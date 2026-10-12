import { MIN_FEATURE_MM } from "../model/settings";
import type { Side } from "../model/types";
import type { Rect2, RectU } from "./slots";
import { ceilU } from "./units";

// Wall cutout placement (roadmap §4.6, §4.7): the finger channels of upright cards and tiles and
// the half-round cutouts of flat ones. Everything is in integer 0.01 mm units.

/** One wall cutout a compartment asks for on one side. */
export interface CutRequest {
  owner: number; // index of the compartment in `rects`
  side: Side;
  fraction: number; // depth as a fraction: 1 = down to its own floor, else of the shallowest well
  notch: boolean; // notch the floor (flat cards and tiles)
}

export interface CutPlacement {
  at: number;
  width: number;
  depth: number;
  notch: number; // 0 = none
}

export interface CutContext {
  rects: readonly RectU[]; // every compartment of the tray: the owners first, then the spares
  spare: (index: number) => boolean;
  depths: readonly number[]; // content depth of each owner (from its floor to the rim)
  slots: readonly Rect2[]; // finger slot footprints (doubled units): cuts keep clear of them
  span: { x: number; y: number }; // outer size along x and y
  H: number; // outer height
  wall: number; // the (lipped) outer wall: a cut's sides stay out of it
  chamfer: number; // the tray's bottom chamfer
  width: number; // fingerPocket.width
  notch: number; // fingerPocket.floorNotch, 0 = none
}

const MIN = ceilU(MIN_FEATURE_MM);
/** A floor notch narrower than this radius after clamping is left out: no fingertip fits. */
const MIN_NOTCH = 100;

const OPPOSITE: Record<Side, Side> = { front: "back", back: "front", left: "right", right: "left" };

/** A cut on front or back runs along x (its band spans x); on left or right along y. */
function alongX(side: Side): boolean {
  return side === "front" || side === "back";
}

/** The rectangle's extent along the side (u) and across it (v). */
function axes(r: RectU, side: Side): { u0: number; u1: number; v0: number; v1: number } {
  return alongX(side)
    ? { u0: r.x, u1: r.x + r.w, v0: r.y, v1: r.y + r.d }
    : { u0: r.y, u1: r.y + r.d, v0: r.x, v1: r.x + r.w };
}

/** Compartment `i` of the tray. */
function rectAt(ctx: CutContext, i: number): RectU {
  const r = ctx.rects[i];
  if (r === undefined) {
    throw new Error("internal: wall cutout without a compartment");
  }
  return r;
}

/** A doubled-unit footprint (a finger slot's) as the smallest whole-unit rectangle around it. */
function wholeUnits(r: Rect2): RectU {
  const x = Math.floor(r.x0 / 2);
  const y = Math.floor(r.y0 / 2);
  return { x, y, w: Math.ceil(r.x1 / 2) - x, d: Math.ceil(r.y1 / 2) - y };
}

/** The outer size across a side: how far its cut may run to the far outer face. */
function spanAcross(ctx: CutContext, side: Side): number {
  return alongX(side) ? ctx.span.y : ctx.span.x;
}

/** The face of `r` on `side`, across the side. */
function faceOf(r: RectU, side: Side): number {
  return { front: r.y, back: r.y + r.d, left: r.x, right: r.x + r.w }[side];
}

/** Where a request's cut runs: out through the outer face, into a spare, or into a twin request. */
type Across =
  { kind: "exit" } | { kind: "spare"; index: number } | { kind: "twin"; request: number };

/**
 * The nearest compartment across `side` of `owner` whose range along the side overlaps the owner's,
 * as an index into `rects`, or -1 when the cut runs out through the outer face.
 */
function nearestAcross(owner: number, side: Side, rects: readonly RectU[]): number {
  const own = rects[owner];
  if (own === undefined) {
    throw new Error("internal: wall cutout without a compartment");
  }
  const o = axes(own, side);
  const face = faceOf(own, side);
  const far = side === "back" || side === "right";
  let best = -1;
  let gap = Number.POSITIVE_INFINITY;
  rects.forEach((r, j) => {
    const a = axes(r, side);
    const distance = far ? a.v0 - face : face - a.v1;
    if (j !== owner && a.u0 < o.u1 && a.u1 > o.u0 && distance >= 0 && distance < gap) {
      best = j;
      gap = distance;
    }
  });
  return best;
}

/**
 * Places every requested wall cutout (roadmap §4.7):
 * - A request's cut runs out through the outer wall when no compartment lies across its side, into
 *   a spare compartment, or through the divider into a compartment that asks for a cut on the facing
 *   side and is centred on the same line (its twin). Toward any other compartment there is no cut:
 *   a channel never opens into bits, minis or a custom well.
 * - Twins, and the cuts on the two sides of one compartment, form a run: one channel with one
 *   centre (the first member's) and one width, at most the setting. The cut's sides keep out of the
 *   outer walls along it and out of the bottom chamfer's corner zone, and reach at most half way
 *   into the gap to any other compartment or finger slot within MIN_FEATURE_MM of the cuts (another
 *   row's wells, whose own channel takes the other half), less MIN_FEATURE_MM / 2.
 * - Depth: down to the compartment's own floor for a full-depth request (flat), else the fraction
 *   of the run's shallowest well (upright: half). A cut leaving through the outer wall keeps its
 *   lowest point at the outer face MIN_FEATURE_MM above the bottom chamfer.
 * - A floor notch is the setting, at most the cut's half-width, inside the compartment along the
 *   side, leaving MIN_FEATURE_MM of floor to an opposite notch, and MIN_FEATURE_MM plus the chamfer
 *   to the outer faces; below MIN_NOTCH it is left out.
 * Returns each request's placement, or null where it gets no cut.
 */
export function placeCutouts(
  requests: readonly CutRequest[],
  ctx: CutContext,
): (CutPlacement | null)[] {
  const rect = (i: number): RectU => rectAt(ctx, i);
  // Twice the centre along the side, so a half unit stays exact.
  const centre2 = (i: number, side: Side): number => {
    const a = axes(rect(i), side);
    return a.u0 + a.u1;
  };
  const nearest = requests.map((q) => nearestAcross(q.owner, q.side, ctx.rects));
  const across: (Across | null)[] = requests.map((q, k) => {
    const j = nearest[k] ?? -1;
    if (j < 0) {
      return { kind: "exit" };
    }
    if (ctx.spare(j)) {
      return { kind: "spare", index: j };
    }
    // Twins face each other: each is the other's nearest compartment across.
    const twin = requests.findIndex(
      (t, m) =>
        t.owner === j &&
        t.side === OPPOSITE[q.side] &&
        nearest[m] === q.owner &&
        Math.abs(centre2(j, q.side) - centre2(q.owner, q.side)) <= 2,
    );
    return twin < 0 ? null : { kind: "twin", request: twin };
  });

  // Runs: union-find over twins and over the cuts of one compartment along one axis.
  const parent = requests.map((_, k) => k);
  const root = (k: number): number => {
    let r = k;
    while (parent[r] !== r) {
      r = parent[r] ?? r;
    }
    return r;
  };
  const join = (a: number, b: number): void => {
    parent[root(b)] = root(a);
  };
  requests.forEach((q, k) => {
    const to = across[k];
    if (!to) {
      return;
    }
    if (to.kind === "twin") {
      join(k, to.request);
    }
    requests.forEach((t, m) => {
      if (across[m] && t.owner === q.owner && alongX(t.side) === alongX(q.side)) {
        join(k, m);
      }
    });
  });
  const runs = new Map<number, number[]>();
  requests.forEach((_, k) => {
    if (across[k]) {
      runs.set(root(k), [...(runs.get(root(k)) ?? []), k]);
    }
  });

  const placed: (CutPlacement | null)[] = requests.map(() => null);
  for (const run of runs.values()) {
    const band = bandOf(run, requests, across, ctx);
    if (band === null) {
      continue;
    }
    const { at, half, side } = band;
    const owners = [...new Set(run.map((k) => requests[k]?.owner ?? -1))];
    const shallowest = Math.min(...owners.map((o) => ctx.depths[o] ?? 0));
    const span = alongX(side) ? ctx.span.x : ctx.span.y;
    for (const k of run) {
      const q = requests[k];
      if (q === undefined) {
        continue;
      }
      const own = axes(rect(q.owner), q.side);
      const ownDepth = ctx.depths[q.owner] ?? 0;
      const face = faceOf(rect(q.owner), q.side);
      // From the face to the outer face behind the compartment, which the notch's half-disc faces.
      const behind =
        q.side === "back" || q.side === "right" ? face : spanAcross(ctx, q.side) - face;
      let notch = 0;
      if (q.notch && ctx.notch > 0) {
        notch = Math.min(
          ctx.notch,
          half,
          at - own.u0,
          own.u1 - at,
          Math.floor((own.v1 - own.v0 - MIN) / 2),
          at - ctx.chamfer - MIN,
          span - at - ctx.chamfer - MIN,
          behind - ctx.chamfer - MIN,
        );
        notch = notch < MIN_NOTCH ? 0 : notch;
      }
      let depth = q.fraction >= 1 ? ownDepth : Math.max(1, Math.round(q.fraction * shallowest));
      if (across[k]?.kind === "exit") {
        // The lowest point the cut leaves at the outer face: the round bottom where the notch
        // meets it, or its bottom.
        const rise = half - Math.sqrt(half * half - notch * notch);
        depth = Math.min(depth, Math.floor(ctx.H - ctx.chamfer - MIN + rise));
      }
      depth = Math.min(depth, ownDepth);
      if (depth >= 1) {
        placed[k] = { at, width: 2 * half, depth, notch };
      }
    }
  }
  return placed;
}

/**
 * A run's centre and half-width (units), or null when it has no room: centred on its first
 * member, at most half the setting, keeping out of the outer walls and the bottom chamfer's
 * corner zone, and at most half way (less MIN / 2) toward any compartment or slot that is not a
 * member nor a spare it runs into and that lies within MIN of its cuts.
 */
function bandOf(
  run: readonly number[],
  requests: readonly CutRequest[],
  across: readonly (Across | null)[],
  ctx: CutContext,
): { at: number; half: number; side: Side } | null {
  const first = requests[run[0] ?? -1];
  if (first === undefined) {
    return null;
  }
  const side = first.side;
  const rectOf = (i: number): RectU => rectAt(ctx, i);
  const owners = new Set(run.map((k) => requests[k]?.owner ?? -1));
  const entered = new Set(
    run.flatMap((k) => {
      const to = across[k];
      return to?.kind === "spare" ? [to.index] : [];
    }),
  );
  const first2 = axes(rectOf(first.owner), side);
  const at = Math.round((first2.u0 + first2.u1) / 2);
  const members = [...owners].map((o) => axes(rectOf(o), side));
  const lowU = Math.min(...members.map((m) => m.u0));
  const highU = Math.max(...members.map((m) => m.u1));
  // The cuts' extent across the side: from each compartment face to where its cut ends.
  const strips = run.map((k) => {
    const q = requests[k];
    const to = across[k];
    if (q === undefined || to === null || to === undefined) {
      throw new Error("internal: wall cutout without a run");
    }
    const face = faceOf(rectOf(q.owner), q.side);
    const outer = { front: 0, back: ctx.span.y, left: 0, right: ctx.span.x }[q.side];
    const end =
      to.kind === "exit"
        ? outer
        : faceOf(
            rectOf(to.kind === "spare" ? to.index : (requests[to.request]?.owner ?? -1)),
            OPPOSITE[q.side],
          );
    return [Math.min(face, end), Math.max(face, end)] as const;
  });
  const span = alongX(side) ? ctx.span.x : ctx.span.y;
  const edge = Math.max(ctx.wall, ctx.chamfer);
  let lo = edge;
  let hi = span - edge;
  const obstacles = [
    ...ctx.rects.flatMap((r, i) => (owners.has(i) || entered.has(i) ? [] : [axes(r, side)])),
    ...ctx.slots.map((slot) => axes(wholeUnits(slot), side)),
  ];
  for (const b of obstacles) {
    if (!strips.some(([v0, v1]) => b.v1 > v0 - MIN && b.v0 < v1 + MIN)) {
      continue;
    }
    if (b.u1 <= at) {
      const gap = lowU - b.u1;
      lo = Math.max(lo, gap >= MIN ? Math.ceil((b.u1 + lowU + MIN) / 2) : b.u1 + MIN);
    } else if (b.u0 >= at) {
      const gap = b.u0 - highU;
      hi = Math.min(hi, gap >= MIN ? Math.floor((b.u0 + highU - MIN) / 2) : b.u0 - MIN);
    } else {
      return null;
    }
  }
  const half = Math.min(Math.ceil(ctx.width / 2), at - lo, hi - at);
  return half >= 1 ? { at, half, side } : null;
}
