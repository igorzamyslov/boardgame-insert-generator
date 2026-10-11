import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import { UnsupportedFeatureError } from "./errors";
import type { FeatureSpec, TraySpec } from "../model/types";
import {
  GEO,
  cardUpright,
  compartment,
  customBlock,
  lippedLower,
  plainBox,
  pocket,
  scoopBulk,
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

  it("rejects a wall below 0.8 mm", () => {
    const thin = { ...plainBox, wall: 0.79 };
    expect(() => planTray(thin, GEO)).toThrow(/wall 0.79 mm is below 0.8 mm/);
    expect(planTray({ ...plainBox, wall: 0.8 }, GEO).outerWall).toBe(0.8);
  });

  it("rejects a lip thinner than 0.8 mm", () => {
    const thin = { ...GEO, lip: { ...GEO.lip, thickness: 0.79 } };
    expect(() => planTray(lippedLower, thin)).toThrow(/lip thickness 0.79 mm is below 0.8 mm/);
    const exact = { ...GEO, lip: { ...GEO.lip, thickness: 0.8 } };
    expect(planTray(lippedLower, exact).lip?.thickness).toBe(0.8);
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
    expect(() => planTray(thinTray(0.8, 0.8), steep)).toThrow(RangeError);
    expect(() => planTray(thinTray(0.8, 0.8), steep)).toThrow(/3 mm bottom chamfer/);
  });

  it("accepts a chamfer leaving exactly 0.8 mm of material", () => {
    // wall + floor − chamfer = 0.8 + 1.4 − 1.4 = 0.8, float noise included.
    expect(planTray(thinTray(0.8, 1.4), { ...GEO, bottomChamfer: 1.4 }).chamfer).toBe(1.4);
    expect(() => planTray(thinTray(0.8, 1.4), { ...GEO, bottomChamfer: 1.41 })).toThrow(/chamfer/);
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
