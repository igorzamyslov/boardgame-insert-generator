// src/model/finger-dip.ts
import { bottomEdgeOf } from "./lip";
import { MIN_FEATURE_MM, POST_MM } from "./settings";
import type { FeatureSpec, Settings, Side, TraySpec } from "./types";

// Finger dips (FeatureSpec "fingerDip", geometry 0.9.3). Trays tile the box a tray gap apart, and
// 0.5 mm from its wall, so nothing on a tray's outside can be gripped: a whole tray comes out only
// by its contents. A filler wedged beside a tray gets a dip, a U cut from its top where it touches
// the tray's outer face, so a fingertip reaches down that face; a dip on two opposite sides lifts
// a full tray by pinching it. The rules live here, pure, because two places must agree on them:
// the print-time pass that places dips (layout/dips.ts) and planTray (geometry/plan-dips.ts) that
// accepts only what is buildable, so whatever is placed is built.
//
// The dip is the card spacer's notch and the wall cutout's U (a round bottom of radius width / 2,
// vertical sides, open at the top, nothing overhangs), run in from the filler's face `side`:
// - `DIP_FINGER_MM` into a thick filler, ending in a wall of its own;
// - across the whole filler when it is thinner than a finger (`dipRun`): a strip is then cut
//   through, the dip is open on both its faces and reaches the tray on each.
// It is cut from the top of the part, so it prints without support.

/** The dip is at most this deep, mm: a fingertip's pad. Below it nothing more can be gripped. */
export const DIP_MAX_DEPTH_MM = 20;

/** A dip shallower than this, mm, is no grip at all: the filler gets none. */
export const DIP_MIN_DEPTH_MM = 3;

/**
 * How far a dip runs into a thick filler, mm: a finger's thickness. A filler thinner than this
 * plus POST_MM (what must stay behind a dip that ends in the filler) is cut across instead.
 */
export const DIP_FINGER_MM = 15;

/** A strip thinner than this, mm, is left whole: no finger enters a slot that narrow. */
export const DIP_MIN_STRIP_MM = 6;

/** A dip must face this much of a tray's side, mm, to count as reaching it (MIN_CUT_MM). */
export const DIP_MIN_CONTACT_MM = 10;

/** At most this many dips face one side of a tray. */
export const DIPS_PER_TRAY_SIDE = 2;

export type FingerDip = Extract<FeatureSpec, { type: "fingerDip" }>;

export function isFingerDip(f: FeatureSpec): f is FingerDip {
  return f.type === "fingerDip";
}

/** The part's own features that are not dips (a card spacer's notch). */
export function ownFeatures(features: readonly FeatureSpec[] | undefined): FeatureSpec[] {
  return (features ?? []).filter((f) => !isFingerDip(f));
}

/**
 * The dips a printed part carries, each with the part it is cut in: the part itself, or for a
 * merged part its members (a dip is on a member, in the member's own frame). A part with no
 * `fingerDip` in `features` has none.
 */
export function fingerDipsOf(spec: TraySpec): { part: TraySpec; dip: FingerDip }[] {
  const parts = spec.merged === undefined ? [spec] : spec.merged.members;
  return parts.flatMap((part) =>
    (part.features ?? []).filter(isFingerDip).map((dip) => ({ part, dip })),
  );
}

/** How far a dip runs into a filler `across` thick (across the face it opens on), mm. */
export function dipRun(across: number): { through: boolean; length: number } {
  const through = across < DIP_FINGER_MM + POST_MM - 1e-9;
  return { through, length: through ? across : DIP_FINGER_MM };
}

/** The opposite of a side. */
export const OPPOSITE_SIDE: Readonly<Record<Side, Side>> = {
  front: "back",
  back: "front",
  left: "right",
  right: "left",
};

/**
 * A dip's footprint in the part's own frame, the part's outer min corner the origin, from the face
 * it opens on `side` inward by `length`, or all the way across when `through`. `x0`…`y1` are in
 * the part's frame.
 */
export function dipBox(
  dip: Pick<FingerDip, "side" | "at" | "width">,
  size: { w: number; d: number },
): { x0: number; x1: number; y0: number; y1: number; through: boolean } {
  const half = dip.width / 2;
  const [a, b] = [dip.at - half, dip.at + half];
  const alongX = dip.side === "front" || dip.side === "back";
  const { through, length } = dipRun(alongX ? size.d : size.w);
  switch (dip.side) {
    case "front":
      return { x0: a, x1: b, y0: 0, y1: length, through };
    case "back":
      return { x0: a, x1: b, y0: size.d - length, y1: size.d, through };
    case "left":
      return { x0: 0, x1: length, y0: a, y1: b, through };
    case "right":
      return { x0: size.w - length, x1: size.w, y0: a, y1: b, through };
  }
}

/**
 * How far the dip's sides stay from the part's ends along its face, mm: clear of the outer corner
 * arc and of what a bottom edge pulls in (the larger of the corner radius setting, POST_MM and the
 * bottom edges' reach), plus MIN_FEATURE_MM of wall beside it, so the corner radius planTray
 * picks is not made smaller by a dip, and a hundredth over. Never under POST_MM + MIN_FEATURE_MM.
 */
export function dipMargin(s: Settings): number {
  const reach = Math.max(bottomEdgeOf(s, 0).reach, bottomEdgeOf(s, 1).reach);
  const round = Math.max(POST_MM, Math.max(0, s.cornerRadius), reach);
  return Math.ceil((round + MIN_FEATURE_MM) * 100 - 1e-6) / 100 + 0.01;
}

/**
 * How deep a dip can be in a part `h` tall whose bottom edge (chamfer, groove or step: `edgeTop`)
 * stands whole above `edgeTop`, when `room` is how far down the tray it faces reaches below the top
 * of the part: about half the part's height (a floor of its own under the dip), at most
 * DIP_MAX_DEPTH_MM, no deeper than the tray it faces, and its bottom MIN_FEATURE_MM above the edge
 * where it leaves through the face, as a wall cutout's is. Whole hundredths, rounded down; 0 when
 * under DIP_MIN_DEPTH_MM.
 */
export function dipDepth(h: number, edgeTop: number, room: number): number {
  const most = h - (edgeTop + MIN_FEATURE_MM);
  const depth = Math.floor(Math.min(DIP_MAX_DEPTH_MM, h / 2, room, most) * 100 + 1e-6) / 100;
  return depth >= DIP_MIN_DEPTH_MM ? depth : 0;
}

/** The height a part's bottom edge stands whole above, mm (chamfer, groove's top or step). */
export function edgeTopOf(s: Settings, level: number): number {
  return bottomEdgeOf(s, level).top;
}
