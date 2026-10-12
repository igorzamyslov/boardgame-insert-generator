import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCtx, MAX_LEVELS } from "./context";
import {
  changeVariant,
  flipCut,
  insertItem,
  mergeStacks,
  moveCut,
  MOVES,
  pickMove,
  removeItems,
  reorderStack,
  rotateItem,
  splitStack,
  swapLeaves,
  type MoveEnv,
} from "./moves";
import { createRng } from "./prng";
import { fitsBed } from "./bed";
import type { Ctx } from "./context";
import { stackLevels, stackMinFootprint } from "./stack";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import {
  cut,
  cuts,
  itemsOf,
  leaf,
  leaves,
  nodeAt,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";

/** Independent oracle: a stack whose minimum bottom footprint fits the bed. */
function printable(ctx: Ctx, stack: Parameters<typeof stackLevels>[1]): boolean {
  const f = stackMinFootprint(ctx, stackLevels(ctx, stack));
  return fitsBed(ctx.bed, f.w, f.d, 0);
}

const reqs = [
  boxReq("a", 60, 40, 10),
  boxReq("b", 50, 40, 10),
  req("c", [
    variant("one", [
      part("c:p0:0", [
        comp({ minW: 40, minD: 40, minH: 10 }),
        comp({ minW: 40, minD: 40, minH: 10 }),
      ]),
    ]),
    variant("two", [
      part("c:p0:0", [comp({ minW: 40, minD: 40, minH: 10 })]),
      part("c:p0:1", [comp({ minW: 40, minD: 40, minH: 10 })]),
    ]),
  ]),
  boxReq("d", 30, 30, 10, { rotatable: false }),
];
const ctx = createCtx(makeInput(reqs), fakeMeasure);
const at = (r: number, v = 0, p = 0): StackItem => ({
  req: r,
  variant: v,
  part: p,
  rotated: false,
});

const start: Tree = {
  root: cut("x", leaf([at(0), at(1)]), cut("y", leaf([at(2)]), leaf([at(3)]))),
  variants: [0, 0, 0, 0],
};

function env(
  lockedPaths: string[] = [],
  pinned: boolean[] = [false, false, false, false],
): MoveEnv {
  return { ctx, lockedPaths, variantPinned: pinned, rotationFixed: new Set() };
}

/** Every part of every active variant appears exactly once; nothing else does. */
function expectComplete(tree: Tree): void {
  const want = reqs
    .flatMap((r, i) =>
      (r.variants[tree.variants[i] ?? 0]?.parts ?? []).map(
        (_, p) => `${i}.${tree.variants[i]}.${p}`,
      ),
    )
    .sort();
  const got = itemsOf(tree.root)
    .map((it) => `${it.req}.${it.variant}.${it.part}`)
    .sort();
  expect(got).toEqual(want);
}

describe("moves", () => {
  it("swaps two leaves", () => {
    const t = swapLeaves(start, env(), createRng(1));
    expect(t).not.toBeNull();
    if (t) {
      expectComplete(t);
      expect(leaves(t.root).map((l) => l.leaf.stack.length)).not.toEqual([2, 1, 1]);
    }
  });

  it("flips a cut axis and moves a cut share", () => {
    const f = flipCut(start, env(), createRng(2));
    expect(f).not.toBeNull();
    expect(f && cuts(f.root).map((c) => c.cut.axis)).not.toEqual(["x", "y"]);
    const m = moveCut(start, env(), createRng(3));
    expect(m).not.toBeNull();
    expect(m && cuts(m.root).map((c) => c.cut.share)).not.toEqual(
      cuts(start.root).map((c) => c.cut.share),
    );
  });

  it("changes a variant, replacing all its parts", () => {
    const t = changeVariant(start, env(), createRng(4));
    expect(t?.variants[2]).toBe(1);
    if (t) {
      expectComplete(t);
    }
    expect(changeVariant(start, env([], [false, false, true, false]), createRng(4))).toBeNull();
  });

  it("rotates only rotatable, unlocked items", () => {
    for (let s = 0; s < 20; s++) {
      const t = rotateItem(start, env(), createRng(s));
      const rotated = t ? itemsOf(t.root).filter((i) => i.rotated) : [];
      expect(rotated.length).toBe(1);
      expect(rotated[0]?.req).not.toBe(3);
    }
  });

  it("reorders, merges and splits stacks", () => {
    const r = reorderStack(start, env(), createRng(5));
    expect(r && (nodeAt(r.root, "0")?.kind === "leaf" ? nodeAt(r.root, "0") : null)).toMatchObject({
      stack: [at(1), at(0)],
    });
    const m = mergeStacks(start, env(), createRng(6));
    expect(m && leaves(m.root).length).toBe(2);
    const s = splitStack(start, env(), createRng(7));
    expect(s && leaves(s.root).length).toBe(4);
  });

  it("removes items and collapses emptied leaves", () => {
    const root = removeItems(start.root, (i) => i.req === 2, env());
    expect(leaves(root).map((l) => l.path)).toEqual(["0", "1"]);
    const kept = removeItems(start.root, (i) => i.req === 2, env(["11"]));
    expect(leaves(kept).map((l) => `${l.path}:${l.leaf.stack.length}`)).toEqual([
      "0:2",
      "10:0",
      "11:1",
    ]);
  });

  it("never inserts into a locked leaf", () => {
    const locked: Tree = {
      root: cut("x", leaf([at(0)], true), leaf([at(1)])),
      variants: [0, 0, 0, 0],
    };
    for (let s = 0; s < 30; s++) {
      const root = insertItem(locked.root, at(3), env(["0"]), createRng(s));
      expect(root && nodeAt(root, "0")).toEqual(leaf([at(0)], true));
    }
  });

  it("is pure and deterministic for a given rng seed", () => {
    for (const { move } of MOVES) {
      const before = JSON.stringify(start);
      const a = move(start, env(), createRng(9));
      const b = move(start, env(), createRng(9));
      expect(JSON.stringify(start)).toBe(before);
      expect(a).toEqual(b);
    }
  });

  it("keeps every invariant over long random move sequences, locks included", () => {
    const lockedLeaf = leaf([at(0)], true);
    const locked: Tree = {
      root: cut("x", lockedLeaf, cut("y", leaf([at(1), at(2)]), leaf([at(3)]))),
      variants: [0, 0, 0, 0],
    };
    const e = env(["0"], [true, false, false, false]);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const rng = createRng(seed);
        let tree = locked;
        for (let i = 0; i < 150; i++) {
          tree = pickMove(rng)(tree, e, rng) ?? tree;
          expectComplete(tree);
          expect(nodeAt(tree.root, "0")).toBe(lockedLeaf);
          expect(tree.root.kind === "cut" && tree.root.axis).toBe("x");
          for (const l of leaves(tree.root)) {
            expect(l.leaf.stack.length).toBeLessThanOrEqual(MAX_LEVELS);
          }
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe("stacks the bed cannot print", () => {
  // fakeMeasure: outer = inner + 4 plain, + 6 lipped; usable bed 120 mm, lip inset 1.45 mm per
  // side and level. "wide" fits the bed plain (119 mm) but neither under a lip (121) nor on
  // top of a tray (119 + 2 × 1.45), so it can only stand alone.
  const topReqs = [boxReq("wide", 115, 40, 10), boxReq("n1", 40, 30, 10), boxReq("n2", 40, 30, 10)];
  const topCtx = createCtx(
    makeInput(topReqs, { printer: { bedX: 130, bedY: 130 }, box: { innerHeight: 100 } }),
    fakeMeasure,
  );
  const topEnv: MoveEnv = {
    ctx: topCtx,
    lockedPaths: [],
    variantPinned: [false, false, false],
    rotationFixed: new Set(),
  };
  const wide = at(0);
  const badStack = (t: Tree): boolean =>
    leaves(t.root).some((l) => !printable(topCtx, l.leaf.stack));
  const tree: Tree = {
    root: cut("x", leaf([wide]), cut("y", leaf([at(1)]), leaf([at(2)]))),
    variants: [0, 0, 0],
  };

  it("never lets any move build one", () => {
    expect(printable(topCtx, [at(1), wide])).toBe(false);
    expect(printable(topCtx, [wide, at(1)])).toBe(false);
    expect(printable(topCtx, [at(1), at(2)])).toBe(true);
    let cur: Tree = tree;
    let stacked = 0;
    for (let s = 0; s < 3000; s++) {
      const next = pickMove(createRng(s))(cur, topEnv, createRng(s * 7 + 1));
      if (next) {
        expect(badStack(next)).toBe(false);
        cur = next;
        stacked += leaves(cur.root).filter((l) => l.leaf.stack.length > 1).length;
      }
    }
    // the other trays do still stack
    expect(stacked).toBeGreaterThan(0);
  });

  it("reorder and merge refuse them", () => {
    const stackTree: Tree = {
      root: cut("x", leaf([at(1), at(2)]), leaf([wide])),
      variants: [0, 0, 0],
    };
    for (let s = 0; s < 50; s++) {
      const r = reorderStack(stackTree, topEnv, createRng(s));
      expect(r === null || !badStack(r)).toBe(true);
      const m = mergeStacks(stackTree, topEnv, createRng(s));
      expect(m === null || !badStack(m)).toBe(true);
    }
  });

  it("insertItem never puts an item on or under such a part", () => {
    const base: TreeNode = leaf([wide]);
    for (let s = 0; s < 100; s++) {
      const root = insertItem(base, at(1), topEnv, createRng(s));
      expect(root && badStack({ root, variants: [0, 0, 0] })).toBe(false);
    }
  });
});
