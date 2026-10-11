import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import { TraySpecError, UnsupportedFeatureError } from "./errors";
import { maxCornerRadius } from "../model/settings";
import type { CompartmentSpec, FeatureSpec, TraySpec } from "../model/types";
import {
  GEO,
  cardUpright,
  compartment,
  customBlock,
  lippedLower,
  plainBox,
  pocket,
  scoopBulk,
  slotIntoSpare,
  spacer,
  traySpec,
  upperLevel1,
} from "./test-specs";

describe("planTray basics", () => {
  it("uses the settings chamfer on level 0 and at least 0.5 on upper levels", () => {
    expect(planTray(plainBox, GEO).chamfer).toBe(0.4);
    expect(planTray(upperLevel1, GEO).chamfer).toBe(0.5);
    expect(planTray(upperLevel1, { ...GEO, bottomChamfer: 0.8 }).chamfer).toBe(0.8);
    expect(planTray(spacer, GEO).chamfer).toBe(0.4);
  });

  it("adds the lip from settings and widens the outer wall", () => {
    const plan = planTray(lippedLower, GEO);
    expect(plan.lip).toEqual({ height: 2, thickness: 1.2, chamfer: 0.6 });
    expect(plan.outerWall).toBeCloseTo(2.9, 9);
    expect(plan.topZ).toBe(27);
    expect(planTray(plainBox, GEO).lip).toBeNull();
  });

  it("keeps the default corner radius when walls are thick enough", () => {
    expect(planTray(plainBox, GEO).cornerRadius).toBe(3);
  });

  it("ignores compartments of solid parts", () => {
    expect(planTray({ ...plainBox, solid: true }, GEO).compartments).toEqual([]);
    expect(planTray(spacer, GEO).compartments).toEqual([]);
  });
});

describe("finger pockets", () => {
  it("leaves the reach band solid and cuts a U-slot in it", () => {
    const plan = planTray(cardUpright, GEO);
    const deck = plan.compartments[0];
    expect(deck?.content).toEqual({ x0: 1.6, y0: 13.6, x1: 25.6, y1: 106.1 });
    expect(deck?.slots).toHaveLength(2);
    const front = deck?.slots[0];
    expect(front?.x0).toBeCloseTo(2.6, 9);
    expect(front?.x1).toBeCloseTo(24.6, 9);
    expect(front?.y0).toBe(1.6);
    expect(front?.y1).toBeCloseTo(14.1, 9);
    expect(front?.radius).toBe(11);
    expect(front?.bottomZ).toBeCloseTo(69.2 - 68 / 3, 9);
  });

  it("clamps the pocket depth to the compartment floor", () => {
    const spec = traySpec({
      key: "deep",
      w: 60,
      d: 60,
      h: 10,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 56.8, d: 56.8, features: [pocket("front", 30, 50)] }),
      ],
    });
    expect(planTray(spec, GEO).compartments[0]?.slots[0]?.bottomZ).toBeCloseTo(1.2, 9);
  });

  it("rejects a pocket that would cut through the outer wall", () => {
    const spec = traySpec({
      key: "edge",
      w: 40,
      d: 60,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 36.8, d: 56.8, features: [pocket("front", 5, 5)] }),
      ],
    });
    expect(() => planTray(spec, GEO)).toThrow(/cut through the outer wall/);
  });

  it("rejects a reach that leaves no room for the contents", () => {
    const spec = traySpec({
      key: "reach",
      w: 60,
      d: 30,
      h: 20,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 56.8,
          d: 26.8,
          features: [pocket("front", 30, 5, 22, 13), pocket("back", 30, 5, 22, 13)],
        }),
      ],
    });
    expect(() => planTray(spec, GEO)).toThrow(/no room/);
  });
});

describe("finger slot clearance", () => {
  // Deck A (1.6…21.6) with a slot centred on `slotAt`, and a neighbour starting at `next`.
  const pair = (slotAt: number, width: number, next: CompartmentSpec): TraySpec =>
    traySpec({
      key: "slot-pair",
      w: 70,
      d: 60,
      h: 30,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 20,
          d: 56.8,
          features: [pocket("front", slotAt, 10, width)],
        }),
        next,
      ],
    });
  const well = (x: number, features: FeatureSpec[] = []): CompartmentSpec =>
    compartment({ x, y: 1.6, w: 68.4 - x, d: 56.8, features });

  it("throws a TraySpecError, a RangeError of its own name, for a spec it rejects", () => {
    const error: unknown = (() => {
      try {
        planTray(slotIntoSpare, GEO);
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(TraySpecError);
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ name: "TraySpecError" });
  });

  it("rejects the slot that reached into a spare compartment (plan 3 regression)", () => {
    expect(() => planTray(slotIntoSpare, GEO)).toThrow(RangeError);
    expect(() => planTray(slotIntoSpare, GEO)).toThrow(
      /Tray fxcrd003:p0:0: compartment 1: a finger pocket comes within 0\.8 mm of compartment 2/,
    );
  });

  it("accepts a slot exactly 0.8 mm from another compartment and rejects 0.79 mm", () => {
    // Slot 1.6…23.6: the neighbour may start at 24.4.
    expect(planTray(pair(12.6, 22, well(24.4)), GEO).compartments).toHaveLength(2);
    expect(() => planTray(pair(12.6, 22, well(24.39)), GEO)).toThrow(/within 0\.8 mm/);
  });

  it("merges neighbouring slots on one band line into one channel", () => {
    // cardUpright: decks 2 and 3 have slots 20 mm apart, within maxChannelSpacing(11) = 20.06.
    expect(planTray(cardUpright, GEO).compartments[2]?.slots).toHaveLength(2);
    // Deck B (30…) with a slot 20.06 mm (merges) or 20.1 mm (does not) right of A's; their ridge
    // peaks at 22.63, well clear of both decks' well faces.
    const merged = pair(12.6, 22, well(30, [pocket("front", 32.66, 10)]));
    expect(planTray(merged, GEO).compartments[1]?.slots).toHaveLength(1);
    expect(() => planTray(pair(12.6, 22, well(30, [pocket("front", 32.7, 10)])), GEO)).toThrow(
      /a finger pocket of compartment 1 without merging into one channel \(centres 20\.10 mm apart, at most 20\.06 mm\)/,
    );
    // The very same slot is one channel too.
    const same = pair(22.2, 40, well(22.8, [pocket("front", 22.2, 10, 40)]));
    expect(planTray(same, GEO).compartments[1]?.slots).toHaveLength(1);
  });

  it("merges only slots of one band line: same side, band, width and depth", () => {
    const next = (feature: FeatureSpec, y = 1.6): CompartmentSpec =>
      compartment({ x: 22.8, y, w: 45.6, d: 56.8 - (y - 1.6), features: [feature] });
    for (const other of [
      next(pocket("front", 31.6, 9)),
      next(pocket("front", 31.6, 10, 21.8)),
      next(pocket("front", 31.6, 10, 22, 11)),
      next(pocket("front", 31.6, 10), 1.7),
    ]) {
      expect(() => planTray(pair(12.6, 22, other), GEO)).toThrow(
        /compartment 0: a finger pocket comes within 0\.8 mm of (a finger pocket of )?compartment 1/,
      );
    }
    expect(planTray(pair(12.6, 22, next(pocket("front", 31.6, 10))), GEO)).toBeTruthy();
  });

  describe("well faces a slot crosses within its overlap into the contents", () => {
    // Deck A (1.6…aEnd) with a 22 mm slot centred on 12.6 (1.6…23.6), and deck B from bStart
    // whose own slot is far away: B's contents start where A's do, so A's slot meets them only
    // within its 0.5 mm overlap, and its round bottom crosses B's well face.
    const decks = (aEnd: number, bStart: number): TraySpec =>
      traySpec({
        key: "neck",
        w: 70,
        d: 60,
        h: 30,
        compartments: [
          compartment({
            x: 1.6,
            y: 1.6,
            w: aEnd - 1.6,
            d: 56.8,
            features: [pocket("front", 12.6, 10)],
          }),
          well(bStart, [pocket("front", 57, 10)]),
        ],
      });

    it("rejects a round bottom that ends just past the face (the feather of review round 2)", () => {
      expect(() => planTray(decks(22.37, 23.57), GEO)).toThrow(
        /compartment 0: a finger pocket crosses the well face of compartment 1 at 23\.57 mm 10\.97 mm from its centre \(at most 8\.17 mm\)/,
      );
      expect(() => planTray(decks(21.6, 22.8), GEO)).toThrow(/10\.20 mm from its centre/);
    });

    it("accepts a face at most maxWellFaceOffset(r) = 8.17 mm from the slot's centre", () => {
      expect(planTray(decks(19.56, 20.76), GEO).compartments).toHaveLength(2);
      expect(() => planTray(decks(19.59, 20.79), GEO)).toThrow(/8\.19 mm from its centre/);
      expect(planTray(decks(15.6, 16.8), GEO).compartments).toHaveLength(2);
    });

    it("accepts a slot that ends 0.8 mm short of the face, and rejects less", () => {
      expect(planTray(decks(20, 24.4), GEO).compartments).toHaveLength(2);
      expect(() => planTray(decks(20, 24.39), GEO)).toThrow(
        /compartment 0: a finger pocket ends less than 0\.8 mm short of the well face of compartment 1 at 24\.39 mm/,
      );
    });

    it("rejects a face that cuts the ridge between two merged slots just past its peak", () => {
      // Slots centred on 12.6 and 32.6 (20 mm apart, merged): their ridge peaks at 22.6. A's well
      // face at 22.5 leaves half the ridge on its solid side, 0.51 mm wide 0.8 mm below the peak.
      const straddle = (aEnd: number): TraySpec =>
        traySpec({
          key: "straddle",
          w: 45.2,
          d: 60,
          h: 30,
          compartments: [
            compartment({
              x: 1.6,
              y: 1.6,
              w: aEnd - 1.6,
              d: 56.8,
              features: [pocket("front", 12.6, 20)],
            }),
            compartment({
              x: aEnd + 1.2,
              y: 1.6,
              w: 43.6 - aEnd - 1.2,
              d: 56.8,
              features: [pocket("front", 32.6, 20)],
            }),
          ],
        });
      expect(() => planTray(straddle(22.5), GEO)).toThrow(
        /the well face of compartment 0 at 22\.50 mm leaves half the ridge between two finger pockets 0\.51 mm wide 0\.8 mm below its peak/,
      );
      expect(() => planTray(straddle(22.25), GEO)).toThrow(/0\.76 mm wide/);
      // 0.4 mm from the peak the half ridge is 0.81 mm wide.
      expect(planTray(straddle(22.2), GEO).compartments).toHaveLength(2);
    });

    it("judges a face by the nearest slot covering it", () => {
      // cardUpright: deck 2's slot (centre 41.8) crosses deck 3's face at 58 16.2 mm from its
      // centre, but deck 3's own slot (centre 61.8, on the contents' side) covers it too.
      expect(planTray(cardUpright, GEO).compartments).toHaveLength(3);
    });

    it("checks the slot's own compartment too", () => {
      // A narrow deck at the end, its slot pushed inward by the outer wall: its own well face at
      // 41.2 is 10 mm from the slot's centre (31.2).
      const spec = traySpec({
        key: "own-face",
        w: 43.8,
        d: 60,
        h: 30,
        compartments: [
          compartment({ x: 1.6, y: 1.6, w: 38.4, d: 56.8, features: [pocket("front", 20.8, 10)] }),
          compartment({ x: 41.2, y: 1.6, w: 1, d: 56.8, features: [pocket("front", 31.2, 10)] }),
        ],
      });
      expect(() => planTray(spec, GEO)).toThrow(
        /compartment 1: a finger pocket crosses the well face of compartment 1 at 41\.20 mm 10\.00 mm from its centre/,
      );
    });
  });

  it("checks the slots of one compartment against each other", () => {
    const corner = (left: number): TraySpec =>
      traySpec({
        key: "corner",
        w: 60,
        d: 60,
        h: 30,
        compartments: [
          compartment({
            x: 1.6,
            y: 1.6,
            w: 56.8,
            d: 56.8,
            features: [pocket("front", 12.6, 10), pocket("left", left, 10)],
          }),
        ],
      });
    // The front slot (x 1.6…23.6, y 1.6…14.1) and the left one (x 1.6…14.1) meet in the corner
    // when the left one reaches down to 14.6 − 11 = 3.6 mm.
    expect(() => planTray(corner(14.6), GEO)).toThrow(
      /compartment 0: a finger pocket comes within 0\.8 mm of a finger pocket of compartment 0/,
    );
    // Centred on 25.9 it starts at 14.9, 0.8 mm past the front slot.
    expect(planTray(corner(25.9), GEO).compartments[0]?.slots).toHaveLength(2);
    // Front and back slots face each other across the contents: nothing solid lies between them.
    const across = traySpec({
      key: "across",
      w: 60,
      d: 1.6 + 12 + 1 + 12 + 1.6,
      h: 30,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 56.8,
          d: 25,
          features: [pocket("front", 30, 10), pocket("back", 30, 10)],
        }),
      ],
    });
    expect(planTray(across, GEO).compartments[0]?.slots).toHaveLength(2);
  });

  it("rejects slots that overlap too little to merge", () => {
    const next = well(22.8, [pocket("front", 34, 10)]);
    expect(() => planTray(pair(12.6, 22, next), GEO)).toThrow(/without merging into one channel/);
  });

  it("rejects two slots that come within 0.8 mm across a wide divider", () => {
    // Slots 1.6…23.6 and 24.39…: each keeps 0.8 mm from the other's compartment, not from the slot.
    const near = well(26.6, [pocket("front", 35.39, 10)]);
    expect(() => planTray(pair(12.6, 22, near), GEO)).toThrow(
      /compartment 0: a finger pocket comes within 0\.8 mm of a finger pocket of compartment 1/,
    );
    const apart = well(26.6, [pocket("front", 35.4, 10)]);
    expect(planTray(pair(12.6, 22, apart), GEO).compartments).toHaveLength(2);
  });
});

describe("limits", () => {
  it("accepts specs exactly on a limit despite float noise (sizing output, 0.01 mm grid)", () => {
    // Content 8.29 − 7.29 = 0.9999999999999991 mm: exactly the 1 mm minimum.
    const narrow = traySpec({
      key: "narrow",
      w: 20,
      d: 30,
      h: 10,
      compartments: [
        compartment({ x: 7.29, y: 1.6, w: 1, d: 26.8, features: [pocket("front", 7.79, 3, 1)] }),
      ],
    });
    expect(planTray(narrow, GEO).compartments[0]?.content.x0).toBe(7.29);
    // Chamfer 2.27: h ≥ 2.27 + 0.8 = 3.0700000000000003 and min(w, d) ≥ 6.140000000000001.
    const steep = { ...GEO, bottomChamfer: 2.27 };
    const low = traySpec({
      key: "low",
      w: 60,
      d: 60,
      h: 3.07,
      // A raised floor keeps wall + floor − chamfer ≥ 0.8 under the steep chamfer.
      compartments: [compartment({ x: 1.6, y: 1.6, w: 56.8, d: 56.8, floorZ: 2 })],
    });
    expect(planTray(low, steep).chamfer).toBe(2.27);
    expect(planTray({ ...spacer, d: 6.14, h: 3.07 }, steep).chamfer).toBe(2.27);
  });
});

describe("scoops", () => {
  it("uses the requested radius when it fits", () => {
    expect(planTray(scoopBulk, GEO).compartments[0]?.scoops).toEqual([{ side: "front", r: 12 }]);
  });

  it("clamps the radius to the compartment depth on a shallow tray", () => {
    const shallow = { ...scoopBulk, h: 8 };
    const scoops = planTray(shallow, GEO).compartments.map((c) => c.scoops[0]?.r);
    expect(scoops).toEqual([6.8, 6.8, 6.8]);
  });
});

describe("validation", () => {
  it("rejects compartments that cut into the outer wall", () => {
    const spec = { ...plainBox, compartments: [compartment({ x: 0.5, y: 1.6, w: 97.9, d: 56.8 })] };
    expect(() => planTray(spec, GEO)).toThrow(RangeError);
    expect(() => planTray({ ...lippedLower, compartments: plainBox.compartments }, GEO)).toThrow(
      /outer wall/,
    );
  });

  it("rejects overlapping or touching compartments", () => {
    const spec = traySpec({
      key: "touch",
      w: 1.6 + 40 + 40 + 1.6,
      d: 40,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 40, d: 36.8 }),
        compartment({ x: 41.6, y: 1.6, w: 40, d: 36.8 }),
      ],
    });
    expect(() => planTray(spec, GEO)).toThrow(/compartments 0 and 1 overlap or touch/);
  });

  it("accepts a thin divider (printability reports it)", () => {
    const spec = traySpec({
      key: "thin-divider",
      w: 1.6 + 40 + 0.3 + 40 + 1.6,
      d: 40,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: 40, d: 36.8 }),
        compartment({ x: 41.9, y: 1.6, w: 40, d: 36.8 }),
      ],
    });
    expect(planTray(spec, GEO).compartments).toHaveLength(2);
  });

  it("rejects floors outside the tray and non-positive sizes", () => {
    expect(() =>
      planTray(
        {
          ...plainBox,
          compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, floorZ: 30 })],
        },
        GEO,
      ),
    ).toThrow(/floor/);
    expect(() => planTray({ ...plainBox, w: 0 }, GEO)).toThrow(/positive/);
    expect(() => planTray({ ...plainBox, w: Number.NaN }, GEO)).toThrow(/positive/);
  });

  it("throws UnsupportedFeatureError for unknown feature types, compartment kinds and parts", () => {
    const magnet = { type: "magnet", d: 6 } as unknown as FeatureSpec;
    const withMagnet = {
      ...customBlock,
      compartments: [{ ...compartment({ x: 1.6, y: 1.6, w: 50, d: 52 }), features: [magnet] }],
    };
    const lid = { ...plainBox, part: "lid" } as unknown as TraySpec;
    const hollow = {
      ...customBlock,
      compartments: [{ ...compartment({ x: 1.6, y: 1.6, w: 50, d: 52 }), kind: "hollow" }],
    } as unknown as TraySpec;
    const cases: [TraySpec, string][] = [
      [withMagnet, "magnet"],
      [lid, "part:lid"],
      [hollow, "kind:hollow"],
    ];
    for (const [spec, feature] of cases) {
      let thrown: unknown;
      try {
        planTray(spec, GEO);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(UnsupportedFeatureError);
      expect(thrown).toMatchObject({ feature });
    }
  });
});

describe("rejections", () => {
  const withPocket = (feature: Record<string, unknown>): TraySpec =>
    traySpec({
      key: "bad-pocket",
      w: 60,
      d: 60,
      h: 20,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 56.8,
          d: 56.8,
          features: [{ ...pocket("front", 30, 5), ...feature } as FeatureSpec],
        }),
      ],
    });

  it.each([
    ["width", 0],
    ["width", -1],
    ["reach", 0],
    ["reach", -1],
    ["depth", 0],
    ["depth", -1],
  ])("rejects a finger pocket with %s %d", (field, value) => {
    expect(() => planTray(withPocket({ [field]: value }), GEO)).toThrow(/invalid finger pocket/);
  });

  it("rejects a finger pocket with a NaN position", () => {
    expect(() => planTray(withPocket({ at: Number.NaN }), GEO)).toThrow(/invalid finger pocket/);
  });

  it("rejects an unknown side", () => {
    expect(() => planTray(withPocket({ side: "top" }), GEO)).toThrow(/unknown side "top"/);
    const scoop = { type: "scoop", side: "up", r: 5 } as unknown as FeatureSpec;
    const spec = {
      ...plainBox,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, features: [scoop] })],
    };
    expect(() => planTray(spec, GEO)).toThrow(/unknown side "up"/);
  });

  it("rejects a wall below MIN_WALL_MM (0.8 mm plus the corner margin)", () => {
    const thin = { ...plainBox, wall: 0.89 };
    expect(() => planTray(thin, GEO)).toThrow(/wall 0.89 mm is below 0.9 mm/);
    expect(planTray({ ...plainBox, wall: 0.9 }, GEO).outerWall).toBe(0.9);
  });

  it("rejects a lip thinner than 0.9 mm (0.8 plus the corner margin)", () => {
    const thin = { ...GEO, lip: { ...GEO.lip, thickness: 0.89 } };
    expect(() => planTray(lippedLower, thin)).toThrow(/lip thickness 0.89 mm is below 0.9 mm/);
    const exact = { ...GEO, lip: { ...GEO.lip, thickness: 0.9 } };
    expect(planTray(lippedLower, exact).lip?.thickness).toBe(0.9);
  });

  it("plans the lowest lip height settings allow (1 mm)", () => {
    const low = { ...GEO, lip: { ...GEO.lip, height: 1 } };
    const plan = planTray(lippedLower, low);
    expect(plan.lip).toEqual({ height: 1, thickness: 1.2, chamfer: 0.6 });
    expect(plan.topZ).toBe(26);
  });

  it("rejects a tray just too small for its chamfer", () => {
    const steep = { ...GEO, bottomChamfer: 2 };
    const box = (w: number, d: number, h: number): TraySpec =>
      traySpec({ key: "small", w, d, h, compartments: [] });
    // Limits: min(w, d) ≥ 2 · (2 + 0.8) = 5.6 and h ≥ 2.8.
    expect(planTray(box(5.6, 5.6, 2.8), steep).chamfer).toBe(2);
    expect(() => planTray(box(5.59, 6, 3), steep)).toThrow(/too small/);
    expect(() => planTray(box(6, 5.59, 3), steep)).toThrow(/too small/);
    expect(() => planTray(box(6, 6, 2.79), steep)).toThrow(/too small/);
    expect(() => planTray({ ...spacer, w: 40, d: 5.59, h: 20 }, steep)).toThrow(/too small/);
  });

  it("rejects non-finite chamfer, corner radius and lip ledge settings", () => {
    const nan = Number.NaN;
    expect(() => planTray(plainBox, { ...GEO, bottomChamfer: nan })).toThrow(/bottom chamfer/);
    expect(() => planTray(plainBox, { ...GEO, cornerRadius: nan })).toThrow(/corner radius/);
    expect(() => planTray(lippedLower, { ...GEO, lip: { ...GEO.lip, ledge: nan } })).toThrow(
      /lip ledge/,
    );
    expect(() => planTray(lippedLower, { ...GEO, lip: { ...GEO.lip, height: nan } })).toThrow(
      /lip height/,
    );
  });
});

describe("bottom chamfer against walls and floor", () => {
  const thinTray = (wall: number, floor: number): TraySpec =>
    traySpec({
      key: "thin",
      wall,
      floor,
      w: 60,
      d: 60,
      h: 20,
      compartments: [
        compartment({ x: wall, y: wall, w: 60 - 2 * wall, d: 60 - 2 * wall, floorZ: floor }),
      ],
    });

  it("rejects a chamfer that breaks out through the wall or floor", () => {
    const steep = { ...GEO, bottomChamfer: 3 };
    expect(() => planTray(thinTray(0.9, 0.8), steep)).toThrow(RangeError);
    expect(() => planTray(thinTray(0.9, 0.8), steep)).toThrow(/3 mm bottom chamfer/);
  });

  it("accepts a chamfer leaving exactly 0.8 mm of material", () => {
    // A compartment 0.9 mm from the left face only (its corners are far from the outer corners):
    // wall + floor − chamfer = 0.9 + 1.3 − 1.4 = 0.8, float noise included.
    const edge = traySpec({
      key: "edge",
      wall: 0.9,
      floor: 1.3,
      w: 60,
      d: 60,
      h: 20,
      compartments: [compartment({ x: 0.9, y: 20, w: 20, d: 20, floorZ: 1.3 })],
    });
    expect(planTray(edge, { ...GEO, bottomChamfer: 1.4 }).chamfer).toBe(1.4);
    expect(() => planTray(edge, { ...GEO, bottomChamfer: 1.41 })).toThrow(/bottom chamfer/);
  });

  it("rejects a chamfer that leaves a thin outer corner at the well floor", () => {
    // Straight faces keep 1.6 + 1.2 − 1.95 = 0.85 mm, but the corner (R = chamfer = 1.95, pulled in
    // by 0.75 at the floor) keeps 1.95 − 0.75 − √2·0.35 = 0.71 mm.
    const corner = traySpec({
      key: "steep-corner",
      w: 60,
      d: 60,
      h: 20,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 56.8, d: 56.8 })],
    });
    expect(() => planTray(corner, { ...GEO, bottomChamfer: 1.95 })).toThrow(/outer corner radius/);
    // R = chamfer = 1.88 keeps 1.88 − 0.68 − √2·0.28 = 0.80 mm on the true arc: not the 0.8 mm plus
    // CORNER_MARGIN the arc polygon needs.
    expect(() => planTray(corner, { ...GEO, bottomChamfer: 1.88 })).toThrow(/keeps only 0.80 mm/);
    // At 1.81 the corner limit for e = 0.61 is rounder than the chamfer.
    expect(planTray(corner, { ...GEO, bottomChamfer: 1.81 }).cornerRadius).toBeCloseTo(
      maxCornerRadius(1.6, 1.6, 0.61),
      9,
    );
  });

  it("measures the floor of each compartment, not the tray's nominal floor", () => {
    const spec = traySpec({
      key: "low-floor",
      w: 60,
      d: 60,
      h: 20,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 56.8, d: 56.8, floorZ: 0.8 })],
    });
    // 1.6 + 0.8 − 1.6 = 0.8 passes, 1.6 + 0.8 − 1.7 = 0.7 does not (spec.floor is 1.2).
    expect(planTray(spec, { ...GEO, bottomChamfer: 1.6 }).chamfer).toBe(1.6);
    expect(() => planTray(spec, { ...GEO, bottomChamfer: 1.7 })).toThrow(/chamfer/);
  });

  it("keeps the same material at the ends of a finger slot", () => {
    const steep = { ...GEO, bottomChamfer: 3 };
    // The compartment is far from the outer faces; its slot at the left end of a front band is not:
    // the slot's side end is lo from the left face, its round bottom (radius r) rises over the floor.
    const slotAt = (at: number): TraySpec =>
      traySpec({
        key: "slot-end",
        w: 80,
        d: 60,
        h: 20,
        compartments: [
          compartment({
            x: 12,
            y: 6,
            w: 60,
            d: 50,
            floorZ: 1.5,
            features: [pocket("front", at, 20, 2, 5)],
          }),
        ],
      });
    // End 1.6 mm from the face: 1.6 + 1.5 + (2 − √2)·1 − 3 = 0.69 < 0.8.
    expect(() => planTray(slotAt(2.6), steep)).toThrow(/finger pocket.*bottom chamfer/);
    // 0.3 mm further in: 0.99.
    expect(planTray(slotAt(2.9), steep).compartments[0]?.slots).toHaveLength(1);
    // The far end is checked the same way.
    expect(() => planTray(slotAt(80 - 2.6), steep)).toThrow(/finger pocket.*bottom chamfer/);
    // And a pocket that is fine without a steep chamfer is accepted with the default.
    expect(planTray(slotAt(2.6), GEO).compartments[0]?.slots).toHaveLength(1);
  });

  it("does not check solid parts", () => {
    expect(planTray({ ...spacer }, { ...GEO, bottomChamfer: 3 }).chamfer).toBe(3);
  });
});

describe("compartment separation grid", () => {
  const pair = (firstEnd: number, secondStart: number): TraySpec =>
    traySpec({
      key: "pair",
      w: 100,
      d: 40,
      h: 20,
      compartments: [
        compartment({ x: 1.6, y: 1.6, w: firstEnd - 1.6, d: 36.8 }),
        compartment({ x: secondStart, y: 1.6, w: 98.4 - secondStart, d: 36.8 }),
      ],
    });

  it.each([
    [41.6, 41.61],
    [41, 41.01],
    [7.29 + 1, 8.3],
  ])("accepts a 0.01 mm divider on the 0.01 grid (%d to %d)", (end, start) => {
    expect(planTray(pair(end, start), GEO).compartments).toHaveLength(2);
  });

  it("still rejects compartments touching or overlapping", () => {
    expect(() => planTray(pair(41.6, 41.6), GEO)).toThrow(/overlap or touch/);
    expect(() => planTray(pair(41.6, 41.4), GEO)).toThrow(/overlap or touch/);
  });
});
