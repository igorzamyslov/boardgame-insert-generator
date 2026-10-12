import { describe, expect, it } from "vitest";
import { planTray } from "./plan";
import { TraySpecError, UnsupportedFeatureError } from "./errors";
import { maxCornerRadius } from "../model/settings";
import type { FeatureSpec, TraySpec } from "../model/types";
import {
  GEO,
  compartment,
  customBlock,
  cutout,
  lippedLower,
  plainBox,
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

describe("errors", () => {
  it("throws a TraySpecError, a RangeError of its own name, for a spec it rejects", () => {
    const error: unknown = (() => {
      try {
        planTray({ ...plainBox, w: -1 }, GEO);
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(TraySpecError);
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ name: "TraySpecError" });
  });
});

describe("limits", () => {
  it("accepts specs exactly on a limit despite float noise (sizing output, 0.01 mm grid)", () => {
    // A 10 mm cut keeping 3 mm posts in a well 7.29…23.29: 15.29 − 12.29 = 2.9999999999999982.
    const narrow = traySpec({
      key: "narrow",
      w: 30,
      d: 30,
      h: 10,
      compartments: [
        compartment({
          x: 7.29,
          y: 1.6,
          w: 16,
          d: 26.8,
          features: [cutout("front", 15.29, 3, 0, 10)],
        }),
      ],
    });
    expect(planTray(narrow, GEO).compartments[0]?.cuts).toHaveLength(1);
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
    expect(() => planTray(spec, GEO)).toThrow(/compartments 0 and 1 are less than 0.8 mm apart/);
  });

  it("rejects a divider thinner than 0.8 mm", () => {
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
    expect(() => planTray(spec, GEO)).toThrow(TraySpecError);
    expect(() => planTray(spec, GEO)).toThrow(/compartments 0 and 1 are less than 0.8 mm apart/);
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
  it("rejects an unknown side", () => {
    const cut = { ...cutout("front", 50, 5), side: "top" } as unknown as FeatureSpec;
    const withCut = {
      ...plainBox,
      compartments: [compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8, features: [cut] })],
    };
    expect(() => planTray(withCut, GEO)).toThrow(/unknown side "top"/);
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

  it("keeps a flat lip top of at least 0.6 mm: chamfer min(0.6, thickness − 0.6)", () => {
    // The ledge keeps the lipped wall at lippedLower's 2.9 mm.
    const lipOf = (thickness: number) =>
      planTray(lippedLower, { ...GEO, lip: { ...GEO.lip, thickness, ledge: 2.9 - thickness } }).lip;
    expect(lipOf(0.9)?.chamfer).toBeCloseTo(0.3, 9);
    expect(lipOf(1)?.chamfer).toBeCloseTo(0.4, 9);
    expect(lipOf(1.2)?.chamfer).toBe(0.6);
    expect(lipOf(2)?.chamfer).toBe(0.6);
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
    [41.6, 42.4],
    [41, 41.8],
    [7.29 + 1, 9.09],
  ])("accepts a 0.8 mm divider on the 0.01 grid (%d to %d)", (end, start) => {
    expect(planTray(pair(end, start), GEO).compartments).toHaveLength(2);
  });

  it("rejects a divider under 0.8 mm, touching or overlapping compartments", () => {
    for (const start of [42.39, 41.61, 41.6, 41.4]) {
      expect(() => planTray(pair(41.6, start), GEO)).toThrow(/less than 0.8 mm apart/);
    }
  });
});
