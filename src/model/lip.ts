import {
  CORNER_MARGIN,
  MIN_FEATURE_MM,
  SPEC_TOLERANCE,
  chamferMinimums,
  effective,
  effectiveBottomChamfer,
} from "./settings";
import type { Settings } from "./types";

// The locating lip on a tray's rim and the groove under the tray above it (spec §6.1 "Locating
// lip", geometry 0.8.0). Pure numbers, shared by sizing (walls, minimum sizes, cut placement) and
// geometry (planTray, buildTray), so what sizing makes room for is what planTray builds.
//
// Cross-section, in (u, z): u is the distance in from the tray's outer face, z the height.
//
//   lip, from the lower tray's rim up: (0,0) (0,H) (f,H) (t,zIn) (t,0), closed, with H = height,
//   f = the flat top, t = thickness; the ramp from (f,H) to (t,zIn) falls 45°.
//
//   groove, from the upper tray's bottom up, the region left of this line, open to the outside:
//   (reach,0) (inset,foot) (inset,zIn) (0,zTop); the first leg is the 45° foot chamfer, the second
//   the vertical inner wall, the last the 45° roof.
//
// The lip is the outer `thickness` of the wall, rising `height` at the outer face and sloping down
// to `zIn` at its inner face; the outer face stays flush with the tray's, so the stack's outer
// footprint does not change. The groove is the lip's shape, one `play` further out and up: a
// notch in the underside of the upper tray along its whole outer edge, open to the outside, whose
// roof slopes at 45°, the angle of the bottom chamfer, so every layer stands on the one below
// (nothing overhangs more than a chamfer does). The upper tray's own outer face starts above
// the lip, at `zTop`.

/** The flat top of the lip is at least this wide, mm (spec §6.1; the lip's outer top edge is not a knife edge). */
export const LIP_FLAT = 0.6;

/**
 * The lip's inner face is at least this high, mm: the lip still keys the tray above sideways
 * where its top slopes down toward the compartments.
 */
export const LIP_INNER_MIN = 0.6;

/** The lip ring's cross-section. */
export interface LipShape {
  /** Rise at the outer face. */
  height: number;
  /** Width of the ring at its foot. */
  thickness: number;
  /** Width of the flat top, from the outer face in. */
  flat: number;
  /** Rise at the inner face, where the 45° ramp ends. */
  zIn: number;
}

/**
 * The lip of `height` and `thickness`: a flat top LIP_FLAT wide and a 45° ramp down over the rest
 * of the thickness, so the inner face stands `height − (thickness − LIP_FLAT)` high: 1.4 mm at the
 * defaults. A low or thick lip gets a wider flat and a shorter ramp rather than an inner face
 * under LIP_INNER_MIN.
 */
export function lipShape(height: number, thickness: number): LipShape {
  const drop = Math.max(0, Math.min(thickness - LIP_FLAT, height - LIP_INNER_MIN));
  return { height, thickness, flat: thickness - drop, zIn: height - drop };
}

/**
 * The groove under a tray that stands on a lipped tray: `inset` in from its outer face (lip
 * thickness plus the effective play), with a 45° `foot` chamfer on the edge where it meets the
 * bottom face, the vertical inner wall up to `zIn`, and the 45° roof up to the outer face at
 * `zTop`. `reach` is how far it cuts into the bottom face: inset + foot. `zTop − inset = zIn`.
 */
export interface Groove {
  inset: number;
  foot: number;
  zIn: number;
  zTop: number;
  reach: number;
}

/**
 * The groove of a tray at `level` (null when it has none): with the lip on, every tray above
 * level 0 stands on a lipped tray, and has one (spacers and dividers are always built at level 0).
 * No tray at level 0 has one: it stands on the box floor or on a riser, neither of which has a lip.
 * The foot chamfer is the tray's bottom chamfer (at least UPPER_MIN_CHAMFER), less where the
 * inner wall is lower.
 */
export function grooveOf(s: Settings, level: number): Groove | null {
  if (!s.lip.enabled || !(level > 0)) {
    return null;
  }
  const { flat, zIn } = lipShape(s.lip.height, s.lip.thickness);
  const play = effective(s).lipPlay;
  const inset = s.lip.thickness + play;
  const foot = Math.min(effectiveBottomChamfer(s, level), zIn);
  return { inset, foot, zIn, zTop: flat + s.lip.height + play, reach: inset + foot };
}

/**
 * How the outer contour is pulled in near the bed: by a 45° chamfer, or a groove. `at(z)` is the
 * effective chamfer size at height z: how far the cavity's 45° plane through the contour at z
 * reaches, so that `max(0, at(z) − z)` is the distance the contour is pulled in there, and the
 * material a point at distance d from the outer face and height z has to the pulled-in contour is
 * `d + z − at(z)`. A plain chamfer c is the constant c; the same sums then read as before.
 */
export interface BottomEdge {
  at(z: number): number;
  /** How far the contour is pulled in at the bed: the chamfer, or the groove's reach. */
  readonly reach: number;
  /** Height above which the outer face stands whole: the chamfer, or the groove's `zTop`. */
  readonly top: number;
  /** Height of the cavity at distance u in from the outer face (0 where there is none). */
  rise(u: number): number;
}

export function plainEdge(c: number): BottomEdge {
  return { at: () => c, reach: c, top: c, rise: (u) => Math.max(0, c - u) };
}

export function grooveEdge(g: Groove): BottomEdge {
  return {
    at: (z) => Math.min(g.zTop, g.inset + Math.max(g.foot, z)),
    reach: g.reach,
    top: g.zTop,
    rise: (u) => (u <= g.inset ? g.zTop - Math.max(0, u) : Math.max(0, g.reach - u)),
  };
}

/** A chamfer size or an edge, as functions that predate grooves take it. */
export function asEdge(e: number | BottomEdge): BottomEdge {
  return typeof e === "number" ? plainEdge(e) : e;
}

/** The edge of a tray at `level`: its groove, or its plain bottom chamfer. */
export function bottomEdgeOf(s: Settings, level: number): BottomEdge {
  const g = grooveOf(s, level);
  return g ? grooveEdge(g) : plainEdge(effectiveBottomChamfer(s, level));
}

/**
 * The outer corner radius a grooved tray keeps up to, mm. The groove's rings are offsets of the
 * outer contour, so the groove fits the lip of the tray below, which is offset from that tray's
 * own outer contour, only as well as the two corner radii agree: at a rounded corner the play
 * between lip and groove falls by 0.41 mm for every mm the upper radius is smaller than the
 * lower one. The wall of a grooved tray is chosen to leave the wells' corners from shrinking its
 * radius (see `grooveWall`) up to this: the default 3 mm, and what the setting asks for up to 4.
 */
export const GROOVE_CORNER_RADIUS_MM = 4;

/**
 * The outer wall a tray at `level` needs for its groove, mm (0 without one):
 * - the wells' bottom edge, at the lowest floor there is (`settings.floor`, at least
 *   MIN_FEATURE_MM), keeps MIN_FEATURE_MM of wall from the pulled-in contour. The contour is
 *   pulled in least where the floor is higher, so this is the most any well needs. With the
 *   defaults 2.25 mm: the groove's inner wall (1.45) and 0.8;
 * - never under the groove's reach (and half a hundredth): the outer corner is at least that
 *   round (the rings of the loft cannot be rounder than the arc they offset);
 * - a well's corner does not shrink the outer corner radius, up to GROOVE_CORNER_RADIUS_MM
 *   (maxCornerRadius solved for the wall, the corner at p = q): 2.54 mm at the defaults. The lip
 *   below was built with the radius the setting asks for, and the groove fits it to within the
 *   play only when the two radii agree.
 */
export function grooveWall(s: Settings, level: number): number {
  const g = grooveOf(s, level);
  if (g === null) {
    return 0;
  }
  const floor = Math.max(s.floor, MIN_FEATURE_MM);
  const pull = Math.max(0, grooveEdge(g).at(floor) - floor);
  const clear = MIN_FEATURE_MM + pull;
  // maxCornerRadius(p, p, pull) ≥ R: (2 + √2)·p − (1 + √2)·m ≥ R with m = MIN_FEATURE_MM +
  // CORNER_MARGIN + pull, and p = R where R is below m (the face is then the limit).
  const radius = Math.min(Math.max(0, s.cornerRadius), GROOVE_CORNER_RADIUS_MM);
  const m = MIN_FEATURE_MM + CORNER_MARGIN + pull;
  const round = radius >= m ? (radius + (1 + Math.SQRT2) * m) / (2 + Math.SQRT2) : radius;
  return Math.max(clear, g.reach, round) + 2 * SPEC_TOLERANCE;
}

/**
 * The smallest outer footprint side and height in mm a tray at `level` can have: chamferMinimums
 * (2·(c + MIN_FEATURE_MM) and c + MIN_FEATURE_MM) for a plain bottom chamfer, and for a groove
 * 2·(reach + MIN_FEATURE_MM) across, so the flat of the bottom face keeps MIN_FEATURE_MM each
 * side of the middle, and `zTop + MIN_FEATURE_MM` high, so the outer face stands at least that
 * far above the groove.
 */
export function bottomMinimums(s: Settings, level: number): { side: number; h: number } {
  const g = grooveOf(s, level);
  if (g === null) {
    return chamferMinimums(s, level);
  }
  return { side: 2 * (g.reach + MIN_FEATURE_MM), h: g.zTop + MIN_FEATURE_MM };
}
