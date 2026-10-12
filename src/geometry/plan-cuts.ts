import type { FeatureSpec, Side, TraySpec } from "../model/types";
import { INNER_CORNER_RADIUS_MM, MIN_FEATURE_MM, SPEC_TOLERANCE as TOL } from "../model/settings";
import { keepsApart, separation } from "../model/slot-rules";
import { FINGER_FILLET_MM, MIN_FILLET } from "./plan-types";
import type { CompartmentPlan, CutPlan, FilletPlan, Rect } from "./plan-types";

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

/** The square a fillet takes from its corner toward the material (the disc it keeps aside). */
export function filletBox(f: FilletPlan): Rect {
  const [x0, x1] = f.sx > 0 ? [f.x, f.x + f.r] : [f.x - f.r, f.x];
  const [y0, y1] = f.sy > 0 ? [f.y, f.y + f.r] : [f.y - f.r, f.y];
  return { x0, y0, x1, y1 };
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

/** Every footprint the cuts of `plans` take: their boxes, floor notches and fillets. */
export function cutFootprints(plans: readonly CompartmentPlan[]): Rect[] {
  return plans.flatMap((plan) =>
    plan.cuts.flatMap((cut) => [
      cut,
      ...(cut.notch > 0 ? [notchFloorBox(cut)] : []),
      ...cut.fillets.map(filletBox),
    ]),
  );
}

// One wall cutout:
// - it is centred on its own compartment (`at` within its range along the side) and its sides stay
//   out of the outer walls it runs along (the parallel walls and their lip stay whole);
// - its footprint runs from the compartment's face across to the facing face of the nearest
//   compartment whose range along the side overlaps the cut, or out through the outer face;
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
    if (a < own.u0 - TOL || b > own.u1 + TOL || n > across + TOL) {
      fail(`${where}: its ${n} mm floor notch leaves the compartment`);
    }
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
    fillets: [],
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
// every compartment but its own and the one it runs into, and from every finger slot. Two cuts
// either keep it too, or cut one channel: the same band (axis, centre and width) with overlapping
// footprints (the two sides of one divider), whose union is the deeper U. The cuts on opposite
// sides of one compartment have only its contents between them.
export function checkCutClearance(plans: readonly CompartmentPlan[], fail: Fail): void {
  const cuts = plans.flatMap((plan) => plan.cuts.map((cut) => ({ plan, cut })));
  for (const { plan, cut } of cuts) {
    const what = `the ${cut.side} cut of compartment ${plan.index} comes within ${MIN_FEATURE_MM} mm of`;
    // The U reaches INNER_CORNER_RADIUS_MM into both compartments (buildTray, past their corners).
    const reach = cutReach(cut, INNER_CORNER_RADIUS_MM, 0);
    for (const other of plans) {
      const exempt = other === plan || other.index === cut.into;
      if (!exempt && !keepsApart(reach, other.rect, TOL)) {
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

// A card spacer's notch (FeatureSpec "spacerNotch", spec §6.2): where a finger channel crosses the
// well a spacer stands in, the channel's U runs on through the spacer, so it stays open end to
// end. In the spacer's own frame: along `axis`, out through both end faces, centred on `at` across
// it, `width` wide, `depth` below the spacer's top, with a round bottom of radius width / 2. It is
// open at the top (the spacer prints standing), and like a wall cutout:
// - its centre lies on the spacer, and each of its sides either cuts past the spacer's face (then
//   the spacer is cut across, its top following the U) or keeps the chamfer plus MIN_FEATURE_MM of
//   spacer beside it;
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
  const length = axis === "x" ? spec.w : spec.d;
  const box =
    axis === "x" ? { x0: 0, x1: length, y0: a, y1: b } : { x0: a, x1: b, y0: 0, y1: length };
  // The U's profile runs across the end faces it leaves through: "left" along x, "front" along y.
  const cut: CutPlan = {
    ...box,
    side: axis === "x" ? "left" : "front",
    bottomZ,
    radius: r,
    into: null,
    notch: 0,
    fillets: [],
  };
  // Its sides on the spacer are rounded where they leave through the end faces (above the
  // chamfer: the bottom stands at least chamfer + MIN_FEATURE_MM up).
  const across = { w: spec.w, d: spec.d };
  const fillets = [0, length].flatMap((face) => filletsAt(cut, face, null, across, chamfer, []));
  return { ...cut, fillets };
}

/**
 * Where a spacer notch's sides meet its end faces, for the outer corner radius: only the sides
 * that lie on the spacer (a side past its face takes the corner away with the rest of its top),
 * at their fillet's box where they have one, else at the sharp corner.
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
    .flatMap((u) =>
      [0, length].flatMap((face) => {
        const [x, y] = along ? [u, face] : [face, u];
        const fillet = notch.fillets.find(
          (f) => Math.abs(f.x - x) <= TOL && Math.abs(f.y - y) <= TOL,
        );
        if (fillet === undefined) {
          return [{ x, y }];
        }
        const box = filletBox(fillet);
        return [
          { x: box.x0, y: box.y0 },
          { x: box.x1, y: box.y0 },
          { x: box.x1, y: box.y1 },
          { x: box.x0, y: box.y1 },
        ];
      }),
    );
}

/**
 * The fillets of a cut where its sides meet the face at `face` (across the side): the corners
 * whose material lies beside the cut on that face's side of the strip. `comp` is the compartment
 * whose face it is (its range along the side must cover the fillet, and the fillet starts at its
 * floor with a floor notch), or null for an outer face the cut leaves through (the fillet ends on
 * it at least the chamfer plus MIN_FEATURE_MM from the face the cut runs along: the outer corner's
 * arc, at least the chamfer, ends MIN_FEATURE_MM before it). A fillet is at most FINGER_FILLET_MM, leaves MIN_FEATURE_MM of the
 * wall or divider end flat between the fillets on its two faces, keeps
 * MIN_FEATURE_MM from every obstacle (half that gap toward another cut), and is left out below
 * MIN_FILLET.
 */
function filletsAt(
  cut: CutPlan,
  face: number,
  comp: CompartmentPlan | null,
  size: { w: number; d: number },
  chamfer: number,
  obstacles: readonly { rect: Rect; share: number }[],
): FilletPlan[] {
  const side = cut.side;
  const box = axes(cut, side);
  const span = alongX(side) ? size.w : size.d;
  const into: 1 | -1 = Math.abs(face - box.v0) <= TOL ? 1 : -1;
  const zc = cut.bottomZ + cut.radius;
  const z0 =
    comp === null
      ? cut.notch > 0
        ? 0
        : zc
      : cut.notch > 0
        ? comp.floorZ
        : Math.max(zc, comp.floorZ);
  // Where the cut leaves the tray its strip is the outer wall, pulled in by the chamfer near the
  // bed (from the lowest fillet on it: the bed with a floor notch, else the round bottom's top).
  const stripPull = cut.into === null ? Math.max(0, chamfer - (cut.notch > 0 ? 0 : zc)) : 0;
  const fillets: FilletPlan[] = [];
  for (const [u, away] of [
    [box.u0, -1],
    [box.u1, 1],
  ] as const) {
    // Fillets on both faces of the wall or divider leave MIN_FEATURE_MM flat between them.
    let r = Math.min(FINGER_FILLET_MM, (box.v1 - box.v0 - stripPull - MIN_FEATURE_MM) / 2);
    if (comp === null) {
      // The side's fillet ends on the outer face MIN_FEATURE_MM past the corner's arc, which is at
      // least the chamfer (plan-corners.ts): the wall beside it keeps that much at the face.
      const beside = away < 0 ? u : span - u;
      r = Math.min(r, beside - chamfer - MIN_FEATURE_MM - TOL);
    } else {
      // On the compartment's flat face, past its rounded inner corner.
      const c = axes(comp.rect, side);
      r = Math.min(r, (away < 0 ? u - c.u0 : c.u1 - u) - INNER_CORNER_RADIUS_MM);
    }
    for (const { rect, share } of obstacles) {
      const o = axes(rect, side);
      if (o.v1 > box.v0 - MIN_FEATURE_MM && o.v0 < box.v1 + MIN_FEATURE_MM) {
        const gap = away < 0 ? u - o.u1 : o.u0 - u;
        if (gap > -TOL) {
          r = Math.min(r, (gap - MIN_FEATURE_MM) * share);
        }
      }
    }
    if (r >= MIN_FILLET - TOL) {
      const [x, y] = alongX(side) ? [u, face] : [face, u];
      const [sx, sy] = alongX(side) ? [away, into] : [into, away];
      fillets.push({ x, y, sx, sy, r, z0 });
    }
  }
  return fillets;
}

/**
 * Every cut's fillets (FINGER_FILLET_MM, spec §6.1): where its sides meet its own compartment's
 * face and the face at its other end (the compartment it runs into, or the outer face it leaves
 * through), clear of every other compartment and finger slot and half way to other cuts.
 */
export function planFillets(
  plans: readonly CompartmentPlan[],
  size: { w: number; d: number },
  chamfer: number,
): CompartmentPlan[] {
  return plans.map((plan) => ({
    ...plan,
    cuts: plan.cuts.map((cut) => {
      const next = cut.into === null ? null : (plans.find((p) => p.index === cut.into) ?? null);
      const obstacles = [
        ...plans.flatMap((p) => (p === plan || p === next ? [] : [{ rect: p.rect, share: 1 }])),
        ...plans.flatMap((p) => p.slots.map((slot) => ({ rect: slot as Rect, share: 1 }))),
        ...plans.flatMap((p) =>
          p.cuts.flatMap((c) =>
            c === cut || sameBand(c, cut) ? [] : [{ rect: c as Rect, share: 0.5 }],
          ),
        ),
      ];
      const own = cutFace(cut);
      const far = own === axes(cut, cut.side).v0 ? axes(cut, cut.side).v1 : axes(cut, cut.side).v0;
      return {
        ...cut,
        fillets: [
          ...filletsAt(cut, own, plan, size, chamfer, obstacles),
          ...filletsAt(cut, far, next, size, chamfer, obstacles),
        ],
      };
    }),
  }));
}
