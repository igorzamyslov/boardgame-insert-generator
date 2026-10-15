import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate, overflowTotal } from "./fill";
import { firstFittingVariant, greedyTree, partitionTrees } from "./greedy";
import { noLocks, resolveLocks } from "./locks";
import { fitsBed } from "./bed";
import type { Ctx } from "./context";
import { stackLevels, stackMinFootprint } from "./stack";
import { fixtureInput } from "./test-fixtures";
import { scorePlan } from "./score";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import { itemsOf, leaves } from "./tree";

/** Independent oracle: a stack whose minimum bottom footprint fits the bed. */
function printable(ctx: Ctx, stack: Parameters<typeof stackLevels>[1]): boolean {
  const f = stackMinFootprint(ctx, stackLevels(ctx, stack));
  return fitsBed(ctx.bed, f.w, f.d, 0);
}

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

  it("never builds a stack the bed cannot print", () => {
    // wide: 119 mm plain (fits the 120 mm bed), 121 mm under a lip. The floor leaves no room
    // beside it, so the small tray is stacked somewhere; it must not go onto wide.
    const two = [boxReq("wide", 115, 40, 10), boxReq("small", 30, 20, 10)];
    const ctx = createCtx(
      makeInput(two, {
        printer: { bedX: 130, bedY: 130 },
        box: { innerWidth: 125, innerDepth: 60, innerHeight: 80 },
      }),
      fakeMeasure,
    );
    for (const along of ["x", "y"] as const) {
      const tree = greedyTree(ctx, noLocks(ctx), along);
      for (const l of leaves(tree.root)) {
        expect(printable(ctx, l.leaf.stack)).toBe(true);
      }
    }
  });
});

describe("partitionTrees", () => {
  it("holds every part once, in stacks side by side, and none for a single tray", () => {
    const four = [
      boxReq("a", 80, 80, 30),
      boxReq("b", 80, 80, 20),
      boxReq("c", 80, 80, 20),
      boxReq("d", 80, 80, 10),
    ];
    const ctx = createCtx(
      makeInput(four, { box: { innerWidth: 90, innerDepth: 170, innerHeight: 100 } }),
      fakeMeasure,
    );
    const trees = partitionTrees(ctx, noLocks(ctx));
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) {
      expect(
        itemsOf(t.root)
          .map((i) => i.req)
          .sort(),
      ).toEqual([0, 1, 2, 3]);
    }
    const one = createCtx(makeInput([boxReq("a", 80, 80, 30)]), fakeMeasure);
    expect(partitionTrees(one, noLocks(one))).toEqual([]);
  });

  it("starts a tight box closer to a fit than first-fit packing does", () => {
    const ctx = createCtx(fixtureInput("tight-minis"));
    const overflow = (t: Parameters<typeof evaluate>[1]): number =>
      scorePlan(ctx, evaluate(ctx, t)).overflow;
    const greedy = Math.min(
      ...(["x", "y"] as const).map((a) => overflow(greedyTree(ctx, noLocks(ctx), a))),
    );
    const partition = Math.min(...partitionTrees(ctx, noLocks(ctx)).map(overflow));
    expect(greedy).toBeGreaterThan(0);
    expect(partition).toBeLessThan(greedy);
  });

  it("keeps stack-locked groups in a leaf of their own", () => {
    const four = [
      boxReq("a", 80, 80, 30),
      boxReq("b", 80, 80, 20),
      boxReq("c", 80, 80, 20),
      boxReq("d", 80, 80, 10),
    ];
    const ctx = createCtx(
      makeInput(four, { box: { innerWidth: 90, innerDepth: 170, innerHeight: 100 } }),
      fakeMeasure,
    );
    const { resolved } = resolveLocks(ctx, [{ kind: "stack", trayKeys: ["b:p0:0", "c:p0:0"] }]);
    for (const t of partitionTrees(ctx, resolved)) {
      const group = leaves(t.root).filter((l) => l.leaf.frozen);
      expect(group.map((l) => l.leaf.stack.map((i) => i.req))).toEqual([[1, 2]]);
    }
  });
});
