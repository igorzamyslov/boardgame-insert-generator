import type { Manifold, ManifoldToplevel, Vec3 } from "manifold-3d";
import { MIN_FEATURE_MM } from "../model/settings";
import type { MergedPart, Side } from "../model/types";
import { GLYPH_ROWS, isEngravable, textRects, textWidth } from "./glyphs";
import { FINGER_FILLET_MM } from "./plan-types";
import type { TrayPlan } from "./plan-types";
import type { Scope } from "./scope";
import { hullPoints } from "./shapes";

// Part names (spec §6.1 "Part names"): the short name of the part (trayNames), engraved into one of
// its outer walls as shallow recessed capitals (glyphs.ts). A recess on a
// vertical wall adds no support, cannot catch or change how parts mate, and leaves the outer size
// as it is. Its roof (the top of a stroke) slopes down into the wall at more than 45°, so no face
// of it overhangs.

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
/** The tighter band tried when the usual one leaves no room (a low part): never the underside. */
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

function engraveIn(
  plan: TrayPlan,
  text: string,
  faces: readonly Side[],
  flipped: boolean,
  belowChamfer: number,
  belowRim: number,
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
    const depth = Math.min(ENGRAVE_DEPTH_MM, thicknessBehind(plan, face, hi) - ENGRAVE_KEEP_MM);
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
 * over, so front and back change places), on the member where the strokes come out largest.
 * `plans` are the members' plans, in the order of `merged.members`. Null when no member has room.
 */
export function planMergedEngraving(
  spec: { x: number; y: number; w: number; d: number },
  merged: MergedPart,
  plans: readonly (TrayPlan | undefined)[],
  text: string,
): { engraving: EngravePlan; member: number } | null {
  const flipped = merged.flipped === true;
  let best: { engraving: EngravePlan; member: number } | null = null;
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
    const found = plan === undefined ? null : planEngraving(plan, text, faces, flipped);
    if (found !== null && (best === null || found.stroke > best.engraving.stroke)) {
      best = { engraving: found, member: i };
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
