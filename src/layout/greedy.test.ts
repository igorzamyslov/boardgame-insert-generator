import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate, overflowTotal } from "./fill";
import { firstFittingVariant, greedyTree } from "./greedy";
import { noLocks, resolveLocks } from "./locks";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import { itemsOf, leaves } from "./tree";

describe("greedyTree", () => {
  const reqs = [
    boxReq("big", 140, 90, 20),
    boxReq("mid", 100, 90, 20),
    boxReq("small", 60, 50, 20),
    boxReq("tiny", 40, 30, 20),
  ];

  it("packs all parts without overflow when they fit side by side (both directions)", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    for (const along of ["x", "y"] as const) {
      const tree = greedyTree(ctx, noLocks(ctx), along);
      expect(itemsOf(tree.root)).toHaveLength(4);
      expect(overflowTotal(evaluate(ctx, tree).overflow)).toBe(0);
    }
  });

  it("stacks when the floor runs out but the height allows it", () => {
    const three = [reqs[0], reqs[2], reqs[3]].flatMap((r) => (r ? [r] : []));
    const ctx = createCtx(
      makeInput(three, { box: { innerWidth: 160, innerDepth: 100, innerHeight: 80 } }),
      fakeMeasure,
    );
    const tree = greedyTree(ctx, noLocks(ctx), "x");
    expect(leaves(tree.root).some((l) => l.leaf.stack.length > 1)).toBe(true);
    expect(overflowTotal(evaluate(ctx, tree).overflow)).toBe(0);
  });

  it("returns an empty leaf for no requirements", () => {
    const ctx = createCtx(makeInput([]), fakeMeasure);
    expect(greedyTree(ctx, noLocks(ctx), "x").root).toEqual({
      kind: "leaf",
      stack: [],
      frozen: false,
    });
  });

  it("leaves position-locked trays out and keeps stack-locked groups together", () => {
    const ctx = createCtx(makeInput(reqs), fakeMeasure);
    const { resolved } = resolveLocks(ctx, [
      { kind: "position", trayKey: "big:p0:0", path: "0", rotated: false },
      { kind: "stack", trayKeys: ["mid:p0:0", "tiny:p0:0"] },
    ]);
    const tree = greedyTree(ctx, resolved, "y");
    expect(
      itemsOf(tree.root)
        .map((i) => i.req)
        .sort(),
    ).toEqual([1, 2, 3]);
    const frozen = leaves(tree.root).filter((l) => l.leaf.frozen);
    expect(frozen.map((l) => l.leaf.stack.map((i) => i.req))).toEqual([[1, 3]]);
  });

  it("starts from the first variant that fits the box height, bed and floor", () => {
    const upright = req("cards", [
      variant("upright", [part("cards:p0:0", [comp({ minW: 30, minD: 90, minH: 70 })])]),
      variant("flat", [part("cards:p0:0", [comp({ minW: 90, minD: 65, minH: 30 })])]),
    ]);
    const ctx = createCtx(makeInput([upright], { box: { innerHeight: 50 } }), fakeMeasure);
    expect(firstFittingVariant(ctx, 0)).toBe(1);
    expect(greedyTree(ctx, noLocks(ctx), "x").variants).toEqual([1]);
    const none = createCtx(makeInput([upright], { box: { innerHeight: 20 } }), fakeMeasure);
    expect(firstFittingVariant(none, 0)).toBe(0);
  });
});
