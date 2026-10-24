// src/instructions/lift.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import type { CompartmentSpec, FeatureSpec, TraySpec } from "../model/types";
import {
  LIFT_LINES,
  carriedBy,
  contact,
  contactOf,
  extentsOf,
  gripOf,
  liftLine,
  standsOn,
} from "./lift";
import type { Extent } from "./lift";

const well = (
  features: FeatureSpec[] = [],
  over: Partial<CompartmentSpec> = {},
): CompartmentSpec => ({
  x: 1.6,
  y: 1.6,
  w: 20,
  d: 20,
  floorZ: 1.2,
  kind: "well",
  contents: "Anchors ×10",
  features,
  ...over,
});

const cut: FeatureSpec = {
  type: "wallCutout",
  side: "left",
  at: 10,
  width: 18,
  depth: 12,
  floorNotch: 0,
};
const scoop: FeatureSpec = { type: "scoop", side: "front", r: 20 };

const none = { neighbour: null, tray: null };

describe("gripOf: what a part is lifted by", () => {
  it("lifts a tray with a wall cutout by the finger cut", () => {
    const grip = gripOf(makeTray({ compartments: [well([cut])] }));
    expect(grip).toEqual({ kind: "finger-cut", own: true });
    expect(liftLine(makeTray(), grip, none)).toBe("Lift it by the finger cut");
  });

  it("lifts a scoop bin by the scoop, after tipping the pieces out", () => {
    const bin = makeTray({ compartments: [well([scoop], { kind: "scoop" })] });
    expect(gripOf(bin)).toEqual({ kind: "scoop", own: true });
    expect(liftLine(bin, gripOf(bin), none)).toBe("Tip the pieces out, then lift it by the scoop");
  });

  describe("a solid filler with top chamfers", () => {
    const chamfer = (side: "left" | "right"): FeatureSpec => ({
      type: "topChamfer",
      side,
      from: 0,
      to: 80,
      size: 4,
    });
    const filler = (over: Partial<TraySpec>) =>
      makeTray({
        part: "leftover",
        solid: true,
        compartments: [],
        features: [chamfer("left"), chamfer("right")],
        ...over,
      });

    it("is pinched by its chamfers when both long edges of a thin strip have one", () => {
      const strip = filler({ w: 10, d: 80 });
      expect(gripOf(strip)).toEqual({ kind: "chamfer", own: true });
      expect(liftLine(strip, gripOf(strip), none)).toBe("Pinch it by its chamfered edges");
    });

    it("has nothing to hold when only one face of a filler is chamfered", () => {
      // The other face is against the next tray or the box wall, so no thumb gets there to pinch it.
      const block = filler({ w: 40, d: 80, features: [chamfer("left")] });
      expect(gripOf(block)).toEqual({ kind: "none", own: false });
      expect(liftLine(block, gripOf(block), { neighbour: "Events", tray: null })).toBe(
        "Take out Events first, then tip it out",
      );
    });

    it("is pinched by a member's two chamfers when the filler is merged", () => {
      const thin = filler({ w: 10, d: 80 });
      const thick = filler({ x: 50, w: 40, d: 80, features: [] });
      const merged = (members: TraySpec[]) =>
        makeTray({
          part: "leftover",
          solid: true,
          compartments: [],
          merged: { members, bridges: [], flipped: false },
        });
      expect(gripOf(merged([thick, thin])).kind).toBe("chamfer");
      expect(
        gripOf(merged([thick, filler({ x: 50, w: 40, d: 80, features: [chamfer("left")] })])).kind,
      ).toBe("none");
    });
  });

  describe("a tray with a top chamfer beside it", () => {
    const facing = new Set(["a:p0:0"]);
    const bare = makeTray({ compartments: [well()] });

    it("is lifted by the chamfer, a grip of its own, when it has no finger cut", () => {
      const grip = gripOf(bare, facing);
      expect(grip).toEqual({ kind: "chamfer-beside", own: true });
      expect(liftLine(bare, grip, none)).toBe("Lift it by the chamfer beside it");
    });

    it("keeps its own finger cut first", () => {
      const cutTray = makeTray({ compartments: [well([cut])] });
      expect(gripOf(cutTray, facing)).toEqual({ kind: "finger-cut", own: true });
    });

    it("is lifted by the chamfer rather than tipped out by its scoop", () => {
      const bin = makeTray({ compartments: [well([scoop], { kind: "scoop" })] });
      expect(gripOf(bin, facing).kind).toBe("chamfer-beside");
    });

    it("is still lifted by its contents when the chamfer faces another tray", () => {
      expect(gripOf(bare, new Set(["other:p0:0"]))).toEqual({ kind: "contents", own: false });
      expect(gripOf(bare)).toEqual({ kind: "contents", own: false });
    });

    it("is for trays only: a divider keeps its edge", () => {
      const divider = makeTray({ part: "divider", solid: true, compartments: [] });
      expect(gripOf(divider, new Set([divider.key])).kind).toBe("edge");
    });
  });

  it("prefers the finger cut when a tray has both", () => {
    const both = makeTray({ compartments: [well([scoop, cut], { kind: "scoop" })] });
    expect(gripOf(both).kind).toBe("finger-cut");
  });

  it("gives a tray with no cut and no scoop only its contents to lift by, and has no grip of its own", () => {
    const tray = makeTray({ compartments: [well()] });
    const grip = gripOf(tray);
    expect(grip).toEqual({ kind: "contents", own: false });
    expect(liftLine(tray, grip, none)).toBe("Empty it first, then lift it from inside");
  });

  it("does not count a tray's own figure pockets as a pocket to reach into", () => {
    const minis = makeTray({ compartments: [well([], { kind: "pocket" })] });
    expect(gripOf(minis).kind).toBe("contents");
  });

  describe("an open spare, riser or spacer box", () => {
    const open = (part: TraySpec["part"], h: number) =>
      makeTray({
        part,
        h,
        solid: false,
        compartments: [well([], { kind: "spare", contents: "", floorZ: 1.2 })],
      });

    it("is reached into when its pocket is at least 5 mm deep", () => {
      for (const part of ["leftover", "riser", "spacer"] as const) {
        const box = open(part, 6.2);
        expect(gripOf(box)).toEqual({ kind: "pocket", own: true });
        expect(liftLine(box, gripOf(box), none)).toBe("Reach into its open pocket");
      }
    });

    it("has nothing to hold when the pocket is shallower", () => {
      expect(gripOf(open("leftover", 6.1)).kind).toBe("none");
    });

    it("has nothing to hold when it is printed solid", () => {
      expect(gripOf(makeTray({ part: "leftover", solid: true, compartments: [] }))).toEqual({
        kind: "none",
        own: false,
      });
    });
  });

  it("lifts a spacer by the finger cut it carries on, and a solid one with no notch has none", () => {
    const notch: FeatureSpec = { type: "spacerNotch", axis: "x", at: 10, width: 18, depth: 8 };
    const plate = { part: "spacer" as const, solid: true, compartments: [] };
    expect(gripOf(makeTray({ ...plate, features: [notch] }))).toEqual({
      kind: "finger-cut",
      own: true,
    });
    expect(gripOf(makeTray(plate)).kind).toBe("none");
  });

  it("pinches a divider by its top edge", () => {
    const divider = makeTray({ part: "divider", solid: true, compartments: [] });
    expect(gripOf(divider)).toEqual({ kind: "edge", own: true });
    expect(liftLine(divider, gripOf(divider), none)).toBe(
      "Empty one side first, then pinch its top edge",
    );
  });

  describe("a merged part", () => {
    const member = (over: Partial<TraySpec>) =>
      makeTray({ part: "leftover", solid: true, compartments: [], ...over });
    const mergedOf = (members: TraySpec[]) =>
      makeTray({
        part: "leftover",
        solid: true,
        compartments: [],
        merged: { members, bridges: [], flipped: false },
      });

    it("is reached into when a member is an open box", () => {
      const riser = member({
        part: "riser",
        solid: false,
        h: 12,
        compartments: [well([], { kind: "spare", contents: "" })],
      });
      expect(gripOf(mergedOf([member({}), riser])).kind).toBe("pocket");
    });

    it("has nothing to hold when every member is solid", () => {
      expect(gripOf(mergedOf([member({}), member({ x: 50 })])).kind).toBe("none");
    });
  });
});

describe("liftLine for a part with nothing to hold", () => {
  const strip = makeTray({ part: "leftover", solid: true, compartments: [] });
  const grip = gripOf(strip);

  it("says which neighbour to take out first", () => {
    expect(liftLine(strip, grip, { neighbour: "Event cards", tray: null })).toBe(
      "Take out Event cards first, then tip it out",
    );
  });

  it("says to tip it out of the box when nothing is beside it", () => {
    expect(liftLine(strip, grip, none)).toBe(LIFT_LINES.alone);
  });

  it("names the tray a solid riser carries, and the tray whose contents hold a spacer", () => {
    const riser = makeTray({ part: "riser", solid: true, compartments: [] });
    expect(liftLine(riser, gripOf(riser), { neighbour: null, tray: "Heroes" })).toBe(
      "Take out Heroes first, then tip it out",
    );
    const plate = makeTray({ part: "spacer", solid: true, compartments: [] });
    expect(liftLine(plate, gripOf(plate), { neighbour: null, tray: "Dice" })).toBe(
      "Take out what Dice holds first, then tip it out",
    );
  });
});

describe("where parts touch", () => {
  const box = (x: number, y: number, z: number, w: number, d: number, h: number): Extent => ({
    x0: x,
    x1: x + w,
    y0: y,
    y1: y + d,
    z0: z,
    z1: z + h,
  });

  it("counts a part beside another across a tray gap, by the edge and height they share", () => {
    // 100 wide, 0.2 mm gap, a strip 10 wide: they share 80 mm of edge, 40 mm high
    expect(contact(box(0, 0, 0, 100, 80, 40), box(100.2, 0, 0, 10, 80, 40))).toBeCloseTo(3200);
    expect(contact(box(0, 0, 0, 100, 80, 40), box(0, 80.2, 0, 100, 10, 20))).toBeCloseTo(2000);
  });

  it("counts a part further off, a corner, or one that shares no height as not touching", () => {
    expect(contact(box(0, 0, 0, 100, 80, 40), box(103, 0, 0, 10, 80, 40))).toBe(0);
    expect(contact(box(0, 0, 0, 100, 80, 40), box(100.2, 80.2, 0, 10, 10, 40))).toBe(0);
    expect(contact(box(0, 0, 0, 100, 80, 40), box(100.2, 0, 40, 10, 80, 40))).toBe(0);
  });

  it("does not count one part on top of another as beside it", () => {
    expect(contact(box(0, 0, 0, 100, 80, 40), box(10, 10, 20, 30, 30, 40))).toBe(0);
  });

  it("knows what stands on what: its floor is the other's top, over the same ground", () => {
    const low = box(0, 0, 0, 100, 80, 40);
    expect(standsOn(box(10, 10, 40, 20, 20, 5), low)).toBe(true);
    expect(standsOn(box(10, 10, 41, 20, 20, 5), low)).toBe(false);
    expect(standsOn(box(110, 10, 40, 20, 20, 5), low)).toBe(false);
    expect(carriedBy([box(10, 10, 40, 20, 20, 5)], [low, box(200, 0, 0, 10, 10, 10)])).toBe(true);
  });

  it("sums the contact of a merged part's members", () => {
    const merged = makeTray({
      merged: {
        members: [
          makeTray({ x: 100.2, y: 0, w: 10, d: 20, h: 40 }),
          makeTray({ x: 100.2, y: 40, w: 10, d: 20, h: 40 }),
        ],
        bridges: [],
        flipped: false,
      },
    });
    expect(contactOf(extentsOf(merged), [box(0, 0, 0, 100, 80, 40)])).toBeCloseTo(1600);
  });
});
