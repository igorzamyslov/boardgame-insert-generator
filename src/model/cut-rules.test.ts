import { describe, expect, it } from "vitest";
import { OPPOSITE, alongX, axes, faceOf, keepsApart, nearestAcross, separation } from "./cut-rules";
import type { RectMm } from "./cut-rules";
import { SPEC_TOLERANCE as TOL } from "./settings";

const rect = (x0: number, y0: number, x1: number, y1: number): RectMm => ({ x0, y0, x1, y1 });

describe("separation and keepsApart", () => {
  const span = (x0: number, x1: number) => rect(x0, 0, x1, 10);

  it("measures along the axis that separates the rectangles most", () => {
    expect(separation(span(0, 10), span(10.8, 20))).toBeCloseTo(0.8, 9);
    expect(separation(span(0, 10), span(5, 20))).toBeCloseTo(-5, 9);
  });

  it("keeps MIN_FEATURE_MM, forgiving tol", () => {
    expect(keepsApart(span(0, 10), span(10.8, 20), 0)).toBe(true);
    expect(keepsApart(span(0, 10), span(10.797, 20), 0)).toBe(false);
    expect(keepsApart(span(0, 10), span(10.797, 20), TOL)).toBe(true);
    expect(keepsApart(span(0, 10), span(10.79, 20), TOL)).toBe(false);
  });
});

describe("cut sides and axes", () => {
  it("runs a front or back cut along x, a left or right one along y", () => {
    expect([alongX("front"), alongX("back"), alongX("left"), alongX("right")]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(OPPOSITE.front).toBe("back");
    expect(OPPOSITE.left).toBe("right");
    const r = rect(1, 2, 3, 4);
    expect(axes(r, "front")).toEqual({ u0: 1, u1: 3, v0: 2, v1: 4 });
    expect(axes(r, "right")).toEqual({ u0: 2, u1: 4, v0: 1, v1: 3 });
    expect([faceOf(r, "front"), faceOf(r, "back"), faceOf(r, "left"), faceOf(r, "right")]).toEqual([
      2, 4, 1, 3,
    ]);
  });
});

describe("nearestAcross", () => {
  // A well, and behind it (back) two wells side by side, then a third further back.
  const rects = [
    rect(10, 0, 30, 10),
    rect(0, 12, 18, 20),
    rect(19, 12, 40, 20),
    rect(0, 22, 40, 30),
  ];

  it("picks the nearest compartment across the side whose range contains the cut's centre", () => {
    expect(nearestAcross(rects, 0, "back", 20, 0)).toBe(2);
    expect(nearestAcross(rects, 0, "back", 15, 0)).toBe(1);
  });

  it("passes a compartment that only overlaps the cut beside its centre", () => {
    // At 18.5 the centre lies between the two: the cut runs on to the third.
    expect(nearestAcross(rects, 0, "back", 18.5, 0)).toBe(3);
  });

  it("runs out through the outer face when nothing lies across", () => {
    expect(nearestAcross(rects, 0, "front", 20, 0)).toBe(-1);
  });

  it("does not count a compartment whose edge lies on the centre, within tol", () => {
    expect(nearestAcross(rects, 0, "back", 18, 0)).toBe(3);
    expect(nearestAcross(rects, 0, "back", 18.004, 0.005)).toBe(3);
  });
});
