import { MAX_LEVELS, type Ctx } from "./context";
import type { Rng } from "./prng";
import { reservedOf, validAnchors } from "./reserve";
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
  /** partId → the rotation a turn lock gives that tray, wherever a move creates it. */
  readonly turns: ReadonlyMap<number, boolean>;
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

/** `item` may go on top of the stack at `l`: a free, unlocked stack with a level to spare. */
function canStackOn(env: MoveEnv, l: { path: string; leaf: Leaf }, item: StackItem): boolean {
  return (
    !l.leaf.frozen &&
    !isLockedLeaf(env, l.path) &&
    l.leaf.stack.length > 0 &&
    l.leaf.stack.length < MAX_LEVELS &&
    stackAllowed(env.ctx, [...l.leaf.stack, item])
  );
}

/** Puts one item into the tree: an empty leaf, on top of a free stack, or a new leaf. */
export function insertItem(
  root: TreeNode,
  item: StackItem,
  env: MoveEnv,
  rng: Rng,
): TreeNode | null {
  const stackable = leaves(root).filter((l) => canStackOn(env, l, item));
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
    const ref = { req: i, variant: next, part: p };
    // a turn lock decides the rotation; else a random one, if the part can rotate
    const rotated = env.turns.get(env.ctx.partId(ref)) ?? (rotatable && rng.nextInt(2) === 1);
    const item: StackItem = { ...ref, rotated };
    // One item's trays belong in one stack (score `apart`): mostly on top of the part before of
    // the same copy, where it can stand, so a new split is not scattered over the box and refused
    // for it. The copies of a per-player variant go anywhere.
    const before = { ...item, part: p - 1 };
    const home: { path: string; leaf: Leaf } | undefined =
      p === 0 || env.ctx.copyOf(before) !== env.ctx.copyOf(item)
        ? undefined
        : leaves(root).find((l) => l.leaf.stack.some((it) => it.req === i && it.part === p - 1));
    root =
      home !== undefined && canStackOn(env, home, item) && rng.nextInt(4) !== 0
        ? replaceAt(root, home.path, leaf([...home.leaf.stack, item]))
        : insertItem(root, item, env, rng);
  }
  if (root === null) {
    return null;
  }
  const variants = tree.variants.map((v, k) => (k === i ? next : v));
  return { ...tree, root, variants };
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

/**
 * Takes one tray out of a stack and puts it into another, at a random level. Stacks are only ever
 * rebuilt whole by the other moves (split + merge passes through a floor overflow of a whole extra
 * stack), so when the heights must come out exactly, one tray at a time has no cheap way to trade
 * places; this is that step. An emptied stack leaves the tree where no lock runs through it.
 */
export const moveItem: Move = (tree, env, rng) => {
  const free = leaves(tree.root).filter((l) => !l.leaf.frozen && !isLockedLeaf(env, l.path));
  const sources = free.filter((l) => l.leaf.stack.length > 0);
  if (sources.length === 0 || free.length < 2) {
    return null;
  }
  const from = rng.pick(sources);
  const targets = free.filter(
    (l) => l.path !== from.path && l.leaf.stack.length < MAX_LEVELS && l.leaf.stack.length > 0,
  );
  if (targets.length === 0) {
    return null;
  }
  const k = rng.nextInt(from.leaf.stack.length);
  const item = from.leaf.stack[k];
  if (!item) {
    return null;
  }
  const into = rng.pick(targets);
  const at = rng.nextInt(into.leaf.stack.length + 1);
  const grown = [...into.leaf.stack.slice(0, at), item, ...into.leaf.stack.slice(at)];
  if (!stackAllowed(env.ctx, grown)) {
    return null;
  }
  const rest = from.leaf.stack.filter((_, i) => i !== k);
  let root = replaceAt(tree.root, into.path, leaf(grown));
  if (rest.length > 0) {
    root = replaceAt(root, from.path, leaf(rest));
  } else if (canRemoveLeaf(env, from.path)) {
    const removed = removeLeafAt(root, from.path);
    if (removed === null) {
      return null;
    }
    root = removed;
  } else {
    root = replaceAt(root, from.path, leaf([]));
  }
  return { ...tree, root };
};

/** Exchanges one tray of a stack with one tray of another: trades heights between stacks. */
export const swapItems: Move = (tree, env, rng) => {
  const free = leaves(tree.root).filter(
    (l) => !l.leaf.frozen && !isLockedLeaf(env, l.path) && l.leaf.stack.length > 0,
  );
  if (free.length < 2) {
    return null;
  }
  const i = rng.nextInt(free.length);
  const j = (i + 1 + rng.nextInt(free.length - 1)) % free.length;
  const a = free[i];
  const b = free[j];
  if (!a || !b) {
    return null;
  }
  const ka = rng.nextInt(a.leaf.stack.length);
  const kb = rng.nextInt(b.leaf.stack.length);
  const ia = a.leaf.stack[ka];
  const ib = b.leaf.stack[kb];
  if (!ia || !ib) {
    return null;
  }
  const sa = a.leaf.stack.map((it, k) => (k === ka ? ib : it));
  const sb = b.leaf.stack.map((it, k) => (k === kb ? ia : it));
  if (!stackAllowed(env.ctx, sa) || !stackAllowed(env.ctx, sb)) {
    return null;
  }
  const root = replaceAt(replaceAt(tree.root, a.path, leaf(sa)), b.path, leaf(sb));
  return { ...tree, root };
};

/** Puts one kept-free area in another corner of the floor, or turns it (box with areas only). */
export const moveReserve: Move = (tree, env, rng) => {
  const ctx = env.ctx;
  if (ctx.areas.length === 0) {
    return null;
  }
  const k = rng.nextInt(ctx.areas.length);
  const placed = reservedOf(ctx, tree);
  const now = placed[k]?.anchor;
  const options = validAnchors(ctx, k).filter((n) => n !== now);
  if (options.length === 0) {
    return null;
  }
  const anchor = rng.pick(options);
  return { ...tree, reserve: placed.map((p, i) => (i === k ? anchor : p.anchor)) };
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
  { name: "moveItem", move: moveItem, weight: 4 },
  { name: "swapItems", move: swapItems, weight: 4 },
];

const TOTAL_WEIGHT = MOVES.reduce((s, m) => s + m.weight, 0);

/** The mix of a box with kept-free areas: the same moves and one more (so no other box's picks change). */
const AREA_MOVES: typeof MOVES = [...MOVES, { name: "moveReserve", move: moveReserve, weight: 8 }];
const AREA_TOTAL_WEIGHT = AREA_MOVES.reduce((s, m) => s + m.weight, 0);

export function pickMove(rng: Rng, env?: MoveEnv): Move {
  const withAreas = env !== undefined && env.ctx.areas.length > 0;
  const table = withAreas ? AREA_MOVES : MOVES;
  let r = rng.nextInt(withAreas ? AREA_TOTAL_WEIGHT : TOTAL_WEIGHT);
  for (const m of table) {
    if (r < m.weight) {
      return m.move;
    }
    r -= m.weight;
  }
  return swapLeaves;
}
