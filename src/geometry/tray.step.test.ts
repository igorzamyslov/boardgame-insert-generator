// @vitest-environment node
// src/geometry/tray.step.test.ts
// The stepped base (owner, 2026-10-23; model/lip.ts stepOf): with `lip.kind` "step" a part above
// another has a solid slab under its floor, inset by the lower part's wall and the play, with a 45°
// step out to its outer face, and the part below a socket for it; the walls stay at `wall`. Built
// from the owner's Star Realms file with the step on: every stack's riser carries the socket and
// its bottom tray the slab (the Trade deck's, a tray alone in its stack, too), and a tray on a tray.
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { DEFAULT_ITERATIONS, optimize } from "../layout/optimize";
import { printableParts } from "../layout/printable";
import { splitRisers } from "../layout/risers";
import { inputsHash } from "../model/hash";
import { effective } from "../model/settings";
import { socketOf, stepOf } from "../model/lip";
import { parseProject } from "../model/schema";
import type { Project, Settings, TraySpec } from "../model/types";
import { size } from "../sizing";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { checkPrintability } from "./printability";
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

/** The owner's file with the stepped base. */
function owner(): Project {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p = parsed.project;
  return { ...p, settings: { ...p.settings, lip: { ...p.settings.lip, kind: "step" } } };
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
    throw new Error("the owner's file no longer fits with the step");
  }
  return result.layout.trays;
}

describe("the stepped base in the owner's Star Realms file", { timeout: 120_000 }, () => {
  const p = owner();
  const settings: Settings = p.settings;
  const plan = stored(p);
  const parts = splitRisers(plan, { settings, printer: p.printer, locks: p.locks });
  const step = stepOf(settings, 1);
  const socket = socketOf(settings, true);
  const play = effective(settings).lipPlay;
  const trays = parts.filter((t) => t.part === "tray");
  const risers = parts.filter((t) => t.part === "riser");

  /** The part below `t`: the tray a level down in its stack, or its riser. */
  const below = (t: TraySpec): TraySpec | undefined =>
    t.level > 0
      ? trays.find((x) => x.stack === t.stack && x.level === t.level - 1)
      : risers.find((r) => r.key === `${t.key}:riser`);

  /** How much of `upper` (at its place, shifted by dx, dy) is inside `lower`, mm³. */
  const interference = (lower: TraySpec, upper: TraySpec, dx = 0, dy = 0, lift = 0): number => {
    const st = planTray(upper, settings).step;
    // a mesh's bed face is its slab's, when it has one
    const under = planTray(lower, settings).step?.height ?? 0;
    const a = solid(buildTray(m, lower, settings).mesh).translate([
      lower.x,
      lower.y,
      lower.z - under,
    ]);
    const b = solid(buildTray(m, upper, settings).mesh).translate([
      upper.x + dx,
      upper.y + dy,
      upper.z - (st?.height ?? 0) + lift,
    ]);
    return a.intersect(b).volume();
  };

  it("has a step and a socket to test, and every riser carries the socket", () => {
    expect(step).not.toBeNull();
    expect(socket).not.toBeNull();
    expect(risers.length).toBeGreaterThanOrEqual(2);
    for (const r of risers) {
      expect(r.lip, r.key).toBe(true);
      expect(planTray(r, settings).socket, r.key).not.toBeNull();
      expect(planTray(r, settings).lip, r.key).toBeNull();
    }
    for (const t of trays.filter((x) => x.level === 0)) {
      expect(t.onRiser, t.key).toBe(true);
    }
  });

  it("locks the Trade deck, alone in its stack, onto its riser", () => {
    const trade = trays.find((t) => t.compartments.some((c) => c.contents.includes("Trade")));
    expect(trade).toBeDefined();
    const t = trade as TraySpec;
    expect(trays.filter((x) => x.stack === t.stack)).toHaveLength(1);
    expect(t.onRiser).toBe(true);
    expect(planTray(t, settings).step).not.toBeNull();
  });

  it("keeps the walls at the Wall setting, the rim's 2.9 mm nowhere", () => {
    for (const t of [...trays, ...risers]) {
      expect(t.wall, t.key).toBe(settings.wall);
      expect(planTray(t, settings).outerWall, t.key).toBeLessThan(2);
    }
  });

  it("builds every tray and riser as a closed, printable solid of its size", () => {
    for (const t of [...trays, ...risers]) {
      expect(problemsOf(m, t, settings), t.key).toEqual([]);
    }
  });

  it("prints a stepped tray slab down: its mesh is its height and the slab tall", () => {
    for (const t of trays) {
      const { mesh } = buildTray(m, t, settings);
      const b = bounds(mesh);
      expect(b.min[2], t.key).toBeCloseTo(0, 6);
      expect(b.max[2], t.key).toBeCloseTo(t.h + (step?.height ?? 0), 6);
      // the bed face is the slab's: inset by the step's reach on every side
      expect(checkPrintability(mesh).overhangTriangles, t.key).toBe(0);
    }
  });

  it("seats every tray on the part below with nothing inside it", () => {
    for (const t of trays) {
      const lower = below(t) as TraySpec;
      expect(lower, t.key).toBeDefined();
      expect(interference(lower, t), `${t.key} on ${lower.key}`).toBeLessThan(1e-3);
    }
  });

  it("centres it with the step: any sideways shift at the seam bites into the rim", () => {
    const t = trays.find((x) => x.level === 0) as TraySpec;
    const lower = below(t) as TraySpec;
    for (const [dx, dy] of [
      [0.1, 0],
      [-0.1, 0],
      [0, 0.1],
      [0, -0.1],
    ] as const) {
      expect(interference(lower, t, dx, dy), `shift ${dx}, ${dy}`).toBeGreaterThan(0.01);
    }
  });

  it("leaves the slab the play to each side in the socket, and no more", () => {
    // Lifted by the play the step is clear of the rim's edge for that much sideways: what is left
    // to touch is the slab against the socket's wall.
    const t = trays.find((x) => x.level === 0) as TraySpec;
    const lower = below(t) as TraySpec;
    const lift = 2 * play + 0.05;
    for (const [dx, dy] of [
      [play - 0.01, 0],
      [-(play - 0.01), 0],
      [0, play - 0.01],
      [0, -(play - 0.01)],
    ] as const) {
      expect(interference(lower, t, dx, dy, lift), `shift ${dx}, ${dy}`).toBeLessThan(1e-3);
    }
    for (const [dx, dy] of [
      [play + 0.05, 0],
      [-(play + 0.05), 0],
      [0, play + 0.05],
      [0, -(play + 0.05)],
    ] as const) {
      expect(interference(lower, t, dx, dy, lift), `shift ${dx}, ${dy}`).toBeGreaterThan(0.01);
    }
  });

  it("leaves the play under the slab: dropped by it, the slab still clears the socket's floor", () => {
    for (const t of trays) {
      const lower = below(t) as TraySpec;
      const st = planTray(t, settings).step;
      // Without its step the slab hangs `height` into the socket, `depth` deep.
      expect(socketOf(settings, true)?.depth).toBeCloseTo((st?.height ?? 0) + play, 9);
      expect(planTray(lower, settings).socket?.depth, lower.key).toBeCloseTo(
        (st?.height ?? 0) + play,
        9,
      );
    }
  });

  it("builds a solid riser with the socket too: leftover style 'solid'", () => {
    const solidSettings: Settings = { ...settings, leftover: "solid" };
    const printed = splitRisers(plan, {
      settings: solidSettings,
      printer: p.printer,
      locks: p.locks,
    });
    for (const block of printed.filter((t) => t.part === "riser")) {
      expect(block, block.key).toMatchObject({ lip: true, solid: true });
      expect(problemsOf(m, block, solidSettings), block.key).toEqual([]);
    }
  });

  it("builds the risers folded into their joined spacers, socket and all", () => {
    const printed = printableParts(plan, {
      components: p.components,
      settings,
      printer: p.printer,
      locks: p.locks,
    });
    const folded = printed.trays.filter(
      (t) => t.merged?.members.some((x) => x.part === "riser" && x.lip) === true,
    );
    expect(folded.length).toBeGreaterThanOrEqual(1);
    for (const f of folded) {
      expect(f.merged?.flipped, f.key).toBe(false);
      expect(problemsOf(m, f, settings), f.key).toEqual([]);
    }
  });
});
