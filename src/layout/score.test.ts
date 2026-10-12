import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { OVERFLOW_WEIGHT, scorePlan, WEIGHTS, type PrevPos } from "./score";
import { boxReq, fakeMeasure, item, makeInput } from "./test-utils";
import { cut, leaf, type Tree } from "./tree";

describe("score", () => {
  it("orders the unit steps of the terms as in spec §7.2", () => {
    const steps = [
      1000 * WEIGHTS.leftover,
      WEIGHTS.coverage,
      WEIGHTS.access,
      20 * WEIGHTS.play,
      WEIGHTS.stacked,
      WEIGHTS.trays,
      1000 * WEIGHTS.filament,
      WEIGHTS.moved,
    ];
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1] ?? 0);
    }
    for (const w of Object.values(WEIGHTS)) {
      expect(Number.isInteger(w)).toBe(true);
    }
  });

  it("makes 0.01 mm of overflow cost more than any feasible score", () => {
    const maxFeasible =
      100_000 * WEIGHTS.leftover +
      200 * (WEIGHTS.coverage + WEIGHTS.access + WEIGHTS.stacked + WEIGHTS.trays + WEIGHTS.moved) +
      20_000 * WEIGHTS.play +
      100_000 * WEIGHTS.filament;
    expect(OVERFLOW_WEIGHT).toBeGreaterThan(maxFeasible);
  });

  const reqs = [
    boxReq("a", 140, 90, 20, { loose: true }),
    boxReq("b", 140, 90, 20, { access: "often" }),
  ];

  it("penalizes leftover volume", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const side: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const s = scorePlan(ctx, evaluate(ctx, side));
    expect(s.overflow).toBe(0);
    expect(s.terms.leftover).toBeGreaterThan(0);
    const roomy = createCtx(makeInput(reqs, { box: { innerDepth: 290 } }), fakeMeasure);
    expect(scorePlan(roomy, evaluate(roomy, side)).terms.leftover).toBeGreaterThan(
      s.terms.leftover,
    );
  });

  it("applies the coverage penalty only with partial coverage or a box stored on its side", () => {
    const tree: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const full = createCtx(makeInput(reqs, { box: { headroom: 5 } }), fakeMeasure);
    expect(scorePlan(full, evaluate(full, tree)).terms.coverage).toBe(0);
    const partial = createCtx(
      makeInput(reqs, { box: { headroom: 5, headroomCoverage: "partial" } }),
      fakeMeasure,
    );
    expect(scorePlan(partial, evaluate(partial, tree)).terms.coverage).toBe(1);
    const side = createCtx(makeInput(reqs, { box: { storedOnSide: true } }), fakeMeasure);
    expect(scorePlan(side, evaluate(side, tree)).terms.coverage).toBe(1);
  });

  it("penalizes often-used trays under other trays and counts stacked trays", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const buried: Tree = { root: leaf([item(1), item(0)]), variants: [0, 0] };
    const s = scorePlan(ctx, evaluate(ctx, buried));
    expect(s.terms.access).toBe(1);
    expect(s.terms.stacked).toBe(1);
    const onTop: Tree = { root: leaf([item(0), item(1)]), variants: [0, 0] };
    expect(scorePlan(ctx, evaluate(ctx, onTop)).terms.access).toBe(0);
  });

  it("counts trays moved relative to a warm start", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const tree: Tree = { root: cut("x", leaf([item(0)]), leaf([item(1)])), variants: [0, 0] };
    const plan = evaluate(ctx, tree);
    const prev = new Map<string, PrevPos>(
      plan.trays.map((t) => [
        `${t.item.req === 0 ? "a" : "b"}:p0:0`,
        { x: t.x, y: t.y, level: t.level },
      ]),
    );
    expect(scorePlan(ctx, plan, prev).terms.moved).toBe(0);
    prev.set("a:p0:0", { x: 1, y: 0, level: 0 });
    expect(scorePlan(ctx, plan, prev).terms.moved).toBe(1);
  });

  it("penalizes nominal play above 1.5 mm", () => {
    const many = Array.from({ length: 8 }, (_, i) => boxReq(`r${i}`, 20, 20, 10));
    const ctx = createCtx(makeInput(many), fakeMeasure);
    let root = leaf([item(7)]) as Tree["root"];
    for (let i = 6; i >= 0; i--) {
      root = cut("x", leaf([item(i)]), root);
    }
    const s = scorePlan(ctx, evaluate(ctx, { root, variants: many.map(() => 0) }));
    expect(s.terms.play).toBeGreaterThan(0);
  });
});
