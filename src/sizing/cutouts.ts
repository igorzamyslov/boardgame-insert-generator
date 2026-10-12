import { MIN_CUT_MM, MIN_FEATURE_MM, POST_MM } from "../model/settings";
import type { Side } from "../model/types";
import { OPPOSITE, alongX, axes, faceOf, nearestAcross } from "../model/cut-rules";
import type { RectMm } from "../model/cut-rules";
import { ceilU } from "./units";

// Wall cutout placement (roadmap §4.6, §4.7): the finger channels of upright cards and tiles and
// the half-round cutouts of flat ones. Everything is in integer 0.01 mm units.

/** One wall cutout a compartment asks for on one side. */
export interface CutAsk {
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

/** A cut placed for compartment `owner` on `side`. */
export interface PlacedCut extends CutPlacement {
  owner: number;
  side: Side;
  to: "exit" | "spare" | "twin"; // out through the outer wall, into a spare, or into its twin
  foot: RectMm; // its footprint: the band along the side, its strip across it
}

export interface CutContext {
  rects: readonly RectMm[]; // every compartment of the tray (units): the owners first, then the spares
  spare: (index: number) => boolean;
  // per owner, the card spacer standing at the high-x end of its well, or null: the channel along
  // the row runs on through it (notched), a cut across the row keeps clear of it
  spacers: readonly (RectMm | null)[];
  depths: readonly number[]; // content depth of each owner (from its floor to the rim)
  span: { x: number; y: number }; // outer size along x and y
  H: number; // outer height
  chamfer: number; // the tray's bottom chamfer
  width: number; // fingerPocket.width
  notch: number; // fingerPocket.floorNotch, 0 = none
}

const MIN = ceilU(MIN_FEATURE_MM);
const POST = ceilU(POST_MM);
const MIN_CUT = ceilU(MIN_CUT_MM);
/** A floor notch reaching less than this into the floor after clamping is left out. */
const MIN_NOTCH = 100;

/** Compartment `i` of the tray. */
function rectAt(ctx: CutContext, i: number): RectMm {
  const r = ctx.rects[i];
  if (r === undefined) {
    throw new Error("internal: wall cutout without a compartment");
  }
  return r;
}

/** The outer size across a side: how far its cut may run to the far outer face. */
function spanAcross(ctx: CutContext, side: Side): number {
  return alongX(side) ? ctx.span.y : ctx.span.x;
}

/** Where a request's cut runs: out through the outer face, into a spare, or into a twin request. */
type Across =
  { kind: "exit" } | { kind: "spare"; index: number } | { kind: "twin"; request: number };

/**
 * Places every requested wall cutout (roadmap §4.7):
 * - A request's cut runs out through the outer wall when no compartment lies across its side, into
 *   a spare compartment, or through the divider into a compartment that asks for a cut on the facing
 *   side and is centred on the same line (its twin). Toward any other compartment there is no cut:
 *   a channel never opens into bits, minis or a custom well.
 * - Twins, and the cuts on the two sides of one compartment, form a run: one channel with one
 *   centre (the first member's) and one width, at most the setting. It leaves a POST_MM post
 *   between its sides and the faces of every compartment it passes (its members and the spares it
 *   runs into), so the wall still holds the contents (spec §6.1), and reaches at most half way
 *   into the gap to any other compartment within MIN_FEATURE_MM of the cuts, less
 *   MIN_FEATURE_MM / 2. Runs are placed one after the other, each keeping MIN_FEATURE_MM from the
 *   cuts already placed (a pocket's cut out past a deck keeps clear of the deck's channel). A run
 *   with less room than MIN_CUT_MM (or the setting, if smaller) gets no cut.
 * - A compartment none of whose requests gets a cut asks again (the same depth and notch), placed
 *   the same way after every first cut, centred on the cards beside a spacer and clear of it: on
 *   the other side of the same axis (a pocket of the back row, whose front faces the front row,
 *   cuts through the back wall), then on both sides of the other axis (a deck between bits along
 *   its row is cut through the front and back walls; review 1, I2).
 * - Depth: down to the compartment's own floor for a full-depth request (flat), else the fraction
 *   of the run's shallowest well (upright: half). A cut leaving through the outer wall without a
 *   floor notch keeps its bottom MIN_FEATURE_MM above the bottom chamfer.
 * - A floor notch takes the cut on down through the bottom at its full width and reaches the
 *   setting into the floor; it leaves
 *   MIN_FEATURE_MM of floor to an opposite notch and MIN_FEATURE_MM plus the chamfer to the outer
 *   face behind; below MIN_NOTCH it is left out.
 * Returns every cut placed, by owner and side; an owner missing from it got none on either axis.
 */
export function placeCutouts(requests: readonly CutAsk[], ctx: CutContext): PlacedCut[] {
  const placed: PlacedCut[] = [];
  placeRuns(requests, ctx, placed);
  // Asks again for the owners still without a cut, on the sides `sides` picks from their asks.
  const again = (sides: (asked: readonly Side[]) => Side[]): CutAsk[] => {
    const cut = new Set(placed.map((c) => c.owner));
    return [...new Set(requests.map((q) => q.owner))]
      .filter((owner) => !cut.has(owner))
      .flatMap((owner) => {
        const asks = requests.filter((q) => q.owner === owner);
        const fraction = Math.min(...asks.map((q) => q.fraction));
        const notch = asks.some((q) => q.notch);
        return sides(asks.map((q) => q.side)).map((side) => ({ owner, side, fraction, notch }));
      });
  };
  const beside = besideSpacers(ctx);
  // The other side of the same axis (a minis pocket's back, where its front faces another pocket)…
  placeRuns(
    again((asked) => asked.map((side) => OPPOSITE[side]).filter((s) => !asked.includes(s))),
    beside,
    placed,
  );
  // …then the two sides of the other axis.
  const across = (asked: readonly Side[]): Side[] =>
    asked.some((side) => alongX(side)) ? ["left", "right"] : ["front", "back"];
  placeRuns(again(across), beside, placed);
  return placed;
}

/**
 * `ctx` with each owner that has a spacer cut down to the rest of its well, the cards: a cut across
 * the row is centred on them and keeps its post from the spacer.
 */
function besideSpacers(ctx: CutContext): CutContext {
  const rects = ctx.rects.map((r, i) => {
    const sp = ctx.spacers[i];
    return sp ? { ...r, x1: sp.x0 } : r;
  });
  return { ...ctx, rects };
}

/**
 * Places the runs of `requests` (placeCutouts) one after the other, each clear of the cuts in
 * `placed` (so a channel along a row and a cut across it never meet), and adds their cuts to it.
 */
function placeRuns(requests: readonly CutAsk[], ctx: CutContext, placed: PlacedCut[]): void {
  const rect = (i: number): RectMm => rectAt(ctx, i);
  // Twice the centre along the side, so a half unit stays exact.
  const centre2 = (i: number, side: Side): number => {
    const a = axes(rect(i), side);
    return a.u0 + a.u1;
  };
  // The cut's centre, as bandOf centres it (the run's first member's, the same within half a unit).
  const nearest = requests.map((q) => {
    const own = axes(rect(q.owner), q.side);
    return nearestAcross(ctx.rects, q.owner, q.side, Math.round((own.u0 + own.u1) / 2), 0);
  });
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

  for (const members of runs.values()) {
    const run = runOf(members, requests, across, ctx);
    const band = bandOf(run, requests, across, ctx, placed);
    if (band === null) {
      continue;
    }
    const { at, half } = band;
    const owners = [...run.owners];
    const shallowest = Math.min(...owners.map((o) => ctx.depths[o] ?? 0));
    run.members.forEach((k, m) => {
      const q = requests[k];
      const [v0, v1] = run.strips[m] ?? [0, 0];
      if (q === undefined) {
        return;
      }
      const own = axes(rect(q.owner), q.side);
      const ownDepth = ctx.depths[q.owner] ?? 0;
      const face = faceOf(rect(q.owner), q.side);
      // From the face to the outer face behind the compartment, which the notch reaches toward.
      const behind =
        q.side === "back" || q.side === "right" ? face : spanAcross(ctx, q.side) - face;
      let notch = 0;
      if (q.notch && ctx.notch > 0) {
        notch = Math.min(
          ctx.notch,
          Math.floor((own.v1 - own.v0 - MIN) / 2),
          behind - ctx.chamfer - MIN,
        );
        notch = notch < MIN_NOTCH ? 0 : notch;
      }
      let depth = q.fraction >= 1 ? ownDepth : Math.max(1, Math.round(q.fraction * shallowest));
      if (across[k]?.kind === "exit" && notch === 0) {
        depth = Math.min(depth, ctx.H - ctx.chamfer - MIN);
      }
      depth = Math.min(depth, ownDepth);
      if (depth >= 1) {
        const to = across[k]?.kind ?? "exit";
        const [u0, u1] = [at - half, at + half];
        const foot = alongX(q.side)
          ? { x0: u0, x1: u1, y0: v0, y1: v1 }
          : { x0: v0, x1: v1, y0: u0, y1: u1 };
        placed.push({ owner: q.owner, side: q.side, to, at, width: 2 * half, depth, notch, foot });
      }
    });
  }
}

/** A run of requests and the cuts' extent across its side: its strips (units). */
interface Run {
  members: readonly number[];
  side: Side;
  owners: ReadonlySet<number>;
  strips: readonly (readonly [number, number])[];
}

/** The run's members, side, owners and strips: from each compartment face to where its cut ends. */
function runOf(
  members: readonly number[],
  requests: readonly CutAsk[],
  across: readonly (Across | null)[],
  ctx: CutContext,
): Run {
  const rectOf = (i: number): RectMm => rectAt(ctx, i);
  const first = requests[members[0] ?? -1];
  if (first === undefined) {
    throw new Error("internal: empty wall cutout run");
  }
  const strips = members.map((k) => {
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
  const owners = new Set(members.map((k) => requests[k]?.owner ?? -1));
  return { members, side: first.side, owners, strips };
}

/** The extent of a run's compartments along its side (units). */
function rangeOf(run: Run, ctx: CutContext): { u0: number; u1: number } {
  const members = [...run.owners].map((o) => axes(rectAt(ctx, o), run.side));
  return { u0: Math.min(...members.map((m) => m.u0)), u1: Math.max(...members.map((m) => m.u1)) };
}

/**
 * A run's centre and half-width (units), or null when it has no room for MIN_CUT_MM (or the
 * setting, if smaller): centred on its first member, at most half the setting, keeping a POST_MM
 * post to the faces of every compartment it passes (its members and the spares it runs into), and
 * at most half way (less MIN / 2) toward any other compartment, and MIN from any cut in `placed`,
 * that lies within MIN of its cuts.
 */
function bandOf(
  run: Run,
  requests: readonly CutAsk[],
  across: readonly (Across | null)[],
  ctx: CutContext,
  placed: readonly PlacedCut[],
): { at: number; half: number } | null {
  const { side, owners, strips } = run;
  const entered = new Set(
    run.members.flatMap((k) => {
      const to = across[k];
      return to?.kind === "spare" ? [to.index] : [];
    }),
  );
  const first = axes(rectAt(ctx, requests[run.members[0] ?? -1]?.owner ?? -1), side);
  const at = Math.round((first.u0 + first.u1) / 2);
  const { u0: lowU, u1: highU } = rangeOf(run, ctx);
  // Its posts: POST from the faces of every compartment it passes. (They also keep its sides past
  // the outer corners' arcs: a post starts at least a wall from the outer face.)
  const passed = [...owners, ...entered].map((i) => axes(rectAt(ctx, i), side));
  let lo = Math.max(...passed.map((p) => p.u0)) + POST;
  let hi = Math.min(...passed.map((p) => p.u1)) - POST;
  // Other compartments, of whose gap it takes half; cuts already placed, which it keeps MIN from.
  const obstacles = [
    ...ctx.rects.flatMap((r, i) =>
      owners.has(i) || entered.has(i) ? [] : [{ ...axes(r, side), share: true }],
    ),
    ...placed.map((c) => ({ ...axes(c.foot, side), share: false })),
  ];
  for (const b of obstacles) {
    if (!strips.some(([v0, v1]) => b.v1 > v0 - MIN && b.v0 < v1 + MIN)) {
      continue;
    }
    if (b.u1 <= at) {
      const gap = lowU - b.u1;
      const half = b.share && gap >= MIN;
      lo = Math.max(lo, half ? Math.ceil((b.u1 + lowU + MIN) / 2) : b.u1 + MIN);
    } else if (b.u0 >= at) {
      const gap = b.u0 - highU;
      const half = b.share && gap >= MIN;
      hi = Math.min(hi, half ? Math.floor((b.u0 + highU - MIN) / 2) : b.u0 - MIN);
    } else {
      return null;
    }
  }
  const half = Math.min(Math.ceil(ctx.width / 2), at - lo, hi - at);
  return 2 * half >= Math.min(MIN_CUT, ctx.width) ? { at, half } : null;
}
