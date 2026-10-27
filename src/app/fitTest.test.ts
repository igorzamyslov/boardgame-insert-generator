// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildTray, loadManifold } from "../geometry";
import { optimize, printableParts } from "../layout";
import { FIXTURES } from "../layout/test-fixtures";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { TraySpec } from "../model/types";
import { size } from "../sizing";
import { buildFitTest3mf } from "./exportBuild";
import { FIT_RING_MM, FIT_SLICE_MAX, fitNames, fitSlices } from "./fitTest";

function planned(fixture: keyof typeof FIXTURES) {
  const parsed = parseProject(FIXTURES[fixture]);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p = parsed.project;
  const { requirements } = size(p.components, p.settings);
  const { layout } = optimize(
    {
      requirements,
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
      inputsHash: inputsHash(p),
      appVersion: "0.0.0-test",
    },
    1,
    20_000,
  );
  if (!layout) {
    throw new Error("no layout");
  }
  const trays = printableParts(layout.trays, {
    components: p.components,
    settings: p.settings,
    printer: p.printer,
    locks: p.locks,
  }).trays;
  return { p, trays };
}

describe("the fit test", () => {
  it.each(["cards-heavy", "tiles-minis"] as const)(
    "%s: a manifold slice for each distinct well, as wide inside as the real well",
    async (fixture) => {
      const { p, trays } = planned(fixture);
      const slices = fitSlices(trays, p.components, p.settings);
      expect(slices.length).toBeGreaterThan(0);
      expect(slices.length).toBeLessThanOrEqual(FIT_SLICE_MAX);
      const m = await loadManifold();
      const real = trays.flatMap((t) => t.compartments);
      for (const s of slices) {
        const [c] = s.part.spec.compartments;
        // the well is a real well's inner size, and the ring is low
        expect(real.some((r) => r.w === c?.w && r.d === c?.d && r.kind === c?.kind)).toBe(true);
        expect(s.part.spec.h).toBeLessThanOrEqual(FIT_RING_MM);
        expect(s.part.spec.w).toBeCloseTo((c?.w ?? 0) + 2 * s.part.spec.wall, 6);
        const built = buildTray(m, { ...s.part.spec, partName: s.short }, p.settings);
        expect(built.volumeMm3).toBeGreaterThan(0);
        expect(built.mesh.indices.length).toBeGreaterThan(0);
      }
      const names = fitNames(slices);
      for (const s of slices) {
        expect(names.get(s.part.spec.key)?.short).toMatch(/^[A-Za-z0-9 -]{1,10}$/);
      }
    },
    60_000,
  );

  it("counts alike wells once", () => {
    const { p, trays } = planned("cards-heavy");
    const slices = fitSlices([...trays, ...trays], p.components, p.settings);
    expect(slices).toEqual(fitSlices(trays, p.components, p.settings));
  });

  it("gives loose bits no ring: no scoop, whatever the plan holds", () => {
    const { p, trays } = planned("bits-heavy");
    expect(trays.some((t) => t.compartments.some((c) => c.kind === "scoop"))).toBe(true);
    const slices = fitSlices(trays, p.components, p.settings);
    expect(slices.some((s) => s.part.spec.compartments.some((c) => c.kind === "scoop"))).toBe(
      false,
    );
  });

  it("takes the tightest well of alike decks, not the first", () => {
    const { p, trays } = planned("cards-heavy");
    const deck = (t: TraySpec) => t.compartments.some((c) => c.kind === "well" && c.componentId);
    const tray = trays.find(deck);
    expect(tray).toBeDefined();
    const at = tray?.compartments.findIndex((c) => c.kind === "well" && c.componentId) ?? 0;
    const tight = tray?.compartments[at];
    if (tray === undefined || tight === undefined) {
      throw new Error("no deck");
    }
    // the same deck's well with 3 mm to spare on both sides, and a copy of the real one
    const roomy = (t: TraySpec): TraySpec => ({
      ...t,
      compartments: t.compartments.map((c, i) => (i === at ? { ...c, w: c.w + 3, d: c.d + 3 } : c)),
    });
    const cardWell = (list: readonly TraySpec[]) =>
      fitSlices(list, p.components, p.settings)
        .map((s) => s.part.spec.compartments[0])
        .find((c) => c?.componentId === tight.componentId);
    for (const order of [
      [roomy(tray), tray],
      [tray, roomy(tray)],
    ]) {
      const well = cardWell(order);
      expect(well?.w).toBeCloseTo(tight.w, 6);
      expect(well?.d).toBeCloseTo(tight.d, 6);
    }
  });

  it("takes the thickest deck for cards, not the first or the thinnest", () => {
    const { p, trays } = planned("cards-heavy");
    const tray = trays.find((t) => t.compartments.some((c) => c.kind === "well" && c.componentId));
    const at = tray?.compartments.findIndex((c) => c.kind === "well" && c.componentId) ?? 0;
    const real = tray?.compartments[at];
    if (tray === undefined || real === undefined) {
      throw new Error("no deck");
    }
    const count = Number(/×(\d+)$/.exec(real.contents)?.[1]);
    expect(count).toBeGreaterThan(3);
    // the same deck with only 3 cards: a thinner well, and a tighter one by spare room
    const thin: TraySpec = {
      ...tray,
      compartments: [{ ...real, contents: real.contents.replace(/×\d+$/, "×3"), w: 2.5 }],
    };
    const own: TraySpec = { ...tray, compartments: [real] };
    for (const order of [
      [thin, own],
      [own, thin],
    ]) {
      const slices = fitSlices(order, p.components, p.settings);
      const wells = slices.map((s) => s.part.spec.compartments[0]);
      expect(wells.filter((c) => c?.componentId === real.componentId)).toEqual([
        expect.objectContaining({ contents: real.contents, w: real.w }),
      ]);
    }
  });

  it("builds one 3MF file with every slice", async () => {
    const { p, trays } = planned("tiles-minis");
    const slices = fitSlices(trays, p.components, p.settings);
    const m = await loadManifold();
    const out = await buildFitTest3mf(
      slices,
      { x: 250, y: 250 },
      {
        getMesh: (spec) => Promise.resolve(buildTray(m, spec, p.settings)),
        onProgress: () => undefined,
        yieldToUi: () => Promise.resolve(),
      },
    );
    expect(out.failed).toEqual([]);
    expect(out.included).toBe(slices.length);
  }, 60_000);
});
