import {
  CORNER_MARGIN,
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  SPEC_TOLERANCE,
  chamferMinimums,
  effective,
  effectiveBottomChamfer,
} from "./settings";
import type { Settings, TraySpec } from "./types";

/** The rim between layers is on and is the lip and groove (`lip.kind` "rim"). */
export function rimOn(s: Settings): boolean {
  return s.lip.enabled && s.lip.kind !== "step";
}

/** The rim between layers is on and is the stepped base (`lip.kind` "step"). */
export function stepOn(s: Settings): boolean {
  return s.lip.enabled && s.lip.kind === "step";
}

/** How far a part's joint stands above its `h`: the lip of a lipped part with the rim, else 0. */
export function lipAbove(s: Settings, lipped: boolean): number {
  return lipped && rimOn(s) ? s.lip.height : 0;
}

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
 * No tray at level 0 has one: it stands on the box floor or on a plain riser, neither of which has a
 * lip. A tray on a riser that carries the lip (`TraySpec.onRiser`, set by splitRisers) is built as
 * one at level 1 is.
 * The foot chamfer is the tray's bottom chamfer (at least UPPER_MIN_CHAMFER), less where the
 * inner wall is lower.
 */
export function grooveOf(s: Settings, level: number): Groove | null {
  if (!rimOn(s) || !(level > 0)) {
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
  /** The least outer corner radius the edge needs; `reach` when absent (a chamfer, a groove). */
  readonly round?: number;
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

/** The edge of a tray at `level`: its groove, its step, or its plain bottom chamfer. */
export function bottomEdgeOf(s: Settings, level: number): BottomEdge {
  const g = grooveOf(s, level);
  if (g) {
    return grooveEdge(g);
  }
  const st = stepOf(s, level);
  return st ? stepEdge(st) : plainEdge(effectiveBottomChamfer(s, level));
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
 * The least height of a tray that stands on a lipped part (level ≥ 1, or the bottom tray on a
 * lipped riser), mm; 0 with the lip off. It is what its groove needs and nothing more:
 * `zTop + MIN_FEATURE_MM`, the groove's height (lip flat + lip height + play, 2.85 mm at the
 * defaults) and the thinnest solid wall above it (0.8 mm), 3.65 mm at the defaults. It scales with
 * the lip height, thickness and play. The floor needs nothing of its own: the groove is in the
 * outer wall only, and `grooveWall` and the cut rules (`planCut`, `edge`) keep every well and cut
 * MIN_FEATURE_MM clear of it. Before 2026-10-23 sizing asked lip.height + 3 mm (5 mm) on top of this,
 * air above shallow contents that a riser could have been. With the stepped base it is the step's
 * (`bottomMinimums`: the wall + MIN_FEATURE_MM above the seam, 2.4 mm at the defaults); the slab
 * hangs below the seam and is no part of it.
 */
export function upperTrayMinH(s: Settings): number {
  return s.lip.enabled ? bottomMinimums(s, 1).h : 0;
}

// ---------------------------------------------------------------------------------------------
// The stepped base (`lip.kind` "step", owner 2026-10-23): the other joint between stacked parts.
//
// Cross-section of the upper part's edge, in (u, z): u in from its outer face, z from the seam
// (where it meets the top of the part below; its TraySpec z). With `wall` the lower part's wall,
// `inset` = wall + play:
//
//   slab:    a solid block under the floor, the outer contour inset by `inset` on every side, from
//            z = −height up; its bed edge has the 45° `foot` chamfer;
//   step:    a 45° chamfer from the slab's side at (inset, −play) out to the outer face at
//            (0, wall), through (wall, 0): the inner edge of the lower part's rim.
//
// So the upper part rests on that edge with its chamfer, centred on every side it has a rim
// under, and the slab hangs `height` into the part below, `play` clear of its wall. Printed slab
// down, every layer stands on the one under it: the slab is the bed face, the step widens at 45°,
// so nothing overhangs and nothing needs support. The part's walls stay at `wall`, and its floor
// above the seam is the Floor setting, so under its wells there are floor + height of solid.
//
// The part below has a socket for the slab: everything inside its wall (dividers, the tops of its
// wells' walls) stops `depth` = height + play under its rim, and its contents stay under that
// (sizing: MinLayout.socket). The upper part's TraySpec z and h are from the seam, as with the rim:
// the slab hangs below z as a lip stands above h, so a stack's heights add up as before; only the
// part below is that much taller and, to the top plane, the part above that much lower.
// ---------------------------------------------------------------------------------------------

/** The stepped base of a part that stands on a socketed part, mm (see above). */
export interface Step {
  /** The slab's height under the seam. */
  height: number;
  /** The lower part's wall the slab clears, and the step's size above the seam. */
  wall: number;
  /** The effective play, sideways between the slab and that wall and under the slab. */
  play: number;
  /** wall + play: how far the slab's side is in from the outer face. */
  inset: number;
  /** The 45° chamfer on the slab's bed edge, at most: the tray's bottom chamfer (planTray may make it less). */
  foot: number;
  /** inset + foot: how far the outline is pulled in at the bed. */
  reach: number;
}

/** The base wall every part keeps (wallFor's base), which a socket leaves around it. */
function stepWallOf(s: Settings): number {
  return Math.max(s.wall, MIN_WALL_MM);
}

/**
 * The step of a part at `level` (null when it has none): with the stepped base on, every tray and
 * filler above level 0 stands on a socketed part and has one; level 0 stands on the box floor or a
 * plain riser. A tray on a riser that carries the joint (`TraySpec.onRiser`) is built as one at
 * level 1 is. The foot is the tray's bottom chamfer, less where the slab is lower than it and its
 * play.
 */
export function stepOf(s: Settings, level: number): Step | null {
  if (!stepOn(s) || !(level > 0)) {
    return null;
  }
  const wall = stepWallOf(s);
  const play = effective(s).lipPlay;
  const height = s.lip.stepHeight;
  const inset = wall + play;
  const foot = Math.max(0, Math.min(effectiveBottomChamfer(s, level), height - play));
  return { height, wall, play, inset, foot, reach: inset + foot };
}

/**
 * The socket a socketed part (one with something stacked on it, `TraySpec.lip`, with the stepped
 * base on) has for the slab above: inside `wall` from its outer face, `depth` (slab height + play)
 * deep from its rim; null otherwise. Its corners are rounded only up to `round` (the slab's inset):
 * every slab, whatever its own corner radius (at least the inset, see `stepEdge`), then fits it
 * with the play all round.
 */
export function socketOf(
  s: Settings,
  lipped: boolean,
): { wall: number; depth: number; round: number } | null {
  if (!lipped || !stepOn(s)) {
    return null;
  }
  const wall = stepWallOf(s);
  const play = effective(s).lipPlay;
  return { wall, depth: s.lip.stepHeight + play, round: wall + play };
}

/**
 * The most outer corner radius a socketed part may have, mm: at the corner its wall beside the
 * socket (whose corner is rounded only to `round`) is thinner than at its faces, by
 * (R − round)·(√2 − 1), and stays MIN_WALL_MM.
 */
export function socketCornerCap(socket: { wall: number; round: number }): number {
  return socket.round + Math.max(0, socket.wall - MIN_WALL_MM) / (Math.SQRT2 - 1);
}

/**
 * The step as a bottom edge, above the seam (z ≥ 0, the only heights wells, cuts and slots
 * reach): the step's 45° plane u + z = wall, so a plain chamfer of the wall's size; `reach` is the
 * slab's foot at the bed, and the outer corner needs to be only as round as the inset (`round`),
 * where the step's rings stay exact offsets of the outline.
 */
export function stepEdge(st: Step): BottomEdge {
  return {
    at: () => st.wall,
    reach: st.reach,
    top: st.wall,
    round: st.inset,
    rise: (u) => Math.max(0, st.wall - u),
  };
}

/** How far a part at `level` (onRiser: as level 1) hangs below its z: its slab, else 0. */
export function stepBelow(s: Settings, level: number): number {
  return stepOf(s, level)?.height ?? 0;
}

/**
 * The level a part's bottom is built at (planTray): spacers and dividers always as level 0, a tray
 * on a riser that carries the joint (`onRiser`) as one above level 0, everything else its level.
 */
export function builtLevel(spec: Pick<TraySpec, "part" | "level" | "onRiser">): number {
  if (spec.part === "spacer" || spec.part === "divider") {
    return 0;
  }
  return spec.onRiser === true ? Math.max(1, spec.level) : spec.level;
}

/**
 * How far a printed part hangs below its z, mm: the slab of a part with the stepped base, else 0.
 * A merged part never has one (mergeParts keeps the parts above level 0 apart with the joint on).
 */
export function slabUnder(s: Settings, spec: TraySpec): number {
  return spec.merged === undefined ? stepBelow(s, builtLevel(spec)) : 0;
}

/**
 * The outer wall a part at `level` needs for its step, mm (0 without one): the wells' bottom
 * corner at the lowest floor there is, where the step pulls the outline in by wall − floor, keeps
 * MIN_FEATURE_MM + CORNER_MARGIN to an outer corner as round as the step needs (the inset;
 * maxCornerRadius solved for the wall, the corner at p = q). At the defaults 1.47 mm, under the
 * 1.6 mm wall: the step never thickens a wall there; it does with a thin floor.
 */
export function stepWall(s: Settings, level: number): number {
  const st = stepOf(s, level);
  if (st === null) {
    return 0;
  }
  const floor = Math.max(s.floor, MIN_FEATURE_MM);
  const m = MIN_FEATURE_MM + CORNER_MARGIN + Math.max(0, st.wall - floor);
  return Math.max(m, (st.inset + (1 + Math.SQRT2) * m) / (2 + Math.SQRT2)) + 2 * SPEC_TOLERANCE;
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
  if (g !== null) {
    return { side: 2 * (g.reach + MIN_FEATURE_MM), h: g.zTop + MIN_FEATURE_MM };
  }
  const st = stepOf(s, level);
  if (st !== null) {
    // The slab's bed face keeps MIN_FEATURE_MM each side of the middle; above the seam the outer
    // face stands whole MIN_FEATURE_MM over the step.
    return { side: 2 * (st.reach + MIN_FEATURE_MM), h: st.wall + MIN_FEATURE_MM };
  }
  return chamferMinimums(s, level);
}
