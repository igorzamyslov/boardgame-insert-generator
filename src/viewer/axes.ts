// src/viewer/axes.ts
// The axis indicator's maths, free of three.js: where the world's X, Y and Z axes point on screen
// for a camera, given the camera's own axes in world coordinates.

export type Vec3 = readonly [number, number, number];

/** The camera's right, up and back (toward the viewer) directions, as unit vectors in world coordinates. */
export interface ViewBasis {
  right: Vec3;
  up: Vec3;
  back: Vec3;
}

export type AxisName = "x" | "y" | "z";

export interface ProjectedAxis {
  axis: AxisName;
  /** The unit axis on screen: to the right, and up (y grows upward here, unlike SVG). */
  dx: number;
  dy: number;
  /** Positive: the axis points toward the viewer; negative: away. */
  depth: number;
}

const AXES: readonly AxisName[] = ["x", "y", "z"];

/** What the camera sees of each world axis, farthest first so the nearest is painted last. */
export function projectAxes(view: ViewBasis): ProjectedAxis[] {
  return AXES.map((axis, i) => ({
    axis,
    dx: view.right[i] ?? 0,
    dy: view.up[i] ?? 0,
    depth: view.back[i] ?? 0,
  })).sort((a, b) => a.depth - b.depth);
}
