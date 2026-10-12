import type { FeatureSpec, Side, TraySpec } from "../model/types";
import { MIN_FEATURE_MM, POST_MM, SPEC_TOLERANCE as TOL } from "../model/settings";
import {
  OPPOSITE,
  alongX,
  axes,
  faceOf,
  keepsApart,
  nearestAcross,
  separation,
} from "../model/cut-rules";
import { FINGER_FILLET_MM, MIN_FILLET } from "./plan-types";
import type { CompartmentPlan, CutPlan, LipPlan, Rect } from "./plan-types";

// Wall cutouts (FeatureSpec "wallCutout", spec §6.1, roadmap §4.6): planned and checked once every
// compartment rectangle is known, because a cut runs from its compartment to the next one across.

export interface CutRequest {
  side: Side;
  at: number;
  width: number;
  depth: number;
  floorNotch: number;
}

interface Frame {
  w: number;
  d: number;
  h: number;
  chamfer: number;
  minCut: number; // the narrowest cut: MIN_CUT_MM, or fingerPocket.width if smaller
}

type Fail = (message: string) => never;

/** The centre of a cut along its side. */
export function cutCentre(cut: CutPlan): number {
  return alongX(cut.side) ? (cut.x0 + cut.x1) / 2 : (cut.y0 + cut.y1) / 2;
}

/** The face of its compartment a cut starts from. */
export function cutFace(cut: CutPlan): number {
  return { front: cut.y1, back: cut.y0, left: cut.x1, right: cut.x0 }[cut.side];
}

/**
 * The footprint of a cut's floor notch in its compartment's floor: the cut's full width, reaching
 * `notch` in from the face (its far corners rounded, so a reach of half the width is a half-disc).
 */
export function notchFloorBox(cut: CutPlan): Rect {
  const face = cutFace(cut);
  const n = cut.notch;
  switch (cut.side) {
    case "front":
      return { x0: cut.x0, x1: cut.x1, y0: face, y1: face + n };
    case "back":
      return { x0: cut.x0, x1: cut.x1, y0: face - n, y1: face };
    case "left":
      return { x0: face, x1: face + n, y0: cut.y0, y1: cut.y1 };
    case "right":
      return { x0: face - n, x1: face, y0: cut.y0, y1: cut.y1 };
  }
}

/**
 * A cut's footprint reaching `into` past the face of its compartment and of the one it runs into,
 * and `out` past the outer face it leaves through (buildTray cuts the U into the compartments past
 * their rounded inner corners, the floor notch only EPS).
 */
export function cutReach(cut: CutPlan, into: number, out: number): Rect {
  const far = cut.into === null ? out : into;
  switch (cut.side) {
    case "front":
      return { ...cut, y0: cut.y0 - far, y1: cut.y1 + into };
    case "back":
      return { ...cut, y0: cut.y0 - into, y1: cut.y1 + far };
    case "left":
      return { ...cut, x0: cut.x0 - far, x1: cut.x1 + into };
    case "right":
      return { ...cut, x0: cut.x0 - into, x1: cut.x1 + far };
  }
}

/** Every footprint the cuts of `plans` take: their boxes and floor notches. */
export function cutFootprints(plans: readonly CompartmentPlan[]): Rect[] {
  return plans.flatMap((plan) =>
    plan.cuts.flatMap((cut) => [cut, ...(cut.notch > 0 ? [notchFloorBox(cut)] : [])]),
  );
}

// One wall cutout:
// - it is centred on its own compartment (`at` within its range along the side) and its sides stay
//   out of the outer walls it runs along (the parallel walls and their lip stay whole);
// - its footprint runs from the compartment's face across to the facing face of the nearest
//   compartment whose range along the side contains its centre (nearestAcross, the rule sizing
//   places it by), or out through the outer face;
// - its depth is measured down from the rim and never below the compartment floor;
// - with a floor notch the cut goes on down through the bottom at its full width, and into the
//   compartment's floor `notch` from its face (far corners rounded with half the width, at most
//   `notch`): the cut lies within the compartment's range along the side and the notch within
//   its floor;
// - against the bottom chamfer it keeps MIN_FEATURE_MM like a compartment: where it leaves the
//   tray without a notch, its bottom stands MIN_FEATURE_MM above the chamfer; its sides keep that
//   from the faces they run along, at their lowest height (the round bottom 45° up, or the bed with
//   a notch), and so does the notch from the outer face behind the compartment.
export function planCut(
  q: CutRequest,
  index: number,
  plans: readonly CompartmentPlan[],
  frame: Frame,
  fail: Fail,
): CutPlan {
  const plan = plans[index];
  if (plan === undefined) {
    return fail("internal: wall cutout without a compartment");
  }
  const { rect, floorZ } = plan;
  const where = `compartment ${index}: the ${q.side} wall cutout at ${q.at} mm`;
  const own = axes(rect, q.side);
  if (q.at < own.u0 - TOL || q.at > own.u1 + TOL) {
    fail(`the ${q.side} wall cutout at ${q.at} mm is not centred on compartment ${index}`);
  }
  const r = q.width / 2;
  const a = q.at - r;
  const b = q.at + r;
  const span = alongX(q.side) ? frame.w : frame.d;
  if (q.width < frame.minCut - TOL) {
    fail(`${where} is narrower than ${frame.minCut} mm`);
  }
  const face = faceOf(rect, q.side);
  const across = nearestAcross(
    plans.map((p) => p.rect),
    index,
    q.side,
    q.at,
    TOL,
  );
  const next = plans[across];
  // A full-height post of POST_MM between each side and the faces of every compartment it passes.
  for (const passed of next === undefined ? [plan] : [plan, next]) {
    const p = axes(passed.rect, q.side);
    if (a < p.u0 + POST_MM - TOL || b > p.u1 - POST_MM + TOL) {
      fail(`${where} leaves less than a ${POST_MM} mm post in compartment ${passed.index}`);
    }
  }
  const outer = { front: 0, back: frame.d, left: 0, right: frame.w }[q.side];
  const end = next === undefined ? outer : faceOf(next.rect, OPPOSITE[q.side]);
  const [v0, v1] = face < end ? [face, end] : [end, face];
  const box = alongX(q.side) ? { x0: a, x1: b, y0: v0, y1: v1 } : { x0: v0, x1: v1, y0: a, y1: b };
  const bottomZ = frame.h - Math.min(q.depth, frame.h - floorZ);
  const n = q.floorNotch;
  if (n > own.v1 - own.v0 + TOL) {
    fail(`${where}: its ${n} mm floor notch leaves the compartment`);
  }
  const material = (distance: number, height: number): number => distance + height - frame.chamfer;
  const sideHeight = n > 0 ? 0 : bottomZ + (2 - Math.SQRT2) * r;
  const behind = {
    front: frame.d - (face + n),
    back: face - n,
    left: frame.w - (face + n),
    right: face - n,
  }[q.side];
  const thin =
    (next === undefined && n === 0 && material(0, bottomZ) < MIN_FEATURE_MM - TOL) ||
    material(Math.min(a, span - b), sideHeight) < MIN_FEATURE_MM - TOL ||
    (n > 0 && material(behind, 0) < MIN_FEATURE_MM - TOL);
  if (thin) {
    fail(
      `${where} leaves less than ${MIN_FEATURE_MM} mm of wall and floor against the ${frame.chamfer} mm bottom chamfer`,
    );
  }
  return {
    ...box,
    side: q.side,
    bottomZ,
    radius: r,
    into: next?.index ?? null,
    notch: n,
    topFillets: [0, 0],
  };
}

/** Two notches on opposite sides of one compartment keep MIN_FEATURE_MM of floor between them. */
export function checkNotches(plan: CompartmentPlan, fail: Fail): void {
  for (const cut of plan.cuts) {
    for (const other of plan.cuts) {
      if (other.side === OPPOSITE[cut.side] && cut.notch > 0 && other.notch > 0) {
        const across = alongX(cut.side) ? plan.rect.y1 - plan.rect.y0 : plan.rect.x1 - plan.rect.x0;
        if (cut.notch + other.notch > across - MIN_FEATURE_MM + TOL) {
          fail(
            `compartment ${plan.index}: its floor notches leave less than ${MIN_FEATURE_MM} mm of floor between them`,
          );
        }
      }
    }
  }
}

/** Two cuts share one band: the same axis, centre and width (they cut one channel). */
function sameBand(a: CutPlan, b: CutPlan): boolean {
  const near = (p: number, q: number): boolean => Math.abs(p - q) <= TOL;
  return (
    alongX(a.side) === alongX(b.side) &&
    near(cutCentre(a), cutCentre(b)) &&
    near(a.radius, b.radius)
  );
}

// Wall cutout clearance (roadmap §4.6). A cut's footprint keeps MIN_FEATURE_MM (along x or y) from
// every compartment but its own and the one it runs into. Two cuts
// either keep it too, or cut one channel: the same band (axis, centre and width) with overlapping
// footprints (the two sides of one divider), whose union is the deeper U. The cuts on opposite
// sides of one compartment have only its contents between them.
export function checkCutClearance(plans: readonly CompartmentPlan[], fail: Fail): void {
  const cuts = plans.flatMap((plan) => plan.cuts.map((cut) => ({ plan, cut })));
  for (const { plan, cut } of cuts) {
    const what = `the ${cut.side} cut of compartment ${plan.index} comes within ${MIN_FEATURE_MM} mm of`;
    for (const other of plans) {
      const exempt = other === plan || other.index === cut.into;
      if (!exempt && !keepsApart(cut, other.rect, TOL)) {
        fail(`${what} compartment ${other.index}`);
      }
    }
    for (const { plan: p2, cut: c2 } of cuts) {
      const across = p2 === plan && c2.side === OPPOSITE[cut.side];
      const channel = sameBand(cut, c2) && separation(cut, c2) < -TOL;
      if (c2 !== cut && !across && !channel && !keepsApart(cut, c2, TOL)) {
        fail(
          `the cuts of compartments ${plan.index} and ${p2.index} meet without sharing their centre and width`,
        );
      }
    }
  }
}

// A card spacer's notch (FeatureSpec "spacerNotch", spec §6.2): where a finger channel crosses the
// well a spacer stands in, the channel's U runs on through the spacer, so it stays open end to
// end. In the spacer's own frame: along `axis`, out through both end faces, centred on `at` across
// it, `width` wide, `depth` below the spacer's top, with a round bottom of radius width / 2. It is
// open at the top (the spacer prints standing), and like a wall cutout:
// - its centre lies on the spacer, and each of its sides either cuts past the spacer's face (then
//   the spacer is cut across, its top following the U) or keeps the chamfer plus MIN_FEATURE_MM of
//   spacer beside it; past both faces, the U meets the farther one no lower than the spacer's top
//   (it takes the whole top, and the spacer ends there);
// - its bottom stands at least the bottom chamfer plus MIN_FEATURE_MM above the bed, where it leaves
//   through the end faces.
// The outer corner radius then shrinks so it ends MIN_FEATURE_MM before its sides on the end faces.
export function planSpacerNotch(
  spec: TraySpec,
  features: readonly FeatureSpec[],
  chamfer: number,
  fail: Fail,
): CutPlan | null {
  if (features.length === 0) {
    return null;
  }
  const [f, ...rest] = features;
  if (spec.part !== "spacer" || f?.type !== "spacerNotch" || rest.length > 0) {
    return fail("only a spacer has a notch, and only one");
  }
  const { axis, at, width, depth } = f;
  if (
    (axis !== "x" && axis !== "y") ||
    !Number.isFinite(at) ||
    !(Number.isFinite(width) && width > 0) ||
    !(Number.isFinite(depth) && depth > 0)
  ) {
    return fail("invalid spacer notch");
  }
  const span = axis === "x" ? spec.d : spec.w;
  if (at < -TOL || at > span + TOL) {
    fail(`the spacer notch at ${at} mm is not centred on the spacer`);
  }
  const r = width / 2;
  const [a, b] = [at - r, at + r];
  // The spacer's corner arc (at least the chamfer) ends MIN_FEATURE_MM before a side on it.
  const keep = chamfer + MIN_FEATURE_MM;
  const sliver = (beside: number): boolean => beside > TOL && beside < keep - TOL;
  if (sliver(a) || sliver(span - b)) {
    fail(`it leaves less than ${keep.toFixed(2)} mm beside the spacer notch at ${at} mm`);
  }
  const bottomZ = spec.h - Math.min(depth, spec.h);
  if (bottomZ - chamfer < MIN_FEATURE_MM - TOL) {
    fail(
      `the spacer notch leaves less than ${MIN_FEATURE_MM} mm against the ${chamfer} mm bottom chamfer`,
    );
  }
  // Past both faces the U takes the whole top: the spacer must end where it meets the farther face
  // (sizing lowers it so), or its mesh would come out lower than its height.
  const far = Math.max(at, span - at);
  if (
    a <= TOL &&
    b >= span - TOL &&
    bottomZ + r - Math.sqrt(Math.max(0, r * r - far * far)) < spec.h - TOL
  ) {
    fail(`the spacer notch at ${at} mm takes the spacer's whole top below its ${spec.h} mm height`);
  }
  const length = axis === "x" ? spec.w : spec.d;
  const box =
    axis === "x" ? { x0: 0, x1: length, y0: a, y1: b } : { x0: a, x1: b, y0: 0, y1: length };
  // The U's profile runs across the end faces it leaves through: "left" along x, "front" along y.
  return {
    ...box,
    side: axis === "x" ? "left" : "front",
    bottomZ,
    radius: r,
    into: null,
    notch: 0,
    topFillets: [0, 0],
  };
}

/**
 * Where a spacer notch's sides meet its end faces, for the outer corner radius: only the sides
 * that lie on the spacer (a side past its face takes the corner away with the rest of its top).
 */
export function notchEdges(
  size: { w: number; d: number },
  notch: CutPlan | null,
): { x: number; y: number }[] {
  if (notch === null) {
    return [];
  }
  const along = alongX(notch.side);
  const { u0, u1 } = axes(notch, notch.side);
  const span = along ? size.w : size.d;
  const length = along ? size.d : size.w;
  return [u0, u1]
    .filter((u) => u > TOL && u < span - TOL)
    .flatMap((u) => [0, length].map((face) => (along ? { x: u, y: face } : { x: face, y: u })));
}

/** Where a cut's top fillets round it: the height of the top they meet and the strip across. */
export function filletStrip(
  cut: CutPlan,
  frame: { w: number; d: number; h: number },
  lip: LipPlan | null,
): { top: number; v0: number; v1: number } {
  const { v0, v1 } = axes(cut, cut.side);
  if (cut.into !== null || lip === null) {
    return { top: frame.h, v0, v1 };
  }
  // Through a lipped wall only the lip ring is rounded, on its top: the ledge the upper tray rests
  // on stays square.
  const outer = { front: 0, back: frame.d, left: 0, right: frame.w }[cut.side];
  const far = cut.side === "back" || cut.side === "right";
  const top = frame.h + lip.height;
  return far
    ? { top, v0: outer - lip.thickness, v1: outer }
    : { top, v0: outer, v1: outer + lip.thickness };
}

/**
 * Where the cuts' top fillets may reach: beside each side of each cut, FINGER_FILLET_MM along it,
 * across its fillet strip (filletStrip). Corner reliefs keep MIN_FEATURE_MM from these, so a relief
 * at a post's corner leaves no feather against the fillet that rounds the post (review 3, M1). The
 * reliefs are planned before the fillets' radii (those wait for the outer corner radius, which
 * waits for the reliefs), so the spans take the largest radius.
 */
export function filletSpans(
  plans: readonly CompartmentPlan[],
  frame: { w: number; d: number; h: number },
  lip: LipPlan | null,
): Rect[] {
  return plans.flatMap((plan) =>
    plan.cuts.flatMap((cut) => {
      const { v0, v1 } = filletStrip(cut, frame, lip);
      const { u0, u1 } = axes(cut, cut.side);
      return [
        [u0 - FINGER_FILLET_MM, u0],
        [u1, u1 + FINGER_FILLET_MM],
      ].map(([a = 0, b = 0]) =>
        alongX(cut.side) ? { x0: a, x1: b, y0: v0, y1: v1 } : { x0: v0, x1: v1, y0: a, y1: b },
      );
    }),
  );
}

/**
 * The radii of a U's two top corners (spec §6.1): FINGER_FILLET_MM, less where that would leave
 * less than MIN_FEATURE_MM of top beside it, along the side up to the nearest void across the same
 * strip (`voids`, other compartments), or to the outer corner's arc of radius `radius` (from the
 * faces at 0 and `span`; 0 for a strip clear of the corners), or to those faces; and no longer than the
 * U's straight side (`side`, from the round bottom's top to the top). Under MIN_FILLET: 0. (It
 * stays on the faces of the compartments the strip runs between: their posts are POST_MM, at least
 * FINGER_FILLET_MM.)
 */
function topRadii(
  [a, b]: readonly [number, number],
  span: number,
  radius: number,
  side: number,
  voids: readonly { u0: number; u1: number }[],
): [number, number] {
  const fit = (room: number, toward: (v: { u0: number; u1: number }) => number): number => {
    let r = Math.min(FINGER_FILLET_MM, side, room - MIN_FEATURE_MM);
    for (const v of voids) {
      const gap = toward(v);
      if (gap > -TOL) {
        r = Math.min(r, gap - MIN_FEATURE_MM);
      }
    }
    return r >= MIN_FILLET - TOL ? r : 0;
  };
  return [
    fit(a - radius, (v) => (v.u1 <= a + TOL ? a - v.u1 : Number.NEGATIVE_INFINITY)),
    fit(span - radius - b, (v) => (v.u0 >= b - TOL ? v.u0 - b : Number.NEGATIVE_INFINITY)),
  ];
}

/**
 * Every cut's top fillets (topRadii): across its strip, at the rim (or, through a lipped wall, on
 * the lip ring's top), clear of every other compartment lying across the same strip, and of the
 * outer corners of radius `cornerRadius`.
 */
export function planTopFillets(
  plans: readonly CompartmentPlan[],
  frame: { w: number; d: number; h: number },
  cornerRadius: number,
  lip: LipPlan | null,
): CompartmentPlan[] {
  return plans.map((plan) => ({
    ...plan,
    cuts: plan.cuts.map((cut) => {
      const strip = filletStrip(cut, frame, lip);
      const across = (r: Rect): boolean => {
        const o = axes(r, cut.side);
        return o.v0 < strip.v1 - TOL && o.v1 > strip.v0 + TOL;
      };
      // Another compartment across the strip (another cut lies inside or beside its own
      // compartment, which comes first along the side).
      const voids = plans.flatMap((p) =>
        p === plan || p.index === cut.into || !across(p.rect) ? [] : [axes(p.rect, cut.side)],
      );
      const { u0, u1 } = axes(cut, cut.side);
      const span = alongX(cut.side) ? frame.w : frame.d;
      // The outer corners' arcs lie within cornerRadius of the faces across the strip too: a strip
      // through an interior divider is clear of them (review 3, M2).
      const depth = alongX(cut.side) ? frame.d : frame.w;
      const nearCorner = strip.v0 < cornerRadius - TOL || strip.v1 > depth - cornerRadius + TOL;
      // No longer than the U's straight side; above the floors of the compartments at the strip's
      // ends (its cutter reaches into them, past their rounded corners); through a lipped wall,
      // in the lip, above the ledge.
      const straight = cut.notch > 0 ? strip.top : strip.top - cut.bottomZ - cut.radius;
      const floors = plans.filter((p) => p === plan || p.index === cut.into).map((p) => p.floorZ);
      const side = Math.min(
        straight,
        strip.top - Math.max(...floors),
        lip !== null && cut.into === null ? lip.height : straight,
      );
      const radius = nearCorner ? cornerRadius : 0;
      return { ...cut, topFillets: topRadii([u0, u1], span, radius, side, voids) };
    }),
  }));
}

/** A spacer notch's top fillets: on the spacer's top, clear of its corners (topRadii). */
export function planNotchFillets(
  notch: CutPlan | null,
  size: { w: number; d: number; h: number },
  cornerRadius: number,
): CutPlan | null {
  if (notch === null) {
    return null;
  }
  const { u0, u1 } = axes(notch, notch.side);
  const span = alongX(notch.side) ? size.w : size.d;
  const side = size.h - notch.bottomZ - notch.radius;
  // A side past the spacer's face takes the top beside it away: nothing to round there.
  const [r0, r1] = topRadii([u0, u1], span, cornerRadius, side, []);
  return { ...notch, topFillets: [u0 > TOL ? r0 : 0, u1 < span - TOL ? r1 : 0] };
}
