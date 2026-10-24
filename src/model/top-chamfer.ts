// src/model/top-chamfer.ts
import { bottomEdgeOf } from "./lip";
import { MIN_FEATURE_MM } from "./settings";
import type { FeatureSpec, Settings, Side, TraySpec } from "./types";

// Top chamfers (FeatureSpec "topChamfer", geometry 0.9.8, which replaced 0.9.4's finger dip). Trays
// tile the box a tray gap apart, and 0.5 mm from its wall, so nothing on a tray's outside can be
// gripped: a whole tray comes out only by its contents. A filler wedged beside a tray gets a 45°
// chamfer along its top edge where it touches the tray's outer face; with the tray's straight wall
// it makes a V-groove CHAMFER_MM across and as deep, so a fingertip reaches the tray's wall and
// the filler's slope. The rules live here, pure, because two places must agree on them: the
// print-time pass that places chamfers (layout/chamfers.ts) and planTray (geometry/plan-chamfers.ts)
// that accepts only what is buildable, so whatever is placed is built.
//
// Size, CHAMFER_MM (5): a fingertip is 15 to 18 mm across, so no groove takes it whole; what it
// needs is a nail's width of the wall and a slope to rest on, and a V 5 mm across and deep gives
// both (3 mm, the least, still takes a nail: CHAMFER_MIN_MM). It also costs the filler little
// (12.5 mm² of section) and prints as it stands: a chamfer along a top edge faces up and out, so
// it has no overhang. The 0.9.4 dip cut a U 25 mm wide and up to 20 mm deep into the filler, the
// look the owner did not like; the chamfer is on the edge, plain, and one stretch of it grips
// along the tray's whole side where a dip gripped a spot.

/** The chamfer's leg, mm, along the filler's top and down its face: 45°. */
export const CHAMFER_MM = 5;

/** A chamfer smaller than this, mm, is no grip at all: the filler gets none. */
export const CHAMFER_MIN_MM = 3;

/**
 * The top left flat across a strip, mm: two perimeters' worth (twice MIN_FEATURE_MM), so chamfers
 * on its two long edges never meet in a ridge, and the strip's top stays a printable flat. A strip
 * with room for less than CHAMFER_MIN_MM is left whole.
 */
export const CHAMFER_LAND_MM = 2 * MIN_FEATURE_MM;

/**
 * A filler thinner than this, mm, is a strip a finger and thumb can pinch (a finger's thickness
 * and a post's, as the 0.9.4 dip's run): it is chamfered along both long edges when it has a
 * chamfer on one, so it can be pinched at the two slopes.
 */
export const CHAMFER_PINCH_MAX_MM = 18;

/** A chamfer must face this much of a tray's side, mm, to count as reaching it (MIN_CUT_MM). */
export const CHAMFER_MIN_CONTACT_MM = 10;

/** The tray's wall must stand this deep in the groove, mm, for a chamfer to count as a grip. */
export const CHAMFER_MIN_GRIP_MM = 3;

export type TopChamfer = Extract<FeatureSpec, { type: "topChamfer" }>;

export function isTopChamfer(f: FeatureSpec): f is TopChamfer {
  return f.type === "topChamfer";
}

/** The part's own features that are not chamfers (a card spacer's notch). */
export function ownFeatures(features: readonly FeatureSpec[] | undefined): FeatureSpec[] {
  return (features ?? []).filter((f) => !isTopChamfer(f));
}

/**
 * The chamfers a printed part carries, each with the part it is cut in: the part itself, or for a
 * merged part its members (a chamfer is on a member, in the member's own frame). A part with no
 * `topChamfer` in `features` has none.
 */
export function topChamfersOf(spec: TraySpec): { part: TraySpec; chamfer: TopChamfer }[] {
  const parts = spec.merged === undefined ? [spec] : spec.merged.members;
  return parts.flatMap((part) =>
    (part.features ?? []).filter(isTopChamfer).map((chamfer) => ({ part, chamfer })),
  );
}

/** The opposite of a side. */
export const OPPOSITE_SIDE: Readonly<Record<Side, Side>> = {
  front: "back",
  back: "front",
  left: "right",
  right: "left",
};

/**
 * Whether a part is a strip chamfered along both long edges: thinner than CHAMFER_PINCH_MAX_MM
 * across, with a chamfer on each of two opposite faces. A finger and thumb pinch it there.
 */
export function pinchable(
  spec: Pick<TraySpec, "w" | "d">,
  chamfers: readonly TopChamfer[],
): boolean {
  const sides = new Set(chamfers.map((c) => c.side));
  return (
    (sides.has("front") && sides.has("back") && spec.d < CHAMFER_PINCH_MAX_MM) ||
    (sides.has("left") && sides.has("right") && spec.w < CHAMFER_PINCH_MAX_MM)
  );
}

/** The most a chamfer can be in a part `h` tall whose bottom edge stands whole above `edgeTop`. */
export function chamferRoom(h: number, edgeTop: number): number {
  return h - (edgeTop + MIN_FEATURE_MM);
}

/**
 * How large a chamfer is on each of `faces` (1 or 2) faces of a filler `across` thick and `h`
 * tall, whose bottom edge (chamfer, groove or step) stands whole above `edgeTop`: CHAMFER_MM, less
 * where the strip is thin (CHAMFER_LAND_MM of the top stays flat across it, shared by the two
 * faces) or low (MIN_FEATURE_MM of wall stays above the bottom edge where the chamfer leaves
 * through the face), and `cap` (the one size the whole layout shares). Whole hundredths, rounded down; 0 when under CHAMFER_MIN_MM.
 */
export function chamferSize(
  across: number,
  h: number,
  edgeTop: number,
  faces: 1 | 2,
  cap: number = CHAMFER_MM,
): number {
  const most = Math.min(cap, (across - CHAMFER_LAND_MM) / faces, chamferRoom(h, edgeTop));
  const size = Math.floor(most * 100 + 1e-6) / 100;
  return size >= CHAMFER_MIN_MM ? size : 0;
}

/** The height a part's bottom edge stands whole above, mm (chamfer, groove's top or step). */
export function edgeTopOf(s: Settings, level: number): number {
  return bottomEdgeOf(s, level).top;
}
