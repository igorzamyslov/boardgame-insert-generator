import { describe, expect, it } from "vitest";
import {
  GROOVE_CORNER_RADIUS_MM,
  asEdge,
  bottomEdgeOf,
  bottomMinimums,
  grooveEdge,
  grooveOf,
  grooveWall,
  lipShape,
  plainEdge,
} from "./lip";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM, chamferMinimums, maxCornerRadius } from "./settings";
import type { Settings } from "./types";

const ON: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, enabled: true } };
const OFF: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, enabled: false } };

describe("lipShape", () => {
  it("is a 0.6 mm flat and a 45° ramp over the rest of the thickness", () => {
    const s = lipShape(2, 1.2);
    expect(s.flat).toBeCloseTo(0.6, 9);
    expect(s.zIn).toBeCloseTo(1.4, 9);
    // the ramp drops as far as it runs: 45°
    expect(2 - s.zIn).toBeCloseTo(1.2 - s.flat, 9);
  });

  it("keeps the inner face at least 0.6 mm high, by widening the flat", () => {
    expect(lipShape(1, 1.2).zIn).toBeCloseTo(0.6, 9);
    expect(lipShape(1, 1.2).flat).toBeCloseTo(0.8, 9);
    expect(lipShape(2, 3).zIn).toBeCloseTo(0.6, 9);
    expect(lipShape(2, 3).flat).toBeCloseTo(1.6, 9);
  });
});

describe("grooveOf", () => {
  it("is the lip one play further out and up, a 45° roof from the inner wall to the outer face", () => {
    const g = grooveOf(ON, 1);
    expect(g).toEqual({ inset: 1.45, foot: 0.5, zIn: 1.4, zTop: 2.85, reach: 1.95 });
    // the roof falls as far as it runs, and meets the inner wall at its top
    expect((g?.zTop ?? 0) - (g?.zIn ?? 0)).toBeCloseTo(g?.inset ?? 0, 9);
  });

  it("only with the lip on, and only above level 0", () => {
    expect(grooveOf(OFF, 1)).toBeNull();
    expect(grooveOf(ON, 0)).toBeNull();
    expect(grooveOf(ON, 2)).toEqual(grooveOf(ON, 1));
  });

  it("follows the lip play (scaled by Fit) and the chamfer, which is the foot", () => {
    expect(grooveOf({ ...ON, fit: 1.4 }, 1)?.inset).toBeCloseTo(1.55, 9);
    expect(grooveOf({ ...ON, bottomChamfer: 0.8 }, 1)?.foot).toBe(0.8);
    // never above the inner wall
    expect(grooveOf({ ...ON, bottomChamfer: 3 }, 1)?.foot).toBeCloseTo(1.4, 9);
  });
});

describe("the bottom edge", () => {
  it("is a plain chamfer c: the constant c, pulled in by c − z", () => {
    const e = plainEdge(0.5);
    expect(e.at(0)).toBe(0.5);
    expect(e.at(3)).toBe(0.5);
    expect(e.reach).toBe(0.5);
    expect(e.top).toBe(0.5);
    expect(e.rise(0.2)).toBeCloseTo(0.3, 9);
    expect(e.rise(1)).toBe(0);
    expect(asEdge(0.5).at(1)).toBe(0.5);
    expect(asEdge(e)).toBe(e);
  });

  it("is the groove above level 0 with the lip on, else the chamfer", () => {
    expect(bottomEdgeOf(OFF, 1).reach).toBe(0.5);
    expect(bottomEdgeOf(ON, 0).reach).toBe(0.4);
    expect(bottomEdgeOf(ON, 1).reach).toBeCloseTo(1.95, 9);
  });

  it("pulls the contour in by the groove's profile at every height", () => {
    const g = grooveOf(ON, 1);
    if (g === null) {
      throw new Error("no groove");
    }
    const e = grooveEdge(g);
    const pull = (z: number): number => Math.max(0, e.at(z) - z);
    expect(pull(0)).toBeCloseTo(1.95, 9); // the foot at the bed
    expect(pull(0.5)).toBeCloseTo(1.45, 9); // up the foot chamfer
    expect(pull(1)).toBeCloseTo(1.45, 9); // the inner wall
    expect(pull(1.4)).toBeCloseTo(1.45, 9);
    expect(pull(2)).toBeCloseTo(0.85, 9); // the 45° roof
    expect(pull(2.85)).toBeCloseTo(0, 9);
    expect(pull(5)).toBe(0);
    expect(e.top).toBeCloseTo(2.85, 9);
    // the height of the cavity at a distance in from the outer face
    expect(e.rise(0)).toBeCloseTo(2.85, 9);
    expect(e.rise(1)).toBeCloseTo(1.85, 9);
    expect(e.rise(1.45)).toBeCloseTo(1.4, 9);
    expect(e.rise(1.7)).toBeCloseTo(0.25, 9);
    expect(e.rise(2)).toBe(0);
  });
});

describe("what a grooved tray needs", () => {
  it("minimums: 2 × (reach + 0.8) across, zTop + 0.8 high; the plain chamfer's without a groove", () => {
    expect(bottomMinimums(ON, 1).side).toBeCloseTo(2 * (1.95 + 0.8), 9);
    expect(bottomMinimums(ON, 1).h).toBeCloseTo(2.85 + 0.8, 9);
    expect(bottomMinimums(ON, 0)).toEqual(chamferMinimums(ON, 0));
    expect(bottomMinimums(OFF, 1)).toEqual(chamferMinimums(OFF, 1));
  });

  it("wall: 0 without a groove; with one, at least what keeps 0.8 mm beside the groove", () => {
    expect(grooveWall(OFF, 1)).toBe(0);
    expect(grooveWall(ON, 0)).toBe(0);
    expect(grooveWall(ON, 1)).toBeGreaterThanOrEqual(1.45 + MIN_FEATURE_MM);
  });

  it("wall: enough that no well corner shrinks the 3 mm outer corner radius", () => {
    const wall = grooveWall(ON, 1);
    // the well corner's disc is pulled in by 1.45 at the floor; maxCornerRadius says what is left
    expect(maxCornerRadius(wall, wall, 1.45)).toBeGreaterThanOrEqual(3);
    expect(wall).toBeCloseTo(2.55, 1);
    // and no more than that: a tenth less would shrink it
    expect(maxCornerRadius(wall - 0.1, wall - 0.1, 1.45)).toBeLessThan(3);
  });

  it("wall: follows the corner radius setting up to GROOVE_CORNER_RADIUS_MM, and no further", () => {
    const radius = (r: number): number => grooveWall({ ...ON, cornerRadius: r }, 1);
    expect(radius(0)).toBeLessThan(radius(3));
    expect(radius(3)).toBeLessThan(radius(GROOVE_CORNER_RADIUS_MM));
    expect(radius(GROOVE_CORNER_RADIUS_MM)).toBe(radius(10));
  });

  it("wall: grows with the chamfer and the play, and shrinks with a higher floor", () => {
    expect(grooveWall({ ...ON, fit: 1.4 }, 1)).toBeGreaterThan(grooveWall(ON, 1));
    expect(grooveWall({ ...ON, bottomChamfer: 1.4 }, 1)).toBeGreaterThan(grooveWall(ON, 1));
    expect(grooveWall({ ...ON, floor: 3 }, 1)).toBeLessThanOrEqual(grooveWall(ON, 1));
  });
});
