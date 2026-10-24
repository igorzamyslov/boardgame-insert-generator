import type { Ctx } from "./context";
import { overflowTotal, type PlacedLeftover, type PlacedTray, type Plan } from "./fill";
import { toU, volMm3, type U } from "./units";

/** Where a tray was in the warm-start layout (units). */
export interface PrevPos {
  readonly x: U;
  readonly y: U;
  readonly level: number;
}

export interface ScoreTerms {
  /** Leftover parts + slack trays can't absorb + room beside alike trays too thin to fill, in 1/100 000 of the usable box volume. */
  readonly leftover: number;
  /** Loose trays (bulk, minis-bulk, tiles) in the top layer when coverage applies. */
  readonly coverage: number;
  /** "often" trays with another tray on top. */
  readonly access: number;
  /** "setup" trays with nothing on top: setup-only trays are the ones to bury. */
  readonly setup: number;
  /** Units of nominal lateral play above the play limit (settings.playLimit, 1.5 mm by default), summed over both axes. */
  readonly play: number;
  /** Trays above level 0. */
  readonly stacked: number;
  /** Printed parts (trays + leftovers). */
  readonly trays: number;
  /** Estimated filament (shells, solid leftovers), in 1/100 000 of the usable box volume. */
  readonly filament: number;
  /** Trays whose position or level differs from the warm-start layout. */
  readonly moved: number;
  /**
   * Parts of one requirement turned differently: per requirement, the parts in the less common
   * orientation. They are one component to the user, so they should look alike (spec §6).
   */
  readonly unturned: number;
  /**
   * The trays one item is split into spread over several stacks: per copy of a requirement (one
   * item, or one player's share of a per-player one; `ctx.copyOf`), its stacks beyond the first.
   * The split trays of one item belong in one stack (owner, 0.5.3): a strong term, over a buried
   * "often" tray and a filler (spec §6).
   */
  readonly apart: number;
  /**
   * Parts of one requirement not side by side: per requirement, its stacks beyond the first, plus
   * the trays of other requirements standing between its parts in a stack, so its parts (and its
   * copies, one tray per player) end up adjacent. Only a preference (spec §6).
   */
  readonly scattered: number;
  /**
   * Trays a requirement is split into beyond one per copy, counted only when some variant holds
   * each copy in a tray that fits on its own (`ctx.wholeFits`): an item stays in one tray unless
   * no single tray fits (groups spec §6.3).
   */
  readonly split: number;
  /**
   * Filler parts (leftovers, in a stack level too): one is a loose piece a person places by hand,
   * so each costs its own term on top of `trays` (spec §6, lever 2).
   */
  readonly fillers: number;
  /**
   * Walls a stack swells beyond what it asks of them: per tray and axis, the square of the extra
   * thickness (mm per side) its footprint is forced to by the trays above it, over what
   * the tray absorbs as room for its contents. A small tray
   * under a large one carries the large one's footprint in its walls (spec: stack order).
   */
  readonly swollen: number;
  /**
   * Finger-cut walls with a filler against them: per tray, the cut walls with a filler part
   * closer than `SEAL_REACH_MM` (spec: sealed cuts). Only a preference.
   */
  readonly sealed: number;
}

export interface Score {
  readonly total: number;
  readonly overflow: U;
  readonly terms: ScoreTerms;
}

/**
 * Integer weights, in the spec's order of importance (§7.2). Each term's "unit step" is
 * worth less than the previous term's unit step:
 *   1 % of the box left over     = 1 000 × 1 000 = 1 000 000
 *   one loose tray on top        =                   500 000
 *   one buried "often" tray      =                   200 000
 *   one extra tray gap of play   = 20 units × 5 000 = 100 000
 *   one stacked tray             =                    50 000
 *   one extra printed part       =                    20 000
 *   one unburied "setup" tray    =                    15 000
 *   1 % of the box in filament   = 1 000 × 10 =       10 000
 *   one moved tray (warm start)  =                     5 000
 * and four terms for the parts of one requirement, which are one thing to the user. Two are
 * strong, set by the owner over the packing preferences above:
 *   one extra stack for one item's trays =         5 000 000 (spec §6, owner 0.5.3; 0.8.1)
 *   one tray more than a whole one       =           300 000 (groups spec §6.3)
 * and two are preferences only:
 *   one part turned unlike its siblings  =            15 000
 *   one extra stack, or tray between     =            10 000
 * and one for the loose pieces a person places by hand (spec §6, lever 2):
 *   one filler part (on top of `trays`)  =             20 000
 * and two preferences about how a stack and its fillers look (spec §6.4):
 *   a wall swollen 1 mm per side beyond need   =       80 000 (× the square of mm)
 *   one finger-cut wall with a filler against it =      10 000
 * Overflow (any hard-rule violation) costs OVERFLOW_WEIGHT per 0.01 mm, more than any
 * feasible score can reach, so the search always prefers reducing violations.
 * Totals stay far below 2^53, so score deltas are exact integers.
 */
export const WEIGHTS: Readonly<ScoreTerms> = {
  leftover: 1_000,
  coverage: 500_000,
  access: 200_000,
  // Below `trays` and `stacked`, so burying a setup tray never pays for an extra stack or
  // printed part; above `moved`, so a warm start can still be rearranged to bury one.
  setup: 15_000,
  play: 5_000,
  stacked: 50_000,
  trays: 20_000,
  filament: 10,
  moved: 5_000,
  // The parts of one requirement are one thing to the user. Owner (0.5.3): "keep the split trays
  // of one item in one stack whenever possible", so an extra stack for one item (one copy: the
  // trays of one player's share are kept together, the players' trays need not be) is the
  // heaviest preference there is, 5 000 000: 5 % of the box left over (5 × 1 000 000). The rule
  // it states: an item kept together may leave up to about 5 % of the box unused, less the filler,
  // filament and sealed cuts that come with that room. The owner's Star Realms box gives up
  // 2.25 % (the three Starter trays in one stack, the Trade deck alone: 0.8.1, when 2 000 000 parted
  // them); with a smaller Counter deck it was 1.5 %. Above `coverage` (500 000) and `access`
  // (200 000), so it buries an "often" part or leaves a loose tray on top rather than part the
  // item; above a filler (40 000 with its part) and a stacked tray; about a wall swollen 8 mm per
  // side. Far below OVERFLOW_WEIGHT (1/400 of 0.01 mm), so it never costs a fit: when no stack can
  // hold the parts, they spread. At the annealer's start temperature (T_START, 1 000 000) a move
  // that parts an item is taken about one time in 150 (e^-5): the search crosses such layouts
  // rarely, and settles on the item's one stack early.
  apart: 5_000_000,
  // Groups spec §6.3 (owner A): one tray per copy unless no single tray fits. Above a buried
  // "often" tray (200 000), a stacked tray (50 000), a filler with its part (40 000) and the weak
  // cohesion terms, so no packing preference buys a split; below `coverage` (500 000), 1 % of
  // the box and `apart`, so a split still wins when the whole tray would cost a loose tray on top,
  // real room or the item's stack; and never an overflow: a whole tray that fits the box alone but
  // not beside the others gives way. Charged only when `ctx.wholeFits`, so an item too big for one
  // tray splits free.
  split: 300_000,
  // They should also look alike and sit together. Orientation is the cheap win (turning a tray
  // rarely costs the packing anything: when it does, it costs a leftover, a play step or a part,
  // each worth more), so it weighs more than adjacency (a requirement's copies in one stack, no
  // other tray between its parts). Both stay under `trays` (20 000, one filler to place by hand)
  // and `stacked` (50 000), so neither ever buys a filler or a stacked tray, far under `access`
  // (200 000, a buried "often" tray) and above `moved` (5 000) so a warm start can still be
  // regrouped.
  unturned: 15_000,
  scattered: 10_000,
  // A filler is a loose piece to place by hand ("the less fillers I have to put manually, the
  // better"), so on top of the 20 000 every part costs it costs 20 000 of its own: twice a tray,
  // 40 000 in all. That is under `stacked` (50 000), so avoiding a filler never buys a stacked
  // tray's reach, and over the weak cohesion preferences (15 000, 10 000) and `setup`, so none
  // of them buys a filler (keeping an item in one stack or in one tray does). Count, not volume:
  // one large filler beats two small ones of the same volume by the whole of it. Measured flat between 10 000 and 29 000 (spec §6.2), so the value
  // is set by those neighbours, not by the search. Spec §6 lever 3, a reward for fillers against
  // the box wall, was measured and dropped: it raised the filler count (spec §6.2).
  fillers: 20_000,
  // The square of the avoidable thickness in mm (see `swollenTotal`), so a few millimetres cost
  // little and a wall carrying a whole footprint costs a great deal: 1 mm per side is 80 000 (two
  // fillers), 2.5 mm is `coverage` (500 000), 10 mm is 8 % of the box. It has to be big
  // because `leftover` charges a filler by volume too, and a small tray on top of a stack has a
  // filler as tall as the stack above its level, taller than the swollen walls it replaces: the
  // honest volume of the thick-walled layout is the smaller, so only a stronger preference moves
  // it (spec §6.4: the mean forced wall on the real project over six seeds fell from 26.0 mm to
  // 6.7 at 20 000, 4.3 at 80 000 and 1.9 at 160 000, with no change to a fixture). Kept under the
  // top of that range so it stays near `coverage`. An "often" tray above exempts the tray under it,
  // so reachability is never what pays for it.
  swollen: 80_000,
  // A filler against a cut wall seals it. It is free to avoid when the slack can go to another
  // face, so it must never buy a part (20 000) or a filler (40 000): half a part, and above
  // `moved` so a warm start can still be rearranged to clear one.
  sealed: 10_000,
};

// 2 000 000 000 since 0.8.1: `apart` at 5 000 000 lifts the worst feasible score (score.test) past
// 1 000 000 000. Totals stay exact: 1 m of overflow in all is 2 × 10^14, far below 2^53.
export const OVERFLOW_WEIGHT = 2_000_000_000;

function share(mm3: number, boxMm3: number): number {
  return Math.round((mm3 * 100_000) / boxMm3);
}

export function coverageApplies(ctx: Ctx): boolean {
  const box = ctx.input.box;
  return (box.headroom > 0 && box.headroomCoverage === "partial") || box.storedOnSide;
}

/** Nominal lateral play along a line crossing `crossed` trays: clearance twice, gap between trays. */
export function nominalPlayU(boxClearance: U, gap: U, crossed: number): U {
  return 2 * boxClearance + Math.max(0, crossed - 1) * gap;
}

function shell(ctx: Ctx, w: U, d: U, h: U): number {
  return volMm3(w, d, h) - volMm3(w - 2 * ctx.wall, d - 2 * ctx.wall, h - ctx.floor);
}

/**
 * Thickness (mm per side) past which `swollen` stops growing. Without it a tray 400 mm wider than
 * the one above would cost more than OVERFLOW_WEIGHT, and a feasible layout could lose to one that
 * overflows; at 10 mm a tray costs 2 × 100 × 80 000 = 16 million at most, and a box of thirty
 * trays under that is still under it.
 */
export const SWOLLEN_CAP_MM = 10;

/** A filler closer than this to a cut wall seals it: less than a fingertip of room (spec §6.4). */
export const SEAL_REACH_MM = 8;
const SEAL_REACH_U: U = toU(SEAL_REACH_MM);

/**
 * The extra thickness (units per side) a tray's walls are forced to by the trays above it, per
 * axis: room the tray takes as space for its contents or as walls the user allowed is not forced
 * waste (`usable`). Flush stacking costs an equal tray above nothing (it stands in the tray's own
 * footprint, whatever the lip).
 */
function swollenOf(ctx: Ctx, t: PlacedTray): [U, U] {
  const usableW = Math.min(t.w, t.minW + Math.max(0, t.capW - ctx.oneWallCap));
  const usableD = Math.min(t.d, t.minD + Math.max(0, t.capD - ctx.oneWallCap));
  const axis = (own: U, need: U, size: U, usable: U): U =>
    Math.max(0, Math.min(size - usable, need - own)) / 2;
  return [axis(t.minW, t.needW, t.w, usableW), axis(t.minD, t.needD, t.d, usableD)];
}

/**
 * Sum over trays and axes of the square of `swollenOf` in mm, rounded: an integer count. A tray with
 * an "often" tray somewhere above it is left out: a wide tray people reach for during play stays on
 * top, so the tray under it carries its footprint, and reachability is not traded for walls.
 */
function swollenTotal(ctx: Ctx, trays: readonly PlacedTray[]): number {
  const oftenAbove = new Map<number, number>();
  for (const t of trays) {
    if (ctx.input.requirements[t.item.req]?.access === "often") {
      oftenAbove.set(t.stack, Math.max(oftenAbove.get(t.stack) ?? -1, t.level));
    }
  }
  let total = 0;
  for (const t of trays) {
    if ((oftenAbove.get(t.stack) ?? -1) > t.level) {
      continue;
    }
    const [w, d] = swollenOf(ctx, t);
    total += Math.min(SWOLLEN_CAP_MM, w / 100) ** 2 + Math.min(SWOLLEN_CAP_MM, d / 100) ** 2;
  }
  return Math.round(total);
}

/**
 * Cut walls with a filler against them. A wall counts once, however many fillers stand there.
 * The cut's place along the wall is not known here (realize places it), so a filler counts when it
 * overlaps the wall by at least a finger pocket's width, or the whole wall when that is shorter.
 */
function sealedTotal(
  ctx: Ctx,
  trays: readonly PlacedTray[],
  fillers: readonly PlacedLeftover[],
): number {
  if (fillers.length === 0) {
    return 0;
  }
  const pocket = toU(ctx.input.settings.fingerPocket.width);
  let total = 0;
  for (const t of trays) {
    const cuts = ctx.cutSides(t.item, t.item.rotated);
    if (!cuts.left && !cuts.right && !cuts.front && !cuts.back) {
      continue;
    }
    // [lo, hi) along the wall, and the gap from the wall to a filler, per side
    const hit = (side: "left" | "right" | "front" | "back"): boolean => {
      const alongX = side === "front" || side === "back";
      const lo = alongX ? t.x : t.y;
      const hi = lo + (alongX ? t.w : t.d);
      const need = Math.min(pocket, hi - lo);
      return fillers.some((f) => {
        if (f.z >= t.z + t.h || f.z + f.h <= t.z) {
          return false;
        }
        const flo = alongX ? f.x : f.y;
        const fhi = flo + (alongX ? f.w : f.d);
        if (Math.min(hi, fhi) - Math.max(lo, flo) < need) {
          return false;
        }
        const gap =
          side === "right"
            ? f.x - (t.x + t.w)
            : side === "left"
              ? t.x - (f.x + f.w)
              : side === "back"
                ? f.y - (t.y + t.d)
                : t.y - (f.y + f.d);
        return gap >= 0 && gap < SEAL_REACH_U;
      });
    };
    for (const side of ["left", "right", "front", "back"] as const) {
      if (cuts[side] && hit(side)) {
        total++;
      }
    }
  }
  return total;
}

export function scorePlan(ctx: Ctx, plan: Plan, prev?: ReadonlyMap<string, PrevPos>): Score {
  const boxMm3 = Math.max(1, volMm3(ctx.floorW, ctx.floorD, Math.max(ctx.topPlane, 1)));
  const covers = coverageApplies(ctx);
  let leftoverMm3 = 0;
  let filamentMm3 = 0;
  let coverage = 0;
  let access = 0;
  let setup = 0;
  let stacked = 0;
  let moved = 0;
  // Per requirement: its variant, the parts turned each way, the stacks they stand in, and the
  // stacks of each copy.
  const siblings = new Map<
    number,
    {
      variant: number;
      turned: number;
      straight: number;
      stacks: Map<number, { lo: number; hi: number; n: number }>;
      copies: Map<number, Set<number>>;
    }
  >();
  for (const t of plan.trays) {
    const kin = siblings.get(t.item.req) ?? {
      variant: t.item.variant,
      turned: 0,
      straight: 0,
      stacks: new Map<number, { lo: number; hi: number; n: number }>(),
      copies: new Map<number, Set<number>>(),
    };
    siblings.set(t.item.req, kin);
    kin[t.item.rotated ? "turned" : "straight"]++;
    const copy = ctx.copyOf(t.item);
    const copyStacks = kin.copies.get(copy) ?? new Set<number>();
    kin.copies.set(copy, copyStacks.add(t.stack));
    const at = kin.stacks.get(t.stack) ?? { lo: t.level, hi: t.level, n: 0 };
    kin.stacks.set(t.stack, {
      lo: Math.min(at.lo, t.level),
      hi: Math.max(at.hi, t.level),
      n: at.n + 1,
    });
    const usableW = Math.min(t.w, t.minW + Math.max(0, t.capW - ctx.oneWallCap));
    const usableD = Math.min(t.d, t.minD + Math.max(0, t.capD - ctx.oneWallCap));
    leftoverMm3 += volMm3(t.w, t.d, t.h) - volMm3(usableW, usableD, t.h);
    filamentMm3 += shell(ctx, t.w, t.d, t.h);
    const r = ctx.input.requirements[t.item.req];
    // a loose tray under a kept-free area has the paper over it
    if (covers && t.top && r?.loose && !t.under) {
      coverage++;
    }
    if (!t.top && r?.access === "often") {
      access++;
    }
    // Constant for a tray that cannot be buried (alone in its stack in every candidate),
    // so it never changes which candidate wins; the annealer only sees score deltas.
    if (t.top && r?.access === "setup") {
      setup++;
    }
    if (t.level > 0) {
      stacked++;
    }
    if (prev) {
      const key = ctx.part(t.item)?.trayKey;
      const p = key === undefined ? undefined : prev.get(key);
      if (p && (p.x !== t.x || p.y !== t.y || p.level !== t.level)) {
        moved++;
      }
    }
  }
  let unturned = 0;
  let apart = 0;
  let scattered = 0;
  let split = 0;
  for (const [req, kin] of siblings) {
    unturned += Math.min(kin.turned, kin.straight);
    for (const stacks of kin.copies.values()) {
      apart += stacks.size - 1;
    }
    scattered += kin.stacks.size - 1;
    // the trays of other components standing between its parts in a stack
    for (const { lo, hi, n } of kin.stacks.values()) {
      scattered += hi - lo + 1 - n;
    }
    if (ctx.wholeFits[req] === true) {
      split += ctx.extraParts(req, kin.variant);
    }
  }
  // Room beside an alike tray that is too thin for a filler stays empty, which is left over too.
  for (const a of plan.air) {
    leftoverMm3 += volMm3(a.w, a.d, a.h);
  }
  for (const l of plan.leftovers) {
    leftoverMm3 += volMm3(l.w, l.d, l.h);
    filamentMm3 += l.solid ? volMm3(l.w, l.d, l.h) : shell(ctx, l.w, l.d, l.h);
  }
  // The play along a row is the nominal one (clearance and gaps) unless something is left empty
  // in it (room beside an alike tray too thin for a filler): then it is what the row leaves.
  const playExcess = (crossed: number, shift: number): number =>
    Math.max(0, Math.max(nominalPlayU(ctx.boxClearance, ctx.gap, crossed), shift) - ctx.playLimit);
  const terms: ScoreTerms = {
    leftover: share(leftoverMm3, boxMm3),
    coverage,
    access,
    setup,
    play: playExcess(plan.crossX, plan.playX) + playExcess(plan.crossY, plan.playY),
    stacked,
    trays: plan.trays.length + plan.leftovers.length,
    filament: share(filamentMm3, boxMm3),
    moved,
    unturned,
    apart,
    scattered,
    split,
    fillers: plan.leftovers.length,
    swollen: swollenTotal(ctx, plan.trays),
    sealed: sealedTotal(ctx, plan.trays, plan.leftovers),
  };
  const overflow = overflowTotal(plan.overflow);
  const total =
    overflow * OVERFLOW_WEIGHT +
    terms.leftover * WEIGHTS.leftover +
    terms.coverage * WEIGHTS.coverage +
    terms.access * WEIGHTS.access +
    terms.setup * WEIGHTS.setup +
    terms.play * WEIGHTS.play +
    terms.stacked * WEIGHTS.stacked +
    terms.trays * WEIGHTS.trays +
    terms.filament * WEIGHTS.filament +
    terms.moved * WEIGHTS.moved +
    terms.unturned * WEIGHTS.unturned +
    terms.apart * WEIGHTS.apart +
    terms.scattered * WEIGHTS.scattered +
    terms.split * WEIGHTS.split +
    terms.fillers * WEIGHTS.fillers +
    terms.swollen * WEIGHTS.swollen +
    terms.sealed * WEIGHTS.sealed;
  return { total, overflow, terms };
}
