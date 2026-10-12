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
  lippedThickWall,
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
    const spec = beside([cutout("front", 11.6, 10, 0, 16), cutout("back", 11.6, 10, 0, 16)]);
    const [front, back] = planTray(spec, GEO).compartments[0]?.cuts ?? [];
    expect(rounded(front)).toMatchObject({ x0: 3.6, x1: 19.6, y0: 0, y1: 1.6, into: null });
    expect(rounded(back)).toMatchObject({ x0: 3.6, x1: 19.6, y0: 58.4, y1: 60, into: null });
  });

  it("shrinks the outer corner radius so a cut's rounded side meets the flat end face", () => {
    // The 55.8 mm cut runs 2.1 mm from the front and back faces, its edges there rounded 0.4 mm
    // (the 1.6 mm wall less its 0.8 mm flat, halved): the arc ends 0.8 mm before the fillet, so the
    // wall beside the cut keeps 0.8 mm at the exit face.
    const spec = beside([cutout("left", 30, 10, 0, 55.8)]);
    expect(planTray(spec, GEO).cornerRadius).toBeCloseTo(0.9, 9);
    expect(planTray(beside([cutout("left", 30, 10)]), GEO).cornerRadius).toBe(3);
  });

  it("shrinks corner reliefs that would come near a cut", () => {
    const relief: FeatureSpec = { type: "cornerRelief", d: 3 };
    const near = planTray(beside([relief, cutout("left", 30, 10, 0, 52)]), GEO);
    const far = planTray(beside([relief, cutout("left", 30, 10)]), GEO);
    const radii = (plan: typeof near) => plan.compartments[0]?.reliefs.map((r) => r.r);
    expect(radii(far)).toEqual([1.5, 1.5, 1.5, 1.5]);
    // The 52 mm cut ends 2.4 mm from the well's front and back corners: the left reliefs shrink.
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

    it("a cut that reaches into an outer wall it runs along", () => {
      rejects(beside([cutout("left", 12, 10)]), /reaches into the 1.6 mm outer wall/);
      rejects(beside([cutout("left", 49, 10)]), /reaches into the 1.6 mm outer wall/);
      // The lipped wall is 2.9 mm.
      const lipped = beside([cutout("left", 13.5, 10)], [], { lip: true });
      const inside = {
        ...lipped.compartments[0],
        x: 2.9,
        y: 2.9,
        w: 20,
        d: 54.2,
      } as CompartmentSpec;
      rejects({ ...lipped, compartments: [inside] }, /reaches into the 2.9 mm outer wall/);
    });

    it("a cut not centred on its own compartment", () => {
      const spec = beside([cutout("left", 30, 10)]);
      const short = { ...spec.compartments[0], d: 20 } as CompartmentSpec;
      rejects({ ...spec, compartments: [short] }, /not centred on compartment 0/);
    });

    it("a compartment within 0.8 mm of a cut", () => {
      // The cut runs between the well and B; C, beside B, lies 0.4 mm past the cut's end.
      const b = compartment({ x: 22.8, y: 1.6, w: 30, d: 28 });
      const c = compartment({ x: 23.2, y: 30.4, w: 30, d: 28 });
      rejects(
        beside([cutout("right", 30, 10)], [b, c]),
        /cut of compartment 0 comes within 0.8 mm of compartment 2/,
      );
      // A well across the room, 0.5 mm from the cut's side.
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
      const spec = beside([cutout("right", 13, 10, 0, 22)], [slotted]);
      // The cut (21.6…22.8 × 2…24) meets the slot (22.4…34.4 × 1.6…8.1) of compartment 1.
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
      const narrow = beside([cutout("left", 30, 10, 8)]);
      const short = { ...narrow.compartments[0], y: 22.2, d: 15 } as CompartmentSpec;
      rejects({ ...narrow, compartments: [short] }, /floor notch/);
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
      // But down there the cut's sides keep the chamfer + 0.8 mm from the faces they run along.
      expect(() => planTray(beside([cutout("left", 12.6, 99, 8)]), steep)).toThrow(
        /bottom chamfer/,
      );
      expect(() => planTray(beside([cutout("left", 13, 99, 8)]), steep)).not.toThrow();
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

  it("shrinks the spacer's corner radius so the notch's rounded edges meet its flat end faces", () => {
    // 2.25 mm beside the notch, its edges rounded 1.045 mm (the 0.4 mm chamfer, 0.8 mm and the
    // 0.005 mm tolerance stay): the arc ends 0.8 mm before the fillet.
    expect(planTray(notch({ width: 88 }), GEO).cornerRadius).toBeCloseTo(0.405, 9);
  });

  describe("rejects", () => {
    it("invalid numbers or axis", () => {
      for (const over of [{ width: 0 }, { depth: 0 }, { at: Number.NaN }]) {
        rejects(notch(over), /invalid spacer notch/);
      }
      rejects(notch({ axis: "z" as "x" }), /invalid spacer notch/);
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

describe("finger fillets", () => {
  interface Fillet {
    x: number;
    y: number;
    r: number;
    z0: number;
  }
  const fillets = (list: readonly Fillet[] | undefined) =>
    (list ?? []).map((f) => [f.x, f.y, f.r, f.z0].map((v) => Number(v.toFixed(3))));

  it("rounds the edges where a channel meets each wall and divider face, keeping 0.8 mm flat", () => {
    const [left, right] = planTray(uprightChannel, GEO).compartments[0]?.cuts ?? [];
    const zc = 69.2 - 34 + 11;
    // Through the 1.6 mm end wall: 0.4 mm on the outer face and on the well's face, 0.8 mm of the
    // wall's end flat between them.
    expect(fillets(left?.fillets)).toEqual([
      [1.6, 36.85, 0.4, zc],
      [1.6, 58.85, 0.4, zc],
      [0, 36.85, 0.4, zc],
      [0, 58.85, 0.4, zc],
    ]);
    // Across the 1.2 mm divider: 0.2 mm.
    expect(fillets(right?.fillets).map(([, , r]) => r)).toEqual([0.2, 0.2, 0.2, 0.2]);
  });

  it("uses the full 1.5 mm where the wall is thick enough", () => {
    expect(FINGER_FILLET_MM).toBe(1.5);
    const spec = traySpec({
      key: "thick",
      w: 60,
      d: 60,
      h: 30,
      compartments: [
        compartment({ x: 11.6, y: 1.6, w: 20, d: 56.8, features: [cutout("left", 30, 10)] }),
      ],
    });
    const cut = planTray(spec, GEO).compartments[0]?.cuts[0];
    expect(fillets(cut?.fillets).map(([, , r]) => r)).toEqual([1.5, 1.5, 1.5, 1.5]);
  });

  it("keeps 0.8 mm of a lipped wall's lip beside a fillet where the cut leaves the tray", () => {
    const cut = planTray(lippedThickWall, GEO).compartments[0]?.cuts[0];
    // Only the lip stands above the channel's round bottom there: the 1.2 mm lip ring keeps
    // 0.8 mm beside 0.4 mm fillets on the outer face (none on the well's, whose corners they meet).
    expect(fillets(cut?.fillets)).toEqual([
      [2.9, 0, 0.4, 17.2],
      [18.9, 0, 0.4, 17.2],
    ]);
  });

  it("rounds a notched cut from the bed where it leaves the tray and from the floor inside", () => {
    const cut = planTray(flatCutouts, GEO).compartments[0]?.cuts[0];
    expect(fillets(cut?.fillets).map(([x, , , z0]) => [x, z0])).toEqual([
      [1.6, 1.2],
      [1.6, 1.2],
      [0, 0],
      [0, 0],
    ]);
  });

  it("shrinks a fillet that would come near another compartment, or drops it", () => {
    const next = compartment({ x: 22.8, y: 1.6, w: 30, d: 39.5 });
    const row = compartment({ x: 22.8, y: 41.9, w: 30, d: 16.5 });
    const cut = planTray(beside([cutout("right", 30, 10)], [next, row]), GEO).compartments[0]
      ?.cuts[0];
    // The divider strip 21.6…22.8 ends 0.9 mm from `row`: no room for a fillet on that side.
    expect(fillets(cut?.fillets).map(([x, y, r]) => [x, y, r])).toEqual([
      [21.6, 19, 0.2],
      [22.8, 19, 0.2],
    ]);
  });

  it("rounds a spacer notch where it leaves the spacer", () => {
    const notch = planTray(notchedSpacer, GEO).notch;
    expect(fillets(notch?.fillets).map(([x, y, r]) => [x, y, r])).toEqual([
      [0, 35.25, 1.5],
      [0, 57.25, 1.5],
      [30, 35.25, 1.5],
      [30, 57.25, 1.5],
    ]);
  });
});
