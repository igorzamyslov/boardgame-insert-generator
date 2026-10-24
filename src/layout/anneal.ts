import type { Plan } from "./fill";
import { pickMove, setsOf, turnSet, type MoveEnv } from "./moves";
import type { Rng } from "./prng";
import type { Score } from "./score";
import type { Tree } from "./tree";

export interface Candidate {
  readonly tree: Tree;
  readonly plan: Plan;
  readonly score: Score;
}

export interface Annealer {
  /** Runs up to n more iterations (never past the total). */
  step(n: number): void;
  readonly done: number;
  readonly current: Candidate;
  /** Lowest-score candidate with zero overflow, or null. */
  readonly bestFeasible: Candidate | null;
  /** Lowest overflow seen (ties: lower score). Reported when nothing is feasible. */
  readonly leastOverflow: Candidate;
}

/** Temperature in score points: starts at ≈ 1 % of the box as leftover, ends 1000× lower. */
export const T_START = 1_000_000;
export const T_END = 1_000;

export function temperature(done: number, total: number): number {
  const progress = total > 0 ? done / total : 1;
  return T_START * Math.pow(T_END / T_START, progress);
}

/**
 * Simulated annealing over guillotine trees. Deterministic: every random decision comes
 * from `rng`; score deltas are exact integers; Math.exp/Math.pow are the only floating
 * point steps (same engine → same result). Chunking (step sizes) never changes the result.
 */
export function createAnnealer(
  env: MoveEnv,
  evaluateTree: (tree: Tree) => Candidate,
  start: Candidate,
  rng: Rng,
  total: number,
): Annealer {
  let done = 0;
  let current = start;
  let bestFeasible: Candidate | null = start.score.overflow === 0 ? start : null;
  let leastOverflow = start;
  const consider = (c: Candidate): void => {
    if (
      c.score.overflow === 0 &&
      (bestFeasible === null || c.score.total < bestFeasible.score.total)
    ) {
      bestFeasible = c;
    }
    if (
      c.score.overflow < leastOverflow.score.overflow ||
      (c.score.overflow === leastOverflow.score.overflow &&
        c.score.total < leastOverflow.score.total)
    ) {
      leastOverflow = c;
    }
  };
  // The last pass (owner, 2026-10-24: "we add another spacer instead of making the existing one
  // thicker"): every set of alike trays turned the same way, either way round, kept when the plan
  // scores better. A copy turned alone leaves a sliver of room beside it that a spacer takes;
  // turned like the others it gathers in the one spacer at the row's end. The search finds this
  // too, but a tray in a stack of two or a row of three turns only with its whole set, so this
  // makes sure of it whatever the random moves did.
  let polished = false;
  const polish = (): void => {
    let best = bestFeasible;
    for (let pass = 0; best !== null && pass < 4; pass++) {
      let improved = false;
      for (const set of setsOf(best.tree.root, env.ctx)) {
        for (const target of [false, true]) {
          const next = turnSet(best.tree, env, set, !target, target);
          if (next === null) {
            continue;
          }
          const cand = evaluateTree(next);
          consider(cand);
          if (cand.score.overflow === 0 && cand.score.total < best.score.total) {
            best = cand;
            improved = true;
          }
        }
      }
      if (!improved) {
        break;
      }
    }
  };
  return {
    step(n) {
      const end = Math.min(total, done + n);
      while (done < end) {
        const t = temperature(done, total);
        done++;
        const move = pickMove(rng, env);
        const next = move(current.tree, env, rng);
        if (next === null) {
          continue;
        }
        const cand = evaluateTree(next);
        const delta = cand.score.total - current.score.total;
        if (delta <= 0 || rng.nextFloat() < Math.exp(-delta / t)) {
          current = cand;
          consider(cand);
        }
      }
      if (!polished && done >= total) {
        polished = true;
        polish();
      }
    },
    get done() {
      return done;
    },
    get current() {
      return current;
    },
    get bestFeasible() {
      return bestFeasible;
    },
    get leastOverflow() {
      return leastOverflow;
    },
  };
}
