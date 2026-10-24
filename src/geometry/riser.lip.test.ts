// @vitest-environment node
// src/geometry/riser.lip.test.ts
// The rim between layers on a riser (owner, 2026-10-23): with the lip on, the riser carries the lip
// and the bottom tray on it the groove (`onRiser`), and the two fit exactly as a tray and the tray
// on it do (tray.groove.test.ts, "the lip fits the groove"). Built from the owner's Star Realms
// file: the Starter stack's riser and its Counter tray.
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { DEFAULT_ITERATIONS, optimize } from "../layout/optimize";
import { printableParts } from "../layout/printable";
import { splitRisers } from "../layout/risers";
import { inputsHash } from "../model/hash";
import { grooveOf } from "../model/lip";
import { parseProject } from "../model/schema";
import type { Project, Settings, TraySpec } from "../model/types";
import { size } from "../sizing";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { buildTray } from "./tray";
import { problemsOf } from "./test-build";
import { bounds } from "./test-mesh";
import type { Mesh } from "./types";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

function solid(mesh: Mesh): Manifold {
  return new m.Manifold(
    new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
  );
}

function owner(): Project {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

function stored(p: Project): TraySpec[] {
  const result = optimize(
    {
      requirements: size(p.components, p.settings).requirements,
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
      inputsHash: inputsHash(p),
      appVersion: "0.0.0-test",
    },
    1,
    DEFAULT_ITERATIONS,
  );
  if (!result.layout) {
    throw new Error("the owner's file no longer fits");
  }
  return result.layout.trays;
}

describe(
  "a lipped riser and the tray on it (the owner's Starter stack)",
  { timeout: 60_000 },
  () => {
    const p = owner();
    const settings: Settings = p.settings;
    const plan = stored(p);
    const parts = splitRisers(plan, { settings, printer: p.printer, locks: p.locks });
    const riser = parts.find((t) => t.part === "riser" && t.stack === 0) as TraySpec;
    const counter = parts.find((t) => t.key === "epeanzhc:p0:0") as TraySpec;

    it("has a lipped riser and a grooved bottom tray to test", () => {
      expect(riser).toMatchObject({ lip: true, h: 9.6, solid: false });
      expect(counter).toMatchObject({ onRiser: true, level: 0, z: 9.6 });
      expect(planTray(riser, settings).lip).not.toBeNull();
      expect(planTray(counter, settings).groove).toEqual(grooveOf(settings, 1));
    });

    it("builds both as closed, printable solids of their size (the lip on top of the riser)", () => {
      expect(problemsOf(m, riser, settings)).toEqual([]);
      expect(problemsOf(m, counter, settings)).toEqual([]);
      const { mesh } = buildTray(m, riser, settings);
      expect(bounds(mesh).max[2]).toBeCloseTo(riser.h + settings.lip.height, 6);
    });

    it("agree on the outer corner radius, so the two rings are offsets of one another", () => {
      expect(planTray(counter, settings).cornerRadius).toBe(planTray(riser, settings).cornerRadius);
    });

    describe("fit like a tray on a tray", () => {
      const interference = (dx: number, dy: number): number => {
        const a = solid(buildTray(m, riser, settings).mesh);
        const b = solid(buildTray(m, counter, settings).mesh).translate([dx, dy, riser.h]);
        return a.intersect(b).volume();
      };

      it("touch only on the rim: nothing of the riser's lip is inside the tray", () => {
        expect(interference(0, 0)).toBeLessThan(1e-3);
      });

      it("leave lip.play to each side, and no more", () => {
        const play = settings.lip.play;
        for (const [dx, dy] of [
          [play - 0.01, 0],
          [-(play - 0.01), 0],
          [0, play - 0.01],
          [0, -(play - 0.01)],
        ] as const) {
          expect(interference(dx, dy), `shift ${dx}, ${dy}`).toBeLessThan(1e-3);
        }
        for (const [dx, dy] of [
          [play + 0.05, 0],
          [-(play + 0.05), 0],
          [0, play + 0.05],
          [0, -(play + 0.05)],
        ] as const) {
          expect(interference(dx, dy), `shift ${dx}, ${dy}`).toBeGreaterThan(0.01);
        }
      });
    });

    it("builds a solid riser with the lip too: leftover style 'solid'", () => {
      const solidSettings: Settings = { ...settings, leftover: "solid" };
      const printed = splitRisers(plan, {
        settings: solidSettings,
        printer: p.printer,
        locks: p.locks,
      });
      const block = printed.find((t) => t.part === "riser" && t.stack === 0) as TraySpec;
      expect(block).toMatchObject({ lip: true, solid: true });
      expect(problemsOf(m, block, solidSettings)).toEqual([]);
    });

    it("builds the riser folded into its joined spacer, lip and all", () => {
      const printed = printableParts(plan, {
        components: p.components,
        settings,
        printer: p.printer,
        locks: p.locks,
      });
      const folded = printed.trays.filter(
        (t) => t.merged?.members.some((x) => x.part === "riser" && x.lip) === true,
      );
      expect(folded).toHaveLength(1);
      expect(problemsOf(m, folded[0] as TraySpec, settings)).toEqual([]);
    });

    it("builds every part of the plan the app prints, as closed printable solids", () => {
      const printed = printableParts(plan, {
        components: p.components,
        settings,
        printer: p.printer,
        locks: p.locks,
      });
      // trays with the lip or the groove, the riser with its lip, what the riser is folded into,
      // and the plain parts too: the folded part under the Trade deck is one solid, no slit where
      // its three members meet at a corner
      const withRim = printed.trays.filter(
        (t) => t.lip || t.onRiser || t.merged?.members.some((x) => x.lip) === true,
      );
      expect(withRim.length).toBeGreaterThanOrEqual(4);
      expect(printed.trays.length).toBeGreaterThan(withRim.length);
      for (const t of printed.trays) {
        expect(problemsOf(m, t, settings), t.key).toEqual([]);
      }
    });

    it("keeps the name clear of the groove under the Counter's edge", () => {
      const named = { ...counter, partName: "A1" };
      expect(problemsOf(m, named, { ...settings, engraveNames: true })).toEqual([]);
    });
  },
);

describe("a riser with the lip off", () => {
  it("is as before: no lip on the riser, no groove under the tray", () => {
    const p = owner();
    const settings: Settings = { ...p.settings, lip: { ...p.settings.lip, enabled: false } };
    const parts = splitRisers(stored(p), { settings, printer: p.printer, locks: p.locks });
    const riser = parts.find((t) => t.part === "riser" && t.stack === 0) as TraySpec;
    expect(planTray(riser, settings).lip).toBeNull();
    const counter = parts.find((t) => t.key === "epeanzhc:p0:0") as TraySpec;
    expect(planTray(counter, settings).groove).toBeNull();
  });
});
