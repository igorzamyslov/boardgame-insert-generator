import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter } from "./outer";
import { realizeTray } from "./realize";
import { at, bulk, cards, custom, minis, partOf } from "./test-helpers";
import type { RealizeOptions } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const ground: RealizeOptions = { lipped: false, level: 0 };
const single = partOf([cards()], "upright-long|strip|split1");
const pocket = (side: "front" | "back", atMm: number, depth: number) => ({
  type: "fingerPocket",
  side,
  at: atMm,
  width: 22,
  reach: 12,
  depth,
});

describe("realizeTray", () => {
  it("places one upright deck at minOuter with ⅓-depth pockets front and back", () => {
    const r = realizeTray(single, { w: 26.7, d: 119.7, h: 69.2 }, s, ground);
    expect(r.wall).toBe(1.6);
    expect(r.spacers).toEqual([]);
    expect(r.compartments).toEqual([
      {
        x: 1.6,
        y: 1.6,
        w: 23.5,
        d: 116.5,
        floorZ: 1.2,
        kind: "well",
        contents: "Main ×52",
        features: [pocket("front", 13.35, 22.67), pocket("back", 13.35, 22.67)],
      },
    ]);
  });

  it("turns spare stack length into one removable spacer", () => {
    const r = realizeTray(single, { w: 56.7, d: 119.7, h: 69.2 }, s, ground);
    expect(r.compartments).toHaveLength(1);
    const well = at(r.compartments, 0);
    expect(well).toMatchObject({ x: 1.6, y: 1.6, w: 53.5, d: 116.5, floorZ: 1.2 });
    expect(at(well.features, 0)).toMatchObject({ at: 13.35, width: 22 });
    expect(r.spacers).toEqual([
      {
        key: "c1:p0:0:spacer",
        part: "spacer",
        path: "",
        stack: 0,
        level: 0,
        x: 25.1,
        y: 13.6,
        z: 1.2,
        w: 30,
        d: 92.5,
        h: 63,
        rotated: false,
        wall: 0,
        floor: 0,
        lip: false,
        solid: true,
        compartments: [],
      },
    ]);
  });

  it("thickens walls first, then adds a spare row for depth slack", () => {
    const r = realizeTray(single, { w: 26.7, d: 139.7, h: 69.2 }, s, ground);
    expect(r.compartments).toHaveLength(2);
    expect(at(r.compartments, 0)).toMatchObject({ x: 1.6, y: 3.2, w: 23.5, d: 116.5 });
    expect(at(r.compartments, 1)).toEqual({
      x: 1.6,
      y: 120.9,
      w: 23.5,
      d: 15.6,
      floorZ: 1.2,
      kind: "spare",
      contents: "spare",
      features: [],
    });
  });

  it("keeps one spacer per tray; another row's slack becomes thicker walls and a spare", () => {
    const part = partOf(
      [
        cards({
          decks: [
            { name: "A", count: 52 },
            { name: "B", count: 30 },
          ],
        }),
      ],
      "upright-long|rows2|split1",
    );
    expect(minOuter(part, s, ground)).toEqual({ w: 26.7, d: 237.4, h: 69.2 });
    const r = realizeTray(part, { w: 36.7, d: 237.4, h: 69.2 }, s, ground);
    expect(r.compartments.map((c) => [c.contents, c.x, c.y, c.w, c.d])).toEqual([
      ["A ×52", 1.6, 1.6, 33.5, 116.5],
      ["B ×30", 3.2, 119.3, 13.98, 116.5],
      ["spare", 18.38, 119.3, 15.12, 116.5],
    ]);
    expect(r.spacers).toHaveLength(1);
    expect(at(r.spacers, 0)).toMatchObject({ x: 25.1, y: 13.6, w: 10, d: 92.5, h: 63 });
  });

  it("gives a one-card deck a full-width finger pocket and a spacer", () => {
    const part = partOf(
      [cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] })],
      "upright-long|strip|split1",
    );
    const r = realizeTray(part, minOuter(part, s, ground), s, ground);
    const well = at(r.compartments, 0);
    expect(well).toMatchObject({ x: 1.6, y: 1.6, w: 22, d: 113.5, floorZ: 1.2 });
    expect(at(well.features, 0)).toMatchObject({ at: 12.6, width: 22 });
    expect(r.spacers).toHaveLength(1);
    expect(at(r.spacers, 0)).toMatchObject({ x: 2.93, w: 20.67, d: 89.5, h: 60 });
  });

  it("raises the floor of shallow contents to the rim in a group", () => {
    const part = partOf(
      [cards({ groupId: "g" }), custom({ groupId: "g", count: 1 })],
      "upright-long+custom|strip|split1",
    );
    expect(part.trayKey).toBe("g:p0:0");
    const outer = minOuter(part, s, ground);
    expect(outer).toEqual({ w: 68.9, d: 119.7, h: 69.2 });
    const r = realizeTray(part, outer, s, ground);
    expect(at(r.compartments, 0).floorZ).toBe(1.2);
    expect(at(r.compartments, 1)).toEqual({
      x: 26.3,
      y: 38.35,
      w: 41,
      d: 43,
      floorZ: 58.2,
      kind: "well",
      contents: "Dial",
      features: [
        { type: "fingerPocket", side: "front", at: 46.8, width: 22, reach: 12, depth: 11 },
        { type: "cornerRelief", d: 3 },
      ],
    });
  });

  describe("bulk", () => {
    const part = partOf(
      [
        bulk({
          items: [
            { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
            { name: "Coins", volumeMl: 50 },
          ],
        }),
      ],
      "shallow|strip|split1",
    );

    it("starts from √(V/20)-wide shallow compartments", () => {
      // 54.78 + 1.2 + 50 inner → 109.18; depth 54.78 → 57.98; 1.2 + 20 → 21.2
      expect(minOuter(part, s, ground)).toEqual({ w: 109.18, d: 57.98, h: 21.2 });
    });

    it("shares width slack between bulk compartments and grows them to full depth", () => {
      const r = realizeTray(part, { w: 119.18, d: 57.98, h: 40 }, s, ground);
      expect(r.compartments).toEqual([
        {
          x: 1.6,
          y: 1.6,
          w: 59.78,
          d: 54.78,
          floorZ: 1.2,
          kind: "scoop",
          contents: "Cubes ×30",
          features: [{ type: "scoop", side: "front", r: 12 }],
        },
        {
          x: 62.58,
          y: 1.6,
          w: 55,
          d: 54.78,
          floorZ: 1.2,
          kind: "scoop",
          contents: "Coins 50 ml",
          features: [{ type: "scoop", side: "front", r: 12 }],
        },
      ]);
    });

    it("caps the depth at 1.5 × the smaller side by raising the floor", () => {
      const r = realizeTray(part, { w: 119.18, d: 57.98, h: 100 }, s, ground);
      // depth = floor(1.5 × 54.78) = 82.17 → floorZ = 100 − 82.17
      expect(r.compartments.map((c) => c.floorZ)).toEqual([17.83, 17.83]);
    });

    it("sizes the scoop as min(scoopRadius, depth, width / 2)", () => {
      const r = realizeTray(
        part,
        { w: 119.18, d: 57.98, h: 40 },
        { ...s, scoopRadius: 50 },
        ground,
      );
      expect(r.compartments.map((c) => c.features)).toEqual([
        [{ type: "scoop", side: "front", r: 29.89 }],
        [{ type: "scoop", side: "front", r: 27.5 }],
      ]);
    });
  });

  it("puts one ⅓-depth finger pocket in front of each mini pocket", () => {
    const part = partOf([minis()], "standing|strip|split1");
    const outer = minOuter(part, s, ground);
    expect(outer).toEqual({ w: 56.4, d: 41.2, h: 42.2 });
    const r = realizeTray(part, outer, s, ground);
    expect(r.compartments.map((c) => [c.contents, c.kind, c.x, c.y, c.w, c.d, c.floorZ])).toEqual([
      ["Hero 1/2", "pocket", 1.6, 1.6, 26, 38, 1.2],
      ["Hero 2/2", "pocket", 28.8, 1.6, 26, 38, 1.2],
    ]);
    expect(r.compartments.map((c) => c.features)).toEqual([
      [{ type: "fingerPocket", side: "front", at: 14.6, width: 22, reach: 12, depth: 13.67 }],
      [{ type: "fingerPocket", side: "front", at: 41.8, width: 22, reach: 12, depth: 13.67 }],
    ]);
  });

  it("realizes 2000 tiny cubes", () => {
    const grains = [bulk({ items: [{ name: "Grains", count: 2000, w: 3, d: 3, h: 3 }] })];
    const shallow = partOf(grains, "shallow|strip|split1");
    const deep = partOf(grains, "deep|strip|split1");
    expect(minOuter(shallow, s, ground)).toEqual({ w: 76.69, d: 76.69, h: 21.2 });
    expect(minOuter(deep, s, ground)).toEqual({ w: 44.81, d: 44.81, h: 63.61 });
    for (const part of [shallow, deep]) {
      const outer = minOuter(part, s, ground);
      const c = at(realizeTray(part, outer, s, ground).compartments, 0);
      expect(c.w * c.d * (outer.h - c.floorZ)).toBeGreaterThanOrEqual(108000);
    }
  });

  it("uses the lipped wall when the tray carries a lip", () => {
    const lipped: RealizeOptions = { lipped: true, level: 0 };
    const r = realizeTray(single, minOuter(single, s, lipped), s, lipped);
    expect(r.wall).toBe(1.6);
    expect(at(r.compartments, 0)).toMatchObject({ x: 2.9, y: 2.9, w: 23.5, d: 116.5 });
    expect(at(at(r.compartments, 0).features, 0)).toMatchObject({ at: 14.65 });
  });

  it("throws RangeError when the outer is below minOuter", () => {
    expect(() => realizeTray(single, { w: 26.69, d: 119.7, h: 69.2 }, s, ground)).toThrow(
      RangeError,
    );
    expect(() => realizeTray(single, { w: 26.7, d: 119.69, h: 69.2 }, s, ground)).toThrow(
      RangeError,
    );
    expect(() => realizeTray(single, { w: 26.7, d: 119.7, h: 69.19 }, s, ground)).toThrow(
      RangeError,
    );
  });
});
