import { describe, expect, it } from "vitest";
import { createCtx, type Ctx } from "./context";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { stackHeights, stackLevels } from "./stack";
import { boxReq, comp, fakeMeasure, item, makeInput, part, req, variant } from "./test-utils";

// The spare height of a stack is shared among the trays set to "As much as fits" (owner,
// 2026-10-24: "if components (even different ones) are stacked, and they have the option enabled,
// they should split the available space between them"), and the split parts of one item all carry
// the joint, so they stack in any order.

const bin = (key: string, growth?: { h: number }) =>
  boxReq(key, 50, 40, 10, { elastic: { h: true }, growth });
const rigid = (key: string) => boxReq(key, 50, 40, 10);

function ctxOf(reqs: ReturnType<typeof boxReq>[], innerHeight = 80): Ctx {
  return createCtx(makeInput(reqs, { box: { innerHeight } }), fakeMeasure);
}

/** How much taller each tray of the stack is than the least its place asks. */
function extras(ctx: Ctx, stack: number[]): number[] {
  const levels = stackLevels(
    ctx,
    stack.map((r) => item(r)),
  );
  const { h } = stackHeights(
    ctx,
    stackLevels(
      ctx,
      stack.map((r) => item(r)),
    ),
  );
  return levels.map((l, k) => (h[k] ?? 0) - l.minH);
}

describe("the spare height of a stack is shared among its trays set to As much as fits", () => {
  it("gives every one of them some, in whole layers, the same to within a layer", () => {
    const ctx = ctxOf([bin("a"), bin("b"), bin("c")]);
    const [a = 0, b = 0, c = 0] = extras(ctx, [0, 1, 2]);
    for (const e of [a, b, c]) {
      expect(e).toBeGreaterThan(0);
    }
    expect(Math.max(a, b, c) - Math.min(a, b, c)).toBeLessThanOrEqual(ctx.layer);
    // no bit of it lost: the stack still reaches the top plane
    const h = stackHeights(ctx, stackLevels(ctx, [item(0), item(1), item(2)]));
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane);
  });

  it("leaves a tray set to None where it was, and shares among the rest", () => {
    const ctx = ctxOf([bin("a"), rigid("n"), bin("b")]);
    const [a = 0, n = 0, b = 0] = extras(ctx, [0, 1, 2]);
    expect(n).toBe(0);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(ctx.layer);
  });

  it("keeps a tray set to Some to what it asked, and the others take what it does not", () => {
    const ctx = ctxOf([bin("some", { h: 2 }), bin("max-1"), bin("max-2")]);
    const [some = 0, m1 = 0, m2 = 0] = extras(ctx, [0, 1, 2]);
    expect(some).toBeLessThanOrEqual(200);
    expect(m1).toBeGreaterThan(some);
    expect(Math.abs(m1 - m2)).toBeLessThanOrEqual(ctx.layer);
  });

  it("shares the same way wherever the trays stand in the stack", () => {
    const ctx = ctxOf([bin("a"), rigid("n"), bin("b")]);
    for (const order of [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
    ]) {
      const e = extras(ctx, order);
      const grown = order.flatMap((r, k) => (r === 1 ? [] : [e[k] ?? 0]));
      expect(Math.abs((grown[0] ?? 0) - (grown[1] ?? 0)), order.join()).toBeLessThanOrEqual(
        ctx.layer,
      );
      expect(e[order.indexOf(1)], order.join()).toBe(0);
    }
  });

  it("puts the spare in the top tray as before when no tray asked for it", () => {
    const ctx = ctxOf([rigid("a"), rigid("b")]);
    const [a = 0, b = 0] = extras(ctx, [0, 1]);
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(0);
  });

  it("is a single tray's as before when only one asked", () => {
    const ctx = ctxOf([bin("a"), rigid("n")]);
    const [a = 0, n = 0] = extras(ctx, [0, 1]);
    expect(n).toBe(0);
    expect(a).toBeGreaterThan(0);
  });
});

describe("the split parts of one item stack in any order", () => {
  // one item split into three trays: one copy, parts 0 to 2
  const cell = comp({ minW: 50, minD: 40, minH: 10, contents: "c" });
  const split = req("split", [
    variant("v", [
      part("split:p0:0", [cell]),
      part("split:p0:1", [cell]),
      part("split:p0:2", [cell]),
    ]),
  ]);
  const other = boxReq("other", 50, 40, 10);
  const ctxAt = (innerHeight = 60): Ctx =>
    createCtx(makeInput([split, other], { box: { innerHeight } }), fakeMeasure);
  const piece = (i: number) => ({ req: 0, variant: 0, part: i, rotated: false });
  const o = item(1);

  it("carries the rim on every part of a stack, the top one too", () => {
    const ctx = ctxAt();
    const levels = stackLevels(ctx, [piece(0), piece(1), piece(2)]);
    expect(levels.map((l) => l.lipped)).toEqual([true, true, true]);
    // they are not copies: no set of alike trays, no sharing of the surplus
    expect(levels.map((l) => l.alike)).toEqual([-1, -1, -1]);
    expect(levels.map((l) => l.plug)).toEqual([false, false, false]);
  });

  it("does so wherever other trays stand among them, and for two of three", () => {
    const ctx = ctxAt();
    expect(stackLevels(ctx, [o, piece(2), piece(0)]).map((l) => l.lipped)).toEqual([
      true,
      true,
      true,
    ]);
    expect(stackLevels(ctx, [piece(1), o, piece(0)]).map((l) => l.lipped)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("builds a part alone with another item as any tray is: no rim on top", () => {
    const ctx = ctxAt();
    expect(stackLevels(ctx, [o, piece(1)]).map((l) => l.lipped)).toEqual([true, false]);
    expect(stackLevels(ctx, [piece(1), o]).map((l) => l.lipped)).toEqual([true, false]);
  });

  it("does not give different items the joint: the top tray of two items has no rim", () => {
    const ctx = ctxOf([rigid("a"), rigid("b")]);
    expect(stackLevels(ctx, [item(0), item(1)]).map((l) => l.lipped)).toEqual([true, false]);
  });

  it("keeps the rim while the stack can afford it, so the top part stands lower by its height", () => {
    const ctx = ctxAt(60);
    const h = stackHeights(ctx, stackLevels(ctx, [piece(0), piece(1), piece(2)]));
    expect(h).toMatchObject({ overflow: 0, rim: true });
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane - ctx.lipHeight);
  });

  it("drops the rim, with the stack still at the top plane, when it cannot afford it", () => {
    // three 11.2 mm trays are 33.6 mm: 34 mm leaves 0.4 mm, under the 2 mm rim
    const ctx = ctxAt(34);
    const h = stackHeights(ctx, stackLevels(ctx, [piece(0), piece(1), piece(2)]));
    expect(h).toMatchObject({ overflow: 0, rim: false });
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane);
  });
});

describe("trays side by side set to As much as fits share the spare footprint evenly", () => {
  const wide = (key: string, elastic = true) =>
    boxReq(key, 50, 40, 10, { elastic: elastic ? { w: true, d: true } : {} });
  const run = (reqs: ReturnType<typeof boxReq>[]) => {
    const input = makeInput(reqs, { box: { innerWidth: 200, innerDepth: 70, innerHeight: 20 } });
    const result = optimize(input, 1, DEFAULT_ITERATIONS);
    return result.layout?.trays.filter((t) => t.part === "tray") ?? [];
  };

  it(
    "makes three trays of a row the same width, to within a hundredth or two",
    { timeout: 30_000 },
    () => {
      const trays = run([wide("a"), wide("b"), wide("c")]);
      expect(trays).toHaveLength(3);
      const widths = trays.map((t) => t.w);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(0.03);
      // and they took the room: no spacer left between or beside them
      expect(widths.reduce((s, w) => s + w, 0)).toBeGreaterThan(190);
    },
  );

  it(
    "leaves a tray set to None its own size, and shares among the others",
    { timeout: 30_000 },
    () => {
      const trays = run([wide("a"), wide("n", false), wide("c")]);
      const by = (key: string) => trays.find((t) => t.key.startsWith(`${key}:`));
      expect(by("n")?.w).toBeLessThan(by("a")?.w ?? 0);
      expect(Math.abs((by("a")?.w ?? 0) - (by("c")?.w ?? 0))).toBeLessThanOrEqual(0.03);
    },
  );
});
