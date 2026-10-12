import { describe, expect, it } from "vitest";
import { createAnnealer, temperature, T_END, T_START, type Candidate } from "./anneal";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { greedyTree } from "./greedy";
import { moveEnvOf, noLocks } from "./locks";
import { createRng } from "./prng";
import { scorePlan } from "./score";
import { boxReq, fakeMeasure, makeInput } from "./test-utils";
import type { Tree } from "./tree";

const reqs = [
  boxReq("a", 120, 80, 20),
  boxReq("b", 90, 80, 20),
  boxReq("c", 60, 40, 15, { elastic: { w: true, d: true, h: true } }),
  boxReq("d", 70, 50, 25),
  boxReq("e", 40, 40, 10),
];
const ctx = createCtx(makeInput(reqs), fakeMeasure);
const env = moveEnvOf(ctx, noLocks(ctx));
const evalTree = (tree: Tree): Candidate => {
  const plan = evaluate(ctx, tree);
  return { tree, plan, score: scorePlan(ctx, plan) };
};

function run(seed: number, total: number, chunk: number): Candidate {
  const start = evalTree(greedyTree(ctx, noLocks(ctx), "x"));
  const a = createAnnealer(env, evalTree, start, createRng(seed), total);
  while (a.done < total) {
    a.step(chunk);
  }
  return a.bestFeasible ?? a.leastOverflow;
}

describe("annealer", () => {
  it("cools geometrically from T_START to T_END", () => {
    expect(temperature(0, 100)).toBe(T_START);
    expect(temperature(100, 100)).toBeCloseTo(T_END, 6);
    expect(temperature(50, 100)).toBeCloseTo(Math.sqrt(T_START * T_END), 6);
  });

  it("never returns worse than its start and tracks the best feasible layout", () => {
    const start = evalTree(greedyTree(ctx, noLocks(ctx), "x"));
    const best = run(1, 2000, 1000);
    expect(best.score.overflow).toBe(0);
    expect(best.score.total).toBeLessThanOrEqual(start.score.total);
  });

  it("is deterministic and independent of chunk size", () => {
    const a = run(7, 1500, 1000);
    const b = run(7, 1500, 1000);
    const c = run(7, 1500, 37);
    expect(b.tree).toEqual(a.tree);
    expect(c.tree).toEqual(a.tree);
    expect(c.score).toEqual(a.score);
  });

  it("stops at the total", () => {
    const start = evalTree(greedyTree(ctx, noLocks(ctx), "y"));
    const a = createAnnealer(env, evalTree, start, createRng(3), 10);
    a.step(1000);
    expect(a.done).toBe(10);
  });
});
