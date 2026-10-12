import { describe, expect, it } from "vitest";
import type { CompartmentSpec, FeatureSpec, TraySpec } from "../model/types";
import { planTray } from "./plan";
import { TraySpecError } from "./errors";
import { KNOWN_FEATURE_TYPES } from "./types";
import { FINGER_FILLET_MM } from "./plan-types";
import {
  GEO,
  compartment,
  cutout,
  flatCutouts,
  notchedSpacer,
  pocket,
  traySpec,
  uprightChannel,
  uprightChannelLipped,
} from "./test-specs";
import type { WallCutout } from "./test-specs";

// A 60 × 60 × 30 tray with one 20 × 56.8 well at x 1.6…21.6 and `others` beside it; the well
// carries `features`.
function beside(
  features: FeatureSpec[],
  others: CompartmentSpec[] = [],
  over: Partial<TraySpec> = {},
) {
  return traySpec({
    key: "cut",
    w: 60,
    d: 60,
    h: 30,
    compartments: [compartment({ x: 1.6, y: 1.6, w: 20, d: 56.8, features }), ...others],
    ...over,
  });
}

/** A planned cut with its footprint rounded to the 0.01 mm grid (float noise aside). */
function rounded<T extends { x0: number; x1: number; y0: number; y1: number }>(cut: T | undefined) {
  const r = (v: number) => Math.round(v * 100) / 100;
  return cut && { ...cut, x0: r(cut.x0), x1: r(cut.x1), y0: r(cut.y0), y1: r(cut.y1) };
}

function rejects(spec: TraySpec, message: RegExp): void {
  expect(() => planTray(spec, GEO)).toThrow(TraySpecError);
  expect(() => planTray(spec, GEO)).toThrow(message);
}

describe("wall cutouts", () => {
  it("is a feature type this geometry version builds", () => {
    expect(KNOWN_FEATURE_TYPES).toContain("wallCutout");
  });

  it("runs an upright channel out through both end walls and across every divider", () => {
    const plan = planTray(uprightChannel, GEO);
    const cuts = plan.compartments.map((c) => c.cuts);
    const ends = cuts.map((list) => list.map(rounded).map((c) => [c?.side, c?.x0, c?.x1, c?.into]));
    expect(ends).toEqual([
      [
        ["left", 0, 1.6, null],
        ["right", 25.6, 26.8, 1],
      ],
      [
        ["left", 25.6, 26.8, 0],
        ["right", 56.8, 58, 2],
      ],
      [
        ["left", 56.8, 58, 1],
        ["right", 73, 74.6, null],
      ],
    ]);
    const first = cuts[0]?.[0];
    expect(first?.y0).toBeCloseTo(36.85, 9);
    expect(first?.y1).toBeCloseTo(58.85, 9);
    expect(first?.radius).toBe(11);
    expect(first?.bottomZ).toBeCloseTo(69.2 - 34, 9);
    expect(first?.notch).toBe(0);
  });

  it("takes a flat cutout down to the floor and keeps its floor notch", () => {
    const [left, right] = planTray(flatCutouts, GEO).compartments[0]?.cuts ?? [];
    expect(rounded(left)).toMatchObject({ side: "left", x0: 0, x1: 1.6, into: null, notch: 11 });
    expect(left?.bottomZ).toBeCloseTo(1.2, 9);
    expect(rounded(right)).toMatchObject({ side: "right", x0: 69.6, x1: 71.2, into: null });
  });

  it("keeps a cut's sides out of the lipped wall and runs it out through the lip", () => {
    const plan = planTray(uprightChannelLipped, GEO);
    expect(plan.outerWall).toBeCloseTo(2.9, 9);
    expect(rounded(plan.compartments[0]?.cuts[0])).toMatchObject({ x0: 0, x1: 2.9, into: null });
    expect(plan.cornerRadius).toBe(3);
  });

  it("clamps the cutout depth to the compartment floor", () => {
    const spec = beside([cutout("left", 30, 99)]);
    expect(planTray(spec, GEO).compartments[0]?.cuts[0]?.bottomZ).toBeCloseTo(1.2, 9);
  });

  it("runs a cutout into a spare compartment and stops at its face", () => {
    const spare = compartment({ x: 22.8, y: 1.6, w: 35.6, d: 56.8, kind: "spare" });
    const cut = planTray(beside([cutout("right", 30, 10)], [spare]), GEO).compartments[0]?.cuts[0];
    expect(rounded(cut)).toMatchObject({ x0: 21.6, x1: 22.8, into: 1 });
  });

  it("works along x as well (front and back cutouts)", () => {
    const spec = beside([cutout("front", 11.6, 10, 0, 14), cutout("back", 11.6, 10, 0, 14)]);
    const [front, back] = planTray(spec, GEO).compartments[0]?.cuts ?? [];
    expect(rounded(front)).toMatchObject({ x0: 4.6, x1: 18.6, y0: 0, y1: 1.6, into: null });
    expect(rounded(back)).toMatchObject({ x0: 4.6, x1: 18.6, y0: 58.4, y1: 60, into: null });
  });

  it("shrinks the outer corner radius so it ends 0.8 mm before a cut's side on the exit face", () => {
    // Behind 3 mm walls the 48 mm cut keeps 3 mm posts, 6 mm from the front and back faces: a 10 mm
    // setting shrinks to 5.2 mm, so the wall beside the cut keeps 0.8 mm at the exit face.
    const spec = traySpec({
      key: "thick",
      wall: 3,
      w: 60,
      d: 60,
      h: 30,
      compartments: [
        compartment({ x: 3, y: 3, w: 20, d: 54, features: [cutout("left", 30, 10, 0, 48)] }),
      ],
    });
    expect(planTray(spec, { ...GEO, cornerRadius: 10 }).cornerRadius).toBeCloseTo(5.2, 9);
    expect(planTray(spec, GEO).cornerRadius).toBe(3);
  });

  it("shrinks corner reliefs that would come near a cut", () => {
    const relief: FeatureSpec = { type: "cornerRelief", d: 3 };
    const near = planTray(beside([relief, cutout("left", 30, 10, 0, 50.8)]), GEO);
    const far = planTray(beside([relief, cutout("left", 30, 10)]), GEO);
    const radii = (plan: typeof near) => plan.compartments[0]?.reliefs.map((r) => r.r);
    expect(radii(far)).toEqual([1.5, 1.5, 1.5, 1.5]);
    // The 50.8 mm cut ends 3 mm from the well's front and back corners: the left reliefs shrink.
    const shrunk = radii(near) ?? [];
    expect(shrunk[0]).toBeLessThan(1.5);
    expect(shrunk[3]).toBeLessThan(1.5);
    expect(shrunk[1]).toBe(1.5);
  });

  describe("rejects", () => {
    it("invalid numbers", () => {
      const bad: Partial<WallCutout>[] = [
        { width: 0 },
        { depth: 0 },
        { floorNotch: -1 },
        { at: Number.NaN },
        { width: Number.POSITIVE_INFINITY },
      ];
      for (const over of bad) {
        rejects(beside([{ ...cutout("left", 30, 10), ...over }]), /invalid wall cutout/);
      }
    });

    it("a cut leaving less than a 3 mm post to a face of a compartment it passes", () => {
      // The well runs 1.6…58.4 along the cut: 50.8 mm keeps 3 mm posts, 51 mm does not.
      expect(() => planTray(beside([cutout("left", 30, 10, 0, 50.8)]), GEO)).not.toThrow();
      rejects(beside([cutout("left", 30, 10, 0, 51)]), /less than a 3 mm post in compartment 0/);
      rejects(beside([cutout("left", 12, 10)]), /less than a 3 mm post in compartment 0/);
      // Through the divider into B, whose face lies 2 mm beside the cut.
      const b = compartment({ x: 22.8, y: 17, w: 30, d: 40, features: [cutout("left", 30, 10)] });
      rejects(beside([cutout("right", 30, 10)], [b]), /less than a 3 mm post in compartment 1/);
    });

    it("a cut narrower than 10 mm, or the finger width if smaller", () => {
      rejects(beside([cutout("left", 30, 10, 0, 9.9)]), /narrower than 10 mm/);
      const narrow = { ...GEO, fingerPocket: { ...GEO.fingerPocket, width: 8 } };
      expect(() => planTray(beside([cutout("left", 30, 10, 0, 8)]), narrow)).not.toThrow();
    });

    it("a cut not centred on its own compartment", () => {
      const spec = beside([cutout("left", 30, 10)]);
      const short = { ...spec.compartments[0], d: 20 } as CompartmentSpec;
      rejects({ ...spec, compartments: [short] }, /not centred on compartment 0/);
    });

    it("a compartment within 0.8 mm of a cut", () => {
      // A well across the room, not holding the cut's centre: the cut runs out past it, 0.5 mm from
      // its side.
      const row = compartment({ x: 22.8, y: 41.5, w: 30, d: 16.9 });
      rejects(beside([cutout("right", 30, 10)], [row]), /comes within 0.8 mm of compartment 1/);
    });

    it("two cuts through one divider that do not share their centre and width", () => {
      const next = (at: number, width = 22) =>
        compartment({
          x: 22.8,
          y: 1.6,
          w: 35.6,
          d: 56.8,
          features: [cutout("left", at, 10, 0, width)],
        });
      expect(() => planTray(beside([cutout("right", 30, 10)], [next(30)]), GEO)).not.toThrow();
      expect(() => planTray(beside([cutout("right", 30, 20)], [next(30)]), GEO)).not.toThrow();
      rejects(beside([cutout("right", 30, 10)], [next(31)]), /cuts of compartments 0 and 1 meet/);
      rejects(
        beside([cutout("right", 30, 10)], [next(30, 20)]),
        /cuts of compartments 0 and 1 meet/,
      );
    });

    it("a cut beside a finger slot", () => {
      const slotted = compartment({
        x: 22.8,
        y: 1.6,
        w: 35.6,
        d: 56.8,
        features: [pocket("front", 28.4, 10, 12, 6)],
      });
      const spec = beside([cutout("right", 13, 10, 0, 16)], [slotted]);
      // The cut (21.6…22.8 × 5…21) meets the slot (22.4…34.4 × 1.6…8.1) of compartment 1.
      rejects(spec, /cut of compartment 0 comes within 0.8 mm of a finger pocket of compartment 1/);
    });

    it("a cut on a side with a scoop or a finger pocket", () => {
      const scoop: FeatureSpec = { type: "scoop", side: "left", r: 5 };
      rejects(beside([scoop, cutout("left", 30, 10)]), /scoop or finger pocket on its left side/);
      rejects(
        beside([pocket("left", 30, 10, 12, 6), cutout("left", 30, 10)]),
        /scoop or finger pocket on its left side/,
      );
    });

    it("a floor notch outside its compartment or meeting the opposite one", () => {
      // A notch is as wide as its cut and may reach past the half-disc into the floor…
      expect(() => planTray(beside([cutout("left", 30, 10, 15)]), GEO)).not.toThrow();
      // …but not past the floor, nor beside the compartment.
      rejects(beside([cutout("left", 30, 10, 20.01)]), /floor notch/);
      rejects(beside([cutout("left", 30, 10, 9.7), cutout("right", 30, 10, 9.7)]), /floor notch/);
      expect(() =>
        planTray(beside([cutout("left", 30, 10, 9.6), cutout("right", 30, 10, 9.6)]), GEO),
      ).not.toThrow();
    });

    it("a cut that leaves the outer face lower than the bottom chamfer allows", () => {
      const steep = { ...GEO, bottomChamfer: 1 };
      // Down to the 1.2 mm floor at the face, under the 1 + 0.8 mm the chamfer needs.
      expect(() => planTray(beside([cutout("left", 30, 99)]), steep)).toThrow(/bottom chamfer/);
      // A notch takes the cut on down through the floor at its full width: no bottom is left.
      expect(() => planTray(beside([cutout("left", 30, 99, 8)]), steep)).not.toThrow();
      // But down there the cut's sides keep the chamfer + 0.8 mm from the faces they run along: a
      // 5.5 mm chamfer under a well raised 5 mm behind 3 mm walls, its posts 6 mm from the faces.
      const raised = { ...GEO, bottomChamfer: 5.5, cornerRadius: 6 };
      const high = (width: number) =>
        traySpec({
          key: "raised",
          wall: 3,
          w: 60,
          d: 60,
          h: 30,
          compartments: [
            compartment({
              x: 3,
              y: 3,
              w: 20,
              d: 54,
              floorZ: 5,
              features: [cutout("left", 30, 99, 8, width)],
            }),
          ],
        });
      expect(() => planTray(high(48), raised)).toThrow(/bottom chamfer/);
      expect(() => planTray(high(46), raised)).not.toThrow();
    });
  });
});

describe("spacer notches", () => {
  const notch = (over: Partial<Extract<FeatureSpec, { type: "spacerNotch" }>> = {}): TraySpec => ({
    ...notchedSpacer,
    features: [{ type: "spacerNotch", axis: "x", at: 46.25, width: 22, depth: 29, ...over }],
  });

  it("is a feature type this geometry version builds", () => {
    expect(KNOWN_FEATURE_TYPES).toContain("spacerNotch");
  });

  it("runs the channel's U through the spacer along its axis", () => {
    const plan = planTray(notchedSpacer, GEO);
    expect(rounded(plan.notch ?? undefined)).toMatchObject({
      x0: 0,
      x1: 30,
      y0: 35.25,
      y1: 57.25,
      radius: 11,
      into: null,
    });
    expect(plan.notch?.bottomZ).toBeCloseTo(63 - 29, 9);
    const across = planTray(notch({ axis: "y", at: 15, width: 10 }), GEO).notch;
    expect(rounded(across ?? undefined)).toMatchObject({ x0: 10, x1: 20, y0: 0, y1: 92.5 });
    expect(planTray({ ...notchedSpacer, features: [] }, GEO).notch).toBeNull();
  });

  it("may cut the whole spacer across, or keep the chamfer plus 0.8 mm beside it", () => {
    expect(() => planTray(notch({ width: 92.5 }), GEO)).not.toThrow();
    expect(() => planTray(notch({ width: 100 }), GEO)).not.toThrow();
    expect(() => planTray(notch({ width: 90.1 }), GEO)).not.toThrow();
    rejects(notch({ width: 90.9 }), /leaves less than 1.20 mm beside the spacer notch/);
    rejects(notch({ width: 91.5 }), /leaves less than 1.20 mm beside the spacer notch/);
  });

  it("shrinks the spacer's corner radius so it ends 0.8 mm before the notch's sides", () => {
    // 2.25 mm beside the notch.
    expect(planTray(notch({ width: 88 }), GEO).cornerRadius).toBeCloseTo(1.45, 9);
  });

  describe("rejects", () => {
    it("invalid numbers or axis", () => {
      for (const over of [{ width: 0 }, { depth: 0 }, { at: Number.NaN }]) {
        rejects(notch(over), /invalid spacer notch/);
      }
      rejects(notch({ axis: "z" as "x" }), /invalid spacer notch/);
    });

    it("a notch past both faces that takes the spacer's whole top below its height", () => {
      // A 100 mm U centred on the 92.5 mm spacer meets its faces 31 mm above its bottom.
      expect(() => planTray(notch({ width: 100, depth: 31 }), GEO)).not.toThrow();
      rejects(notch({ width: 100, depth: 32 }), /takes the spacer's whole top/);
    });

    it("a notch not centred on the spacer", () => {
      rejects(notch({ at: 93 }), /not centred on the spacer/);
    });

    it("a notch whose bottom comes within 0.8 mm of the bottom chamfer", () => {
      rejects(notch({ depth: 62 }), /bottom chamfer/);
      expect(() => planTray(notch({ depth: 61.8 }), GEO)).not.toThrow();
    });

    it("a notch on anything but a spacer, and spacer features in a compartment", () => {
      const tray = traySpec({ ...notchedSpacer, part: "tray", solid: false, key: "t" });
      rejects(tray, /only a spacer has a notch/);
      const inWell = beside([{ type: "spacerNotch", axis: "x", at: 30, width: 10, depth: 5 }]);
      rejects(inWell, /spacer notch in compartment 0/);
    });
  });
});

describe("top fillets", () => {
  const radii = (cut: { topFillets: readonly [number, number] } | null | undefined) =>
    cut?.topFillets.map((r) => Number(r.toFixed(3)));

  it("rounds both top corners of every cut with 3 mm where the wall and divider tops are long", () => {
    expect(FINGER_FILLET_MM).toBe(3);
    const plan = planTray(uprightChannel, GEO);
    for (const c of plan.compartments) {
      expect(c.cuts.map(radii)).toEqual([
        [3, 3],
        [3, 3],
      ]);
    }
  });

  it("keeps 0.8 mm of top between a fillet and the outer corner's arc", () => {
    // The 50 mm cut's sides lie 5 mm from the front and back faces, the arc 3 mm: 1.2 mm fillets.
    const plan = planTray(beside([cutout("left", 30, 28, 0, 50)]), GEO);
    expect(plan.cornerRadius).toBe(3);
    expect(radii(plan.compartments[0]?.cuts[0])).toEqual([1.2, 1.2]);
  });

  it("is no taller than the U's straight sides", () => {
    // 13 mm deep, radius 11: 2 mm of straight side under the rim.
    expect(radii(planTray(beside([cutout("left", 30, 13)]), GEO).compartments[0]?.cuts[0])).toEqual(
      [2, 2],
    );
  });

  it("stays above the floor of the compartments at the strip's ends", () => {
    // A well raised to 28 mm, 2 mm below the rim, cut through the floor: 2 mm fillets.
    const spec = beside([cutout("left", 30, 2, 5)]);
    const well = { ...spec.compartments[0], floorZ: 28 } as CompartmentSpec;
    const plan = planTray({ ...spec, compartments: [well] }, GEO);
    expect(radii(plan.compartments[0]?.cuts[0])).toEqual([2, 2]);
  });

  it("keeps 0.8 mm of top to a compartment lying across the strip", () => {
    // C, in the left wall's strip beside the well, ends 3 mm before the cut: 2.2 mm.
    const spec = traySpec({
      key: "across",
      w: 40,
      d: 60,
      h: 30,
      compartments: [
        compartment({ x: 10, y: 20, w: 20, d: 20, features: [cutout("left", 30, 20, 0, 10)] }),
        compartment({ x: 1.6, y: 1.6, w: 7.4, d: 20.4 }),
      ],
    });
    expect(radii(planTray(spec, GEO).compartments[0]?.cuts[0])).toEqual([2.2, 3]);
  });

  it("rounds a lipped wall's cut on the lip's top, and drops fillets under 0.2 mm", () => {
    // Out through the end walls only the 2 mm high lip is rounded, above the ledge: 2 mm.
    const plan = planTray(uprightChannelLipped, GEO);
    expect(plan.compartments.map((c) => c.cuts.map(radii))).toEqual([
      [
        [2, 2],
        [3, 3],
      ],
      [
        [3, 3],
        [3, 3],
      ],
      [
        [3, 3],
        [2, 2],
      ],
    ]);
    // Sides 6 mm from the faces: a 5 mm arc leaves 0.2 mm for the fillets, a 5.05 mm one 0.15 mm,
    // which is dropped.
    const spec = traySpec({
      key: "thick",
      wall: 3,
      w: 60,
      d: 60,
      h: 30,
      compartments: [
        compartment({ x: 3, y: 3, w: 20, d: 54, features: [cutout("left", 30, 27, 0, 48)] }),
      ],
    });
    const fillets = (cornerRadius: number) =>
      radii(planTray(spec, { ...GEO, cornerRadius }).compartments[0]?.cuts[0]);
    expect(fillets(5)).toEqual([0.2, 0.2]);
    expect(fillets(5.05)).toEqual([0, 0]);
  });

  it("rounds a spacer notch on the spacer's top, not where a side passes its face", () => {
    expect(radii(planTray(notchedSpacer, GEO).notch)).toEqual([3, 3]);
    const notch = (over: Partial<Extract<FeatureSpec, { type: "spacerNotch" }>>): TraySpec => ({
      ...notchedSpacer,
      features: [{ type: "spacerNotch", axis: "x", at: 46.25, width: 22, depth: 29, ...over }],
    });
    expect(radii(planTray(notch({ at: 5, width: 20 }), GEO).notch)).toEqual([0, 3]);
  });
});
