import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { bulkLine, bulkOptions, shapeLine } from "./bulk";
import { at, bulk } from "./test-helpers";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;

function line(component = bulk(), settings: Settings = s, option = 0, item = 0): CompartmentReq {
  return at(at(at(bulkOptions(component, settings, 0).options, option).blocks, item), 0);
}

describe("bulkOptions", () => {
  it("divides the item volume by the packing factor; shallow first, then deep", () => {
    const { options, notices } = bulkOptions(bulk(), s, 0);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["shallow", "deep"]);
    // V = 30 · 10³ / 0.5 = 60 000 mm³
    const shallow = line();
    expect(shallow.minVolume).toBe(60000);
    expect(shallow.minH).toBe(20);
    expect(shallow.minW).toBeCloseTo(Math.sqrt(3000), 9); // 54.772…
    expect(shallow.minD).toBeCloseTo(Math.sqrt(3000), 9);
    expect(shallow.kind).toBe("scoop");
    expect(shallow.contents).toBe("Cubes ×30");
    expect(shallow.elastic).toEqual({ w: true, d: true, h: true });
    expect(shallow.maxHRatio).toBe(1.5);
    expect(shallow.features).toEqual([{ type: "scoop", side: "front" }]);
    const deep = line(bulk(), s, 1);
    expect(deep.minW).toBeCloseTo(Math.cbrt(40000), 9); // 34.1995…
    expect(deep.minH).toBeCloseTo(1.5 * Math.cbrt(40000), 6); // 51.299…
  });

  it("uses volumeMl lines as given (1 ml = 1000 mm³)", () => {
    const component = bulk({ items: [{ name: "Coins", volumeMl: 120 }] });
    const shallow = line(component);
    expect(shallow.minVolume).toBe(120000);
    expect(shallow.contents).toBe("Coins 120 ml");
    expect(shallow.minW).toBeCloseTo(Math.sqrt(6000), 9); // 77.459…
    expect(shallow.minH).toBe(20);
    const deep = line(component, s, 1);
    expect(deep.minW).toBeCloseTo(Math.cbrt(80000), 9); // 43.088…
    expect(deep.minH).toBeCloseTo(1.5 * Math.cbrt(80000), 6);
  });

  it("keeps the per-axis minimum: largest item dimension + clearance, at least 25", () => {
    const component = bulk({ items: [{ name: "Board", count: 1, w: 40, d: 30, h: 5 }] });
    const shallow = line(component);
    expect(shallow.minW).toBe(41);
    expect(shallow.minD).toBe(41);
    expect(shallow.minH).toBe(20);
    // the deep shape cannot be narrower, so it equals the shallow one (variants dedupe it)
    expect(line(component, s, 1)).toEqual(shallow);
  });

  it("a clearance override replaces pieceClearance, unscaled by fit", () => {
    const component = bulk({
      clearance: 3,
      items: [{ name: "Board", count: 1, w: 40, d: 30, h: 5 }],
    });
    expect(line(component, { ...s, fit: 1.4 }).minW).toBe(43);
    expect(
      line(bulk({ items: [{ name: "Board", count: 1, w: 40, d: 30, h: 5 }] }), {
        ...s,
        fit: 1.4,
      }).minW,
    ).toBeCloseTo(41.4, 9);
  });

  it("a smaller packing factor needs more volume", () => {
    expect(line(bulk(), { ...s, packingFactor: 0.25 }).minVolume).toBe(120000);
  });

  it("makes one compartment per item line", () => {
    const { options } = bulkOptions(
      bulk({
        items: [
          { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
          { name: "Coins", volumeMl: 50 },
        ],
      }),
      s,
      0,
    );
    expect(at(options, 0).blocks.map((b) => b.map((c) => c.contents))).toEqual([
      ["Cubes ×30"],
      ["Coins 50 ml"],
    ]);
  });

  it("handles 2000 tiny cubes with finite, volume-preserving shapes", () => {
    const component = bulk({ items: [{ name: "Grains", count: 2000, w: 3, d: 3, h: 3 }] });
    for (const option of [0, 1]) {
      const c = line(component, s, option);
      expect(c.minVolume).toBe(108000);
      for (const v of [c.minW, c.minD, c.minH]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(c.minW * c.minD * c.minH).toBeGreaterThanOrEqual(108000 * (1 - 1e-9));
      expect(c.minH).toBeLessThanOrEqual(1.5 * Math.min(c.minW, c.minD) + 1e-9);
    }
    expect(line(component).minW).toBeCloseTo(Math.sqrt(5400), 9); // 73.48…
    expect(line(component, s, 1).minW).toBeCloseTo(Math.cbrt(72000), 9); // 41.60…
  });

  it("returns no options and no notices for an invalid component", () => {
    for (const component of [
      bulk({ items: [] }),
      bulk({ items: [{ name: "X", count: 0, w: 1, d: 0, h: 1 }] }),
      bulk({ items: [{ name: "Y", volumeMl: -1 }] }),
    ]) {
      expect(bulkOptions(component, s, 1)).toEqual({ options: [], notices: [] });
    }
  });
});

describe("bulk shapes", () => {
  it("keeps side² · h ≥ volume and h ≤ 1.5 · side", () => {
    const l = bulkLine({ name: "A", count: 7, w: 12, d: 9, h: 4 }, 1, 0.5);
    for (const shape of ["shallow", "deep"] as const) {
      const { side, h } = shapeLine(l, shape);
      expect(side * side * h).toBeGreaterThanOrEqual(l.volume * (1 - 1e-12));
      expect(h).toBeLessThanOrEqual(1.5 * side + 1e-9);
    }
  });
});
