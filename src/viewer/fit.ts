// src/viewer/fit.ts
// Where the 3D camera stands so the whole model stays in the frame however it is turned and however
// far apart it is spread. The camera orbits the middle of the box, so the model is inside a sphere
// about that point and a sphere is in view from any side when it is in view from one: the distance
// is the sphere's radius over the sine of half the narrower field of view (the horizontal one when
// the frame is taller than it is wide). Pure, so the fit is tested without a renderer.
import type { TraySpec } from "../model/types";
import { trayPosition } from "./transform";
import type { BoxOutline } from "./types";

/** The camera's vertical field of view, in degrees. */
export const CAMERA_FOV = 40;

/**
 * Air between the sphere and the frame's edge: the model never comes nearer to the edge than a
 * tenth of the frame's half-size (1 / 1.12 is 0.893), which is clear of the rounded corners and the
 * pills over the frame, so a part at the edge reads as inside it and not as cut off.
 */
export const FIT_AIR = 1.12;

export type Vec3 = readonly [number, number, number];

/** The point the camera looks at and turns about: the middle of the box. */
export function outlineTarget(o: BoxOutline): Vec3 {
  return [o.min[0] + o.size[0] / 2, o.min[1] + o.size[1] / 2, o.min[2] + o.size[2] / 2];
}

/** The eight corners of a box given by its least corner and its size. */
export function cornersOf(min: Vec3, size: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const dx of [0, 1]) {
    for (const dy of [0, 1]) {
      for (const dz of [0, 1]) {
        out.push([min[0] + dx * size[0], min[1] + dy * size[1], min[2] + dz * size[2]]);
      }
    }
  }
  return out;
}

/** A part to fit: its spec and the part it is spread apart with (`anchorOf`). */
export interface FitPart {
  spec: TraySpec;
  anchor: TraySpec;
}

/** The corners of every part where it stands at `explode`, and of the box (which does not move). */
export function modelCorners(
  outline: BoxOutline,
  parts: readonly FitPart[],
  explode: number,
): Vec3[] {
  const center: [number, number] = [
    outline.min[0] + outline.size[0] / 2,
    outline.min[1] + outline.size[1] / 2,
  ];
  const out = cornersOf(outline.min, outline.size);
  for (const { spec, anchor } of parts) {
    const at = trayPosition(spec, explode, center, anchor);
    out.push(...cornersOf(at, [spec.w, spec.d, spec.h]));
  }
  return out;
}

/** The farthest any of `points` is from `target`. */
export function radiusAbout(points: readonly Vec3[], target: Vec3): number {
  return Math.max(
    0,
    ...points.map((p) => Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2])),
  );
}

/** The sphere about the box's middle that holds the box and every part, spread apart as far as `explode`. */
export function modelRadius(
  outline: BoxOutline,
  parts: readonly FitPart[],
  explode: number,
): number {
  return radiusAbout(modelCorners(outline, parts, explode), outlineTarget(outline));
}

/**
 * How far the camera stands from the middle for a sphere of `radius` to be in frame: for the
 * narrower of the vertical field of view `fovDeg` and the horizontal one it makes at `aspect`
 * (width over height), with `FIT_AIR` to spare.
 */
export function fitDistance(radius: number, aspect: number, fovDeg = CAMERA_FOV): number {
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return (radius * FIT_AIR) / Math.sin(Math.min(vertical, horizontal) / 2);
}

/**
 * A point's place in the frame, x and y each in -1..1 when it is inside: `view` is the camera's
 * world-to-camera matrix and `projection` its projection, both column-major as three.js keeps them.
 * The harness reads it to see whether any part of the model is cut off.
 */
export function ndcOf(
  view: ArrayLike<number>,
  projection: ArrayLike<number>,
  p: Vec3,
): [number, number] {
  const at = (m: ArrayLike<number>, row: number, v: readonly number[]): number =>
    (m[row] ?? 0) * (v[0] ?? 0) +
    (m[4 + row] ?? 0) * (v[1] ?? 0) +
    (m[8 + row] ?? 0) * (v[2] ?? 0) +
    (m[12 + row] ?? 0) * (v[3] ?? 0);
  const eye = [0, 1, 2, 3].map((row) => at(view, row, [p[0], p[1], p[2], 1]));
  const clip = [0, 1, 3].map((row) => at(projection, row, eye));
  const w = clip[2] ?? 1;
  return [(clip[0] ?? 0) / w, (clip[1] ?? 0) / w];
}

/**
 * Half the height of the orthographic camera's view at zoom 1, for a sphere of `radius` to be in
 * frame with `FIT_AIR` to spare: the sphere's radius across the narrower side of the frame, so the
 * height is that over `aspect` (width over height) when the frame is the taller one. The distance
 * of an orthographic camera changes nothing of what it sees, so there is no distance to fit.
 */
export function orthoHalfHeight(radius: number, aspect: number): number {
  return (radius * FIT_AIR) / Math.min(1, aspect);
}

/** The sphere about the box's middle that holds the box alone: what a remembered view is checked against. */
export function boxRadius(outline: BoxOutline): number {
  return radiusAbout(cornersOf(outline.min, outline.size), outlineTarget(outline));
}
