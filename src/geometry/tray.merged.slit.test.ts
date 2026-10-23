// @vitest-environment node
// src/geometry/tray.merged.slit.test.ts
// A merged part is one solid with no hole through it. The tray gap between members is closed by
// bridges, one per pair of members that share an edge; where three or four members meet at a
// corner the gap between them is a small square no pairwise bridge covers, and it ran as a slit
// through the part (genus 1). Found in the owner's Star Realms file: the Trade deck's folded part.
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { DEFAULT_ITERATIONS, optimize } from "../layout/optimize";
import { mergeParts } from "../layout/merge";
import { printableParts } from "../layout/printable";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Project, Settings, TraySpec } from "../model/types";
import { size } from "../sizing";
import { loadManifold } from "./load";
import { problemsOf } from "./test-build";
import { topology } from "./test-mesh";
import { buildTray } from "./tray";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const GAP = DEFAULT_SETTINGS.trayGap;
const plain: Settings = {
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
  mergeRisers: true,
};

const solid = (o: Partial<TraySpec>): TraySpec =>
  traySpec({ part: "leftover", path: "0", stack: 5, h: 35, solid: true, ...o });

function genusOf(spec: TraySpec, settings: Settings) {
  return topology(buildTray(m, spec, settings).mesh);
}

describe("members that meet at a corner", () => {
  // Two members side by side, a third across both of them: a gap x gap square at the corner.
  const corner = (o: { cH?: number } = {}): TraySpec[] => [
    solid({ key: "leftover:0", x: 0, y: GAP + 20, w: 30, d: 30 }),
    solid({ key: "leftover:1", x: 30 + GAP, y: GAP + 20, w: 30, d: 30 }),
    solid({ key: "leftover:2", x: 0, y: 0, w: 60 + GAP, d: 20, h: o.cH ?? 35 }),
  ];

  it("three members: one closed solid without a hole", () => {
    const out = mergeParts(corner(), { settings: plain, printer: TEST_PRINTER });
    expect(out).toHaveLength(1);
    expect(genusOf(out[0] as TraySpec, plain)).toMatchObject({ closed: true, genus: 0 });
    expect(problemsOf(m, out[0] as TraySpec, plain)).toEqual([]);
  });

  it("three members, the one across them lower: the slit is closed up to its height", () => {
    const out = mergeParts(corner({ cH: 12 }), { settings: plain, printer: TEST_PRINTER });
    expect(out).toHaveLength(1);
    expect(genusOf(out[0] as TraySpec, plain)).toMatchObject({ closed: true, genus: 0 });
    expect(problemsOf(m, out[0] as TraySpec, plain)).toEqual([]);
  });

  it("four members in a cross: one solid without a hole", () => {
    const cross = [
      solid({ key: "leftover:0", x: 0, y: 0, w: 30, d: 30 }),
      solid({ key: "leftover:1", x: 30 + GAP, y: 0, w: 30, d: 30, h: 20 }),
      solid({ key: "leftover:2", x: 0, y: 30 + GAP, w: 30, d: 30, h: 28 }),
      solid({ key: "leftover:3", x: 30 + GAP, y: 30 + GAP, w: 30, d: 30 }),
    ];
    const out = mergeParts(cross, { settings: plain, printer: TEST_PRINTER });
    expect(out).toHaveLength(1);
    expect(genusOf(out[0] as TraySpec, plain)).toMatchObject({ closed: true, genus: 0 });
  });

  it("a ring of members round a tray's place keeps its opening", () => {
    // four strips round a 40 x 40 mm hole, each joined to the next across the gap
    const ring = [
      solid({ key: "leftover:0", x: 0, y: 0, w: 50, d: 5 }),
      solid({ key: "leftover:1", x: 50 + GAP, y: 0, w: 5, d: 50 }),
      solid({ key: "leftover:2", x: 5 + GAP, y: 50 + GAP, w: 50, d: 5 }),
      solid({ key: "leftover:3", x: 0, y: 5 + GAP, w: 5, d: 50 }),
    ];
    const out = mergeParts(ring, { settings: plain, printer: TEST_PRINTER });
    expect(out).toHaveLength(1);
    expect(genusOf(out[0] as TraySpec, plain).genus).toBe(1);
  });
});

describe("the owner's printable parts (star-realms-owner-5)", { timeout: 120_000 }, () => {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p: Project = parsed.project;
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
  const layout = result.layout;

  for (const lip of [true, false]) {
    it(`every merged part is a closed solid of genus 0 (rim ${lip ? "on" : "off"})`, () => {
      expect(layout).not.toBeNull();
      const settings: Settings = { ...p.settings, lip: { ...p.settings.lip, enabled: lip } };
      const printed = printableParts(layout?.trays ?? [], {
        components: p.components,
        settings,
        printer: p.printer,
        locks: p.locks,
      });
      const folded = printed.trays.filter((t) => t.merged !== undefined);
      expect(folded.length).toBeGreaterThan(0);
      for (const t of folded) {
        expect(genusOf(t, settings), t.key).toMatchObject({ closed: true, genus: 0 });
        expect(problemsOf(m, t, settings), t.key).toEqual([]);
      }
    });
  }
});
