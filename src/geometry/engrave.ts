import type { Manifold, ManifoldToplevel, Vec3 } from "manifold-3d";
import { MIN_FEATURE_MM } from "../model/settings";
import type { MergedPart, Side } from "../model/types";
import { GLYPH_ROWS, isEngravable, textRects, textWidth } from "./glyphs";
import { notchFloorBox } from "./plan-cuts";
import { FINGER_FILLET_MM } from "./plan-types";
import type { Rect, TrayPlan } from "./plan-types";
import type { Scope } from "./scope";
import { hullPoints } from "./shapes";

// Part names (spec §6.1 "Part names"): the short name of the part (trayNames), engraved as shallow
// recessed capitals (glyphs.ts) on up to three faces: two opposite outer walls and the underside.
// A recess on a vertical wall adds no support, cannot catch or change how parts mate, and leaves
// the outer size as it is. Its roof (the top of a stroke) slopes down into the wall at more than
// 45°, so no face of it overhangs. The underside is cut as V-shaped grooves for the same reason
// (see `planUnderside`).

/** Depth of the engraving into the wall: one nozzle line, a quarter of a default 1.6 mm wall. */
export const ENGRAVE_DEPTH_MM = 0.4;
/** Material kept behind the engraving's floor: the thinnest feature, so the wall stays whole. */
export const ENGRAVE_KEEP_MM = MIN_FEATURE_MM + 0.01;
/** The shallowest engraving worth cutting; a wall too thin to take it is left plain. */
export const ENGRAVE_MIN_DEPTH_MM = 0.3;
/** Stroke width, mm, at most (letters 8 mm tall) and at least (5 mm tall; also the gap, ≥ 0.8). */
export const ENGRAVE_STROKE_MAX_MM = 1.6;
export const ENGRAVE_STROKE_MIN_MM = 1;
/** A face that gives the name at least this stroke is used before looking at the next. */
const GOOD_STROKE_MM = 1.3;
/** The letters keep this far from a corner's arc, a through cut's fillets and the chamfer. */
const EDGE_MM = 1.5;
const BELOW_CHAMFER_MM = 1;
const BELOW_RIM_MM = 1.5;
/** The tighter band tried when the usual one leaves no room (a low part). */
const TIGHT_BELOW_CHAMFER_MM = 0.5;
const TIGHT_BELOW_RIM_MM = 0.8;
/** A roof falls this many mm per mm of depth: 1.25 is steeper than 45°, so nothing overhangs. */
const ROOF_SLOPE = 1.25;
const OVERSHOOT = 1;
/**
 * Each stroke's cutter is made this much bigger along the text and upward, so two strokes that
 * meet only at a corner of the font's cells (the steps of a diagonal) cut one connected recess,
 * not two that touch along a bare edge. Far below what a printer resolves.
 */
const JOIN_MM = 0.03;

/** Faces in the order they are tried. */
export const ENGRAVE_FACES: readonly Side[] = ["front", "back", "left", "right"];

export interface EngravePlan {
  face: Side;
  /** The text engraved, as given (the font draws capitals). */
  text: string;
  /** Stroke (and gap) width, mm. */
  stroke: number;
  depth: number;
  /** Along the face, from its left end as seen from outside, to the text's left edge, mm. */
  from: number;
  /** Height of the text's lower edge above the part's bed side, mm. */
  z: number;
  /** The part is built upside down in relation to the way it prints (merged.flipped). */
  flipped: boolean;
}

interface Span {
  lo: number;
  hi: number;
}

/** The face's coordinate along it from its left end seen from outside, for a world x or y. */
function alongOf(face: Side, plan: TrayPlan, x: number, y: number): number {
  switch (face) {
    case "front":
      return x;
    case "back":
      return plan.w - x;
    case "left":
      return plan.d - y;
    case "right":
      return y;
  }
}

/** The material between the face and the nearest well (or relief) that the letters could meet. */
function thicknessBehind(plan: TrayPlan, face: Side, top: number): number {
  let t = Infinity;
  for (const c of plan.compartments) {
    if (c.floorZ >= top) {
      continue; // the wall there is the floor's, which is thick
    }
    const { x0, y0, x1, y1 } = c.rect;
    t = Math.min(t, { front: y0, back: plan.d - y1, left: x0, right: plan.w - x1 }[face]);
    for (const r of c.reliefs) {
      t = Math.min(
        t,
        {
          front: r.cy - r.r,
          back: plan.d - (r.cy + r.r),
          left: r.cx - r.r,
          right: plan.w - (r.cx + r.r),
        }[face],
      );
    }
  }
  return t;
}

// The free stretches of the face (as the plan sees it, before any flip) that the text may take:
// between the corners' arcs, less every cut through the face and its fillets.
function freeSpans(plan: TrayPlan, face: Side): Span[] {
  const length = face === "front" || face === "back" ? plan.w : plan.d;
  const edge = plan.cornerRadius + EDGE_MM;
  let spans: Span[] = [{ lo: edge, hi: length - edge }];
  for (const c of plan.compartments) {
    for (const cut of c.cuts) {
      if (cut.side !== face || cut.into !== null) {
        continue;
      }
      const a = alongOf(face, plan, cut.x0, cut.y0);
      const b = alongOf(face, plan, cut.x1, cut.y1);
      const lo = Math.min(a, b) - FINGER_FILLET_MM - EDGE_MM;
      const hi = Math.max(a, b) + FINGER_FILLET_MM + EDGE_MM;
      spans = spans.flatMap((s) =>
        [
          { lo: s.lo, hi: Math.min(s.hi, lo) },
          { lo: Math.max(s.lo, hi), hi: s.hi },
        ].filter((p) => p.hi > p.lo),
      );
    }
  }
  return spans;
}

/**
 * Where the text goes on a part, or null when no face has room for it at least
 * ENGRAVE_STROKE_MIN_MM a stroke (a name too long for the face is left off, never replaced by
 * something else), or a wall thick enough to take it (a thin face is left plain rather than
 * weakened), or the font lacks a character of it. Only the `faces` are tried (a merged part's own
 * faces are those on its outside), in ENGRAVE_FACES order: the first that gives a good stroke wins,
 * else the best. A part that is built upside down (`flipped`: its members are solid) is planned as
 * it prints, so the text reads upright; a flipped part with wells is left plain.
 */
export function planEngraving(
  plan: TrayPlan,
  text: string,
  faces: readonly Side[] = ENGRAVE_FACES,
  flipped = false,
): EngravePlan | null {
  if ((flipped && plan.compartments.length > 0) || text === "" || !isEngravable(text)) {
    return null;
  }
  // The usual band first; a part with no room in it (a low one) gets a second try in a tighter band,
  // and a part the first try engraves is engraved exactly as before.
  return (
    engraveIn(plan, text, faces, flipped, BELOW_CHAMFER_MM, BELOW_RIM_MM) ??
    engraveIn(plan, text, faces, flipped, TIGHT_BELOW_CHAMFER_MM, TIGHT_BELOW_RIM_MM)
  );
}

/** The wall across the part from each face. */
const OPPOSITE: Readonly<Record<Side, Side>> = {
  front: "back",
  back: "front",
  left: "right",
  right: "left",
};

/**
 * The wall engravings of a part: the face `planEngraving` picks, and the wall opposite it when
 * that face is among `faces` and has room too (the same bands, tried on that wall alone, and a
 * depth that leaves the thinnest feature between the two recesses). Empty when no face has room.
 */
export function planWallEngravings(
  plan: TrayPlan,
  text: string,
  faces: readonly Side[] = ENGRAVE_FACES,
  flipped = false,
): EngravePlan[] {
  const first = planEngraving(plan, text, faces, flipped);
  if (first === null) {
    return [];
  }
  const other = OPPOSITE[first.face];
  const second = faces.includes(other)
    ? (engraveIn(plan, text, [other], flipped, BELOW_CHAMFER_MM, BELOW_RIM_MM, first.depth) ??
      engraveIn(
        plan,
        text,
        [other],
        flipped,
        TIGHT_BELOW_CHAMFER_MM,
        TIGHT_BELOW_RIM_MM,
        first.depth,
      ))
    : null;
  return second === null ? [first] : [first, second];
}

function engraveIn(
  plan: TrayPlan,
  text: string,
  faces: readonly Side[],
  flipped: boolean,
  belowChamfer: number,
  belowRim: number,
  reserved = 0,
): EngravePlan | null {
  const strokesWide = textWidth(text);
  // The band of the part's height the text sits in, in the printed frame. It starts above the
  // chamfer, or above the groove (roof included), which leaves the outer face standing only from
  // `zTop`; the tighter band keeps its margin above that too, so a name never touches the groove.
  const lo = (plan.groove ? plan.groove.zTop : plan.chamfer) + belowChamfer;
  const hi = plan.h - belowRim;
  const band = flipped ? { lo: plan.h - hi, hi: plan.h - lo } : { lo, hi };
  const byHeight = (band.hi - band.lo) / GLYPH_ROWS;
  let best: EngravePlan | null = null;
  for (const face of ENGRAVE_FACES.filter((f) => faces.includes(f))) {
    // `reserved` is the depth already cut into the opposite wall: the part keeps the thinnest
    // feature between the two recesses.
    const across = face === "front" || face === "back" ? plan.d : plan.w;
    const depth = Math.min(
      ENGRAVE_DEPTH_MM,
      thicknessBehind(plan, face, hi) - ENGRAVE_KEEP_MM,
      across - reserved - ENGRAVE_KEEP_MM,
    );
    if (depth < ENGRAVE_MIN_DEPTH_MM) {
      continue;
    }
    const span = freeSpans(plan, face).reduce<Span | null>(
      (a, s) => (a === null || s.hi - s.lo > a.hi - a.lo ? s : a),
      null,
    );
    if (span === null) {
      continue;
    }
    const stroke = Math.min(ENGRAVE_STROKE_MAX_MM, byHeight, (span.hi - span.lo) / strokesWide);
    if (stroke < ENGRAVE_STROKE_MIN_MM || (best !== null && stroke <= best.stroke)) {
      continue;
    }
    best = {
      face,
      text,
      stroke,
      depth,
      from: (span.lo + span.hi) / 2 - (stroke * strokesWide) / 2,
      z: (band.lo + band.hi) / 2 - (stroke * GLYPH_ROWS) / 2,
      flipped,
    };
    if (stroke >= GOOD_STROKE_MM) {
      break;
    }
  }
  return best;
}

const SAME_MM = 0.01;

/**
 * Where the text goes on a merged part (several fillers and risers printed as one): on a face of
 * one member that lies on the merged part's own outside (as it prints: a flipped part is turned
 * over, so front and back change places), on the member where the strokes come out largest, and
 * on the wall opposite that face when it lies on the outside too and has room. A merged part has
 * no underside engraving: its underside is the bottoms of several members and the bridges between
 * them. `plans` are the members' plans, in the order of `merged.members`. Null when no member has
 * room.
 */
export function planMergedEngraving(
  spec: { x: number; y: number; w: number; d: number },
  merged: MergedPart,
  plans: readonly (TrayPlan | undefined)[],
  text: string,
): { engravings: EngravePlan[]; member: number } | null {
  const flipped = merged.flipped === true;
  let best: { engravings: EngravePlan[]; member: number } | null = null;
  merged.members.forEach((member, i) => {
    const plan = plans[i];
    const near = (a: number, b: number): boolean => Math.abs(a - b) < SAME_MM;
    const faces: Side[] = [];
    const buildFront = near(member.y, spec.y);
    const buildBack = near(member.y + member.d, spec.y + spec.d);
    if (flipped ? buildBack : buildFront) {
      faces.push("front");
    }
    if (flipped ? buildFront : buildBack) {
      faces.push("back");
    }
    if (near(member.x, spec.x)) {
      faces.push("left");
    }
    if (near(member.x + member.w, spec.x + spec.w)) {
      faces.push("right");
    }
    const found = plan === undefined ? [] : planWallEngravings(plan, text, faces, flipped);
    const first = found[0];
    if (
      first !== undefined &&
      (best === null || first.stroke > (best.engravings[0]?.stroke ?? 0))
    ) {
      best = { engravings: found, member: i };
    }
  });
  return best;
}

/**
 * The convex pieces of an engraving's cutter, as the points they are the hull of, in the part's
 * own frame: one per stroke, open to the outside (OVERSHOOT past the face), its floor `depth` in
 * and flat, its roof a slope that falls ROOF_SLOPE per mm of depth.
 */
export function engravingPieces(
  plan: EngravePlan,
  part: { w: number; d: number; h: number },
): Vec3[][] {
  const { face, stroke: u, depth, from, z: z0 } = plan;
  // (a, in, z) = along the face from its left, into the wall, height; as printed. A flipped part
  // is turned half a turn about X to print, so the cutter is put through that turn back.
  const toPart = (a: number, into: number, z: number): Vec3 => {
    const [x, y]: [number, number] = {
      front: [a, into] as [number, number],
      back: [part.w - a, part.d - into] as [number, number],
      left: [into, part.d - a] as [number, number],
      right: [part.w - into, a] as [number, number],
    }[face];
    return plan.flipped ? [x, part.d - y, part.h - z] : [x, y, z];
  };
  return textRects(plan.text).map((r) => {
    const zb = z0 + r.z0 * u - JOIN_MM;
    const zt = z0 + r.z1 * u + JOIN_MM;
    const profile: [number, number][] = [
      [-OVERSHOOT, zb],
      [depth, zb],
      [depth, zt - ROOF_SLOPE * depth],
      [0, zt],
      [-OVERSHOOT, zt],
    ];
    const points: Vec3[] = [];
    for (const a of [from + r.x0 * u - JOIN_MM, from + r.x1 * u + JOIN_MM]) {
      for (const [into, z] of profile) {
        points.push(toPart(a, into, z));
      }
    }
    return points;
  });
}

/** The cutter of an engraving (engravingPieces), tracked in `scope`. */
export function buildEngraving(
  m: ManifoldToplevel,
  scope: Scope,
  plan: EngravePlan,
  part: { w: number; d: number; h: number },
): Manifold {
  const pieces = engravingPieces(plan, part).map((points) => hullPoints(m, scope, points));
  return scope.track(m.Manifold.union(pieces));
}

// The underside (the face that prints on the bed). A recess here has a ceiling, and a ceiling is
// an overhang: the spec's rule 6 ("Openings face up") allows no downward face steeper than 45° from
// vertical above the bed. So each stroke is cut as a V-shaped groove (a hull of its footprint on the bed and a ridge
// above it, its four sides rising UNDERSIDE_SLOPE mm per mm in) that closes in a ridge and has no
// flat roof. A V this deep is narrower than the font's cell, so the letters are drawn as lines,
// `line` wide at the bed, down the middle of each stroke's cell, and the cells' gaps stay solid.

/** The deepest V cut into the underside, mm: three layers of 0.2 mm, one more than the wall's. */
export const UNDERSIDE_DEPTH_MAX_MM = 0.6;
/**
 * A groove's sides rise this many mm per mm in from the edge: 1.1 is 48° from the horizontal,
 * steeper than 45° with room to spare for the mesh's rounding (the wall roofs use 1.25).
 */
export const UNDERSIDE_SLOPE = 1.1;
/** Solid kept between two neighbouring grooves at the bed, mm (a stroke's gap, less its line). */
const UNDERSIDE_BRIDGE_MM = 0.3;
/** Each run of strokes reaches this far past its ends, so runs that meet cross (see undersidePieces). */
const UNDERSIDE_JOIN_MM = 0.1;

export interface UndersidePlan {
  /** The text engraved, as given. */
  text: string;
  /** Cell width and height (a stroke and the gap), mm: the font's unit. */
  stroke: number;
  /** Width of a groove at the bed, mm. */
  line: number;
  /** Height of a groove's ridge above the bed, mm: `line * UNDERSIDE_SLOPE / 2`. */
  depth: number;
  /** The centre of the text on the bed face, in the part's frame, mm. */
  cx: number;
  cy: number;
  /**
   * The axis the text runs along. The text is mirrored, as seen from above through the part, so
   * that it reads upright from below once the part is turned over about its Y axis: along "x" it
   * reads toward −x with its top toward +y; along "y" (a part longer than it is wide), turned a
   * quarter more, it reads toward +y with its top toward +x.
   */
  along: "x" | "y";
}

const overlaps = (a: Rect, b: Rect, margin: number): boolean =>
  a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.y0 < b.y1 + margin && a.y1 > b.y0 - margin;

/** The footprints on the bed that leave through the bottom: the floor notches of finger cuts. */
function throughFloor(plan: TrayPlan): Rect[] {
  return plan.compartments.flatMap((c) =>
    c.cuts.flatMap((cut) => (cut.notch > 0 ? [cut, notchFloorBox(cut)] : [])),
  );
}

/** The floor's thickness under `box`: the lowest floor or divider slot floor beside it. */
function floorUnder(plan: TrayPlan, box: Rect): number {
  let t = plan.h; // a solid part, or text not over a well: the whole height
  for (const c of plan.compartments) {
    if (!overlaps(c.rect, box, EDGE_MM / 3)) {
      continue;
    }
    t = Math.min(t, c.floorZ);
    for (const s of c.slots) {
      if (overlaps(s, box, EDGE_MM / 3)) {
        t = Math.min(t, s.bottomZ);
      }
    }
  }
  return t;
}

/**
 * Where the name goes on the underside, or null when it has no room: centred on the bed face,
 * along its longer side when the strokes come out at least as large there, kept EDGE_MM clear of
 * the bed face's edge (the foot chamfer, or the groove's reach on an upper tray, and the corner
 * arcs) and of every floor notch, at least ENGRAVE_STROKE_MIN_MM a stroke, over a floor that keeps
 * ENGRAVE_KEEP_MM above the ridge (the thinnest floor under it) and a ridge at least
 * ENGRAVE_MIN_DEPTH_MM high. A name that does not fit, or hits a notch, is left off the underside
 * only; the walls are planned on their own.
 */
export function planUnderside(plan: TrayPlan, text: string): UndersidePlan | null {
  if (text === "" || !isEngravable(text)) {
    return null;
  }
  // The bed face is the footprint pulled in by the chamfer or the groove's reach.
  const reach = plan.groove ? plan.groove.reach : plan.chamfer;
  const arc = Math.max(plan.cornerRadius - reach, 0);
  const margin = Math.max(
    reach + EDGE_MM,
    plan.cornerRadius - (arc - EDGE_MM) / Math.SQRT2, // the text box's corner lies inside the arc
  );
  const free = { x: plan.w - 2 * margin, y: plan.d - 2 * margin };
  if (!(free.x > 0 && free.y > 0)) {
    return null;
  }
  const cx = plan.w / 2;
  const cy = plan.d / 2;
  const cells = textWidth(text);
  const through = throughFloor(plan);
  let best: UndersidePlan | null = null;
  for (const along of plan.w >= plan.d ? (["x", "y"] as const) : (["y", "x"] as const)) {
    const [room, across] = along === "x" ? [free.x, free.y] : [free.y, free.x];
    const stroke = Math.min(ENGRAVE_STROKE_MAX_MM, room / cells, across / GLYPH_ROWS);
    if (stroke < ENGRAVE_STROKE_MIN_MM || (best !== null && stroke <= best.stroke)) {
      continue;
    }
    const [hx, hy] =
      along === "x"
        ? [(stroke * cells) / 2, (stroke * GLYPH_ROWS) / 2]
        : [(stroke * GLYPH_ROWS) / 2, (stroke * cells) / 2];
    const box = { x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy };
    if (through.some((r) => overlaps(r, box, EDGE_MM))) {
      continue;
    }
    const keep = Math.min(UNDERSIDE_DEPTH_MAX_MM, floorUnder(plan, box) - ENGRAVE_KEEP_MM);
    const line = Math.min((2 * keep) / UNDERSIDE_SLOPE, stroke - UNDERSIDE_BRIDGE_MM);
    const depth = (line * UNDERSIDE_SLOPE) / 2;
    if (depth < ENGRAVE_MIN_DEPTH_MM - 1e-9) {
      continue;
    }
    best = { text, stroke, line, depth, cx, cy, along };
  }
  return best;
}

/**
 * The convex pieces of an underside engraving, as the points they are the hull of, in the part's
 * own frame: one per stroke, its footprint at the bed (and OVERSHOOT below it) closing in a ridge
 * `depth` above, so every face of it slopes up at UNDERSIDE_SLOPE and none faces down.
 */
export function undersidePieces(plan: UndersidePlan): Vec3[][] {
  const { text, stroke: u, line: g, depth, cx, cy, along } = plan;
  const width = u * textWidth(text);
  const height = u * GLYPH_ROWS;
  // (a, v) = along the line of text from its left, up from its lower edge, as read from below.
  const toXY = (a: number, v: number): [number, number] => {
    const da = a - width / 2;
    const dv = v - height / 2;
    return along === "x" ? [cx - da, cy + dv] : [cx + dv, cy + da];
  };
  const inset = (u - g) / 2;
  const k = g / 2;
  return textRects(text).map((r) => {
    // A run ends in the middle of the cell where it meets another, so its end is at the other's
    // ridge, with the same slopes: coincident faces the kernel cannot merge cleanly. Each run
    // reaches UNDERSIDE_JOIN_MM past its ends so that two cross instead of touching.
    const long = r.x1 - r.x0 > r.z1 - r.z0 ? "a" : r.z1 - r.z0 > r.x1 - r.x0 ? "v" : null;
    const ea = long === "a" ? UNDERSIDE_JOIN_MM : 0;
    const ev = long === "v" ? UNDERSIDE_JOIN_MM : 0;
    const a0 = r.x0 * u + inset - ea;
    const a1 = r.x1 * u - inset + ea;
    const v0 = r.z0 * u + inset - ev;
    const v1 = r.z1 * u - inset + ev;
    // The ridge: the footprint pulled in by k all round, or a line (a point) where that is a
    // width or less; put exactly on the middle, so no float noise inverts it.
    const span = (lo: number, hi: number): [number, number] =>
      hi - lo - 2 * k < 1e-6 ? [(lo + hi) / 2, (lo + hi) / 2] : [lo + k, hi - k];
    const [ra0, ra1] = span(a0, a1);
    const [rv0, rv1] = span(v0, v1);
    const corners: [number, number, number][] = [];
    for (const [a, v] of [
      [a0, v0],
      [a1, v0],
      [a1, v1],
      [a0, v1],
    ] as const) {
      corners.push([a, v, -OVERSHOOT], [a, v, 0]);
    }
    for (const [a, v] of [
      [ra0, rv0],
      [ra1, rv0],
      [ra1, rv1],
      [ra0, rv1],
    ] as const) {
      corners.push([a, v, depth]);
    }
    const seen = new Set<string>();
    const points: Vec3[] = [];
    for (const [a, v, z] of corners) {
      const [x, y] = toXY(a, v);
      const key = [x, y, z].map((n) => n.toFixed(6)).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        points.push([x, y, z]);
      }
    }
    return points;
  });
}

/** Every face of a single part that carries its name. */
export interface Engravings {
  /** Up to two opposite outer walls. */
  walls: EngravePlan[];
  underside: UndersidePlan | null;
}

/** Where the name goes on a part (not a merged one): the walls and the underside that have room. */
export function planEngravings(plan: TrayPlan, text: string): Engravings {
  return { walls: planWallEngravings(plan, text), underside: planUnderside(plan, text) };
}

/** Whether any face carries the name. */
export function hasEngraving(e: Engravings): boolean {
  return e.walls.length > 0 || e.underside !== null;
}

/** The cutters of every engraving (walls and underside), as one solid, or null when there is none. */
export function buildEngravings(
  m: ManifoldToplevel,
  scope: Scope,
  e: Engravings,
  part: { w: number; d: number; h: number },
): Manifold | null {
  const pieces = [
    ...e.walls.flatMap((w) => engravingPieces(w, part)),
    ...(e.underside ? undersidePieces(e.underside) : []),
  ].map((points) => hullPoints(m, scope, points));
  return pieces.length === 0 ? null : scope.track(m.Manifold.union(pieces));
}
