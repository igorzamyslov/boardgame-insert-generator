import { PLAY_LIMIT_U, type Ctx } from "./context";
import { overflowTotal, type Plan } from "./fill";
import { volMm3, type U } from "./units";

/** Where a tray was in the warm-start layout (units). */
export interface PrevPos {
  readonly x: U;
  readonly y: U;
  readonly level: number;
}

export interface ScoreTerms {
  /** Leftover parts + slack trays can't absorb, in 1/100 000 of the usable box volume. */
  readonly leftover: number;
  /** Loose trays (bulk, minis-bulk, tiles) in the top layer when coverage applies. */
  readonly coverage: number;
  /** "often" trays with another tray on top. */
  readonly access: number;
  /** "setup" trays with nothing on top: setup-only trays are the ones to bury. */
  readonly setup: number;
  /** Units of nominal lateral play above 1.5 mm, summed over both axes. */
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
   * Parts of one requirement spread over several stacks: per requirement, its stacks beyond the
   * first. Only a preference; a tray reachable on top comes first (spec §6).
   */
  readonly apart: number;
  /**
   * Filler parts (leftovers, in a stack level too): one is a loose piece a person places by hand,
   * so each costs its own term on top of `trays` (spec §6, lever 2).
   */
  readonly fillers: number;
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
 * and two cohesion terms for the parts of one requirement (spec §6), both preferences only:
 *   one part turned unlike its siblings =             15 000
 *   one extra stack for a requirement   =             10 000
 * and one for the loose pieces a person places by hand (spec §6, lever 2):
 *   one filler part (on top of `trays`)  =             20 000
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
  // The parts of one requirement are one thing to the user, so they should look alike. Orientation
  // is the cheap win (turning a tray rarely costs the packing anything: when it does, it costs a
  // leftover, a play step or a part, each worth more), so it weighs more than keeping them in one
  // stack. Both stay under `trays` (20 000, one filler to place by hand) and `stacked` (50 000), so
  // neither ever buys a filler or a stacked tray, far under `access` (200 000, a buried "often"
  // tray) and above `moved` (5 000) so a warm start can still be regrouped. The whole of them is a
  // few hundred thousand at most, nowhere near OVERFLOW_WEIGHT, so they can never make an
  // infeasible layout beat a feasible one.
  unturned: 15_000,
  apart: 10_000,
  // A filler is a loose piece to place by hand ("the less fillers I have to put manually, the
  // better"), so on top of the 20 000 every part costs it costs 20 000 of its own: twice a tray,
  // 40 000 in all. That is under `stacked` (50 000), so avoiding a filler never buys a stacked
  // tray's reach, and over every cohesion preference (15 000, 10 000) and `setup`, so none of
  // them buys a filler. Count, not volume: one large filler beats two small ones of the same
  // volume by the whole of it. Measured flat between 10 000 and 29 000 (spec §6.2), so the value
  // is set by those neighbours, not by the search. Spec §6 lever 3, a reward for fillers against
  // the box wall, was measured and dropped: it raised the filler count (spec §6.2).
  fillers: 20_000,
};

export const OVERFLOW_WEIGHT = 1_000_000_000;

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
  // Per requirement: the parts turned each way, and the stacks they stand in.
  const siblings = new Map<number, { turned: number; straight: number; stacks: Set<number> }>();
  for (const t of plan.trays) {
    const kin = siblings.get(t.item.req) ?? { turned: 0, straight: 0, stacks: new Set<number>() };
    siblings.set(t.item.req, kin);
    kin[t.item.rotated ? "turned" : "straight"]++;
    kin.stacks.add(t.stack);
    const usableW = Math.min(t.w, t.minW + t.capW);
    const usableD = Math.min(t.d, t.minD + t.capD);
    leftoverMm3 += volMm3(t.w, t.d, t.h) - volMm3(usableW, usableD, t.h);
    filamentMm3 += shell(ctx, t.w, t.d, t.h);
    const r = ctx.input.requirements[t.item.req];
    if (covers && t.top && r?.loose) {
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
  for (const kin of siblings.values()) {
    unturned += Math.min(kin.turned, kin.straight);
    apart += kin.stacks.size - 1;
  }
  for (const l of plan.leftovers) {
    leftoverMm3 += volMm3(l.w, l.d, l.h);
    filamentMm3 += l.solid ? volMm3(l.w, l.d, l.h) : shell(ctx, l.w, l.d, l.h);
  }
  const playExcess = (crossed: number): number =>
    Math.max(0, nominalPlayU(ctx.boxClearance, ctx.gap, crossed) - PLAY_LIMIT_U);
  const terms: ScoreTerms = {
    leftover: share(leftoverMm3, boxMm3),
    coverage,
    access,
    setup,
    play: playExcess(plan.crossX) + playExcess(plan.crossY),
    stacked,
    trays: plan.trays.length + plan.leftovers.length,
    filament: share(filamentMm3, boxMm3),
    moved,
    unturned,
    apart,
    fillers: plan.leftovers.length,
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
    terms.fillers * WEIGHTS.fillers;
  return { total, overflow, terms };
}
