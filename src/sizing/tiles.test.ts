import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TilesComponent } from "../model/types";
import { AUTO_GROWTH_CEILING, PLATED_RETENTION } from "./constants";
import { at, tiles } from "./test-helpers";
import { columnCounts, flatFootprint, hexCornerToCorner, tileOptions } from "./tiles";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const C2C40 = (40 * 2) / Math.sqrt(3); // 46.18802…

function first(
  component: TilesComponent,
  option = 0,
  block = 0,
  settings: Settings = s,
): CompartmentReq {
  return at(at(at(tileOptions(component, settings).options, option).blocks, block), 0);
}

// "auto" is what the fill setting "bigger wells" gives an item that asked for nothing
const wells: Settings = { ...s, biggerWells: true };

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
    // 60 tiles of 2 mm count 5 % thicker (2.1 mm each) + 1 mm
    expect(column.minH).toBeCloseTo(127, 9);
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
    expect(three.blocks.map((b) => at(b, 0).minH)).toEqual([43, 43, 43]);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([26.2, 26.2, 26.2, 26.2, 26.2]);
  });

  it("spreads uneven counts with the extra tiles in the first columns", () => {
    const { options } = tileOptions(tiles({ count: 7, thickness: 10 }), s);
    expect(at(options, 2).blocks.map((b) => at(b, 0).minH)).toEqual([32.5, 22, 22]);
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
    expect(stack.minW).toBeCloseTo(127, 9);
    expect(stack.minD).toBe(47.19);
    expect(stack.minH).toBeCloseTo(41, 9);
    // The stack never grows on its own (owner, 2026-10-23), with no spacer axis (that takes
    // `separators`). And no corner reliefs: a tile on its edge doesn't need them.
    expect(stack.elastic).toEqual({ w: false, d: false, h: false });
    expect(stack.growth).toBeUndefined();
    expect(stack.spacerAxis).toBeUndefined();
    expect(stack.features).toEqual([
      { type: "wallCutout", side: "left", depthFraction: 1 / 2, floorNotch: false },
      { type: "wallCutout", side: "right", depthFraction: 1 / 2, floorNotch: false },
    ]);
  });

  describe("growth (minimal-trays spec §5)", () => {
    const stack = (over: Partial<TilesComponent>, settings: Settings = s) =>
      first(tiles({ storage: "upright", ...over }), 0, 0, settings);
    const max = { room: "max" } as const;

    it("is `auto` for an upright stack under bigger wells: its thickness, at most 50 mm", () => {
      expect(stack({}, wells).growth).toEqual({ w: AUTO_GROWTH_CEILING });
      // 10 tiles of 2 mm, counted 2.1 mm each: a 21 mm stack, so it binds
      expect(stack({ count: 10 }, wells).growth).toEqual({ w: 21 });
    });

    it("is off by default: content-tight, no spacer, the footprint never grows", () => {
      const c = stack({});
      expect(c.elastic).toEqual({ w: false, d: false, h: false });
      expect(c.spacerAxis).toBeUndefined();
    });

    it("takes a number as that many more tiles, built into the well and not grown after", () => {
      // was a number of mm of growth; now "some" is counted in tiles (owner, 2026-10-23)
      const none = stack({ count: 10 });
      const c = stack({ count: 10, room: 5 });
      expect(c.minW).toBeCloseTo(none.minW + 5 * 2.1, 9);
      expect(c.elastic).toEqual({ w: false, d: false, h: false });
      expect(c.growth).toBeUndefined();
    });

    it("never grows the tile's footprint, whatever the room", () => {
      const c = stack(max);
      expect(c.elastic).toEqual({ w: true, d: false, h: false });
    });

    it("holds the stack to its own thickness without plates, and to 6× with them", () => {
      // 60 tiles of 2 mm, counted 2.1 mm each: a 126 mm stack
      expect(stack(max).growth).toEqual({ w: 126 });
      expect(stack({ ...max, separators: 2 }).growth).toEqual({
        w: 126 * PLATED_RETENTION,
      });
    });

    it("has no spacer axis unless `separators` is set, at any room", () => {
      for (const [name, c] of [
        ["max", stack(max)],
        ["bigger wells", stack({}, wells)],
      ] as const) {
        expect(c.spacerAxis, name).toBeUndefined();
        expect(c.elastic.w, name).toBe(true);
      }
      expect(stack({ room: 5 }).spacerAxis).toBeUndefined();
      // plates with no room asked: nothing to fill, so no spacer either
      expect(stack({ separators: 1 }).spacerAxis).toBeUndefined();
      expect(stack({ ...max, separators: 1 }).spacerAxis).toBe("w");
      // some room with plates: the planned room is the spacer's, as wide as the room
      const planned = stack({ room: 5, separators: 1 });
      expect(planned.spacerAxis).toBe("w");
      expect(planned.spacerRoom).toBeCloseTo(5 * 2.1, 2);
    });

    it("holds the stack to what keeps it under its finger cut, when that is tighter", () => {
      const narrow: Settings = { ...s, fingerPocket: { ...s.fingerPocket, width: 12 } };
      // 10 tiles of 2 mm: a 21 mm stack; a 12 mm cut leaves 12 + 21 - 20 = 13 mm of room
      const narrowStack = (over: Partial<TilesComponent>) =>
        first(tiles({ storage: "upright", count: 10, ...over }), 0, 0, narrow);
      expect(narrowStack(max).growth).toEqual({ w: 13 });
      expect(narrowStack({ ...max, separators: 2 }).growth).toEqual({
        w: 21 * PLATED_RETENTION,
      });
      // the default 25 mm cut leaves retention the tighter
      expect(stack({ count: 10, ...max }).growth).toEqual({ w: 21 });
      // a flat stack is unaffected: as much as fits has no cap of its own
      const flat = first(tiles({ storage: "flat", ...max }), 0, 0, narrow);
      expect(flat.growth).toBeUndefined();
    });

    it("keeps a flat stack from growing taller by default, and grows it when asked", () => {
      expect(first(tiles({ storage: "flat" })).elastic).toEqual({ w: false, d: false, h: false });
      // not even under bigger wells
      expect(first(tiles({ storage: "flat" }), 0, 0, wells).elastic.h).toBe(false);
      const asked = first(tiles({ storage: "flat", room: "max" }));
      expect(asked.elastic).toEqual({ w: false, d: false, h: true });
      expect(asked.growth).toBeUndefined();
      expect(asked.spacerAxis).toBeUndefined();
      // some: more tiles in the stack, so a taller well and nothing grown after
      const some = first(tiles({ storage: "flat", room: 4 }));
      expect(some.minH).toBeCloseTo(first(tiles({ storage: "flat" })).minH + 4 * 2.1, 9);
      expect(some.elastic.h).toBe(false);
    });
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
    // 10 tiles at 2.1 mm + 1 mm clearance
    expect(stack.minW).toBeCloseTo(22, 9);
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
