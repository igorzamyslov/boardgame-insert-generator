import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { bulkLine, bulkOptions, shapeLine } from "./bulk";
import { at, bulk } from "./test-helpers";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;

function line(component = bulk(), settings: Settings = s, option = 0, item = 0): CompartmentReq {
  return at(at(at(bulkOptions(component, settings).options, option).blocks, item), 0);
}

describe("bulkOptions labels", () => {
  it("shows the component name beside an item's, and not twice", () => {
    const component = bulk({
      name: "Tokens",
      items: [
        { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
        { name: "", count: 5, w: 10, d: 10, h: 10 },
        { name: "Coins", volumeMl: 50 },
      ],
    });
    const { options } = bulkOptions(component, DEFAULT_SETTINGS);
    expect(at(options, 0).blocks.map((b) => b.map((c) => c.contents))).toEqual([
      ["Tokens — Cubes ×30"],
      ["Tokens ×5"],
      ["Tokens — Coins 50 ml"],
    ]);
  });
});

describe("bulkOptions", () => {
  it("divides the item volume by the packing factor; shallow first, then deep", () => {
    const { options, notices } = bulkOptions(bulk(), s);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["shallow", "deep"]);
    // V = 30 · 10³ / 0.5 = 60 000 mm³
    const shallow = line();
    expect(shallow.minVolume).toBe(60000);
    expect(shallow.minH).toBe(20);
    expect(shallow.minW).toBe(54.78); // √3000 = 54.772…, rounded up
    expect(shallow.minD).toBe(54.78);
    expect(shallow.kind).toBe("scoop");
    expect(shallow.contents).toBe("Bits — Cubes ×30");
    expect(shallow.elastic).toEqual({ w: true, d: true, h: true });
    expect(shallow.maxHRatio).toBe(1.5);
    expect(shallow.features).toEqual([{ type: "scoop" }]);
    const deep = line(bulk(), s, 1);
    // A bin you scoop from keeps its pile within reach (SCOOP_REACH − BIN_FREEBOARD = 30 mm),
    // so the deep shape spreads wider instead of going deeper.
    expect(deep.minW).toBe(44.73); // √(60000/30) = 44.721…, rounded up
    expect(deep.minH).toBe(30);
  });

  it("uses volumeMl lines as given (1 ml = 1000 mm³)", () => {
    const component = bulk({ items: [{ name: "Coins", volumeMl: 120 }] });
    const shallow = line(component);
    expect(shallow.minVolume).toBe(120000);
    expect(shallow.contents).toBe("Bits — Coins 120 ml");
    expect(shallow.minW).toBe(77.46); // √6000 = 77.459…, rounded up
    expect(shallow.minH).toBe(20);
    const deep = line(component, s, 1);
    expect(deep.minW).toBe(63.25); // √(120000/30) = 63.245…, rounded up
    expect(deep.minH).toBe(30);
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

  it("an item's own packing replaces the insert's, for that item only", () => {
    const own = bulk({
      packing: 0.8,
      items: [
        { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
        { name: "Coins", volumeMl: 50 },
      ],
    });
    // 30 · 10³ / 0.8, not / 0.5
    expect(line(own).minVolume).toBe(37500);
    // a pile given as a volume has no packing to scale
    expect(line(own, s, 0, 1).minVolume).toBe(50000);
    // the insert's number still decides for an item with none
    expect(line(bulk(), { ...s, packingFactor: 0.8 }).minVolume).toBe(37500);
    expect(line(own, { ...s, packingFactor: 0.25 }).minVolume).toBe(37500);
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
    );
    expect(at(options, 0).blocks.map((b) => b.map((c) => c.contents))).toEqual([
      ["Bits — Cubes ×30"],
      ["Bits — Coins 50 ml"],
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
    expect(line(component).minW).toBe(73.49); // √5400 = 73.48…, rounded up
    expect(line(component, s, 1).minW).toBe(60); // √(108000/30)
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

describe("bulk growth (minimal-trays spec §5)", () => {
  it("is `auto` on all three axes: the bin's own size, at most 50 mm", () => {
    const small = line(bulk({ items: [{ name: "Peas", count: 5, w: 5, d: 5, h: 5 }] }));
    // a 25 mm minimum side, so it binds on width and length
    expect(small.elastic).toEqual({ w: true, d: true, h: true });
    expect(small.growth?.w).toBe(25);
    expect(small.growth?.d).toBe(25);
    const big = line(bulk({ items: [{ name: "Beans", volumeMl: 600 }] }));
    expect(big.growth?.w).toBe(50);
    expect(big.growth?.d).toBe(50);
    expect(big.growth?.h).toBeLessThanOrEqual(50);
  });

  it("takes each axis from its own setting", () => {
    const c = line(bulk({ growth: { w: "off", d: 7, h: "max" } }));
    expect(c.elastic).toEqual({ w: false, d: true, h: true });
    expect(c.growth).toEqual({ d: 7 });
  });

  it("is off on every axis when set off, giving a content-tight bin", () => {
    const c = line(bulk({ growth: { w: "off", d: "off", h: "off" } }));
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect(c.growth).toBeUndefined();
  });

  it("has no cap on `max`, which is the absence of one", () => {
    const c = line(bulk({ growth: { w: "max", d: "max", h: "max" } }));
    expect(c.elastic).toEqual({ w: true, d: true, h: true });
    expect(c.growth).toBeUndefined();
  });
});
