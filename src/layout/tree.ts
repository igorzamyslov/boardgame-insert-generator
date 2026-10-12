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
  /** Bottom → top. Empty = a leftover region. */
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

/** Child rectangles of a cut inside `r`, exactly as placeLeaves allocates them. */
export function splitRect(
  node: Cut,
  r: Rect,
  gap: U,
  minOf: (node: TreeNode) => Ext,
): [Rect, Rect] {
  const ma = minOf(node.a);
  const mb = minOf(node.b);
  if (node.axis === "x") {
    const slack = r.w - (ma.w + gap + mb.w);
    const wa = ma.w + (slack > 0 ? mulDiv(slack, node.share, SHARE_MAX) : 0);
    const wb = slack >= 0 ? r.w - gap - wa : mb.w;
    return [
      { x: r.x, y: r.y, w: wa, d: Math.max(r.d, ma.d) },
      { x: r.x + wa + gap, y: r.y, w: wb, d: Math.max(r.d, mb.d) },
    ];
  }
  const slack = r.d - (ma.d + gap + mb.d);
  const da = ma.d + (slack > 0 ? mulDiv(slack, node.share, SHARE_MAX) : 0);
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
): Placement {
  const minOf = minExtents(gap, leafMin);
  const out: PlacedLeaf[] = [];
  const allocate = (node: TreeNode, r: Rect, path: string): void => {
    if (node.kind === "leaf") {
      out.push({ path, leaf: node, rect: r });
      return;
    }
    const [ra, rb] = splitRect(node, r, gap, minOf);
    allocate(node.a, ra, `${path}0`);
    allocate(node.b, rb, `${path}1`);
  };
  allocate(root, rect, "");
  return { leaves: out, min: minOf(root) };
}
