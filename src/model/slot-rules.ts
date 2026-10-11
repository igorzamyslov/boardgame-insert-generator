import {
  FLOAT_EPSILON,
  MIN_FEATURE_MM,
  SPEC_TOLERANCE,
  cutRidgeWidth,
  maxChannelSpacing,
  maxWellFaceOffset,
} from "./settings";

// The finger slot clearance rule (roadmap §4.6) as predicates on lengths in mm, shared by sizing
// (sizing/slots.ts, which places slots, with tol 0) and planTray (geometry/plan.ts, which checks
// them, with tol SPEC_TOLERANCE). `tol` is how far a length may miss a limit and still pass:
// planTray forgives the float noise of TraySpec sums, sizing forgives nothing, so whatever sizing
// places planTray accepts. FLOAT_EPSILON absorbs the float noise of the mm arithmetic in both.

/** An axis-aligned rectangle in mm. */
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

/** Whether two slots of radius r on one band line, centred `spacing` apart, keep MIN_FEATURE_MM. */
export function slotsApart(spacing: number, r: number, tol: number): boolean {
  return spacing - 2 * r >= MIN_FEATURE_MM - tol - FLOAT_EPSILON;
}

/**
 * Whether two slots of radius r on one band line, centred `spacing` apart, merge into one channel
 * (maxChannelSpacing). Neighbouring slots must keep apart or merge.
 */
export function slotsMerge(spacing: number, r: number, tol: number): boolean {
  return spacing <= maxChannelSpacing(r) + tol + FLOAT_EPSILON;
}

/** A well face along a band line: its position, and the side its solid material lies on. */
export interface WellFace {
  at: number;
  solid: -1 | 1;
}

/**
 * A slot crosses a face only when it reaches more than SPEC_TOLERANCE past it on both sides: a
 * slot end within half a 0.01 mm grid step of a face may lie on either side of it after float
 * noise, so sizing and planTray both count it as not crossing, and its end as up to the face.
 */
const CROSSING = SPEC_TOLERANCE + FLOAT_EPSILON;

/** Why a well face does not hold (wellFaceProblem); `centre` names the slot to blame. */
export type FaceProblem =
  | { kind: "short"; centre: number; short: number } // ends `short` mm before the face
  | { kind: "offset"; centre: number; offset: number; most: number } // crosses it too far out
  | { kind: "ridge"; width: number }; // cuts a merged ridge too close to its peak

/**
 * Why a well face does not hold against the slots of radius r centred on `centres` (twins on one
 * band line, roadmap §4.6 "Well faces in the overlap"), or null when it holds:
 * - the covering slot whose centre is nearest decides (on a tie the one on the solid side, whose
 *   bottom is lower there). With its centre on the solid side the face lies at most
 *   maxWellFaceOffset(r) from it; with its centre on the contents' side, a merged slot toward the
 *   solid side leaves half their ridge, cutRidgeWidth ≥ MIN_FEATURE_MM;
 * - with no covering slot, every slot whose end lies on the solid side ends ≥ MIN_FEATURE_MM short
 *   of the face.
 */
export function wellFaceProblem(
  face: WellFace,
  centres: readonly number[],
  r: number,
  tol: number,
): FaceProblem | null {
  const { at, solid } = face;
  const min = MIN_FEATURE_MM - tol - FLOAT_EPSILON;
  // Plain loops: sizing calls this in its slot search, many thousand times per tray.
  let nearest = Number.NaN;
  let best = Number.POSITIVE_INFINITY;
  for (const c of centres) {
    if (c - r < at - CROSSING && c + r > at + CROSSING) {
      const offset = solid * (c - at); // > 0: on the solid side
      const rank = Math.abs(offset) - (offset > 0 ? tol + FLOAT_EPSILON : 0);
      if (rank < best) {
        best = rank;
        nearest = c;
      }
    }
  }
  if (Number.isNaN(nearest)) {
    for (const c of centres) {
      // How far the slot's end toward the contents stops short of the face (< 0: on the contents
      // side, past the face).
      const short = solid * (c - solid * r - at);
      if (short >= -CROSSING && short < min) {
        return { kind: "short", centre: c, short };
      }
    }
    return null;
  }
  const dx = solid * (nearest - at);
  if (dx > 0) {
    const most = maxWellFaceOffset(r);
    return dx <= most + tol + FLOAT_EPSILON
      ? null
      : { kind: "offset", centre: nearest, offset: dx, most };
  }
  // On the contents' side: the half ridge with the next slot toward the solid side, if they merge.
  let across = Number.POSITIVE_INFINITY;
  for (const c of centres) {
    const d = solid * (c - at);
    if (d > tol + FLOAT_EPSILON && d - dx < 2 * r - tol - FLOAT_EPSILON) {
      across = Math.min(across, d);
    }
  }
  const width = across === Number.POSITIVE_INFINITY ? across : cutRidgeWidth(r, -dx, across);
  return width >= min ? null : { kind: "ridge", width };
}

/** Whether a well face holds: wellFaceProblem finds nothing wrong. */
export function wellFaceHolds(
  face: WellFace,
  centres: readonly number[],
  r: number,
  tol: number,
): boolean {
  return wellFaceProblem(face, centres, r, tol) === null;
}
