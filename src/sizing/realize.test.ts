import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CompartmentSpec, FeatureSpec, Settings } from "../model/types";
import { CutFitError } from "./errors";
import { minOuter, realizeTray } from "./realize";
import { assertTrayInvariants, at, bulk, cards, custom, minis, partOf } from "./test-helpers";
import type { OuterSize, RealizeOptions, TrayPartReq } from "./types";

// These cover sizing with a locating lip available (the lipped wall, upper-tray
// minimums), so they turn it on; the app's own default is off.
const s: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, enabled: true } };
const ground: RealizeOptions = { lipped: false, level: 0 };
const single = partOf([cards({ stretch: true })], "upright-long|strip|split1");
const cutout = (side: "left" | "right", atMm: number, depth: number, width = 25) => ({
  type: "wallCutout",
  side,
  at: atMm,
  width,
  depth,
  floorNotch: 0,
});

function cutsOf(c: CompartmentSpec): FeatureSpec[] {
  return c.features.filter((f) => f.type === "wallCutout");
}

describe("realizeTray", () => {
  it("places one upright deck at minOuter with a half-deep channel through both end walls", () => {
    const r = realizeTray(single, { w: 26.7, d: 95.7, h: 69.2 }, s, ground);
    expect(r.wall).toBe(1.6);
    expect(r.spacers).toEqual([]);
    expect(r.compartments).toEqual([
      {
        x: 1.6,
        y: 1.6,
        w: 23.5,
        d: 92.5,
        floorZ: 1.2,
        kind: "well",
        contents: "Main ×52",
        componentId: "c1",
        features: [cutout("left", 47.85, 34), cutout("right", 47.85, 34)],
      },
    ]);
  });

  // Enough spare length for a divider and a pocket: the wall holds the deck by itself, so
  // there is nothing left for a spacer to do and none is made — one part fewer to print.
  it("walls the deck off from a long spare length instead of making a spacer", () => {
    const r = realizeTray(single, { w: 56.7, d: 95.7, h: 69.2 }, s, ground);
    expect(r.spacers).toEqual([]);
    expect(r.compartments).toHaveLength(2);
    // The deck's well stays at its minimum, so the cards cannot slide along it. (Its x sits
    // past the wall, which took some of the spare length as extra thickness.)
    const deck = at(r.compartments, 0);
    expect(deck).toMatchObject({ y: 1.6, w: 23.5, d: 92.5 });
    const pocket = at(r.compartments, 1);
    expect(pocket.kind).toBe("spare");
    // A divider's worth of wall stands between the deck and the pocket.
    expect(pocket.x).toBeGreaterThanOrEqual(deck.x + deck.w + s.divider);
  });

  it("turns a short spare stack length into one removable spacer", () => {
    const r = realizeTray(single, { w: 36.7, d: 95.7, h: 69.2 }, s, ground);
    expect(r.compartments).toHaveLength(1);
    const well = at(r.compartments, 0);
    expect(well).toMatchObject({ x: 1.6, y: 1.6, w: 33.5, d: 92.5, floorZ: 1.2 });
    expect(at(well.features, 0)).toMatchObject({ at: 47.85, width: 25 });
    expect(r.spacers).toEqual([
      {
        key: "c1:p0:0:spacer",
        part: "spacer",
        path: "",
        stack: 0,
        level: 0,
        x: 25.1,
        y: 1.6,
        z: 1.2,
        w: 10,
        d: 92.5,
        h: 63,
        rotated: false,
        wall: 0,
        floor: 0,
        lip: false,
        solid: true,
        compartments: [],
        // The deck's finger channel runs on through the spacer.
        features: [{ type: "spacerNotch", axis: "x", at: 46.25, width: 25, depth: 29 }],
      },
    ]);
  });

  it("makes a spacer only when it is long enough for its bottom chamfer", () => {
    // 6 mm of spare stack: a spacer at the default 0.4 mm chamfer (needs max(5, 2.4) mm) …
    const six = { w: 32.7, d: 95.7, h: 69.2 };
    expect(realizeTray(single, six, s, ground).spacers.map((sp) => sp.w)).toEqual([6]);
    // … but not at a 3 mm chamfer, which needs 2 × (3 + 0.8) = 7.6 mm (3 mm walls and floor make
    // that chamfer valid; the same deck then needs 2.8 mm more width and 1.8 mm more height).
    const steep: Settings = { ...s, wall: 3, floor: 3, bottomChamfer: 3 };
    const sixSteep = { w: 35.5, d: 98.5, h: 71 };
    const r = realizeTray(single, sixSteep, steep, ground);
    expect(r.spacers).toEqual([]);
    assertTrayInvariants(r, sixSteep, steep, ground);
    const longer = { ...sixSteep, w: 37.1 };
    expect(realizeTray(single, longer, steep, ground).spacers.map((sp) => sp.w)).toEqual([7.6]);
  });

  it("thickens walls first, then adds a spare row for depth slack", () => {
    const r = realizeTray(single, { w: 26.7, d: 115.7, h: 69.2 }, s, ground);
    expect(r.compartments).toHaveLength(2);
    expect(at(r.compartments, 0)).toMatchObject({ x: 1.6, y: 3.2, w: 23.5, d: 92.5 });
    expect(at(r.compartments, 1)).toEqual({
      x: 1.6,
      y: 96.9,
      w: 23.5,
      d: 15.6,
      floorZ: 1.2,
      kind: "spare",
      contents: "spare",
      features: [],
    });
  });

  it("walls every row off from its own spare length", () => {
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
    expect(minOuter(part, s, ground)).toEqual({ w: 26.7, d: 189.4, h: 69.2 });
    const outer = { w: 46.7, d: 189.4, h: 69.2 };
    const r = realizeTray(part, outer, s, ground);
    // Each deck keeps its minimum width and a divider separates it from its own spare pocket,
    // so neither deck can slide and neither needs a spacer printed.
    expect(r.spacers).toEqual([]);
    expect(r.compartments.map((c) => [c.contents, c.w])).toEqual([
      ["A ×52", 23.5],
      ["B ×30", 13.98],
      ["spare", 15.6],
      ["spare", 25.12],
    ]);
    expect(cutsOf(at(r.compartments, 1))).toEqual([
      cutout("left", 141.55, 34),
      cutout("right", 141.55, 34),
    ]);
    assertTrayInvariants(r, outer, s, ground);
    // 15.2 mm narrower, the spare would be under MIN_SPARE: the slack stays solid.
    const narrow = realizeTray(part, { w: 31.5, d: 189.4, h: 69.2 }, s, ground);
    expect(narrow.compartments.map((c) => c.kind)).toEqual(["well", "well"]);
  });

  it("gives a one-card deck a full-width channel without widening its tray", () => {
    const part = partOf(
      [cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] })],
      "upright-long|strip|split1",
    );
    const outer = minOuter(part, s, ground);
    const r = realizeTray(part, outer, s, ground);
    const well = at(r.compartments, 0);
    expect(well).toMatchObject({ x: 1.6, y: 1.6, w: 1.33, d: 89.5, floorZ: 1.2 });
    expect(well.features).toEqual([cutout("left", 46.35, 32.5), cutout("right", 46.35, 32.5)]);
    expect(r.spacers).toEqual([]);
    assertTrayInvariants(r, outer, s, ground);
  });

  it("raises the floor of shallow contents to the rim in a group", () => {
    const part = partOf(
      [cards({ groupId: "g" }), custom({ groupId: "g", count: 1 })],
      "upright-long+custom|strip|split1",
    );
    expect(part.trayKey).toBe("g:p0:0");
    const outer = minOuter(part, s, ground);
    expect(outer).toEqual({ w: 68.9, d: 95.7, h: 69.2 });
    const r = realizeTray(part, outer, s, ground);
    expect(at(r.compartments, 0).floorZ).toBe(1.2);
    // The deck's channel leaves through the end wall but never opens into the custom well.
    expect(at(r.compartments, 0).features).toEqual([cutout("left", 47.85, 34)]);
    // The dial's well is cut through the front wall, half its 11 mm deep.
    expect(at(r.compartments, 1)).toEqual({
      x: 26.3,
      y: 32.35,
      w: 41,
      d: 31,
      floorZ: 58.2,
      kind: "well",
      contents: "Dial",
      componentId: "x1",
      features: [
        { type: "wallCutout", side: "front", at: 46.8, width: 25, depth: 5.5, floorNotch: 0 },
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

    it("shares width slack between bulk compartments and keeps them within reach", () => {
      const r = realizeTray(part, { w: 119.18, d: 57.98, h: 40 }, s, ground);
      expect(r.compartments).toEqual([
        {
          x: 1.6,
          y: 1.6,
          w: 59.78,
          d: 54.78,
          // 20 mm of pile plus 5 mm of freeboard, not the whole 38.8 mm the tray could give:
          // a deeper bin would just be a pit with a ramp at the bottom.
          floorZ: 15,
          kind: "scoop",
          contents: "Cubes ×30",
          componentId: "b1",
          features: [
            { type: "scoop", side: "front", r: 12 },
            { type: "scoop", side: "back", r: 12 },
          ],
        },
        {
          x: 62.58,
          y: 1.6,
          w: 55,
          d: 54.78,
          floorZ: 15,
          kind: "scoop",
          contents: "Coins 50 ml",
          componentId: "b1",
          features: [
            { type: "scoop", side: "front", r: 12 },
            { type: "scoop", side: "back", r: 12 },
          ],
        },
      ]);
    });

    it("stops a scooped bin at the depth you can reach, however tall the tray", () => {
      const r = realizeTray(part, { w: 119.18, d: 57.98, h: 100 }, s, ground);
      // 20 mm pile + 5 mm freeboard = 25 → floorZ = 100 − 25, the rest raised solid floor.
      expect(r.compartments.map((c) => c.floorZ)).toEqual([75, 75]);
    });

    it("caps a bin without a curved floor at 1.5 × the smaller side instead", () => {
      // Nothing to reach down to, so the old ratio cap is what binds: floor(1.5 × 54.78).
      const open = partOf(
        [
          bulk({
            fingerCuts: true,
            curvedFloor: false,
            items: [
              { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
              { name: "Coins", volumeMl: 50 },
            ],
          }),
        ],
        "shallow|strip|split1",
      );
      const r = realizeTray(open, { w: 119.18, d: 57.98, h: 100 }, s, ground);
      expect(r.compartments.map((c) => c.floorZ)).toEqual([17.83, 17.83]);
    });

    it("sizes the scoop as min(scoopRadius, depth), a second ramp opposite when 2 r fits across", () => {
      const r = realizeTray(
        part,
        { w: 119.18, d: 57.98, h: 40 },
        { ...s, scoopRadius: 50 },
        ground,
      );
      // Depth is now 25 (pile + freeboard), so it, not the 50 mm setting, caps the radius.
      expect(r.compartments.map((c) => c.features)).toEqual([
        [
          { type: "scoop", side: "front", r: 25 },
          { type: "scoop", side: "back", r: 25 },
        ],
        [
          { type: "scoop", side: "front", r: 25 },
          { type: "scoop", side: "back", r: 25 },
        ],
      ]);
    });
  });

  it("cuts each mini pocket through the front and back walls, half its depth, keeping 3 mm posts", () => {
    const part = partOf([minis()], "standing|strip|split1");
    const outer = minOuter(part, s, ground);
    expect(outer).toEqual({ w: 56.4, d: 29.2, h: 42.2 });
    const r = realizeTray(part, outer, s, ground);
    expect(r.compartments.map((c) => [c.contents, c.kind, c.x, c.y, c.w, c.d, c.floorZ])).toEqual([
      ["Hero 1/2", "pocket", 1.6, 1.6, 26, 26, 1.2],
      ["Hero 2/2", "pocket", 28.8, 1.6, 26, 26, 1.2],
    ]);
    expect(r.compartments.map((c) => c.features)).toEqual([
      [
        { type: "wallCutout", side: "front", at: 14.6, width: 20, depth: 20.5, floorNotch: 0 },
        { type: "wallCutout", side: "back", at: 14.6, width: 20, depth: 20.5, floorNotch: 0 },
      ],
      [
        { type: "wallCutout", side: "front", at: 41.8, width: 20, depth: 20.5, floorNotch: 0 },
        { type: "wallCutout", side: "back", at: 41.8, width: 20, depth: 20.5, floorNotch: 0 },
      ],
    ]);
  });

  it("realizes 2000 tiny cubes", () => {
    const grains = [bulk({ items: [{ name: "Grains", count: 2000, w: 3, d: 3, h: 3 }] })];
    const shallow = partOf(grains, "shallow|strip|split1");
    const deep = partOf(grains, "deep|strip|split1");
    expect(minOuter(shallow, s, ground)).toEqual({ w: 76.69, d: 76.69, h: 21.2 });
    // The deep shape spreads wider rather than deeper, so the pile stays within reach.
    expect(minOuter(deep, s, ground)).toEqual({ w: 63.2, d: 63.2, h: 31.2 });
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
    expect(at(r.compartments, 0)).toMatchObject({ x: 2.9, y: 2.9, w: 23.5, d: 92.5 });
    expect(at(at(r.compartments, 0).features, 0)).toMatchObject({ at: 49.15 });
  });

  it("refuses a tray whose tiny pocket has no room for a cut", () => {
    const part = partOf(
      [minis({ clearance: 0, figures: [{ name: "Pip", w: 0.5, d: 0.5, h: 0.01, count: 1 }] })],
      "standing|strip|split1",
    );
    expect(() => realizeTray(part, minOuter(part, s, ground), s, ground)).toThrow(CutFitError);
  });

  it("never undershoots a hand-built, off-grid compartment minimum", () => {
    const part: TrayPartReq = {
      trayKey: "hand:p0:0",
      arrangement: "strip",
      rotatable: true,
      compartments: [
        {
          componentId: "hand",
          contents: "Hand-built",
          kind: "well",
          minW: 20.004,
          minD: 30.004,
          minH: 10.004,
          elastic: { w: false, d: false, h: false },
          features: [],
        },
      ],
    };
    const outer = minOuter(part, s, ground);
    expect(outer).toEqual({ w: 23.21, d: 33.21, h: 11.21 });
    const r = realizeTray(part, outer, s, ground);
    const c = at(r.compartments, 0);
    expect([c.w, c.d, outer.h - c.floorZ]).toEqual([20.01, 30.01, expect.closeTo(10.01, 9)]);
    assertTrayInvariants(r, outer, s, ground);
  });

  it("throws RangeError when the outer is below minOuter", () => {
    expect(() => realizeTray(single, { w: 26.69, d: 95.7, h: 69.2 }, s, ground)).toThrow(
      RangeError,
    );
    expect(() => realizeTray(single, { w: 26.7, d: 95.69, h: 69.2 }, s, ground)).toThrow(
      RangeError,
    );
    expect(() => realizeTray(single, { w: 26.7, d: 95.7, h: 69.19 }, s, ground)).toThrow(
      RangeError,
    );
  });

  it("rejects an outer a hair below minOuter instead of rounding it up", () => {
    expect(() => realizeTray(single, { w: 26.696, d: 95.7, h: 69.2 }, s, ground)).toThrow(
      RangeError,
    );
    expect(() => realizeTray(single, { w: 26.7, d: 95.7, h: 69.1999 }, s, ground)).toThrow(
      RangeError,
    );
  });

  it("keeps the scoop radius within the width across it at any unit", () => {
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
    const r = realizeTray(part, { w: 119.19, d: 57.98, h: 40 }, { ...s, scoopRadius: 50 }, ground);
    // These wells are wide, so the 25 mm the bin is allowed to be deep caps the radius first.
    expect(r.compartments.map((c) => [c.w, c.features])).toEqual([
      [
        59.79,
        [
          { type: "scoop", side: "front", r: 25 },
          { type: "scoop", side: "back", r: 25 },
        ],
      ],
      [
        55,
        [
          { type: "scoop", side: "front", r: 25 },
          { type: "scoop", side: "back", r: 25 },
        ],
      ],
    ]);

    // A narrow bin has the depth of its pile (20 mm at this tray height) before it runs out of
    // width: the ramp is clamped by the dimension across it, which is not halved.
    const narrow = partOf(
      [bulk({ items: [{ name: "Tiny", count: 5, w: 5, d: 5, h: 5 }] })],
      "shallow|strip|split1",
    );
    const n = realizeTray(narrow, minOuter(narrow, s, ground), { ...s, scoopRadius: 50 }, ground);
    expect(at(n.compartments, 0).features).toEqual([{ type: "scoop", side: "front", r: 20 }]);
  });

  describe("scoop walls", () => {
    const tiny = partOf(
      [bulk({ items: [{ name: "Tiny", count: 5, w: 5, d: 5, h: 5 }] })],
      "shallow|strip|split1",
    );
    const sides = (c: CompartmentSpec) =>
      c.features.flatMap((f) => (f.type === "scoop" ? [[f.side, f.r]] : []));

    it("goes on the longer walls, so the ramp runs across the shorter dimension", () => {
      const base = minOuter(tiny, s, ground);
      const wide = realizeTray(tiny, { ...base, w: base.w + 40 }, s, ground);
      expect(sides(at(wide.compartments, 0))).toEqual([
        ["front", 12],
        ["back", 12],
      ]);
      const deep = realizeTray(tiny, { ...base, d: base.d + 40 }, s, ground);
      expect(sides(at(deep.compartments, 0))).toEqual([
        ["left", 12],
        ["right", 12],
      ]);
    });

    it("puts one full-size ramp where two would meet, front before back on a square well", () => {
      const cfg: Settings = { ...s, scoopRadius: 15 };
      const r = realizeTray(tiny, minOuter(tiny, cfg, ground), cfg, ground);
      // 25 × 25 mm: 2 × 15 > 25, and the radius is not shrunk to fit a second one.
      expect(sides(at(r.compartments, 0))).toEqual([["front", 15]]);
    });

    it("clamps the radius of a left or right ramp by the width, not the depth", () => {
      const base = minOuter(tiny, s, ground);
      const cfg: Settings = { ...s, scoopRadius: 50 };
      const r = realizeTray(tiny, { ...base, d: base.d + 40, h: 40 }, cfg, ground);
      // The well is 25 wide and 65 deep: the bin's 25 mm depth and its width both allow 25.
      expect(sides(at(r.compartments, 0))).toEqual([["left", 25]]);
    });

    it("yields to a cut: a ramp never shares a wall with one, and its opposite stays single", () => {
      const part = partOf([custom({ count: 1, curvedFloor: true })], "custom|strip|split1");
      const r = realizeTray(part, minOuter(part, s, ground), s, ground);
      const well = at(r.compartments, 0);
      expect(cutsOf(well).map((f) => f.type === "wallCutout" && f.side)).toEqual(["front"]);
      expect(sides(well)).toEqual([["back", 11]]);
    });
  });

  describe("settings that are not whole multiples of 0.01 mm", () => {
    const odd: Settings = {
      ...s,
      wall: 1.234,
      divider: 1.234,
      floor: 1.234,
      lip: { ...s.lip, thickness: 1.234 },
    };

    it("never undershoots the wall, divider or floor", () => {
      const part = partOf(
        [
          cards({
            decks: [
              { name: "A", count: 52 },
              { name: "B", count: 30 },
            ],
          }),
        ],
        "upright-long|strip|split1",
        odd,
      );
      const outer = minOuter(part, odd, ground);
      const r = realizeTray(part, outer, odd, ground);
      expect(r.wall).toBe(1.24);
      expect(r.compartments.map((c) => [c.x, c.y, c.floorZ])).toEqual([
        [1.24, 1.24, 1.24],
        [25.98, 1.24, 1.24],
      ]);
      const [a, b] = [at(r.compartments, 0), at(r.compartments, 1)];
      expect(b.x - (a.x + a.w)).toBeCloseTo(1.24, 9);
      assertTrayInvariants(r, outer, odd, ground);
    });

    it("keeps lipped compartments the lipped wall from the face", () => {
      const lipped: RealizeOptions = { lipped: true, level: 0 };
      const part = partOf([cards()], "upright-long|strip|split1", odd);
      const outer = minOuter(part, odd, lipped);
      const r = realizeTray(part, outer, odd, lipped);
      expect(r.wall).toBe(1.24); // the base wall; the lipped wall is derived from it
      expect(at(r.compartments, 0)).toMatchObject({ x: 2.94, y: 2.94 });
      assertTrayInvariants(r, outer, odd, lipped);
    });

    it("keeps odd-width finger channels inside the walls", () => {
      for (const [width, decks] of [
        [
          16.49,
          [
            { name: "A", count: 30 },
            { name: "B", count: 30 },
          ],
        ],
        [22.01, [{ name: "Solo", count: 1 }]],
      ] as const) {
        const cfg: Settings = { ...s, fingerPocket: { ...s.fingerPocket, width } };
        const part = partOf(
          [cards({ sleeve: "none", decks: [...decks] })],
          "upright-long|strip|split1",
          cfg,
        );
        const outer = minOuter(part, cfg, ground);
        assertTrayInvariants(realizeTray(part, outer, cfg, ground), outer, cfg, ground);
      }
    });

    it("never makes the well narrower than the content", () => {
      const part = partOf([custom({ w: 29.001, d: 29.001, count: 1 })], "custom|strip|split1");
      const outer = minOuter(part, s, ground);
      const c = at(realizeTray(part, outer, s, ground).compartments, 0);
      expect(c.w).toBeGreaterThanOrEqual(30.001);
      expect(c.d).toBeGreaterThanOrEqual(30.001);
    });

    it("grows walls and dividers to at most 2 × the setting, rounded down", () => {
      const cfg: Settings = { ...s, wall: 1.7976, divider: 1.7976 };
      const part = partOf([custom({ count: 2 })], "custom|strip|split1", cfg);
      const outer = minOuter(part, cfg, ground);
      const wide = { ...outer, w: outer.w + 40 };
      const r = realizeTray(part, wide, cfg, ground);
      const [a, b] = [at(r.compartments, 0), at(r.compartments, 1)];
      expect(a.x).toBe(3.59); // 2 × 1.7976 = 3.5952
      expect(b.x - (a.x + a.w)).toBeCloseTo(3.59, 9);
      expect(at(r.compartments, 2).kind).toBe("spare");
      assertTrayInvariants(r, wide, cfg, ground);
    });

    it("caps the scoop radius at the setting, rounded down", () => {
      const cfg: Settings = { ...s, scoopRadius: 10.006 };
      const part = partOf([bulk()], "shallow|strip|split1", cfg);
      const r = realizeTray(part, minOuter(part, cfg, ground), cfg, ground);
      expect(at(r.compartments, 0).features).toEqual([
        { type: "scoop", side: "front", r: 10 },
        { type: "scoop", side: "back", r: 10 },
      ]);
    });
  });

  describe("geometry contract", () => {
    const lipped: RealizeOptions = { lipped: true, level: 0 };
    const upper: RealizeOptions = { lipped: false, level: 1 };
    const group = partOf(
      [cards({ groupId: "g" }), custom({ groupId: "g", count: 1 })],
      "upright-long+custom|strip|split1",
    );
    const rows = partOf(
      [
        cards({
          decks: [
            { name: "A", count: 52 },
            { name: "B", count: 30 },
            { name: "C", count: 10 },
          ],
        }),
      ],
      "upright-long|rows2|split1",
    );
    const loose = partOf(
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
    const figures = partOf([minis()], "standing|strip|split1");
    const grow = (outer: OuterSize, dw: number, dd: number, dh: number): OuterSize => ({
      w: outer.w + dw,
      d: outer.d + dd,
      h: outer.h + dh,
    });
    const cases: [string, TrayPartReq, RealizeOptions][] = [
      ["one deck", single, ground],
      ["one deck, lipped", single, lipped],
      ["one deck, upper tray", single, upper],
      ["two rows", rows, ground],
      ["group", group, ground],
      ["bulk", loose, ground],
      ["minis", figures, ground],
    ];
    const slacks: [number, number, number][] = [
      [0, 0, 0],
      [30, 0, 0],
      [0, 20, 0],
      [3.37, 4.11, 5],
      [37, 37, 20],
    ];

    it.each(cases)("holds for %s at default settings", (_name, part, opts) => {
      for (const [dw, dd, dh] of slacks) {
        const outer = grow(minOuter(part, s, opts), dw, dd, dh);
        assertTrayInvariants(realizeTray(part, outer, s, opts), outer, s, opts);
      }
    });

    it("holds with 3-decimal settings", () => {
      const odd: Settings = {
        ...s,
        wall: 1.234,
        divider: 1.007,
        floor: 1.111,
        fingerPocket: { ...s.fingerPocket, width: 21.337 },
        lip: { ...s.lip, thickness: 1.234 },
      };
      const parts: [TrayPartReq, RealizeOptions][] = [
        [partOf([cards()], "upright-long|strip|split1", odd), ground],
        [partOf([cards()], "upright-long|strip|split1", odd), lipped],
        [partOf([minis()], "standing|strip|split1", odd), ground],
        [
          partOf(
            [
              cards({
                decks: [
                  { name: "A", count: 52 },
                  { name: "B", count: 30 },
                  { name: "C", count: 10 },
                ],
              }),
            ],
            "upright-long|rows2|split1",
            odd,
          ),
          ground,
        ],
      ];
      for (const [part, opts] of parts) {
        for (const [dw, dd, dh] of slacks) {
          const outer = grow(minOuter(part, odd, opts), dw, dd, dh);
          assertTrayInvariants(realizeTray(part, outer, odd, opts), outer, odd, opts);
        }
      }
    });
  });
});
