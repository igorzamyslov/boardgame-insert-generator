import { FLOAT_EPSILON, MIN_FEATURE_MM } from "./settings";
import type { Side } from "./types";

// Sides and axes of wall cutouts (roadmap §4.6, §4.7), shared by sizing (sizing/cutouts.ts, in
// whole 0.01 mm units with tol 0) and planTray (geometry/plan-cuts.ts, in mm with tol
// SPEC_TOLERANCE). A cut on a side runs along it (u) and across it (v), from its compartment's face.
// `tol` is how far a length may miss a limit and still pass: planTray forgives the float noise of
// TraySpec sums, sizing forgives nothing, so whatever sizing places planTray accepts.
// FLOAT_EPSILON absorbs the float noise of the mm arithmetic in both.

/** An axis-aligned rectangle. */
export interface RectMm {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** How far apart two rectangles are along the axis that separates them most (< 0: they overlap). */
export function separation(a: RectMm, b: RectMm): number {
  return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
}

/**
 * Whether two rectangles keep MIN_FEATURE_MM apart along x or y, which keeps it between them at
 * any height.
 */
export function keepsApart(a: RectMm, b: RectMm, tol: number): boolean {
  return separation(a, b) >= MIN_FEATURE_MM - tol - FLOAT_EPSILON;
}

export const OPPOSITE: Readonly<Record<Side, Side>> = {
  front: "back",
  back: "front",
  left: "right",
  right: "left",
};

/** A cut on front or back runs along x (its width spans x); on left or right along y. */
export function alongX(side: Side): boolean {
  return side === "front" || side === "back";
}

/** The rectangle's extent along the side (u) and across it (v). */
export function axes(r: RectMm, side: Side): { u0: number; u1: number; v0: number; v1: number } {
  return alongX(side)
    ? { u0: r.x0, u1: r.x1, v0: r.y0, v1: r.y1 }
    : { u0: r.y0, u1: r.y1, v0: r.x0, v1: r.x1 };
}

/** The face of `r` on `side`, across the side. */
export function faceOf(r: RectMm, side: Side): number {
  return { front: r.y0, back: r.y1, left: r.x0, right: r.x1 }[side];
}

/**
 * Where a cut on `side` of compartment `owner`, centred on `at` along the side, runs: the index of
 * the nearest compartment across that side whose range along it contains `at` (more than `tol`
 * inside it), or -1 when it runs out through the outer face. Sizing asks with the centre its cut
 * gets, planTray with the cut's `at`, so both pick the same compartment.
 */
export function nearestAcross(
  rects: readonly RectMm[],
  owner: number,
  side: Side,
  at: number,
  tol: number,
): number {
  const own = rects[owner];
  if (own === undefined) {
    throw new Error("internal: wall cutout without a compartment");
  }
  const face = faceOf(own, side);
  const far = side === "back" || side === "right";
  let best = -1;
  let gap = Number.POSITIVE_INFINITY;
  rects.forEach((r, j) => {
    const a = axes(r, side);
    const distance = far ? a.v0 - face : face - a.v1;
    if (j !== owner && a.u0 + tol < at && a.u1 - tol > at && distance >= -tol && distance < gap) {
      best = j;
      gap = distance;
    }
  });
  return best;
}
