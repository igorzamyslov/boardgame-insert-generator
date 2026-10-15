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
  for (const t of plan.trays) {
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
    terms.moved * WEIGHTS.moved;
  return { total, overflow, terms };
}
