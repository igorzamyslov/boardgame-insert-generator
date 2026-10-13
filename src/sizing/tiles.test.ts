import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TilesComponent } from "../model/types";
import { at, tiles } from "./test-helpers";
import { columnCounts, flatFootprint, hexCornerToCorner, tileOptions } from "./tiles";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const C2C40 = (40 * 2) / Math.sqrt(3); // 46.18802…

function first(component: TilesComponent, option = 0, block = 0): CompartmentReq {
  return at(at(at(tileOptions(component, s).options, option).blocks, block), 0);
}

describe("tile geometry", () => {
  it("computes hex corner-to-corner", () => {
    expect(hexCornerToCorner(40)).toBeCloseTo(46.18802, 5);
  });

  it("puts flat-to-flat front-to-back for flat hexes and left-to-right for pointy ones", () => {
    expect(flatFootprint({ type: "hex", flatToFlat: 40, orientation: "flat" })).toEqual({
      x: C2C40,
      y: 40,
    });
    expect(flatFootprint({ type: "hex", flatToFlat: 40, orientation: "pointy" })).toEqual({
      x: 40,
      y: C2C40,
    });
    expect(flatFootprint({ type: "rect", w: 30, d: 20 })).toEqual({ x: 30, y: 20 });
  });

  it("offers 1 column plus columns for ~50 mm and ~25 mm stacks", () => {
    expect(columnCounts(60, 2)).toEqual([1, 3, 5]);
    expect(columnCounts(7, 2)).toEqual([1]);
    expect(columnCounts(7, 10)).toEqual([1, 2, 3]);
    expect(columnCounts(2, 40)).toEqual([1, 2]);
  });

  it("ignores float noise in the stack height (625 × 0.56 is 350.00000000000006)", () => {
    expect(columnCounts(625, 0.56)).toEqual([1, 7, 14]);
  });
});

describe("tileOptions", () => {
  it("lays hex tiles flat, a flat edge to the front, cut through the long walls, with reliefs", () => {
    const { options, notices } = tileOptions(tiles(), s);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["flat-c1", "flat-c3", "flat-c5"]);
    const column = first(tiles());
    expect(column.minW).toBe(47.19);
    expect(column.minD).toBeCloseTo(41, 9);
    expect(column.minH).toBeCloseTo(121, 9);
    expect(column.kind).toBe("well");
    expect(column.contents).toBe("Hexes ×60");
    expect(column.elastic).toEqual({ w: false, d: false, h: false });
    // Corner to corner (47.19) runs along X, so the long walls are the front and back.
    expect(column.features).toEqual([
      { type: "wallCutout", side: "front", depthFraction: 1, floorNotch: true },
      { type: "wallCutout", side: "back", depthFraction: 1, floorNotch: true },
      { type: "cornerRelief" },
    ]);
  });

  it("swaps the footprint axes for pointy hexes", () => {
    const column = first(tiles({ shape: { type: "hex", flatToFlat: 40, orientation: "pointy" } }));
    expect(column.minW).toBeCloseTo(41, 9);
    expect(column.minD).toBe(47.19);
    expect(column.features.map((f) => f.side)).toEqual(["left", "right", undefined]);
  });

  it("splits a tall stack into columns, one block each", () => {
    const { options } = tileOptions(tiles(), s);
    const three = at(options, 1);
    expect(three.blocks).toHaveLength(3);
    expect(three.blocks.map((b) => at(b, 0).minH)).toEqual([41, 41, 41]);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([25, 25, 25, 25, 25]);
  });

  it("spreads uneven counts with the extra tiles in the first columns", () => {
    const { options } = tileOptions(tiles({ count: 7, thickness: 10 }), s);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([31, 21, 21]);
    expect(at(options, 2).blocks.map((b) => at(b, 0).contents)).toEqual([
      "Hexes ×3",
      "Hexes ×2",
      "Hexes ×2",
    ]);
  });

  it("stands hex tiles upright on a flat edge, like upright cards", () => {
    const upright = tiles({ storage: "upright" });
    expect(tileOptions(upright, s).options.map((o) => o.id)).toEqual([
      "upright-c1",
      "upright-c3",
      "upright-c5",
    ]);
    const stack = first(upright);
    expect(stack.minW).toBeCloseTo(121, 9);
    expect(stack.minD).toBe(47.19);
    expect(stack.minH).toBeCloseTo(41, 9);
    // Stretch is off by default: content-tight, no spacer. And no corner reliefs: a tile on its
    // edge doesn't need them.
    expect(stack.elastic).toEqual({ w: false, d: false, h: false });
    expect(stack.spacerAxis).toBeUndefined();
    expect(stack.features).toEqual([
      { type: "wallCutout", side: "left", depthFraction: 1 / 2, floorNotch: false },
      { type: "wallCutout", side: "right", depthFraction: 1 / 2, floorNotch: false },
    ]);
  });

  it("stretch on makes an upright stack elastic along its width with a spacer axis", () => {
    const stack = first(tiles({ storage: "upright", stretch: true }));
    expect(stack.elastic).toEqual({ w: true, d: false, h: false });
    expect(stack.spacerAxis).toBe("w");
  });

  it("gives upright tiles no corner relief even when asked, but flat tiles keep theirs", () => {
    const asked = { cornerReliefs: true } as const;
    const upright = first(tiles({ storage: "upright", ...asked }));
    expect(upright.features.map((f) => f.type)).not.toContain("cornerRelief");
    const flat = first(tiles({ storage: "flat" }));
    expect(flat.features.map((f) => f.type)).toContain("cornerRelief");
  });

  it("stands rect tiles on their longer edge", () => {
    const stack = first(
      tiles({ shape: { type: "rect", w: 30, d: 20 }, count: 10, storage: "upright" }),
    );
    expect(stack.minW).toBeCloseTo(21, 9);
    expect(stack.minD).toBeCloseTo(31, 9);
    expect(stack.minH).toBeCloseTo(21, 9);
  });

  it("auto lists flat options before upright ones", () => {
    expect(tileOptions(tiles({ storage: "auto" }), s).options.map((o) => o.id)).toEqual([
      "flat-c1",
      "flat-c3",
      "flat-c5",
      "upright-c1",
      "upright-c3",
      "upright-c5",
    ]);
  });

  it("uses the clearance override", () => {
    const column = first(tiles({ shape: { type: "rect", w: 30, d: 20 }, clearance: 0 }));
    expect(column.minW).toBe(30);
    expect(column.minD).toBe(20);
  });
});
