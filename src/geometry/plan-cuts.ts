import type { Side } from "../model/types";
import { MIN_FEATURE_MM, SPEC_TOLERANCE as TOL } from "../model/settings";
import { keepsApart, separation } from "../model/slot-rules";
import type { CompartmentPlan, CutPlan, Rect } from "./plan-types";

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
  outerWall: number; // the (lipped) outer wall the cut's sides keep out of
  chamfer: number;
}

type Fail = (message: string) => never;

const OPPOSITE: Record<Side, Side> = { front: "back", back: "front", left: "right", right: "left" };

/** The cut runs across front and back walls along x; across left and right walls along y. */
function alongX(side: Side): boolean {
  return side === "front" || side === "back";
}

/** A rectangle's extent along the side (u) and across it (v). */
function axes(r: Rect, side: Side): { u0: number; u1: number; v0: number; v1: number } {
  return alongX(side)
    ? { u0: r.x0, u1: r.x1, v0: r.y0, v1: r.y1 }
    : { u0: r.y0, u1: r.y1, v0: r.x0, v1: r.x1 };
}

/** The compartment face a cut on `side` starts from, across the side. */
function faceOf(r: Rect, side: Side): number {
  return { front: r.y0, back: r.y1, left: r.x0, right: r.x1 }[side];
}

/** How far `other` lies beyond `face` on `side` (negative: not beyond it). */
function beyond(other: Rect, face: number, side: Side): number {
  return {
    front: face - other.y1,
    back: other.y0 - face,
    left: face - other.x1,
    right: other.x0 - face,
  }[side];
}

/** The centre of a cut along its side. */
export function cutCentre(cut: CutPlan): number {
  return alongX(cut.side) ? (cut.x0 + cut.x1) / 2 : (cut.y0 + cut.y1) / 2;
}

/** The face of its compartment a cut starts from. */
export function cutFace(cut: CutPlan): number {
  return { front: cut.y1, back: cut.y0, left: cut.x1, right: cut.x0 }[cut.side];
}

/** The part of a cut's footprint its floor notch takes through the bottom (the cut's middle). */
export function notchRect(cut: CutPlan): Rect {
  const at = cutCentre(cut);
  return alongX(cut.side)
    ? { ...cut, x0: at - cut.notch, x1: at + cut.notch }
    : { ...cut, y0: at - cut.notch, y1: at + cut.notch };
}

/** The bounding box of a cut's floor notch half-disc in its compartment's floor. */
export function notchDiscBox(cut: CutPlan): Rect {
  const at = cutCentre(cut);
  const face = cutFace(cut);
  const n = cut.notch;
  switch (cut.side) {
    case "front":
      return { x0: at - n, x1: at + n, y0: face, y1: face + n };
    case "back":
      return { x0: at - n, x1: at + n, y0: face - n, y1: face };
    case "left":
      return { x0: face, x1: face + n, y0: at - n, y1: at + n };
    case "right":
      return { x0: face - n, x1: face, y0: at - n, y1: at + n };
  }
}

/** Every footprint the cuts of `plans` take: their boxes, and the floor notch half-discs. */
export function cutFootprints(plans: readonly CompartmentPlan[]): Rect[] {
  return plans.flatMap((plan) =>
    plan.cuts.flatMap((cut) => (cut.notch > 0 ? [cut, notchDiscBox(cut)] : [cut])),
  );
}

// One wall cutout:
// - it is centred on its own compartment (`at` within its range along the side) and its sides stay
//   out of the outer walls it runs along (the parallel walls and their lip stay whole);
// - its footprint runs from the compartment's face across to the facing face of the nearest
//   compartment whose range along the side overlaps the cut, or out through the outer face;
// - its depth is measured down from the rim and never below the compartment floor;
// - a floor notch is no wider than the cut, lies within the compartment's range along the side and
//   within its floor;
// - against the bottom chamfer it keeps MIN_FEATURE_MM like a compartment: where it leaves the
//   tray, the lowest part of the outer face it leaves (the round bottom where the notch meets it)
//   stands MIN_FEATURE_MM above the chamfer; its sides keep that from the faces they run along,
//   at their lowest height (the round bottom 45° up, or the bed for a notch), and so does the notch
//   from the outer face behind the compartment.
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
  const wall = Number(frame.outerWall.toFixed(3));
  if (a < frame.outerWall - TOL || b > span - frame.outerWall + TOL) {
    fail(`${where} reaches into the ${wall} mm outer wall it runs along`);
  }
  const face = faceOf(rect, q.side);
  let next: CompartmentPlan | undefined;
  let gap = Number.POSITIVE_INFINITY;
  for (const other of plans) {
    const o = axes(other.rect, q.side);
    const distance = beyond(other.rect, face, q.side);
    if (other !== plan && o.u0 < b - TOL && o.u1 > a + TOL && distance > -TOL && distance < gap) {
      next = other;
      gap = distance;
    }
  }
  const outer = { front: 0, back: frame.d, left: 0, right: frame.w }[q.side];
  const end = next === undefined ? outer : faceOf(next.rect, OPPOSITE[q.side]);
  const [v0, v1] = face < end ? [face, end] : [end, face];
  const box = alongX(q.side) ? { x0: a, x1: b, y0: v0, y1: v1 } : { x0: v0, x1: v1, y0: a, y1: b };
  const bottomZ = frame.h - Math.min(q.depth, frame.h - floorZ);
  const n = q.floorNotch;
  if (n > 0) {
    const across = own.v1 - own.v0;
    if (n > r + TOL || q.at - n < own.u0 - TOL || q.at + n > own.u1 + TOL || n > across + TOL) {
      fail(`${where}: its ${n} mm floor notch is wider than the cut or leaves the compartment`);
    }
  }
  const material = (distance: number, height: number): number => distance + height - frame.chamfer;
  const low = n > 0 ? bottomZ + r - Math.sqrt(Math.max(0, r * r - n * n)) : bottomZ;
  const sideHeight = bottomZ + (2 - Math.SQRT2) * r;
  const behind = {
    front: frame.d - (face + n),
    back: face - n,
    left: frame.w - (face + n),
    right: face - n,
  }[q.side];
  const thin =
    (next === undefined && material(0, low) < MIN_FEATURE_MM - TOL) ||
    material(Math.min(a, span - b), sideHeight) < MIN_FEATURE_MM - TOL ||
    (n > 0 &&
      (material(Math.min(q.at - n, span - q.at - n), 0) < MIN_FEATURE_MM - TOL ||
        material(behind, 0) < MIN_FEATURE_MM - TOL));
  if (thin) {
    fail(
      `${where} leaves less than ${MIN_FEATURE_MM} mm of wall and floor against the ${frame.chamfer} mm bottom chamfer`,
    );
  }
  return { ...box, side: q.side, bottomZ, radius: r, into: next?.index ?? null, notch: n };
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
// every compartment but its own and the one it runs into, and from every finger slot. Two cuts
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
      for (const slot of other.slots) {
        if (!keepsApart(cut, slot, TOL)) {
          fail(`${what} a finger pocket of compartment ${other.index}`);
        }
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
