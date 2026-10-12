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
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import { cut, cuts, itemsOf, leaf, leaves, nodeAt, type StackItem, type Tree } from "./tree";

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
