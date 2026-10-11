import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TilesComponent } from "../model/types";
import { at, tiles } from "./test-helpers";
import { columnCounts, flatFootprint, hexCornerToCorner, tileOptions } from "./tiles";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const C2C40 = (40 * 2) / Math.sqrt(3); // 46.18802…

function first(component: TilesComponent, option = 0, block = 0): CompartmentReq {
  return at(at(at(tileOptions(component, s, 0).options, option).blocks, block), 0);
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
});

describe("tileOptions", () => {
  it("lays hex tiles flat, a flat edge to the front, with full-depth pockets and corner reliefs", () => {
    const { options, notices } = tileOptions(tiles(), s, 0);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["flat-c1", "flat-c3", "flat-c5"]);
    const column = first(tiles());
    expect(column.minW).toBeCloseTo(C2C40 + 1, 9);
    expect(column.minD).toBeCloseTo(65, 9);
    expect(column.minH).toBeCloseTo(121, 9);
    expect(column.kind).toBe("well");
    expect(column.contents).toBe("Hexes ×60");
    expect(column.elastic).toEqual({ w: false, d: false, h: false });
    expect(column.features).toEqual([
      { type: "fingerPocket", side: "front", depthFraction: 1, perItem: true },
      { type: "fingerPocket", side: "back", depthFraction: 1, perItem: true },
      { type: "cornerRelief" },
    ]);
  });

  it("swaps the footprint axes for pointy hexes", () => {
    const column = first(tiles({ shape: { type: "hex", flatToFlat: 40, orientation: "pointy" } }));
    expect(column.minW).toBeCloseTo(41, 9);
    expect(column.minD).toBeCloseTo(C2C40 + 1 + 24, 9);
  });

  it("splits a tall stack into columns, one block each", () => {
    const { options } = tileOptions(tiles(), s, 0);
    const three = at(options, 1);
    expect(three.blocks).toHaveLength(3);
    expect(three.blocks.map((b) => at(b, 0).minH)).toEqual([41, 41, 41]);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([25, 25, 25, 25, 25]);
  });

  it("spreads uneven counts with the extra tiles in the first columns", () => {
    const { options } = tileOptions(tiles({ count: 7, thickness: 10 }), s, 0);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([31, 21, 21]);
    expect(at(options, 2).blocks.map((b) => at(b, 0).contents)).toEqual([
      "Hexes ×3",
      "Hexes ×2",
      "Hexes ×2",
    ]);
  });

  it("stands hex tiles upright on a flat edge, like upright cards", () => {
    const upright = tiles({ storage: "upright" });
    expect(tileOptions(upright, s, 0).options.map((o) => o.id)).toEqual([
      "upright-c1",
      "upright-c3",
      "upright-c5",
    ]);
    const stack = first(upright);
    expect(stack.minW).toBeCloseTo(121, 9);
    expect(stack.minD).toBeCloseTo(C2C40 + 1 + 24, 9);
    expect(stack.minH).toBeCloseTo(41, 9);
    expect(stack.elastic).toEqual({ w: true, d: false, h: false });
    expect(stack.spacerAxis).toBe("w");
    expect(at(stack.features, 0)).toEqual({
      type: "fingerPocket",
      side: "front",
      depthFraction: 1 / 3,
      perItem: true,
    });
  });

  it("stands rect tiles on their longer edge", () => {
    const stack = first(
      tiles({ shape: { type: "rect", w: 30, d: 20 }, count: 10, storage: "upright" }),
    );
    expect(stack.minW).toBeCloseTo(21, 9);
    expect(stack.minD).toBeCloseTo(55, 9);
    expect(stack.minH).toBeCloseTo(21, 9);
  });

  it("auto lists flat options before upright ones", () => {
    expect(tileOptions(tiles({ storage: "auto" }), s, 0).options.map((o) => o.id)).toEqual([
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
    expect(column.minD).toBe(44);
  });

  it("returns no options and no notices for an invalid component", () => {
    for (const component of [
      tiles({ thickness: 0 }),
      tiles({ count: 0 }),
      tiles({ shape: { type: "rect", w: 0, d: 20 } }),
      tiles({ shape: { type: "hex", flatToFlat: -1, orientation: "flat" } }),
    ]) {
      expect(tileOptions(component, s, 2)).toEqual({ options: [], notices: [] });
    }
  });
});
