// src/geometry/engrave.ts
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { MIN_FEATURE_MM } from "../model/settings";
import type { MergedPart, Side } from "../model/types";
import { CAP_GOOD_MM, CAP_MAX_MM, CAP_SIZES_MM, isEngravable, layoutText } from "./glyphs";
import type { Point, TextLayout } from "./glyphs";
import { notchFloorBox } from "./plan-cuts";
import { FINGER_FILLET_MM } from "./plan-types";
import type { CompartmentPlan, Rect, TrayPlan } from "./plan-types";
import type { Scope } from "./scope";

// Part names (spec §6.1 "Part names"): the short name of the part (trayNames), engraved as shallow
// recessed capitals (glyphs.ts: Overpass Bold outlines) on up to four faces: two opposite outer
// walls, the underside and the floor of a well (see `planInside`). A name is set at the largest of
// CAP_SIZES_MM (8, 6, 5 or 4 mm tall) that the room on a face allows.
// A recess on a vertical wall adds no support, cannot catch or change how parts mate, and leaves
// the outer size as it is. Its roof (the top of a stroke) slopes down into the wall at more than
// 45°, so no face of it overhangs. The underside and the floor are recesses with straight sides: the
// floor's faces up, and the underside's has a flat ceiling a stroke wide at most, which a printer
// bridges (see `planUnderside`).

/** Depth of the engraving into the wall: one nozzle line, a quarter of a default 1.6 mm wall. */
export const ENGRAVE_DEPTH_MM = 0.4;
/** Material kept behind the engraving's floor: the thinnest feature, so the wall stays whole. */
export const ENGRAVE_KEEP_MM = MIN_FEATURE_MM + 0.01;
/** The shallowest engraving worth cutting; a wall too thin to take it is left plain. */
export const ENGRAVE_MIN_DEPTH_MM = 0.3;
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
/** Float slack when a thickness is compared with the thinnest feature. */
const SLACK = 1e-6;

/** Faces in the order they are tried. */
export const ENGRAVE_FACES: readonly Side[] = ["front", "back", "left", "right"];

export interface EngravePlan {
  face: Side;
  /** The text engraved, as given (the font draws capitals). */
  text: string;
  /** Capital height, mm: one of CAP_SIZES_MM. */
  cap: number;
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
  // A socket leaves only its wall at the top, from its depth under the rim.
  let t = plan.socket && top > plan.h - plan.socket.depth ? plan.socket.wall : Infinity;
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
// between the corners' arcs, less every cut through the face and its fillets, and every top
// chamfer along it (a chamfer takes the top `size` of the face, so one that starts above the text,
// `textTop`, is no obstacle).
function freeSpans(plan: TrayPlan, face: Side, textTop: number): Span[] {
  const length = face === "front" || face === "back" ? plan.w : plan.d;
  const edge = plan.cornerRadius + EDGE_MM;
  let spans: Span[] = [{ lo: edge, hi: length - edge }];
  const without = (lo: number, hi: number): void => {
    spans = spans.flatMap((s) =>
      [
        { lo: s.lo, hi: Math.min(s.hi, lo) },
        { lo: Math.max(s.lo, hi), hi: s.hi },
      ].filter((p) => p.hi > p.lo),
    );
  };
  for (const c of plan.compartments) {
    for (const cut of c.cuts) {
      if (cut.side !== face || cut.into !== null) {
        continue;
      }
      const a = alongOf(face, plan, cut.x0, cut.y0);
      const b = alongOf(face, plan, cut.x1, cut.y1);
      without(
        Math.min(a, b) - FINGER_FILLET_MM - EDGE_MM,
        Math.max(a, b) + FINGER_FILLET_MM + EDGE_MM,
      );
    }
  }
  for (const chamfer of plan.chamfers) {
    if (chamfer.side !== face || textTop + EDGE_MM <= plan.h - chamfer.size) {
      continue;
    }
    const a = alongOf(face, plan, chamfer.a, chamfer.a);
    const b = alongOf(face, plan, chamfer.b, chamfer.b);
    without(Math.min(a, b) - EDGE_MM, Math.max(a, b) + EDGE_MM);
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

/**
 * The largest size of CAP_SIZES_MM at which `text` fits a room `width` by `height`, mm, or null
 * when even the smallest does not. The sizes are tried largest first: a name is as large as the
 * room allows. (Naming fixes the short name before the geometry sees the room, so there is no
 * shorter name to trade for a larger size here; a name that fits at no size is left off.)
 */
export function fitCap(
  text: string,
  width: number,
  height: number,
): { cap: number; layout: TextLayout } | null {
  for (const cap of CAP_SIZES_MM) {
    const layout = layoutText(text, cap);
    if (layout !== null && layout.width <= width + SLACK && layout.height <= height + SLACK) {
      return { cap, layout };
    }
  }
  return null;
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
  const tallest = layoutText(text, CAP_MAX_MM);
  if (tallest === null) {
    return null;
  }
  // The band of the part's height the text sits in, in the printed frame. It starts above the
  // chamfer, or above the groove (roof included), which leaves the outer face standing only from
  // `zTop`; the tighter band keeps its margin above that too, so a name never touches the groove.
  // A stepped part's outer face stands whole from the step's top, the wall's size above the seam.
  const lo =
    (plan.groove ? plan.groove.zTop : plan.step ? plan.step.wall : plan.chamfer) + belowChamfer;
  const hi = plan.h - belowRim;
  const band = flipped ? { lo: plan.h - hi, hi: plan.h - lo } : { lo, hi };
  const bandHeight = band.hi - band.lo;
  // The most the text can reach up: centred in the band, at its tallest.
  const textTop = (band.lo + band.hi) / 2 + Math.min(bandHeight, tallest.height) / 2;
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
    const span = freeSpans(plan, face, textTop).reduce<Span | null>(
      (a, s) => (a === null || s.hi - s.lo > a.hi - a.lo ? s : a),
      null,
    );
    if (span === null) {
      continue;
    }
    const fit = fitCap(text, span.hi - span.lo, bandHeight);
    if (fit === null || (best !== null && fit.cap <= best.cap)) {
      continue;
    }
    best = {
      face,
      text,
      cap: fit.cap,
      depth,
      from: (span.lo + span.hi) / 2 - fit.layout.width / 2,
      z: (band.lo + band.hi) / 2 - fit.layout.height / 2,
      flipped,
    };
    if (fit.cap >= CAP_GOOD_MM) {
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
    if (first !== undefined && (best === null || first.cap > (best.engravings[0]?.cap ?? 0))) {
      best = { engravings: found, member: i };
    }
  });
  return best;
}

/**
 * The name on the floor of a well of one member of a merged part (a riser with a pocket): the
 * member whose strokes come out largest, or null when none has room. A flipped part carries none.
 */
export function planMergedInside(
  merged: MergedPart,
  plans: readonly (TrayPlan | undefined)[],
  text: string,
): { inside: InsidePlan; member: number } | null {
  const flipped = merged.flipped === true;
  let best: { inside: InsidePlan; member: number } | null = null;
  plans.forEach((plan, member) => {
    const inside = plan === undefined ? null : planInside(plan, text, flipped);
    if (inside !== null && (best === null || inside.cap > best.inside.cap)) {
      best = { inside, member };
    }
  });
  return best;
}

// The text's outlines as a CrossSection, each point mapped from the layout's own frame (a along the
// line, v up, from the ink's lower left) to the plane the cutter stands in. The fill rule is
// non-zero, so a letter's counter (the hole of an O) is left standing, and a mirror (which turns
// every contour round) changes nothing.
function shape(
  m: ManifoldToplevel,
  scope: Scope,
  layout: TextLayout,
  at: (a: number, v: number) => Point,
): CrossSection {
  const polygons = layout.polygons.map((contour) => contour.map(([a, v]) => at(a, v)));
  return scope.track(new m.CrossSection(polygons, "NonZero"));
}

/** Where a face's own axes (along it, into the wall) point in the plan, and its origin. */
function frameOf(face: Side, w: number, d: number): { ex: Point; ez: Point; t: Point } {
  switch (face) {
    case "front":
      return { ex: [1, 0], ez: [0, 1], t: [0, 0] };
    case "back":
      return { ex: [-1, 0], ez: [0, -1], t: [w, d] };
    case "left":
      return { ex: [0, -1], ez: [1, 0], t: [0, d] };
    case "right":
      return { ex: [0, 1], ez: [-1, 0], t: [w, 0] };
  }
}

/**
 * The cutter of a wall engraving, in the part's own frame: the text's outline from OVERSHOOT
 * outside the face to `depth` in, lowered `ROOF_SLOPE` times the depth it has reached, so the roof
 * of every stroke slopes down into the wall at more than 45° from the vertical and nothing
 * overhangs; its sides stay upright.
 */
export function buildEngraving(
  m: ManifoldToplevel,
  scope: Scope,
  plan: EngravePlan,
  part: { w: number; d: number; h: number },
): Manifold {
  const layout = layoutText(plan.text, plan.cap) as TextLayout;
  // local frame: x along the face, y up, z into the wall
  const flat = shape(m, scope, layout, (a, v) => [plan.from + a, plan.z + v]);
  // The recess is the text's outline carried in and down: at depth t it is the outline lowered by
  // ROOF_SLOPE * t (a shear of the prism). Every roof is then one slope, down into the wall at more
  // than 45° from the vertical, and so is every floor; the sides stay upright, so nothing
  // overhangs. (Cutting only the roofs by an intersection leaves a flat sliver under every island
  // of a letter that has a slanted edge.) Outside the face the outline goes straight out.
  const prism = scope.track(flat.extrude(plan.depth));
  const carried = scope.track(
    prism.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, -ROOF_SLOPE, 1, 0, 0, 0, 0, 1]),
  );
  const outside = scope.track(scope.track(flat.extrude(OVERSHOOT)).translate([0, 0, -OVERSHOOT]));
  const solid = scope.track(m.Manifold.union([outside, carried]));
  // The matrix's columns: where the local x (along), y (up) and z (into) go in the plan, then the
  // offset; a flipped part is turned half a turn about X to print, so y and z turn about it.
  const { w, d, h } = part;
  const { ex, ez, t } = frameOf(plan.face, w, d);
  const f = plan.flipped ? -1 : 1;
  const matrix = [
    ...[ex[0], f * ex[1], 0, 0],
    ...[0, 0, f, 0],
    ...[ez[0], f * ez[1], 0, 0],
    ...[t[0], plan.flipped ? d - t[1] : t[1], plan.flipped ? h : 0, 1],
  ];
  return scope.track(solid.transform(matrix as Parameters<Manifold["transform"]>[0]));
}

/** Where a text goes in a room: one of the sizes, centred, along x or along y. */
interface Placement {
  text: string;
  cap: number;
  layout: TextLayout;
  /** The centre of the text and its bounding box, in the part's frame. */
  cx: number;
  cy: number;
  along: "x" | "y";
  box: Rect;
}

/**
 * The best place for `text` in `free`, clear of `blocked`: the largest size, then the largest room
 * (the whole of `free` when nothing is in the way, which centres the name), then along the
 * longer side. The rooms tried are the rectangles between the lines that `free` and `blocked` make.
 * `accepts` says whether the floor under a box takes a recess: its depth, or 0 for no. Null when
 * no room holds the text at any size.
 */
function placeText(
  text: string,
  free: Rect,
  blocked: readonly Rect[],
  accepts: (box: Rect) => number,
): (Placement & { depth: number; area: number }) | null {
  const near = blocked.filter((o) => overlaps(o, free, 0));
  const xs = [free.x0, free.x1, ...near.flatMap((o) => [o.x0, o.x1])]
    .filter((v) => v >= free.x0 && v <= free.x1)
    .sort((a, b) => a - b);
  const ys = [free.y0, free.y1, ...near.flatMap((o) => [o.y0, o.y1])]
    .filter((v) => v >= free.y0 && v <= free.y1)
    .sort((a, b) => a - b);
  let best: (Placement & { depth: number; area: number }) | null = null;
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = i + 1; j < xs.length; j += 1) {
      for (let k = 0; k < ys.length; k += 1) {
        for (let l = k + 1; l < ys.length; l += 1) {
          const room = {
            x0: xs[i] as number,
            x1: xs[j] as number,
            y0: ys[k] as number,
            y1: ys[l] as number,
          };
          const w = room.x1 - room.x0;
          const d = room.y1 - room.y0;
          if (near.some((o) => overlaps(o, room, 0))) {
            continue;
          }
          for (const along of w >= d ? (["x", "y"] as const) : (["y", "x"] as const)) {
            const fit = along === "x" ? fitCap(text, w, d) : fitCap(text, d, w);
            if (fit === null) {
              continue;
            }
            const [hx, hy] =
              along === "x"
                ? [fit.layout.width / 2, fit.layout.height / 2]
                : [fit.layout.height / 2, fit.layout.width / 2];
            const cx = (room.x0 + room.x1) / 2;
            const cy = (room.y0 + room.y1) / 2;
            const box = { x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy };
            const area = w * d;
            const better =
              best === null ||
              fit.cap > best.cap ||
              (fit.cap === best.cap && area > best.area + 1e-9);
            if (!better) {
              continue;
            }
            const depth = accepts(box);
            if (depth > 0) {
              best = { text, cap: fit.cap, layout: fit.layout, cx, cy, along, box, depth, area };
            }
          }
        }
      }
    }
  }
  return best;
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
  // Measured from the bed face: under a stepped part, the slab's bed face.
  const slab = plan.step?.height ?? 0;
  return slab + floorAbove(plan, box);
}

function floorAbove(plan: TrayPlan, box: Rect): number {
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

// The underside (the face that prints on the bed). The recess is cut straight up from the bed, 0.4
// mm (two layers) deep, with upright sides and a flat ceiling. The ceiling is the only overhang
// and it spans a stroke at most, which a printer bridges at these sizes (the owner printed it,
// 2026-10-24); it replaces the V-shaped groove of 0.8.1, which closed to a ridge after about a
// layer and a half and squashed shut under the first layer's squish. The name is mirrored, so it
// reads upright from below once the part is turned over.

/** The depth of the recess in the underside, mm: two layers. */
export const UNDERSIDE_DEPTH_MM = 0.4;

export interface UndersidePlan {
  /** The text engraved, as given. */
  text: string;
  /** Capital height, mm: one of CAP_SIZES_MM. */
  cap: number;
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
  /** The text's bounding box, in the part's frame. */
  box: Rect;
}

/**
 * Where the name goes on the underside, or null when it has no room: on the bed face, which is the
 * footprint pulled in EDGE_MM from the foot chamfer (or the groove's reach on an upper tray, or the
 * slab's on a stepped part) and from the corner arcs, centred when nothing is in the way, along its
 * longer side, and clear of every floor notch by EDGE_MM. It is two layers deep over a floor that
 * keeps the thinnest feature above it (1.2 mm and more), and where the name on the floor of a well
 * lies over it, over a floor that keeps it above both (the inside name wins: this one moves aside
 * to where it is clear, or is left off). A name that does not fit is left off the underside only;
 * the walls are planned on their own.
 */
export function planUnderside(
  plan: TrayPlan,
  text: string,
  inside: InsidePlan | null = null,
): UndersidePlan | null {
  if (text === "" || !isEngravable(text)) {
    return null;
  }
  // The bed face is the footprint pulled in by the chamfer or the groove's reach, or the slab's
  // (sharp-cornered at its foot, model/lip.ts stepOf).
  const reach = plan.groove ? plan.groove.reach : plan.step ? plan.step.reach : plan.chamfer;
  const arc = Math.max(plan.cornerRadius - reach, 0);
  const margin = plan.step
    ? reach + EDGE_MM
    : Math.max(
        reach + EDGE_MM,
        plan.cornerRadius - (arc - EDGE_MM) / Math.SQRT2, // the text box's corner lies inside the arc
      );
  const free = { x0: margin, y0: margin, x1: plan.w - margin, y1: plan.d - margin };
  if (!(free.x1 > free.x0 && free.y1 > free.y0)) {
    return null;
  }
  const blocked: Rect[] = throughFloor(plan).map((r) => ({
    x0: r.x0 - EDGE_MM,
    y0: r.y0 - EDGE_MM,
    x1: r.x1 + EDGE_MM,
    y1: r.y1 + EDGE_MM,
  }));
  // The floor over the inside name keeps its own thinnest feature: where it could not also hold
  // this recess, the inside name has the place.
  if (
    inside !== null &&
    floorUnder(plan, inside.box) - inside.depth < UNDERSIDE_DEPTH_MM + MIN_FEATURE_MM - SLACK
  ) {
    blocked.push(inside.box);
  }
  const found = placeText(text, free, blocked, (box) =>
    floorUnder(plan, box) >= UNDERSIDE_DEPTH_MM + MIN_FEATURE_MM - SLACK ? UNDERSIDE_DEPTH_MM : 0,
  );
  return found === null
    ? null
    : {
        text,
        cap: found.cap,
        depth: found.depth,
        cx: found.cx,
        cy: found.cy,
        along: found.along,
        box: found.box,
      };
}

/**
 * The cutter of an underside engraving, in the part's own frame: the outline straight up from
 * OVERSHOOT under the bed to `depth` over it (`bed` is the bed face's height in that frame).
 */
export function buildUnderside(
  m: ManifoldToplevel,
  scope: Scope,
  plan: UndersidePlan,
  bed: number,
): Manifold {
  const layout = layoutText(plan.text, plan.cap) as TextLayout;
  const { cx, cy, along } = plan;
  const flat = shape(m, scope, layout, (a, v) => {
    const da = a - layout.width / 2;
    const dv = v - layout.height / 2;
    return along === "x" ? [cx - da, cy + dv] : [cx + dv, cy + da];
  });
  const solid = scope.track(flat.extrude(plan.depth + OVERSHOOT));
  return scope.track(solid.translate([0, 0, bed - OVERSHOOT]));
}

// The floor of a well (the name for someone who has emptied the trays and looks down into the box:
// "which tray is this?"). The recess is cut straight down from the floor, with vertical sides: an
// up-facing recess has no ceiling, so nothing overhangs. The text is upright as seen from above
// with the part's front toward the viewer, and runs along the longer side of the free flat floor.
// It lies on the flat of one well: clear of the well's walls, of every scoop fillet and corner
// relief, of a divider's slot and of a floor notch, as the underside name is.

/** Depth of the inside name: two layers; three where the floor is thick enough, see below. */
export const INSIDE_DEPTH_MM = 0.4;
export const INSIDE_DEEP_MM = 0.6;
/** A floor at least this thick under the text takes INSIDE_DEEP_MM. */
export const INSIDE_DEEP_FLOOR_MM = 2;
/** Depths are whole layers (the app prints 0.2 mm layers); less than the shallowest is left off. */
const INSIDE_LAYER_MM = 0.2;
export const INSIDE_MIN_DEPTH_MM = INSIDE_DEPTH_MM;
/** The text keeps this far from the well's own walls. */
const INSIDE_WALL_MM = 1;

export interface InsidePlan {
  text: string;
  /** Capital height, mm: one of CAP_SIZES_MM. */
  cap: number;
  depth: number;
  /** The centre of the text, in the part's frame, mm. */
  cx: number;
  cy: number;
  /** The floor's top, in the part's frame (the compartment's `floorZ`). */
  floorZ: number;
  /**
   * The axis the text runs along. Along "x" it reads toward +x with its top toward +y (the back);
   * along "y" it reads toward +y with its top toward −x, a quarter turn.
   */
  along: "x" | "y";
  /** The text's bounding box, in the part's frame. */
  box: Rect;
}

/** The depth a floor `thickness` thick under the text takes; 0 when it takes none worth cutting. */
function insideDepth(thickness: number): number {
  if (thickness >= INSIDE_DEEP_FLOOR_MM - SLACK) {
    return INSIDE_DEEP_MM;
  }
  const spare = Math.min(INSIDE_DEPTH_MM, thickness - MIN_FEATURE_MM);
  const depth = Math.floor((spare + SLACK) / INSIDE_LAYER_MM) * INSIDE_LAYER_MM;
  return depth >= INSIDE_MIN_DEPTH_MM - SLACK ? depth : 0;
}

/** The floor of `c` that is flat and clear of the well's walls and scoop fillets. */
function flatFloor(c: CompartmentPlan): Rect {
  let { x0, y0, x1, y1 } = c.rect;
  x0 += INSIDE_WALL_MM;
  y0 += INSIDE_WALL_MM;
  x1 -= INSIDE_WALL_MM;
  y1 -= INSIDE_WALL_MM;
  for (const s of c.scoops) {
    switch (s.side) {
      case "front":
        y0 = Math.max(y0, c.rect.y0 + s.r + EDGE_MM / 3);
        break;
      case "back":
        y1 = Math.min(y1, c.rect.y1 - s.r - EDGE_MM / 3);
        break;
      case "left":
        x0 = Math.max(x0, c.rect.x0 + s.r + EDGE_MM / 3);
        break;
      case "right":
        x1 = Math.min(x1, c.rect.x1 - s.r - EDGE_MM / 3);
        break;
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Where the name goes on the floor of a well, or null when there is no room: no well has a flat
 * floor free of notches, slots, reliefs and fillets that holds the name at any of CAP_SIZES_MM,
 * over a floor that leaves the thinnest feature (a whole layer count) under a recess of at least
 * INSIDE_MIN_DEPTH_MM. The well where the name comes out largest wins (the larger floor, then the
 * first, on a tie). A part built upside down with wells is left plain, as its walls are.
 */
export function planInside(plan: TrayPlan, text: string, flipped = false): InsidePlan | null {
  if (text === "" || !isEngravable(text) || (flipped && plan.compartments.length > 0)) {
    return null;
  }
  // What the floor must keep clear of, wherever it lies: floor notches and slots.
  const obstacles: Rect[] = [
    ...throughFloor(plan),
    ...plan.compartments.flatMap((c) => c.slots),
  ].map((r) => ({
    x0: r.x0 - EDGE_MM,
    y0: r.y0 - EDGE_MM,
    x1: r.x1 + EDGE_MM,
    y1: r.y1 + EDGE_MM,
  }));
  let best: (Placement & { depth: number; area: number; floorZ: number }) | null = null;
  for (const c of plan.compartments) {
    // A socket takes away everything above its own depth under the rim: a floor up there is gone.
    if (plan.socket && c.floorZ > plan.h - plan.socket.depth) {
      continue;
    }
    const reliefs: Rect[] = c.reliefs.map((r) => ({
      x0: r.cx - r.r - EDGE_MM,
      y0: r.cy - r.r - EDGE_MM,
      x1: r.cx + r.r + EDGE_MM,
      y1: r.cy + r.r + EDGE_MM,
    }));
    const found = placeText(text, flatFloor(c), [...obstacles, ...reliefs], (box) =>
      insideDepth(floorUnder(plan, box)),
    );
    if (
      found !== null &&
      (best === null ||
        found.cap > best.cap ||
        (found.cap === best.cap && found.area > best.area + 1e-9))
    ) {
      best = { ...found, floorZ: c.floorZ };
    }
  }
  return best === null
    ? null
    : {
        text,
        cap: best.cap,
        depth: best.depth,
        cx: best.cx,
        cy: best.cy,
        floorZ: best.floorZ,
        along: best.along,
        box: best.box,
      };
}

/**
 * The cutter of an inside engraving, in the part's own frame: the outline straight down from
 * OVERSHOOT over the floor (the well is open there) to `depth` under it.
 */
export function buildInside(m: ManifoldToplevel, scope: Scope, plan: InsidePlan): Manifold {
  const layout = layoutText(plan.text, plan.cap) as TextLayout;
  const { cx, cy, along } = plan;
  const flat = shape(m, scope, layout, (a, v) => {
    const da = a - layout.width / 2;
    const dv = v - layout.height / 2;
    return along === "x" ? [cx + da, cy + dv] : [cx - dv, cy + da];
  });
  const solid = scope.track(flat.extrude(plan.depth + OVERSHOOT));
  return scope.track(solid.translate([0, 0, plan.floorZ - plan.depth]));
}

/** Every face of a single part that carries its name. */
export interface Engravings {
  /** Up to two opposite outer walls. */
  walls: EngravePlan[];
  underside: UndersidePlan | null;
  /** The floor of one well, as seen from above. */
  inside: InsidePlan | null;
}

/**
 * Where the name goes on a part (not a merged one): the walls, the floor of a well and the
 * underside that have room. The inside name is planned first, because the underside gives way to it.
 */
export function planEngravings(plan: TrayPlan, text: string): Engravings {
  const inside = planInside(plan, text);
  return {
    walls: planWallEngravings(plan, text),
    underside: planUnderside(plan, text, inside),
    inside,
  };
}

/** Whether any face carries the name. */
export function hasEngraving(e: Engravings): boolean {
  return e.walls.length > 0 || e.underside !== null || e.inside !== null;
}

/** The cutters of every engraving (walls, underside and inside), as one solid, or null when there is none. */
export function buildEngravings(
  m: ManifoldToplevel,
  scope: Scope,
  e: Engravings,
  part: { w: number; d: number; h: number },
  // the bed face's height in the part's frame: below 0 under a stepped part's slab
  bed = 0,
): Manifold | null {
  const pieces = [
    ...e.walls.map((w) => buildEngraving(m, scope, w, part)),
    ...(e.underside ? [buildUnderside(m, scope, e.underside, bed)] : []),
    ...(e.inside ? [buildInside(m, scope, e.inside)] : []),
  ];
  return pieces.length === 0 ? null : scope.track(m.Manifold.union(pieces));
}
