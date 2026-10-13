import { bedExcess, bedOrientations, splitForBed } from "./bed";
import { GRIP_U, INF_U, printedHeight, type Ctx } from "./context";
import {
  stackAbsorb,
  stackHeights,
  stackLevels,
  stackLockCap,
  stackMinFootprint,
  type Level,
} from "./stack";
import { placeLeaves, type Leaf, type StackItem, type Tree } from "./tree";
import type { Ext, Rect, U } from "./units";

export interface PlacedTray {
  readonly path: string;
  readonly stack: number;
  readonly level: number;
  readonly item: StackItem;
  readonly x: U;
  readonly y: U;
  readonly z: U;
  readonly w: U;
  readonly d: U;
  readonly h: U;
  readonly lipped: boolean;
  /** Nothing is stacked on it. */
  readonly top: boolean;
  readonly minW: U;
  readonly minD: U;
  readonly capW: U;
  readonly capD: U;
}

export interface PlacedLeftover {
  readonly path: string;
  readonly stack: number;
  readonly x: U;
  readonly y: U;
  readonly w: U;
  readonly d: U;
  readonly h: U;
  readonly solid: boolean;
}

/** Constraint violations in units; all zero = feasible. */
export interface Overflow {
  readonly x: U;
  readonly y: U;
  /** Σ over stacks of height above topPlane. */
  readonly z: U;
  readonly bed: U;
  readonly lock: U;
}

export interface Plan {
  readonly trays: PlacedTray[];
  readonly leftovers: PlacedLeftover[];
  readonly overflow: Overflow;
  /** Per axis: how much larger the box would have to be (z: worst stack). */
  readonly shortfall: { readonly x: U; readonly y: U; readonly z: U };
  /** Most bottom-level parts crossed by a line along X / along Y. */
  readonly crossX: number;
  readonly crossY: number;
}

export function overflowTotal(o: Overflow): U {
  return o.x + o.y + o.z + o.bed + o.lock;
}

interface Bottom {
  foot: Ext;
  over: U;
}

/**
 * Bottom tray extent on one axis: leaf extent L, minimum F, absorbable a, cap c (spec §7.2).
 * The excess over F is absorbed into the tray, with no filler part, only when the tray can take
 * it without anyone asking for a filler: an elastic axis (a is unbounded), or walls the user let
 * grow (`wallGrowth`, a), or when the excess minus the tray gap is too small to be a part at all
 * (under `ctx.minFiller`) so there is nowhere else for it to go. Anything else becomes a
 * leftover (filler) leaf beside a tray of exactly its minimum size.
 */
function axisExtent(ctx: Ctx, L: U, F: U, a: U, c: U): { b: U; over: U } {
  if (L <= F) {
    return { b: F, over: 0 };
  }
  const elastic = a >= INF_U / 2;
  // A filler would be at least this wide beside a tray of the minimum size.
  const fillerFits = L - F - ctx.gap >= ctx.minFiller;
  if (L <= c) {
    return { b: L - F <= a || !fillerFits ? L : F, over: 0 };
  }
  let b = Math.min(c, L - ctx.gap - ctx.minFiller);
  if (!elastic && F < b && fillerFits) {
    b = F;
  }
  if (b < F) {
    return { b: L, over: F - b };
  }
  return { b, over: 0 };
}

function chooseBottom(ctx: Ctx, levels: readonly Level[], rect: Rect): Bottom {
  const F = stackMinFootprint(ctx, levels);
  const a = stackAbsorb(ctx, levels, F);
  const lock = stackLockCap(ctx, levels);
  let best: Bottom | null = null;
  for (const o of bedOrientations(ctx.bed)) {
    const ew = axisExtent(ctx, rect.w, F.w, a.w, Math.min(o.w, lock.w));
    const ed = axisExtent(ctx, rect.d, F.d, a.d, Math.min(o.d, lock.d));
    const cand: Bottom = { foot: { w: ew.b, d: ed.b }, over: ew.over + ed.over };
    if (
      best === null ||
      cand.over < best.over ||
      (cand.over === best.over && cand.foot.w * cand.foot.d > best.foot.w * best.foot.d)
    ) {
      best = cand;
    }
  }
  return best ?? { foot: F, over: 0 };
}

export interface StackPlacement {
  readonly trays: Omit<PlacedTray, "path" | "stack">[];
  readonly leftovers: Rect[];
  readonly overflowZ: U;
  readonly overflowLock: U;
}

/**
 * Fills one leaf: the bottom tray takes the leaf footprint minus any leftover; slack the
 * stack can't absorb (elastic axes, `wallGrowth`) becomes a leftover strip of any width from
 * ctx.minFiller up, and a gap narrower than that is absorbed by the tray; bed and size-lock caps
 * force a leftover of at least ctx.minFiller. Level k is inset
 * k·inset per side; heights come from stackHeights.
 */
export function placeStack(ctx: Ctx, levels: readonly Level[], rect: Rect): StackPlacement {
  if (levels.length === 0) {
    return { trays: [], leftovers: [rect], overflowZ: 0, overflowLock: 0 };
  }
  const { foot } = chooseBottom(ctx, levels, rect);
  const lockCap = stackLockCap(ctx, levels);
  const heights = stackHeights(ctx, levels);
  const leftovers: Rect[] = [];
  if (foot.w < rect.w) {
    leftovers.push({
      x: rect.x + foot.w + ctx.gap,
      y: rect.y,
      w: rect.w - foot.w - ctx.gap,
      d: rect.d,
    });
  }
  if (foot.d < rect.d) {
    leftovers.push({
      x: rect.x,
      y: rect.y + foot.d + ctx.gap,
      w: foot.w,
      d: rect.d - foot.d - ctx.gap,
    });
  }
  let z = 0;
  const trays = levels.map((l, k) => {
    const inset = k * ctx.inset;
    const h = heights.h[k] ?? 0;
    const t = {
      level: k,
      item: l.item,
      x: rect.x + inset,
      y: rect.y + inset,
      z,
      w: foot.w - 2 * inset,
      d: foot.d - 2 * inset,
      h,
      lipped: l.lipped,
      top: k === levels.length - 1,
      minW: l.minW,
      minD: l.minD,
      capW: l.capW,
      capD: l.capD,
    };
    z += h;
    return t;
  });
  const lockOver =
    Math.max(0, foot.w - lockCap.w) + Math.max(0, foot.d - lockCap.d) + heights.lockOverflow;
  return { trays, leftovers, overflowZ: heights.overflow, overflowLock: lockOver };
}

/** Most rectangles crossed by one straight line along X (alongX) or along Y. */
export function maxCrossing(rects: readonly Rect[], alongX: boolean): number {
  let best = 0;
  for (const r of rects) {
    const line = alongX ? r.y : r.x;
    let n = 0;
    for (const s of rects) {
      const lo = alongX ? s.y : s.x;
      const hi = alongX ? s.y + s.d : s.x + s.w;
      if (lo <= line && line < hi) {
        n++;
      }
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Turns a tree into concrete integer placements, leftovers and overflow (the "fill" step). */
export function evaluate(ctx: Ctx, tree: Tree): Plan {
  const levelCache = new Map<Leaf, Level[]>();
  const levelsOf = (leaf: Leaf): Level[] => {
    const hit = levelCache.get(leaf);
    if (hit) {
      return hit;
    }
    const lv = stackLevels(ctx, leaf.stack);
    levelCache.set(leaf, lv);
    return lv;
  };
  const floor: Rect = { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD };
  const placement = placeLeaves(tree.root, floor, ctx.gap, (leaf) =>
    stackMinFootprint(ctx, levelsOf(leaf)),
  );
  const trays: PlacedTray[] = [];
  const leftovers: PlacedLeftover[] = [];
  let z = 0;
  let zMax = 0;
  let bed = 0;
  let lock = 0;
  let stack = 0;
  const leftoverH = Math.max(0, ctx.topPlane);
  const pending: { path: string; rect: Rect }[] = [];
  for (const pl of placement.leaves) {
    const levels = levelsOf(pl.leaf);
    const sp = placeStack(ctx, levels, pl.rect);
    z += sp.overflowZ;
    zMax = Math.max(zMax, sp.overflowZ);
    lock += sp.overflowLock;
    if (sp.trays.length > 0) {
      for (const t of sp.trays) {
        trays.push({ ...t, path: pl.path, stack });
        bed += bedExcess(ctx.bed, t.w, t.d, printedHeight(ctx, t.h, t.lipped));
      }
      stack++;
    }
    for (const r of sp.leftovers) {
      pending.push({ path: pl.path, rect: r });
    }
  }
  const spareMin = GRIP_U + 2 * ctx.wall;
  // A spare leftover needs a grip (≥ 25 mm inside) and a floor below its rim (roadmap §4.6).
  const solidSetting = ctx.input.settings.leftover === "solid" || leftoverH <= 2 * ctx.floor;
  for (const p of pending) {
    for (const piece of splitForBed(ctx.bed, p.rect, ctx.gap)) {
      leftovers.push({
        path: p.path,
        stack,
        ...piece,
        h: leftoverH,
        solid: solidSetting || Math.min(piece.w, piece.d) < spareMin,
      });
      bed += bedExcess(ctx.bed, piece.w, piece.d, leftoverH);
      stack++;
    }
  }
  const bottoms: Rect[] = [...trays.filter((t) => t.level === 0), ...leftovers];
  const ox = Math.max(0, placement.min.w - ctx.floorW);
  const oy = Math.max(0, placement.min.d - ctx.floorD);
  return {
    trays,
    leftovers,
    overflow: { x: ox, y: oy, z, bed, lock },
    shortfall: { x: ox, y: oy, z: zMax },
    crossX: maxCrossing(bottoms, true),
    crossY: maxCrossing(bottoms, false),
  };
}
