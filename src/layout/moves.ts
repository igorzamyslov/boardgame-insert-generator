import { MAX_LEVELS, type Ctx } from "./context";
import type { Rng } from "./prng";
import { stackAllowed } from "./stack";
import {
  cut,
  cuts,
  leaf,
  leaves,
  otherAxis,
  removeLeafAt,
  replaceAt,
  SHARE_MAX,
  splitLeafAt,
  type Axis,
  type Leaf,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";

/** What moves may touch. Built from the resolved locks (locks.ts). */
export interface MoveEnv {
  readonly ctx: Ctx;
  /** Leaf paths fixed by position locks. Their routes from the root are fixed too. */
  readonly lockedPaths: readonly string[];
  /** Per requirement: its variant is pinned by a lock. */
  readonly variantPinned: readonly boolean[];
  /** partIds whose rotation is fixed by a lock. */
  readonly rotationFixed: ReadonlySet<number>;
}

/** A move is a pure function of (tree, rng): a new tree, or null when it doesn't apply. */
export type Move = (tree: Tree, env: MoveEnv, rng: Rng) => Tree | null;

function isLockedLeaf(env: MoveEnv, path: string): boolean {
  return env.lockedPaths.includes(path);
}

/** A cut at `path` may change axis or collapse only if no locked path runs through it. */
function isFreeCut(env: MoveEnv, path: string): boolean {
  return !env.lockedPaths.some((lp) => lp.startsWith(path));
}

function canRemoveLeaf(env: MoveEnv, path: string): boolean {
  return path !== "" && isFreeCut(env, path.slice(0, -1));
}

function randomAxis(rng: Rng): Axis {
  return rng.nextInt(2) === 0 ? "x" : "y";
}

function canRotate(env: MoveEnv, item: StackItem): boolean {
  const p = env.ctx.part(item);
  return p !== undefined && p.rotatable && !env.rotationFixed.has(env.ctx.partId(item));
}

/**
 * Removes matching items. Leaves that become empty collapse into their sibling where no
 * locked path runs through the parent; elsewhere they stay as empty (leftover) leaves.
 */
export function removeItems(
  root: TreeNode,
  pred: (item: StackItem) => boolean,
  env: MoveEnv,
): TreeNode {
  const strip = (node: TreeNode, path: string): TreeNode | null => {
    if (node.kind === "leaf") {
      if (!node.stack.some(pred)) {
        return node;
      }
      const stack = node.stack.filter((i) => !pred(i));
      return stack.length === 0 ? null : leaf(stack, node.frozen);
    }
    const a = strip(node.a, `${path}0`);
    const b = strip(node.b, `${path}1`);
    if (a === node.a && b === node.b) {
      return node;
    }
    if (isFreeCut(env, path)) {
      if (a === null) {
        return b;
      }
      if (b === null) {
        return a;
      }
    }
    return { ...node, a: a ?? leaf([]), b: b ?? leaf([]) };
  };
  return strip(root, "") ?? leaf([]);
}

/** Puts a whole leaf into the tree: into an empty leaf or by splitting an unlocked leaf. */
export function insertLeaf(root: TreeNode, added: Leaf, env: MoveEnv, rng: Rng): TreeNode | null {
  const all = leaves(root);
  const empties = all.filter(
    (l) => l.leaf.stack.length === 0 && !l.leaf.frozen && !isLockedLeaf(env, l.path),
  );
  if (empties.length > 0 && rng.nextInt(2) === 0) {
    return replaceAt(root, rng.pick(empties).path, added);
  }
  const splittable = all.filter((l) => !isLockedLeaf(env, l.path));
  if (splittable.length === 0) {
    return null;
  }
  const target = rng.pick(splittable);
  return splitLeafAt(root, target.path, randomAxis(rng), added, rng.nextInt(2) === 0);
}

/** Puts one item into the tree: an empty leaf, on top of a free stack, or a new leaf. */
export function insertItem(
  root: TreeNode,
  item: StackItem,
  env: MoveEnv,
  rng: Rng,
): TreeNode | null {
  const stackable = leaves(root).filter(
    (l) =>
      !l.leaf.frozen &&
      !isLockedLeaf(env, l.path) &&
      l.leaf.stack.length > 0 &&
      l.leaf.stack.length < MAX_LEVELS &&
      stackAllowed(env.ctx, [...l.leaf.stack, item]),
  );
  if (stackable.length > 0 && rng.nextInt(4) === 0) {
    const s = rng.pick(stackable);
    return replaceAt(root, s.path, leaf([...s.leaf.stack, item]));
  }
  return insertLeaf(root, leaf([item]), env, rng);
}

export const swapLeaves: Move = (tree, env, rng) => {
  const free = leaves(tree.root).filter((l) => !isLockedLeaf(env, l.path));
  if (free.length < 2) {
    return null;
  }
  const i = rng.nextInt(free.length);
  const j = (i + 1 + rng.nextInt(free.length - 1)) % free.length;
  const a = free[i];
  const b = free[j];
  if (!a || !b || (a.leaf.stack.length === 0 && b.leaf.stack.length === 0)) {
    return null;
  }
  const root = replaceAt(replaceAt(tree.root, a.path, b.leaf), b.path, a.leaf);
  return { ...tree, root };
};

export const flipCut: Move = (tree, env, rng) => {
  const free = cuts(tree.root).filter((c) => isFreeCut(env, c.path));
  if (free.length === 0) {
    return null;
  }
  const c = rng.pick(free);
  return { ...tree, root: replaceAt(tree.root, c.path, { ...c.cut, axis: otherAxis(c.cut.axis) }) };
};

export const moveCut: Move = (tree, _env, rng) => {
  const all = cuts(tree.root);
  if (all.length === 0) {
    return null;
  }
  const c = rng.pick(all);
  let share: number;
  if (rng.nextInt(4) === 0) {
    share = rng.nextInt(SHARE_MAX + 1);
  } else {
    const delta = 1 + rng.nextInt(SHARE_MAX / 8);
    share = c.cut.share + (rng.nextInt(2) === 0 ? delta : -delta);
    share = Math.max(0, Math.min(SHARE_MAX, share));
  }
  if (share === c.cut.share) {
    return null;
  }
  return { ...tree, root: replaceAt(tree.root, c.path, { ...c.cut, share }) };
};

export const changeVariant: Move = (tree, env, rng) => {
  const reqs = env.ctx.input.requirements;
  const options = reqs
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => r.variants.length > 1 && !env.variantPinned[i]);
  if (options.length === 0) {
    return null;
  }
  const { r, i } = rng.pick(options);
  const current = tree.variants[i] ?? 0;
  const next = (current + 1 + rng.nextInt(r.variants.length - 1)) % r.variants.length;
  let root: TreeNode | null = removeItems(tree.root, (it) => it.req === i, env);
  const parts = r.variants[next]?.parts ?? [];
  for (let p = 0; p < parts.length && root !== null; p++) {
    const rotatable = parts[p]?.rotatable ?? false;
    const item: StackItem = {
      req: i,
      variant: next,
      part: p,
      rotated: rotatable && rng.nextInt(2) === 1,
    };
    root = insertItem(root, item, env, rng);
  }
  if (root === null) {
    return null;
  }
  const variants = tree.variants.map((v, k) => (k === i ? next : v));
  return { root, variants };
};

export const rotateItem: Move = (tree, env, rng) => {
  const options: { path: string; leaf: Leaf; k: number }[] = [];
  for (const l of leaves(tree.root)) {
    if (l.leaf.frozen) {
      continue;
    }
    l.leaf.stack.forEach((item, k) => {
      if (canRotate(env, item)) {
        options.push({ path: l.path, leaf: l.leaf, k });
      }
    });
  }
  if (options.length === 0) {
    return null;
  }
  const o = rng.pick(options);
  const stack = o.leaf.stack.map((item, k) =>
    k === o.k ? { ...item, rotated: !item.rotated } : item,
  );
  // a turned tray can outgrow the bed in a stack (the other trays' footprints stay as they are)
  if (!stackAllowed(env.ctx, stack)) {
    return null;
  }
  return { ...tree, root: replaceAt(tree.root, o.path, leaf(stack, o.leaf.frozen)) };
};

export const reorderStack: Move = (tree, env, rng) => {
  const options = leaves(tree.root).filter((l) => !l.leaf.frozen && l.leaf.stack.length >= 2);
  if (options.length === 0) {
    return null;
  }
  const o = rng.pick(options);
  const k = rng.nextInt(o.leaf.stack.length - 1);
  const stack = [...o.leaf.stack];
  const lower = stack[k];
  const upper = stack[k + 1];
  if (!lower || !upper) {
    return null;
  }
  stack[k] = upper;
  stack[k + 1] = lower;
  if (!stackAllowed(env.ctx, stack)) {
    return null;
  }
  return { ...tree, root: replaceAt(tree.root, o.path, leaf(stack)) };
};

export const mergeStacks: Move = (tree, env, rng) => {
  const all = leaves(tree.root).filter(
    (l) => !l.leaf.frozen && !isLockedLeaf(env, l.path) && l.leaf.stack.length > 0,
  );
  const removable = all.filter((l) => canRemoveLeaf(env, l.path));
  if (all.length < 2 || removable.length === 0) {
    return null;
  }
  const from = rng.pick(removable);
  const targets = all.filter(
    (l) => l.path !== from.path && l.leaf.stack.length + from.leaf.stack.length <= MAX_LEVELS,
  );
  if (targets.length === 0) {
    return null;
  }
  const into = rng.pick(targets);
  const stack =
    rng.nextInt(2) === 0
      ? [...into.leaf.stack, ...from.leaf.stack]
      : [...from.leaf.stack, ...into.leaf.stack];
  if (!stackAllowed(env.ctx, stack)) {
    return null;
  }
  const merged = replaceAt(tree.root, into.path, leaf(stack));
  const root = removeLeafAt(merged, from.path);
  return root === null ? null : { ...tree, root };
};

export const splitStack: Move = (tree, env, rng) => {
  const options = leaves(tree.root).filter(
    (l) => !l.leaf.frozen && !isLockedLeaf(env, l.path) && l.leaf.stack.length >= 2,
  );
  if (options.length === 0) {
    return null;
  }
  const o = rng.pick(options);
  const k = 1 + rng.nextInt(o.leaf.stack.length - 1);
  const bottom = leaf(o.leaf.stack.slice(0, k));
  const top = leaf(o.leaf.stack.slice(k));
  const node =
    rng.nextInt(2) === 0 ? cut(randomAxis(rng), bottom, top) : cut(randomAxis(rng), top, bottom);
  return { ...tree, root: replaceAt(tree.root, o.path, node) };
};

/** Move mix: integer weights, picked with rng.nextInt(total). */
export const MOVES: readonly {
  readonly name: string;
  readonly move: Move;
  readonly weight: number;
}[] = [
  { name: "swapLeaves", move: swapLeaves, weight: 20 },
  { name: "flipCut", move: flipCut, weight: 10 },
  { name: "moveCut", move: moveCut, weight: 30 },
  { name: "changeVariant", move: changeVariant, weight: 10 },
  { name: "rotateItem", move: rotateItem, weight: 10 },
  { name: "reorderStack", move: reorderStack, weight: 5 },
  { name: "mergeStacks", move: mergeStacks, weight: 7 },
  { name: "splitStack", move: splitStack, weight: 8 },
];

const TOTAL_WEIGHT = MOVES.reduce((s, m) => s + m.weight, 0);

export function pickMove(rng: Rng): Move {
  let r = rng.nextInt(TOTAL_WEIGHT);
  for (const m of MOVES) {
    if (r < m.weight) {
      return m.move;
    }
    r -= m.weight;
  }
  return swapLeaves;
}
