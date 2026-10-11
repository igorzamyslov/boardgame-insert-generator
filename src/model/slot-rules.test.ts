import { describe, expect, it } from "vitest";
import {
  SPEC_TOLERANCE as TOL,
  cutRidgeWidth,
  maxChannelSpacing,
  maxWellFaceOffset,
} from "./settings";
import {
  keepsApart,
  separation,
  slotsApart,
  slotsMerge,
  wellFaceHolds,
  wellFaceProblem,
} from "./slot-rules";
import type { WellFace } from "./slot-rules";

const rect = (x0: number, x1: number) => ({ x0, x1, y0: 0, y1: 10 });

describe("separation and keepsApart", () => {
  it("measures along the axis that separates the rectangles most", () => {
    expect(separation(rect(0, 10), rect(10.8, 20))).toBeCloseTo(0.8, 9);
    expect(separation(rect(0, 10), rect(5, 20))).toBeCloseTo(-5, 9);
  });

  it("keeps MIN_FEATURE_MM, forgiving tol", () => {
    expect(keepsApart(rect(0, 10), rect(10.8, 20), 0)).toBe(true);
    expect(keepsApart(rect(0, 10), rect(10.797, 20), 0)).toBe(false);
    expect(keepsApart(rect(0, 10), rect(10.797, 20), TOL)).toBe(true);
    expect(keepsApart(rect(0, 10), rect(10.79, 20), TOL)).toBe(false);
  });
});

describe("slotsApart and slotsMerge", () => {
  it("keeps two 22 mm slots apart from 22.8 mm between centres", () => {
    expect(slotsApart(22.8, 11, 0)).toBe(true);
    expect(slotsApart(22.797, 11, 0)).toBe(false);
    expect(slotsApart(22.797, 11, TOL)).toBe(true);
  });

  it("merges two 22 mm slots up to maxChannelSpacing between centres", () => {
    const most = maxChannelSpacing(11);
    expect(slotsMerge(most, 11, 0)).toBe(true);
    expect(slotsMerge(most + 0.003, 11, 0)).toBe(false);
    expect(slotsMerge(most + 0.003, 11, TOL)).toBe(true);
  });
});

describe("wellFaceHolds", () => {
  // A face at 0 with its solid material toward −x, the contents toward +x; 22 mm slots.
  const face: WellFace = { at: 0, solid: -1 };
  const holds = (centres: number[], tol = 0) => wellFaceHolds(face, centres, 11, tol);

  it("needs a slot that does not cross the face to end MIN_FEATURE_MM short of it", () => {
    expect(holds([-11.8])).toBe(true);
    expect(holds([-11.79])).toBe(false);
    expect(holds([-11.797])).toBe(false);
    expect(holds([-11.797], TOL)).toBe(true);
  });

  it("counts a slot end within SPEC_TOLERANCE of the face as up to it, never as crossing", () => {
    for (const tol of [0, TOL]) {
      expect(holds([-11], tol)).toBe(false);
      expect(holds([-10.995], tol)).toBe(false);
      expect(holds([-11.005], tol)).toBe(false);
    }
  });

  it("ignores a slot on the contents side", () => {
    expect(holds([11])).toBe(true);
    expect(holds([10.995])).toBe(true);
  });

  it("allows a slot centred on the solid side at most maxWellFaceOffset from the face", () => {
    const most = maxWellFaceOffset(11);
    expect(holds([-most])).toBe(true);
    expect(holds([-most - 0.003])).toBe(false);
    expect(holds([-most - 0.003], TOL)).toBe(true);
    // The nearest covering slot decides: a farther one does not matter.
    expect(holds([-most - 2, 1])).toBe(true);
  });

  it("keeps half a merged ridge the face cuts at least MIN_FEATURE_MM wide", () => {
    // Centres 20 mm apart (merged); the face 9.5 or 9.9 mm from the contents-side centre.
    expect(cutRidgeWidth(11, 9.5, 10.5)).toBeGreaterThan(0.8);
    expect(holds([9.5, -10.5])).toBe(true);
    expect(cutRidgeWidth(11, 9.9, 10.1)).toBeLessThan(0.8);
    expect(holds([9.9, -10.1])).toBe(false);
    // Without the solid-side slot the contents-side centre leaves an obtuse edge.
    expect(holds([9.9])).toBe(true);
  });
});

describe("wellFaceProblem", () => {
  const face: WellFace = { at: 10, solid: 1 }; // solid material toward +x
  const problem = (centres: number[]) => wellFaceProblem(face, centres, 11, 0);

  it("names the slot and what is wrong", () => {
    expect(problem([21.5])).toMatchObject({ kind: "short", centre: 21.5 });
    expect((problem([21.5]) as { short: number }).short).toBeCloseTo(0.5, 9);
    expect(problem([19, -20])).toEqual({
      kind: "offset",
      centre: 19,
      offset: 9,
      most: maxWellFaceOffset(11),
    });
    const ridge = problem([0.1, 20.1]);
    expect(ridge?.kind).toBe("ridge");
    expect((ridge as { width: number }).width).toBeCloseTo(cutRidgeWidth(11, 9.9, 10.1), 9);
    expect(problem([10, 40])).toBeNull();
  });
});
