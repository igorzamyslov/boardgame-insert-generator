import { GEOMETRY_VERSION } from "../geometry/version";
import type { Notice, StoredLayout } from "../model/types";
import { createAnnealer, type Annealer, type Candidate } from "./anneal";
import { createCtx, withSizeLocks, type Ctx, type Measure } from "./context";
import { evaluate } from "./fill";
import { greedyTree, partitionTrees } from "./greedy";
import {
  applyLocks,
  conflictOf,
  dedupeConflicts,
  moveEnvOf,
  noLocks,
  resolveLocks,
  withTurns,
  trayNamer,
  type ResolvedLocks,
} from "./locks";
import { materialize, type Realize } from "./materialize";
import { createRng } from "./prng";
import { scorePlan, type PrevPos } from "./score";
import { summarize } from "./summarize";
import type { Tree } from "./tree";
import type { LayoutInput, LayoutResult, LockConflict } from "./types";
import { toMm } from "./units";
import { warmHints, warmTree, type WarmHints } from "./warmstart";
import {
  bedNotices,
  cappedNotice,
  doesNotFitNotice,
  layoutWarnings,
  overBedParts,
  type StopReason,
} from "./warnings";

/** Iterations per chunk between progress events, cancel checks and time-cap checks. */
export const CHUNK = 1000;
/** Safety stop (spec §7.2); a capped result is marked `capped`. */
export const DEFAULT_TIME_CAP_MS = 30_000;
/**
 * Default budget N (spec §7.2: ≈ 3 s on a mid-range laptop; "improve more" adds 3N).
 * Measured while writing plan 4 (Apple M-series, Node 26, stand-in sizing): 80 000 it/s on
 * cards-heavy (slowest), 120 000–350 000 on the others. A mid-range laptop is assumed
 * ≈ 3× slower (≈ 27 000 it/s), so 3 s ≈ 80 000; 50 000 leaves headroom for real sizing.
 * Recalibrate: CALIBRATE=1 npx vitest run src/layout/optimize.calibrate.test.ts --reporter=verbose
 */
export const DEFAULT_ITERATIONS = 50_000;

export interface RunOptions {
  warmStart?: StoredLayout;
  timeCapMs?: number;
  /** Clock for the time cap (default Date.now). */
  now?: () => number;
  /** Injection points for unit tests (default: sizing's minOuter / realizeTray). */
  measure?: Measure;
  realize?: Realize;
}

/** An optimization in progress; step() runs one chunk and returns true when finished. */
export interface Run {
  step(): boolean;
  /** Iterations run so far, over every chain. Only grows. */
  readonly done: number;
  /**
   * The iterations of every chain started, plus those of the chains that may still follow
   * while none has found a layout (derived seed, then unlocked): announced up front, so it
   * only ever shrinks, when a chain finds a layout and the rest are skipped. Together with
   * `done` growing, done / total never goes backwards.
   */
  readonly total: number;
  /** Best result so far (materialized; costs realizeTray calls). */
  snapshot(): LayoutResult;
  /** Final result; marks the run capped if called before it finished. */
  result(): LayoutResult;
}

interface Phase {
  readonly ctx: Ctx;
  readonly resolved: ResolvedLocks;
  readonly conflicts: LockConflict[];
  /** No start tree took the locks, so the search began from a tree that ignores them. */
  readonly startIgnoredLocks: boolean;
  readonly annealer: Annealer;
}

/** The seed of the one extra chain a run makes when the first one found nothing. */
function derivedSeed(seed: number): number {
  return (seed ^ 0x9e3779b9) >>> 0;
}

function overflowOf(phase: Phase): number {
  return phase.annealer.leastOverflow.score.overflow;
}

const NO_HINTS: WarmHints = {
  variantOf: () => undefined,
  rotatedOf: () => undefined,
  axisOf: () => undefined,
  levelOf: () => undefined,
  singleLeaf: false,
  prev: new Map<string, PrevPos>(),
};

function startPhase(
  input: LayoutInput,
  seed: number,
  iterations: number,
  opts: RunOptions,
  hints: WarmHints,
  useLocks: boolean,
): Phase {
  const base = createCtx(input, opts.measure);
  const { resolved, conflicts } = useLocks
    ? resolveLocks(base, input.locks, hints)
    : { resolved: noLocks(base), conflicts: [] };
  const ctx = withSizeLocks(base, resolved.sizes);
  const env = moveEnvOf(ctx, resolved);
  const rng = createRng(seed);
  const prev = opts.warmStart ? hints.prev : undefined;
  const evalTree = (tree: Tree): Candidate => {
    const plan = evaluate(ctx, tree);
    return { tree, plan, score: scorePlan(ctx, plan, prev) };
  };
  const starts: Tree[] = [];
  if (opts.warmStart) {
    const wt = warmTree(ctx, opts.warmStart.trays, resolved.pinnedVariant, hints, resolved.turns);
    if (wt) {
      starts.push(wt);
    }
  }
  starts.push(greedyTree(ctx, resolved, "x"), greedyTree(ctx, resolved, "y"));
  let best: Candidate | null = null;
  for (const s of starts) {
    const t = applyLocks(s, resolved, env, rng, hints.axisOf);
    if (t === null) {
      continue;
    }
    const c = evalTree(t);
    if (best === null || c.score.total < best.score.total) {
      best = c;
    }
  }
  // Greedy packing that still overflows may be a box with no slack in its heights: try trays dealt
  // over a few stacks to the same heights (the common case, a greedy start that fits, skips this).
  if (best === null || best.score.overflow > 0) {
    for (const s of partitionTrees(ctx, resolved)) {
      const t = applyLocks(s, resolved, env, rng, hints.axisOf);
      if (t === null) {
        continue;
      }
      const c = evalTree(t);
      if (best === null || c.score.total < best.score.total) {
        best = c;
      }
    }
  }
  // No start took the locks (no unlocked leaf was left to insert into): the plain greedy tree
  // stands in, with the turned trays still turned (the moves can't undo a turn lock).
  const startIgnoredLocks = best === null && resolved.kept.length > 0;
  const start =
    best ?? evalTree(withTurns(greedyTree(ctx, noLocks(ctx), "x"), ctx, resolved.turns));
  return {
    ctx,
    resolved,
    conflicts,
    startIgnoredLocks,
    annealer: createAnnealer(env, evalTree, start, rng, iterations),
  };
}

export function createRun(
  input: LayoutInput,
  seed: number,
  iterations: number,
  opts: RunOptions = {},
): Run {
  const now = opts.now ?? Date.now;
  const started = now();
  // A NaN cap is no cap given (the default applies); a negative one stops after the first chunk.
  const cap =
    opts.timeCapMs === undefined || Number.isNaN(opts.timeCapMs)
      ? DEFAULT_TIME_CAP_MS
      : Math.max(0, opts.timeCapMs);
  const hints = opts.warmStart
    ? warmHints(createCtx(input, opts.measure), opts.warmStart.trays)
    : NO_HINTS;
  const budget = Number.isFinite(iterations) ? Math.max(0, Math.floor(iterations)) : 0;
  // StoredLayout.iterations is cumulative: a warm start ("improve more", re-runs after an
  // edit) continues the stored search, so its count carries over (spec §7.2).
  const prior = opts.warmStart?.iterations ?? 0;
  const carried = Number.isFinite(prior) ? Math.max(0, Math.floor(prior)) : 0;
  // Chains run in order while none has found a feasible layout: the main chain; one more from
  // a derived seed (a seed can trap the search in a dead end that another escapes, and a
  // bigger budget does not help); then, when locks were kept, one without them.
  const main = startPhase(input, seed, budget, opts, hints, true);
  let derived: Phase | null = null;
  let fallback: Phase | null = null;
  // Pins the layout can't keep make the result unusable (the caller discards it), so such a run
  // reports them without searching.
  const skipped = main.conflicts.length > 0;
  let finished = skipped;
  let stop: StopReason | null = null;

  const chains = (): Phase[] => [main, derived, fallback].filter((p) => p !== null);
  const feasible = (): Phase | undefined => chains().find((p) => p.annealer.bestFeasible !== null);

  const build = (): LayoutResult => {
    const phase = feasible();
    if (skipped) {
      return {
        layout: null,
        bestAttempt: null,
        summary: null,
        notices: [],
        lockConflicts: main.conflicts,
      };
    }
    const notices: Notice[] = [];
    // Pins the layout had to ignore: never dropped, reported for the caller to refuse the layout.
    const lockConflicts: LockConflict[] = [...main.conflicts];
    if (phase !== undefined && phase === fallback) {
      for (const lock of main.resolved.kept) {
        lockConflicts.push(
          conflictOf(lock, "the pins together leave no layout that fits", trayNamer(phase.ctx)),
        );
      }
    } else if (phase?.startIgnoredLocks) {
      // The search began from a tree without the pins (no free place was left for the other
      // trays), so the layout it found need not keep them.
      for (const lock of phase.resolved.kept) {
        lockConflicts.push(
          conflictOf(
            lock,
            "the pins leave no free place for the other trays",
            trayNamer(phase.ctx),
          ),
        );
      }
    }
    const best = phase?.annealer.bestFeasible;
    const capped = stop !== null;
    if (phase !== undefined && best) {
      notices.push(...bedNotices(phase.ctx));
      const trays = materialize(phase.ctx, best.plan, opts.realize);
      const summary = summarize(trays, input);
      notices.push(...layoutWarnings(phase.ctx, trays, summary));
      if (stop) {
        notices.push(cappedNotice(stop));
      }
      return {
        layout: {
          createdWith: input.appVersion,
          geometryVersion: GEOMETRY_VERSION,
          inputsHash: input.inputsHash,
          seed,
          // the iterations the producing chain ran (all of its budget unless it was stopped)
          iterations: carried + phase.annealer.done,
          capped,
          trays,
        },
        bestAttempt: null,
        summary,
        notices,
        lockConflicts: dedupeConflicts(lockConflicts),
      };
    }
    // Nothing fits: report the least-overflow attempt of the chains that keep the locks (the
    // main chain, or the derived-seed one when it came closer; ties go to the main chain).
    // The unlocked chain may overflow less, but its trays would silently ignore locks the
    // notices still call kept.
    const closest = derived !== null && overflowOf(derived) < overflowOf(main) ? derived : main;
    const attempt = closest.annealer.leastOverflow;
    const sf = attempt.plan.shortfall;
    const shortfall = { x: toMm(sf.x), y: toMm(sf.y), z: toMm(sf.z) };
    const attemptTrays = materialize(closest.ctx, attempt.plan, opts.realize);
    const overBed = attempt.plan.overflow.bed > 0 ? overBedParts(closest.ctx, attemptTrays) : [];
    notices.push(...bedNotices(closest.ctx));
    const tried = chains().reduce((sum, c) => sum + c.annealer.done, 0);
    notices.push(doesNotFitNotice(closest.ctx, shortfall, overBed, tried));
    if (stop) {
      notices.push(cappedNotice(stop));
    }
    return {
      layout: null,
      bestAttempt: {
        trays: attemptTrays,
        shortfall,
        overBedKeys: overBed.filter((o) => !o.filler).map((o) => o.key),
      },
      summary: null,
      notices,
      lockConflicts: dedupeConflicts(lockConflicts),
    };
  };

  return {
    step() {
      if (finished) {
        return true;
      }
      const active = fallback ?? derived ?? main;
      active.annealer.step(CHUNK);
      if (active.annealer.done >= budget) {
        if (feasible() !== undefined) {
          finished = true;
        } else if (derived === null) {
          derived = startPhase(input, derivedSeed(seed), budget, opts, hints, true);
        } else if (fallback === null && main.resolved.kept.length > 0) {
          fallback = startPhase(input, seed, budget, opts, hints, false);
        } else {
          finished = true;
        }
      }
      if (!finished && now() - started >= cap) {
        stop = { reason: "time", limitMs: cap };
        finished = true;
      }
      return finished;
    },
    get done() {
      return chains().reduce((sum, p) => sum + p.annealer.done, 0);
    },
    get total() {
      if (skipped) {
        return 0;
      }
      const locked = main.resolved.kept.length > 0 ? 1 : 0;
      let ahead = 0;
      if (feasible() === undefined) {
        ahead = derived === null ? 1 + locked : fallback === null ? locked : 0;
      }
      return budget * (chains().length + ahead);
    },
    snapshot: build,
    result() {
      if (!finished) {
        stop = { reason: "cancel" };
        finished = true;
      }
      return build();
    },
  };
}

/**
 * Optimizes a layout (spec §7.2). `iterations` is this run's budget; the result's
 * StoredLayout.iterations adds `warmStart.iterations` (cumulative). Deterministic: same
 * input + warm start + seed + iterations on the same JS engine → deep-equal result, unless
 * the time cap stopped it.
 */
export function optimize(
  input: LayoutInput,
  seed: number,
  iterations: number,
  opts?: {
    warmStart?: StoredLayout;
    onProgress?: (done: number, best: LayoutResult) => void;
    timeCapMs?: number;
    shouldCancel?: () => boolean;
  },
): LayoutResult {
  const run = createRun(input, seed, iterations, {
    warmStart: opts?.warmStart,
    timeCapMs: opts?.timeCapMs,
  });
  for (;;) {
    const finished = run.step();
    if (opts?.onProgress) {
      opts.onProgress(run.done, run.snapshot());
    }
    if (finished || opts?.shouldCancel?.() === true) {
      break;
    }
  }
  return run.result();
}
