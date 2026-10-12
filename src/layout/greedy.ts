import { fitsBed } from "./bed";
import { MAX_LEVELS, type Ctx } from "./context";
import type { ResolvedLocks } from "./locks";
import { stackAllowed, stackHeights, stackLevels, stackMinFootprint } from "./stack";
import {
  cut,
  leaf,
  otherAxis,
  SHARE_MAX,
  type Axis,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";
import type { Ext, U } from "./units";

interface Unit {
  items: StackItem[];
  readonly frozen: boolean;
  ext: Ext;
}

interface Shelf {
  readonly units: Unit[];
  used: U;
  depth: U;
}

/** Right-nested chain of cuts; shares split the slack evenly between the nodes. */
function chain(nodes: readonly TreeNode[], axis: Axis): TreeNode {
  const [first, ...rest] = nodes;
  if (!first) {
    return leaf([]);
  }
  if (rest.length === 0) {
    return first;
  }
  return cut(axis, first, chain(rest, axis), Math.floor(SHARE_MAX / nodes.length));
}

/**
 * Sizing never sees the box (roadmap §4.7), so a requirement's preferred variant may not
 * fit at all (e.g. upright cards taller than the box). Starting layouts use the first
 * variant whose every part fits the height, the bed and the floor; else variant 0.
 */
export function firstFittingVariant(ctx: Ctx, req: number): number {
  const r = ctx.input.requirements[req];
  const fits = (variant: number): boolean =>
    (r?.variants[variant]?.parts ?? []).every((p, part) => {
      const m = ctx.metrics({ req, variant, part }, false, 0);
      const onFloor =
        (m.w <= ctx.floorW && m.d <= ctx.floorD) ||
        (p.rotatable && m.d <= ctx.floorW && m.w <= ctx.floorD);
      return m.h <= ctx.topPlane && fitsBed(ctx.bed, m.w, m.d, m.h) && onFloor;
    });
  const i = (r?.variants ?? []).findIndex((_, v) => fits(v));
  return Math.max(0, i);
}

/**
 * First-fit decreasing shelf packing (spec §7.2 starting layouts). With `along` = "x",
 * shelves run along X and are stacked along Y; "y" is the transpose. Units that fit in no
 * shelf and no new shelf are stacked onto an existing stack when the grown footprint
 * (lipped wall, insets) still fits the shelf and the floor and the heights fit; otherwise
 * they open a shelf anyway (overflow, which the annealer then removes).
 * Position-locked trays are left out (applyLocks adds them).
 */
export function greedyTree(ctx: Ctx, resolved: ResolvedLocks, along: Axis): Tree {
  const reqs = ctx.input.requirements;
  const variants = reqs.map((_, i) => resolved.pinnedVariant[i] ?? firstFittingVariant(ctx, i));
  const skip = new Set<number>([
    ...resolved.leaves.flatMap((l) => l.items.map((i) => ctx.partId(i))),
    ...resolved.groups.flatMap((g) => g.map((i) => ctx.partId(i))),
  ]);
  const extOf = (items: readonly StackItem[]): Ext =>
    stackMinFootprint(ctx, stackLevels(ctx, items));
  const units: Unit[] = resolved.groups.map((g) => ({
    items: [...g],
    frozen: true,
    ext: extOf(g),
  }));
  reqs.forEach((r, i) => {
    const v = variants[i] ?? 0;
    (r.variants[v]?.parts ?? []).forEach((p, k) => {
      const ref = { req: i, variant: v, part: k };
      if (skip.has(ctx.partId(ref))) {
        return;
      }
      const fixed = ctx.sizeLocks.get(ctx.partId(ref));
      const m = ctx.metrics(ref, false, 0);
      const flat = along === "x" ? m.w < m.d : m.d < m.w;
      const rotated = fixed ? fixed.rotated : p.rotatable && flat;
      const items = [{ ...ref, rotated }];
      units.push({ items, frozen: false, ext: extOf(items) });
    });
  });
  const primary = (e: Ext): U => (along === "x" ? e.w : e.d);
  const secondary = (e: Ext): U => (along === "x" ? e.d : e.w);
  const order = units
    .map((u, i) => ({ u, i }))
    .sort(
      (a, b) =>
        secondary(b.u.ext) - secondary(a.u.ext) || primary(b.u.ext) - primary(a.u.ext) || a.i - b.i,
    )
    .map((x) => x.u);
  const P = along === "x" ? ctx.floorW : ctx.floorD;
  const S = along === "x" ? ctx.floorD : ctx.floorW;
  const shelves: Shelf[] = [];
  const usedS = (): U =>
    shelves.reduce((s, sh) => s + sh.depth, 0) + Math.max(0, shelves.length - 1) * ctx.gap;
  for (const unit of order) {
    const p = primary(unit.ext);
    const s = secondary(unit.ext);
    const shelf = shelves.find((sh) => sh.used + ctx.gap + p <= P && s <= sh.depth);
    if (shelf) {
      shelf.units.push(unit);
      shelf.used += ctx.gap + p;
      continue;
    }
    if (shelves.length === 0 || usedS() + ctx.gap + s <= S) {
      shelves.push({ units: [unit], used: p, depth: s });
      continue;
    }
    let stacked = false;
    for (const sh of shelves) {
      for (const base of sh.units) {
        if (
          stacked ||
          base.frozen ||
          unit.frozen ||
          base.items.length + unit.items.length > MAX_LEVELS
        ) {
          continue;
        }
        const items = [...base.items, ...unit.items];
        if (!stackAllowed(ctx, items)) {
          continue;
        }
        const levels = stackLevels(ctx, items);
        const f = stackMinFootprint(ctx, levels);
        const grow = Math.max(0, primary(f) - primary(base.ext));
        const depth = Math.max(sh.depth, secondary(f));
        if (
          sh.used + grow <= P &&
          usedS() - sh.depth + depth <= S &&
          stackHeights(ctx, levels).overflow === 0
        ) {
          base.items = items;
          base.ext = f;
          sh.used += grow;
          sh.depth = depth;
          stacked = true;
        }
      }
    }
    if (!stacked) {
      shelves.push({ units: [unit], used: p, depth: s });
    }
  }
  const shelfNodes = shelves.map((sh) =>
    chain(
      sh.units.map((u) => leaf(u.items, u.frozen)),
      along,
    ),
  );
  return { root: chain(shelfNodes, otherAxis(along)), variants };
}
