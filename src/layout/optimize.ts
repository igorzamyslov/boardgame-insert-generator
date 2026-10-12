import { GEOMETRY_VERSION } from "../geometry/version";
import type { Notice, StoredLayout } from "../model/types";
import { createAnnealer, type Annealer, type Candidate } from "./anneal";
import { createCtx, withSizeLocks, type Ctx, type Measure } from "./context";
import { evaluate } from "./fill";
import { greedyTree } from "./greedy";
import {
  applyLocks,
  lockDroppedNotice,
  moveEnvOf,
  noLocks,
  resolveLocks,
  type ResolvedLocks,
} from "./locks";
import { materialize, type Realize } from "./materialize";
import { createRng } from "./prng";
import { scorePlan, type PrevPos } from "./score";
import { summarize } from "./summarize";
import type { Tree } from "./tree";
import type { LayoutInput, LayoutResult } from "./types";
import { toMm } from "./units";
import { warmHints, warmTree, type WarmHints } from "./warmstart";
import { bedNotices, cappedNotice, doesNotFitNotice, layoutWarnings } from "./warnings";

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
  readonly done: number;
  readonly total: number;
  /** Best result so far (materialized; costs realizeTray calls). */
  snapshot(): LayoutResult;
  /** Final result; marks the run capped if called before it finished. */
  result(): LayoutResult;
}

interface Phase {
  readonly ctx: Ctx;
  readonly resolved: ResolvedLocks;
  readonly notices: Notice[];
  readonly annealer: Annealer;
}

const NO_HINTS: WarmHints = {
  variantOf: () => undefined,
  rotatedOf: () => undefined,
  axisOf: () => undefined,
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
  const { resolved, notices } = useLocks
    ? resolveLocks(base, input.locks, hints)
    : { resolved: noLocks(base), notices: [] };
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
    const wt = warmTree(ctx, opts.warmStart.trays, resolved.pinnedVariant, hints);
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
  const start = best ?? evalTree(greedyTree(ctx, noLocks(ctx), "x"));
  return {
    ctx,
    resolved,
    notices,
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
  const cap = opts.timeCapMs ?? DEFAULT_TIME_CAP_MS;
  const hints = opts.warmStart
    ? warmHints(createCtx(input, opts.measure), opts.warmStart.trays)
    : NO_HINTS;
  const budget = Number.isFinite(iterations) ? Math.max(0, Math.floor(iterations)) : 0;
  // StoredLayout.iterations is cumulative: a warm start ("improve more", re-runs after an
  // edit) continues the stored search, so its count carries over (spec §7.2).
  const prior = opts.warmStart?.iterations ?? 0;
  const carried = Number.isFinite(prior) ? Math.max(0, Math.floor(prior)) : 0;
  const main = startPhase(input, seed, budget, opts, hints, true);
  let fallback: Phase | null = null;
  let finished = false;
  let capped = false;

  const build = (): LayoutResult => {
    const fb = fallback;
    const useFallback = fb !== null && fb.annealer.bestFeasible !== null;
    const phase = useFallback ? fb : main;
    const notices: Notice[] = [...main.notices];
    if (useFallback) {
      for (const lock of main.resolved.kept) {
        notices.push(
          lockDroppedNotice(
            lock,
            "no layout that keeps it fits in the box",
            input.locks.indexOf(lock),
          ),
        );
      }
    }
    notices.push(...bedNotices(phase.ctx));
    const best = phase.annealer.bestFeasible;
    const done = main.annealer.done + (fallback?.annealer.done ?? 0);
    if (best) {
      const trays = materialize(phase.ctx, best.plan, opts.realize);
      const summary = summarize(trays, input);
      notices.push(...layoutWarnings(phase.ctx, trays, summary));
      if (capped) {
        notices.push(cappedNotice());
      }
      return {
        layout: {
          createdWith: input.appVersion,
          geometryVersion: GEOMETRY_VERSION,
          inputsHash: input.inputsHash,
          seed,
          iterations: carried + (capped ? done : budget),
          capped,
          trays,
        },
        bestAttempt: null,
        summary,
        notices,
      };
    }
    const attempts = [main, ...(fallback ? [fallback] : [])].map((p) => ({
      p,
      c: p.annealer.leastOverflow,
    }));
    const least = attempts.reduce((a, b) => (b.c.score.overflow < a.c.score.overflow ? b : a));
    const sf = least.c.plan.shortfall;
    const shortfall = { x: toMm(sf.x), y: toMm(sf.y), z: toMm(sf.z) };
    notices.push(doesNotFitNotice(least.p.ctx, shortfall));
    if (capped) {
      notices.push(cappedNotice());
    }
    return {
      layout: null,
      bestAttempt: { trays: materialize(least.p.ctx, least.c.plan, opts.realize), shortfall },
      summary: null,
      notices,
    };
  };

  return {
    step() {
      if (finished) {
        return true;
      }
      const active = fallback ?? main;
      active.annealer.step(CHUNK);
      if (active.annealer.done >= budget) {
        const retry =
          fallback === null && main.annealer.bestFeasible === null && main.resolved.kept.length > 0;
        if (retry) {
          fallback = startPhase(input, seed, budget, opts, hints, false);
        } else {
          finished = true;
        }
      }
      if (!finished && now() - started >= cap) {
        capped = true;
        finished = true;
      }
      return finished;
    },
    get done() {
      return main.annealer.done + (fallback?.annealer.done ?? 0);
    },
    get total() {
      return fallback ? 2 * budget : budget;
    },
    snapshot: build,
    result() {
      if (!finished) {
        capped = true;
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
