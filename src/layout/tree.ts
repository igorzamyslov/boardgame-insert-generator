import { mulDiv, type Ext, type Rect, type U } from "./units";

/**
 * Guillotine tree over the box floor. Nodes are immutable: every edit copies the nodes on
 * the path from the root and shares the rest (that is the "clone"). A cut with axis "x"
 * splits the X extent (children side by side along X, a on the low side); axis "y" splits Y.
 * Paths: "" is the root, then "0" for child a and "1" for child b per depth.
 * Cut positions are integers derived from the subtree minimums plus a share of the slack
 * (`share / SHARE_MAX` of it goes to child a), so a tree always tiles its rectangle exactly
 * and moving a cut means changing its share.
 */
export type Axis = "x" | "y";

export interface StackItem {
  readonly req: number;
  readonly variant: number;
  readonly part: number;
  readonly rotated: boolean;
}

export interface Leaf {
  readonly kind: "leaf";
  /**
   * Bottom → top, one tray per level. Empty = a leftover region. A level's fillers are not stored
   * here: `placeStack` derives them from the room the level has beside its tray, so a level is a
   * tray plus whatever filler that room leaves, and the tree, its moves and its locks stay one
   * tray per level.
   */
  readonly stack: readonly StackItem[];
  /** Membership and order are locked (stack or position lock); the leaf itself may move. */
  readonly frozen: boolean;
}

export interface Cut {
  readonly kind: "cut";
  readonly axis: Axis;
  readonly share: number;
  readonly a: TreeNode;
  readonly b: TreeNode;
}

export type TreeNode = Leaf | Cut;

export interface Tree {
  readonly root: TreeNode;
  /** Active variant index per requirement. */
  readonly variants: readonly number[];
  /**
   * Where each kept-free area lies (`Ctx.areas`, in order): an anchor, see reserve.ts. Absent: every
   * area at its first anchor. Only the search moves it, and only a box with areas has any.
   */
  readonly reserve?: readonly number[];
}

/** 2^20 > the largest slack in units (1000 mm = 100 000), so a share can hit any integer split. */
export const SHARE_MAX = 1 << 20;
export const SHARE_HALF = SHARE_MAX / 2;

export function leaf(stack: readonly StackItem[], frozen = false): Leaf {
  return { kind: "leaf", stack, frozen };
}

export function cut(axis: Axis, a: TreeNode, b: TreeNode, share = SHARE_HALF): Cut {
  return { kind: "cut", axis, share, a, b };
}

export function otherAxis(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

export function nodeAt(root: TreeNode, path: string): TreeNode | undefined {
  let node: TreeNode = root;
  for (const ch of path) {
    if (node.kind === "leaf") {
      return undefined;
    }
    node = ch === "0" ? node.a : node.b;
  }
  return node;
}

/** Returns a new root with the node at `path` replaced. Throws on a path that does not exist. */
export function replaceAt(root: TreeNode, path: string, node: TreeNode): TreeNode {
  if (path === "") {
    return node;
  }
  if (root.kind === "leaf") {
    throw new RangeError(`replaceAt: no node at path ${path}`);
  }
  const head = path.charAt(0);
  const rest = path.slice(1);
  return head === "0"
    ? { ...root, a: replaceAt(root.a, rest, node) }
    : { ...root, b: replaceAt(root.b, rest, node) };
}

export interface LeafAt {
  readonly path: string;
  readonly leaf: Leaf;
}

export interface CutAt {
  readonly path: string;
  readonly cut: Cut;
}

/** Leaves in order (a before b). */
export function leaves(root: TreeNode): LeafAt[] {
  const out: LeafAt[] = [];
  const walk = (node: TreeNode, path: string): void => {
    if (node.kind === "leaf") {
      out.push({ path, leaf: node });
      return;
    }
    walk(node.a, `${path}0`);
    walk(node.b, `${path}1`);
  };
  walk(root, "");
  return out;
}

export function cuts(root: TreeNode): CutAt[] {
  const out: CutAt[] = [];
  const walk = (node: TreeNode, path: string): void => {
    if (node.kind === "leaf") {
      return;
    }
    out.push({ path, cut: node });
    walk(node.a, `${path}0`);
    walk(node.b, `${path}1`);
  };
  walk(root, "");
  return out;
}

export function itemsOf(root: TreeNode): StackItem[] {
  return leaves(root).flatMap((l) => [...l.leaf.stack]);
}

/** Replaces the leaf at `path` by its sibling's subtree. Returns null for the root leaf. */
export function removeLeafAt(root: TreeNode, path: string): TreeNode | null {
  if (path === "") {
    return null;
  }
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(root, parentPath);
  if (!parent || parent.kind !== "cut") {
    throw new RangeError(`removeLeafAt: no leaf at path ${path}`);
  }
  const sibling = path.endsWith("0") ? parent.b : parent.a;
  return replaceAt(root, parentPath, sibling);
}

/** Splits the leaf at `path` into a cut holding the old leaf and `added` (added first when addedFirst). */
export function splitLeafAt(
  root: TreeNode,
  path: string,
  axis: Axis,
  added: Leaf,
  addedFirst: boolean,
): TreeNode {
  const old = nodeAt(root, path);
  if (!old || old.kind !== "leaf") {
    throw new RangeError(`splitLeafAt: no leaf at path ${path}`);
  }
  const node = addedFirst ? cut(axis, added, old) : cut(axis, old, added);
  return replaceAt(root, path, node);
}

const packed = new WeakMap<TreeNode, TreeNode>();

/**
 * The tree with the slack of every cut given where it is wanted, and nowhere else: to the cut's
 * second child, so the trays pack together toward the front and left and what is left over lies at
 * the end of the row, against the box wall, never between two trays (owner, 2026-10-23: a spacer in
 * the middle of a row splits it and makes the trays harder to take out). The shares the search
 * moved stay in the tree and decide nothing about where room goes.
 *
 * `grows` (the last step of planning, when trays may take room into their wells): whether a leaf's
 * tray grows along an axis. The slack of a cut then goes to the leaves that grow, each side in
 * proportion to how many it has along the cut, so a row of bins that each take room all grow alike
 * and the room is theirs, not a spacer's. A cut with nothing that grows packs to the wall as before.
 */
export function packedToWall(
  node: TreeNode,
  grows?: (leaf: Leaf, axis: Axis) => boolean,
): TreeNode {
  if (node.kind === "leaf") {
    return node;
  }
  if (grows === undefined) {
    const hit = packed.get(node);
    if (hit) {
      return hit;
    }
    const out = cut(node.axis, packedToWall(node.a), packedToWall(node.b), 0);
    packed.set(node, out);
    return out;
  }
  // How many leaves share the slack along `axis`: those of a cut along it add, a cut across it
  // gives its leaves the same slack, so the larger side counts.
  const count = (n: TreeNode, axis: Axis): number =>
    n.kind === "leaf"
      ? grows(n, axis)
        ? 1
        : 0
      : n.axis === axis
        ? count(n.a, axis) + count(n.b, axis)
        : Math.max(count(n.a, axis), count(n.b, axis));
  const ca = count(node.a, node.axis);
  const cb = count(node.b, node.axis);
  const share = ca + cb === 0 ? 0 : Math.round((ca / (ca + cb)) * SHARE_MAX);
  return cut(node.axis, packedToWall(node.a, grows), packedToWall(node.b, grows), share);
}

export interface PlacedLeaf {
  readonly path: string;
  readonly leaf: Leaf;
  readonly rect: Rect;
}

export interface Placement {
  readonly leaves: PlacedLeaf[];
  /** Minimum extent of the whole tree; larger than the floor = overflow. */
  readonly min: Ext;
}

/** Memoized minimum extent of every subtree: an X cut adds widths + gap, a Y cut depths + gap. */
export function minExtents(gap: U, leafMin: (leaf: Leaf) => Ext): (node: TreeNode) => Ext {
  const mins = new Map<TreeNode, Ext>();
  const minOf = (node: TreeNode): Ext => {
    const hit = mins.get(node);
    if (hit) {
      return hit;
    }
    let ext: Ext;
    if (node.kind === "leaf") {
      ext = leafMin(node);
    } else {
      const a = minOf(node.a);
      const b = minOf(node.b);
      ext =
        node.axis === "x"
          ? { w: a.w + gap + b.w, d: Math.max(a.d, b.d) }
          : { w: Math.max(a.w, b.w), d: a.d + gap + b.d };
    }
    mins.set(node, ext);
    return ext;
  };
  return minOf;
}

/**
 * Coordinates a cut is drawn to when it can reach one: the line where the second child of a cut
 * along that axis begins. A kept-free area's edge is one (reserve.ts): the stack that ends there is
 * the last one the area covers, and the trays beyond it do not.
 */
export interface Snap {
  readonly x: readonly U[];
  readonly y: readonly U[];
}

/** The first child's extent when a cut is drawn to a `snap` line it can reach, else `wanted`. */
function snapped(
  lines: readonly U[] | undefined,
  start: U,
  gap: U,
  min: U,
  slack: U,
  wanted: U,
): U {
  for (const line of lines ?? []) {
    const at = line - gap - start;
    if (at >= min && at <= min + slack) {
      return at;
    }
  }
  return wanted;
}

/** Child rectangles of a cut inside `r`, exactly as placeLeaves allocates them. */
export function splitRect(
  node: Cut,
  r: Rect,
  gap: U,
  minOf: (node: TreeNode) => Ext,
  snap?: Snap,
): [Rect, Rect] {
  const ma = minOf(node.a);
  const mb = minOf(node.b);
  if (node.axis === "x") {
    const slack = r.w - (ma.w + gap + mb.w);
    const own = ma.w + (slack > 0 ? mulDiv(slack, node.share, SHARE_MAX) : 0);
    const wa = slack > 0 ? snapped(snap?.x, r.x, gap, ma.w, slack, own) : own;
    const wb = slack >= 0 ? r.w - gap - wa : mb.w;
    return [
      { x: r.x, y: r.y, w: wa, d: Math.max(r.d, ma.d) },
      { x: r.x + wa + gap, y: r.y, w: wb, d: Math.max(r.d, mb.d) },
    ];
  }
  const slack = r.d - (ma.d + gap + mb.d);
  const own = ma.d + (slack > 0 ? mulDiv(slack, node.share, SHARE_MAX) : 0);
  const da = slack > 0 ? snapped(snap?.y, r.y, gap, ma.d, slack, own) : own;
  const db = slack >= 0 ? r.d - gap - da : mb.d;
  return [
    { x: r.x, y: r.y, w: Math.max(r.w, ma.w), d: da },
    { x: r.x, y: r.y + da + gap, w: Math.max(r.w, mb.w), d: db },
  ];
}

/**
 * Assigns every leaf a rectangle. Neighbouring leaves are separated by exactly `gap`;
 * along each cut, child extents + gap = parent extent whenever the parent's slack is ≥ 0.
 * With negative slack (overflow), children get their minimums and may extend past `rect`.
 */
export function placeLeaves(
  root: TreeNode,
  rect: Rect,
  gap: U,
  leafMin: (leaf: Leaf) => Ext,
  snap?: Snap,
): Placement {
  const minOf = minExtents(gap, leafMin);
  const out: PlacedLeaf[] = [];
  const allocate = (node: TreeNode, r: Rect, path: string): void => {
    if (node.kind === "leaf") {
      out.push({ path, leaf: node, rect: r });
      return;
    }
    const [ra, rb] = splitRect(node, r, gap, minOf, snap);
    allocate(node.a, ra, `${path}0`);
    allocate(node.b, rb, `${path}1`);
  };
  allocate(root, rect, "");
  return { leaves: out, min: minOf(root) };
}
