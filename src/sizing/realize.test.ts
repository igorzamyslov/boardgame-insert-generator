import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, maxChannelSpacing } from "../model/settings";
import type { CompartmentSpec, FeatureSpec, Settings } from "../model/types";
import { SlotFitError } from "./errors";
import { minLayoutU } from "./outer";
import { minOuter, realizeTray } from "./realize";
import { fromU, round2 } from "./units";
import { assertTrayInvariants, at, bulk, cards, custom, minis, partOf } from "./test-helpers";
import type { OuterSize, RealizeOptions, TrayPartReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const ground: RealizeOptions = { lipped: false, level: 0 };
const single = partOf([cards()], "upright-long|strip|split1");
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
        features: [cutout("left", 47.85, 34), cutout("right", 47.85, 34)],
      },
    ]);
  });

  it("turns spare stack length into one removable spacer", () => {
    const r = realizeTray(single, { w: 56.7, d: 95.7, h: 69.2 }, s, ground);
    expect(r.compartments).toHaveLength(1);
    const well = at(r.compartments, 0);
    expect(well).toMatchObject({ x: 1.6, y: 1.6, w: 53.5, d: 92.5, floorZ: 1.2 });
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
        w: 30,
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
    expect(minOuter(part, s, ground)).toEqual({ w: 26.7, d: 189.4, h: 69.2 });
    const outer = { w: 46.7, d: 189.4, h: 69.2 };
    const r = realizeTray(part, outer, s, ground);
    // The spare starts right after the divider: "B ×30"'s channel runs into it.
    expect(r.compartments.map((c) => [c.contents, c.x, c.y, c.w, c.d])).toEqual([
      ["A ×52", 1.6, 1.6, 43.5, 92.5],
      ["B ×30", 3.2, 95.3, 13.98, 92.5],
      ["spare", 18.38, 95.3, 25.12, 92.5],
    ]);
    expect(cutsOf(at(r.compartments, 1))).toEqual([
      cutout("left", 141.55, 34),
      cutout("right", 141.55, 34),
    ]);
    expect(r.spacers).toHaveLength(1);
    expect(at(r.spacers, 0)).toMatchObject({ x: 25.1, y: 1.6, w: 20, d: 92.5, h: 63 });
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
    expect(at(r.compartments, 1)).toEqual({
      x: 26.3,
      y: 26.35,
      w: 41,
      d: 43,
      floorZ: 58.2,
      kind: "well",
      contents: "Dial",
      features: [
        { type: "fingerPocket", side: "front", at: 46.8, width: 25, reach: 12, depth: 11 },
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
      [{ type: "fingerPocket", side: "front", at: 14.6, width: 25, reach: 12, depth: 13.67 }],
      [{ type: "fingerPocket", side: "front", at: 41.8, width: 25, reach: 12, depth: 13.67 }],
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
    expect(at(r.compartments, 0)).toMatchObject({ x: 2.9, y: 2.9, w: 23.5, d: 92.5 });
    expect(at(at(r.compartments, 0).features, 0)).toMatchObject({ at: 49.15 });
  });

  it("keeps 1 mm of content and a real finger pocket for a tiny figure", () => {
    const part = partOf(
      [minis({ clearance: 0, figures: [{ name: "Pip", w: 0.5, d: 0.5, h: 0.01, count: 1 }] })],
      "standing|strip|split1",
    );
    const outer = minOuter(part, s, ground);
    const r = realizeTray(part, outer, s, ground);
    const c = at(r.compartments, 0);
    expect(c.w).toBeGreaterThanOrEqual(1);
    expect(c.d - 12).toBeGreaterThanOrEqual(1); // minus the front reach band
    const slot = at(c.features, 0);
    expect(slot.type === "fingerPocket" && slot.depth).toBe(0.01);
    assertTrayInvariants(r, outer, s, ground);
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

  it("keeps the scoop radius within half the content width at any unit", () => {
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
    expect(r.compartments.map((c) => [c.w, c.features])).toEqual([
      [59.79, [{ type: "scoop", side: "front", r: 29.89 }]],
      [55, [{ type: "scoop", side: "front", r: 27.5 }]],
    ]);
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
      const cfg: Settings = { ...s, fingerPocket: { ...s.fingerPocket, reach: 12.345 } };
      const part = partOf([custom({ w: 29.001, d: 29.001, count: 1 })], "custom|strip|split1", cfg);
      const outer = minOuter(part, cfg, ground);
      const c = at(realizeTray(part, outer, cfg, ground).compartments, 0);
      const band = 1235; // one front pocket, reach 12.345 rounded up to whole units
      expect(c.w).toBeGreaterThanOrEqual(30.001);
      expect((Math.round(c.d * 100) - band) / 100).toBeGreaterThanOrEqual(30.001);
    });

    it("never makes a finger pocket narrower than the setting", () => {
      const cfg: Settings = { ...s, fingerPocket: { ...s.fingerPocket, width: 22.004 } };
      const part = partOf(
        [minis({ figures: [{ name: "Pip", w: 5, d: 5, h: 5, count: 1 }] })],
        "standing|strip|split1",
        cfg,
      );
      const outer = minOuter(part, cfg, ground);
      expect(outer.w - 2 * 1.6).toBeGreaterThanOrEqual(22.01);
      const r = realizeTray(part, outer, cfg, ground);
      const slot = at(at(r.compartments, 0).features, 0);
      expect(slot).toMatchObject({ type: "fingerPocket", width: 22.01 });
      assertTrayInvariants(r, outer, cfg, ground);
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
      expect(at(r.compartments, 0).features).toEqual([{ type: "scoop", side: "front", r: 10 }]);
    });

    it("reports the reach it reserves", () => {
      const cfg: Settings = { ...s, fingerPocket: { ...s.fingerPocket, reach: 12.345 } };
      const part = partOf([custom({ count: 1 })], "custom|strip|split1", cfg);
      const outer = minOuter(part, cfg, ground);
      const wide = { ...outer, w: outer.w + 30 };
      const r = realizeTray(part, wide, cfg, ground);
      const well = at(r.compartments, 0);
      expect(at(well.features, 0)).toMatchObject({ type: "fingerPocket", reach: 12.35 });
      expect(well.d).toBeCloseTo(31 + 12.35, 9);
      assertTrayInvariants(r, wide, cfg, ground);
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
        fingerPocket: { ...s.fingerPocket, width: 21.337, reach: 11.987 },
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

  describe("finger slot clearance", () => {
    // Minis pockets and custom wells keep their finger pockets (reach band and U-slot). These
    // pockets are as wide as the card wells the rules were first worked out on (a stack of n
    // cards, sleeve "none" or "standard"), each 65 mm deep, so their ⅓-depth slots match, with
    // the 22 mm finger width of that time.
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, width: 22 },
    };
    const lipped: RealizeOptions = { lipped: true, level: 0 };
    const pockets = (widths: number[], names?: string[]) =>
      minis({
        figures: widths.map((w, i) => ({
          name: names?.[i] ?? `D${i + 1}`,
          w: round2(w - 1),
          d: 88.5,
          h: 64,
          count: 1,
        })),
      });
    // The well width of a stack of `count` cards: count · t · 1.03 + 1, rounded up to 0.01 mm.
    const stack = (count: number, t = 0.32): number =>
      Math.ceil((count * t * 1.03 + 1) * 100) / 100;
    const objectives = partOf(
      [pockets([stack(45, 0.42), stack(50, 0.42)], ["Goals", "Starting hands"])],
      "standing|rows2|split1",
    );

    it("keeps a spare compartment clear of a pocket's slot (plan 3 regression)", () => {
      const min = minOuter(objectives, s, lipped);
      const outer = { w: min.w + 10, d: min.d + 10, h: min.h + 10 };
      const r = realizeTray(objectives, outer, s, lipped);
      assertTrayInvariants(r, outer, s, lipped);
      // The slack beside "Goals" does not become a spare its slot would reach into.
      expect(r.compartments.map((c) => c.contents)).toEqual(["Starting hands", "Goals"]);
      expect(at(at(r.compartments, 1).features, 0)).toMatchObject({ at: 13.9, width: 22 });
    });

    it("keeps a spare when there is room beside the slot", () => {
      const min = minOuter(objectives, s, lipped);
      const outer = { w: min.w + 30, d: min.d, h: min.h };
      const r = realizeTray(objectives, outer, s, lipped);
      assertTrayInvariants(r, outer, s, lipped);
      // The spare beside "Goals" (row 1) starts 0.8 mm past its slot, not right after the divider.
      const goals = at(r.compartments, 1);
      const spare = r.compartments.find((c) => c.kind === "spare" && c.y === goals.y);
      if (spare === undefined) {
        throw new Error("expected a spare beside Goals");
      }
      const slot = at(goals.features, 0);
      if (slot.type !== "fingerPocket") {
        throw new Error("expected a finger pocket");
      }
      expect(spare.x).toBeCloseTo(slot.at + slot.width / 2 + 0.8, 9);
    });

    const strip = (counts: number[]): TrayPartReq =>
      partOf([pockets(counts.map((n) => stack(n)))], "standing|strip|split1");
    const slotsOf = (part: TrayPartReq) => {
      const outer = minOuter(part, s, ground);
      const r = realizeTray(part, outer, s, ground);
      assertTrayInvariants(r, outer, s, ground);
      return r.compartments.map((c) => {
        const f = at(c.features, 0);
        if (f.type !== "fingerPocket") {
          throw new Error("expected a finger pocket");
        }
        return f;
      });
    };

    it("merges the slots of narrow neighbouring pockets into one channel", () => {
      const slots = slotsOf(strip([45, 45, 45, 45]));
      expect(slots.map((f) => [f.at, f.width])).toEqual([
        [12.6, 22],
        [26.56, 22],
        [43.6, 22],
        [57.56, 22],
      ]);
      // Each overlaps the next, centres at most maxChannelSpacing(11) = 20.06 mm apart.
      slots.slice(1).forEach((f, i) => {
        const spacing = f.at - at(slots, i).at;
        expect(spacing).toBeLessThan(22);
        expect(spacing).toBeLessThanOrEqual(maxChannelSpacing(11));
      });
    });

    it("widens minOuter until the finger slots fit", () => {
      // A 1.33 mm pocket against the wall: at the minimum layout (46.29 mm) a slot of at least
      // 15 mm would cross its own well face too far from the slot's centre (roadmap §4.6); 1.45 mm
      // more lets the walls and divider grow until it fits.
      const part = strip([1, 120]);
      expect(fromU(minLayoutU(part, s, ground).w)).toBe(46.29);
      const min = minOuter(part, s, ground);
      expect(min).toEqual({ w: 47.74, d: 104.7, h: 66.2 });
      assertTrayInvariants(realizeTray(part, min, s, ground), min, s, ground);
    });

    it("refuses a tray whose finger slots fit at no footprint the search tries", () => {
      // Two 1.5 mm pockets of different depths, so their slots run on two band lines: no
      // footprint up to fingerPocket.width wider leaves room for 15 mm slots, and a part refused at
      // minOuter is refused at every outer.
      const part = partOf(
        [
          minis({
            figures: [
              { name: "A", w: 0.5, d: 1, h: 20, count: 1 },
              { name: "B", w: 0.5, d: 3, h: 10, count: 1 },
            ],
          }),
        ],
        "standing|strip|split1",
      );
      const min = minOuter(part, s, ground);
      expect(fromU(minLayoutU(part, s, ground).w)).toBe(min.w);
      for (const extra of [0, 3, 30]) {
        let error: unknown;
        try {
          realizeTray(part, { ...min, w: min.w + extra }, s, ground);
        } catch (thrown) {
          error = thrown;
        }
        expect(error).toBeInstanceOf(SlotFitError);
        expect(error).toBeInstanceOf(RangeError);
        const fit = error as SlotFitError;
        expect(fit.name).toBe("SlotFitError");
        expect(fit.message).toBe("Tray m1:p0:0: cannot fit a finger slot of at least 15 mm for A");
        expect(fit.minWidth).toBe(15);
        expect(fit.componentIds).toEqual(["m1"]);
        expect(fit.contents).toEqual(["A"]);
      }
    });

    it("throws a plain RangeError, not a SlotFitError, for an outer below minOuter", () => {
      const part = strip([1, 120]);
      const min = minOuter(part, s, ground);
      let error: unknown;
      try {
        realizeTray(part, { ...min, w: min.w - 0.01 }, s, ground);
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(RangeError);
      expect(error).not.toBeInstanceOf(SlotFitError);
    });

    it("is monotonic in slack: slots that fit at minOuter fit in any larger outer", () => {
      // A 1.44 mm pocket beside a 52.92 mm one, on a lipped tray: the slots fit at minOuter, but
      // the slack of a 20 mm larger outer (a wider row, a spare) leaves no room for them. The tray
      // falls back to its minOuter arrangement, centred: the slack goes to the outer walls.
      const part = partOf([pockets([stack(1, 0.42), stack(120, 0.42)])], "standing|strip|split1");
      const min = minOuter(part, s, lipped);
      const atMin = realizeTray(part, min, s, lipped);
      for (const extra of [20.01, 37]) {
        const outer = { w: min.w + extra, d: min.d + extra, h: min.h };
        const r = realizeTray(part, outer, s, lipped);
        assertTrayInvariants(r, outer, s, lipped);
        expect(r.wall).toBe(atMin.wall);
        const shift = Math.floor(extra * 50) / 100; // half the slack, rounded down to 0.01 mm
        expect(r.spacers).toEqual([]);
        expect(r.compartments).toEqual(
          atMin.compartments.map((c) => ({
            ...c,
            x: round2(c.x + shift),
            y: round2(c.y + shift),
            features: c.features.map((f) =>
              f.type === "fingerPocket" ? { ...f, at: round2(f.at + shift) } : f,
            ),
          })),
        );
      }
    });

    it("moves a slot so neighbours merge instead of narrowing them", () => {
      // The narrow pockets' slots, pushed against the wall, start 21.6 mm from the wide pocket's
      // centre: too far to merge, too close to keep apart. The middle pocket's slot moves 3.9 mm
      // toward the wide one (still covering its own centre, 45.84) to within
      // maxChannelSpacing(11).
      const slots = slotsOf(strip([120, 12, 12]));
      expect(slots.map((f) => [f.at, f.width])).toEqual([
        [21.88, 22],
        [41.94, 22],
        [43.48, 22],
      ]);
    });
  });
});
