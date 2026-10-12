import type { CompartmentSpec, TraySpec } from "../model/types";
import type { CompartmentReq, TrayPartReq } from "../sizing/types";
import { MAX_DEPTH, type Ctx } from "./context";
import { isValidPath, type LockHints } from "./locks";
import type { PrevPos } from "./score";
import { stackLevels, stackMinFootprint } from "./stack";
import {
  cut,
  leaf,
  minExtents,
  SHARE_HALF,
  SHARE_MAX,
  splitRect,
  type Axis,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";
import { toU, type Rect } from "./units";

export interface WarmHints extends Required<LockHints> {
  /** Cut axis at an internal path of the stored layout, when its children are separable. */
  axisOf(path: string): Axis | undefined;
  /** Stored positions by trayKey, for the "moved trays" score term. */
  readonly prev: ReadonlyMap<string, PrevPos>;
}

interface Box2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Bottom-level footprints (level-0 trays and leftovers) of a stored layout, in units. */
function bottomRects(trays: readonly TraySpec[]): { path: string; r: Box2 }[] {
  return trays
    .filter((t) => (t.part === "tray" && t.level === 0) || t.part === "leftover")
    .filter((t) => isValidPath(t.path))
    .map((t) => {
      const x0 = toU(t.x);
      const y0 = toU(t.y);
      return { path: t.path, r: { x0, y0, x1: x0 + toU(t.w), y1: y0 + toU(t.d) } };
    });
}

function bbox(rects: readonly { path: string; r: Box2 }[], prefix: string): Box2 | null {
  let out: Box2 | null = null;
  for (const { path, r } of rects) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    out = out
      ? {
          x0: Math.min(out.x0, r.x0),
          y0: Math.min(out.y0, r.y0),
          x1: Math.max(out.x1, r.x1),
          y1: Math.max(out.y1, r.y1),
        }
      : { ...r };
  }
  return out;
}

/** Rule 7 for one compartment: its rectangle (content + clearance, no reach bands: amendment 7) holds the
 * minimum footprint in either orientation, and its depth below the rim is at least `minH`. */
export function meetsMinimum(c: CompartmentReq, s: CompartmentSpec, trayH: number): boolean {
  const eps = 1e-6;
  const fits =
    (s.w >= c.minW - eps && s.d >= c.minD - eps) || (s.w >= c.minD - eps && s.d >= c.minW - eps);
  return fits && trayH - s.floorZ >= c.minH - eps;
}

function partMeets(part: TrayPartReq, t: TraySpec): boolean {
  return part.compartments.every((c, i) => {
    const s = t.compartments[i];
    return s !== undefined && meetsMinimum(c, s, t.h);
  });
}

/**
 * The variant of requirement `req` that stored trays were realized from. A TraySpec doesn't
 * record its variant, and variants share trayKeys (`<key>:p0:0` is in most of them), so the
 * key set alone can't tell "upright" from "flat". Picks the first variant whose part keys
 * equal the requirement's stored keys and whose compartments all meet their minimums; else
 * the first with that key set; else the one sharing the most keys; undefined if none.
 */
export function inferVariant(
  ctx: Ctx,
  req: number,
  trays: readonly TraySpec[],
): number | undefined {
  const r = ctx.input.requirements[req];
  if (!r) {
    return undefined;
  }
  const own = new Map(
    trays
      .filter((t) => t.part === "tray" && ctx.refsOfKey(t.key)[0]?.req === req)
      .map((t) => [t.key, t]),
  );
  const sameKeys = r.variants
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.parts.length === own.size && v.parts.every((p) => own.has(p.trayKey)));
  const exact = sameKeys.find(({ v }) =>
    v.parts.every((p) => {
      const t = own.get(p.trayKey);
      return t !== undefined && partMeets(p, t);
    }),
  );
  if (exact ?? sameKeys[0]) {
    return (exact ?? sameKeys[0])?.i;
  }
  let best: number | undefined;
  let bestCount = 0;
  r.variants.forEach((v, i) => {
    const n = v.parts.filter((p) => own.has(p.trayKey)).length;
    if (n > bestCount) {
      best = i;
      bestCount = n;
    }
  });
  return best;
}

export function warmHints(ctx: Ctx, trays: readonly TraySpec[]): WarmHints {
  const rects = bottomRects(trays);
  const rotated = new Map(trays.filter((t) => t.part === "tray").map((t) => [t.key, t.rotated]));
  const prev = new Map<string, PrevPos>(
    trays
      .filter((t) => t.part === "tray")
      .map((t) => [t.key, { x: toU(t.x), y: toU(t.y), level: t.level }]),
  );
  return {
    variantOf: (req) => inferVariant(ctx, req, trays),
    rotatedOf: (key) => rotated.get(key),
    levelOf: (key) => prev.get(key)?.level,
    singleLeaf: rects.length > 0 && rects.every((r) => r.path === ""),
    axisOf(path) {
      const a = bbox(rects, `${path}0`);
      const b = bbox(rects, `${path}1`);
      if (!a || !b) {
        return undefined;
      }
      if (a.x1 <= b.x0) {
        return "x";
      }
      if (a.y1 <= b.y0) {
        return "y";
      }
      return undefined;
    },
    prev,
  };
}

/**
 * Rebuilds the guillotine tree of a stored layout (warm start, spec §7.2): leaves from tray
 * paths, cut axes from positions, cut shares recovered exactly from the stored extents, so
 * unchanged inputs reproduce the same placement. Trays of other variants or unknown keys
 * are left out (completeTree re-adds what's missing). Returns null for corrupt paths.
 */
export function warmTree(
  ctx: Ctx,
  trays: readonly TraySpec[],
  pinnedVariant: readonly (number | null)[],
  hints: WarmHints,
): Tree | null {
  const parts = trays.filter((t) => t.part === "tray" || t.part === "leftover");
  if (parts.length === 0 || parts.some((t) => !isValidPath(t.path))) {
    return null;
  }
  const paths = [...new Set(parts.map((t) => t.path))].sort();
  for (let i = 1; i < paths.length; i++) {
    const prevPath = paths[i - 1] ?? "";
    if ((paths[i] ?? "").startsWith(prevPath)) {
      return null;
    }
  }
  const variants = ctx.input.requirements.map(
    (_, i) => pinnedVariant[i] ?? hints.variantOf(i) ?? 0,
  );
  const stacks = new Map<string, StackItem[]>();
  const seen = new Set<number>();
  const ordered = parts
    .filter((t) => t.part === "tray")
    .sort((a, b) => (a.path === b.path ? a.level - b.level : a.path < b.path ? -1 : 1));
  for (const t of ordered) {
    const ref = ctx.refsOfKey(t.key).find((r) => r.variant === variants[r.req]);
    if (!ref || seen.has(ctx.partId(ref))) {
      continue;
    }
    seen.add(ctx.partId(ref));
    const rotatable = ctx.part(ref)?.rotatable ?? false;
    const list = stacks.get(t.path) ?? [];
    list.push({ ...ref, rotated: rotatable && t.rotated });
    stacks.set(t.path, list);
  }
  const pathSet = new Set(paths);
  const build = (q: string): TreeNode => {
    if (pathSet.has(q)) {
      return leaf(stacks.get(q) ?? []);
    }
    if (q.length < MAX_DEPTH && paths.some((p) => p.startsWith(q))) {
      return cut(
        hints.axisOf(q) ?? (q.length % 2 === 0 ? "x" : "y"),
        build(`${q}0`),
        build(`${q}1`),
      );
    }
    return leaf([]);
  };
  const rects = bottomRects(trays);
  const minOf = minExtents(ctx.gap, (l) => stackMinFootprint(ctx, stackLevels(ctx, l.stack)));
  const recover = (node: TreeNode, r: Rect, q: string): TreeNode => {
    if (node.kind === "leaf") {
      return node;
    }
    const ma = minOf(node.a);
    const mb = minOf(node.b);
    const x = node.axis === "x";
    const slack = x ? r.w - (ma.w + ctx.gap + mb.w) : r.d - (ma.d + ctx.gap + mb.d);
    const box = bbox(rects, `${q}0`);
    let share = SHARE_HALF;
    if (slack > 0 && box) {
      const ext = x ? box.x1 - r.x : box.y1 - r.y;
      const e = Math.max(0, Math.min(slack, ext - (x ? ma.w : ma.d)));
      share = Math.min(SHARE_MAX, Math.ceil((e * SHARE_MAX) / slack));
    }
    const withShare = { ...node, share };
    const [ra, rb] = splitRect(withShare, r, ctx.gap, minOf);
    return { ...withShare, a: recover(node.a, ra, `${q}0`), b: recover(node.b, rb, `${q}1`) };
  };
  const root = recover(build(""), { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD }, "");
  return { root, variants };
}
