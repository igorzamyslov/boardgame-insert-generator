import { bedExcess, bedOrientations, splitForBed } from "./bed";
import { GRIP_U, printedHeight, type Ctx } from "./context";
import {
  levelAbsorb,
  levelGrowth,
  levelLockCap,
  levelMinFootprints,
  stackHeights,
  stackLevels,
  stackMinFootprint,
  type Level,
} from "./stack";
import type { OuterCutSides } from "../sizing";
import { placeLeaves, type Leaf, type StackItem, type Tree } from "./tree";
import type { Ext, Rect, U } from "./units";

const NO_CUTS: OuterCutSides = { left: false, right: false, front: false, back: false };

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
  /** The smallest footprint the stack asks of the tray (box frame): its own minimum, or more under others. */
  readonly needW: U;
  readonly needD: U;
  readonly capW: U;
  readonly capD: U;
}

export interface PlacedLeftover {
  readonly path: string;
  readonly stack: number;
  /**
   * 0 for a filler beside a whole stack (as tall as the box's top plane); k ≥ 1 for a filler
   * in level k of a stack: it stands beside that level's tray, from the tray's floor up to the
   * top of the stack (the trays above it are smaller, so nothing else fills the space over it).
   */
  readonly level: number;
  readonly x: U;
  readonly y: U;
  /** Bottom of the part: 0 for a level-0 leftover, the level's own z for an in-level filler. */
  readonly z: U;
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

/**
 * A tray's extent on one axis: region extent L, minimum F, absorbable a, room for its contents g
 * (a minus what the walls take), cap c (spec §7.2).
 * The excess over F is absorbed into the tray, with no filler part, only when the tray can take
 * it without anyone asking for a filler: room its contents may grow into (an unbounded axis has
 * all of it, a bounded one up to its cap: spec §5), or walls the user let grow (`wallAbsorb`),
 * together a; or when the excess minus the tray gap is too small to be a part at all (under
 * `minFiller`) so there is nowhere else for it to go. Past that the tray grows by g, the room its
 * contents may have, and the rest becomes a leftover (filler) beside it, so with nothing to grow
 * into it is a tray of exactly its minimum size. The same rules apply in every level of a stack,
 * each against the room its own level has.
 */
function axisExtent(ctx: Ctx, minFiller: U, L: U, F: U, a: U, g: U, c: U): { b: U; over: U } {
  if (L <= F) {
    return { b: F, over: 0 };
  }
  // A filler would be at least this wide beside a tray of the minimum size.
  const fillerFits = L - F - ctx.gap >= minFiller;
  if (L <= c) {
    if (L - F <= a || !fillerFits) {
      return { b: L, over: 0 };
    }
    // More than the tray may absorb: it grows as far as its contents may (g), and the rest of the
    // room is a filler beside it (spec §5: past the bound the slack is a filler).
    return { b: Math.min(F + g, L - ctx.gap - minFiller), over: 0 };
  }
  let b = Math.min(c, L - ctx.gap - minFiller);
  if (F < b && fillerFits) {
    b = Math.min(b, F + g);
  }
  if (b < F) {
    return { b: L, over: F - b };
  }
  return { b, over: 0 };
}

/** The tray of one level inside the `rect` its level has: its extent, trying each bed orientation. */
function chooseTray(
  ctx: Ctx,
  level: Level,
  F: Ext,
  rect: Rect,
  minFiller: U,
): { foot: Ext; over: U } {
  const a = levelAbsorb(level, F);
  const g = levelGrowth(level);
  const lock = levelLockCap(level);
  let best: { foot: Ext; over: U } | null = null;
  for (const o of bedOrientations(ctx.bed)) {
    const ew = axisExtent(ctx, minFiller, rect.w, F.w, a.w, g.w, Math.min(o.w, lock.w));
    const ed = axisExtent(ctx, minFiller, rect.d, F.d, a.d, g.d, Math.min(o.d, lock.d));
    const cand = { foot: { w: ew.b, d: ed.b }, over: ew.over + ed.over };
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

/** A filler beside the tray of one level of a stack; `h` runs from `z` to the top of the stack. */
export interface LevelFiller {
  readonly level: number;
  readonly rect: Rect;
  readonly z: U;
  readonly h: U;
}

export interface StackPlacement {
  readonly trays: Omit<PlacedTray, "path" | "stack">[];
  /** Beside the whole stack, as tall as the box. */
  readonly leftovers: Rect[];
  /** Beside a tray of level 1 and up, from that level's floor to the top of the stack. */
  readonly fillers: LevelFiller[];
  readonly overflowZ: U;
  readonly overflowLock: U;
}

/**
 * Leftover rects of `region` around a tray standing at one end of each axis: beside it along X
 * (the whole depth of the region), then along Y (as wide as the tray). `highX` / `highY` put the
 * tray at the far end of that axis, so its slack lies on the near side instead.
 */
function beside(ctx: Ctx, region: Rect, foot: Ext, highX = false, highY = false): Rect[] {
  const out: Rect[] = [];
  if (foot.w < region.w) {
    out.push({
      x: highX ? region.x : region.x + foot.w + ctx.gap,
      y: region.y,
      w: region.w - foot.w - ctx.gap,
      d: region.d,
    });
  }
  if (foot.d < region.d) {
    out.push({
      x: highX ? region.x + region.w - foot.w : region.x,
      y: highY ? region.y : region.y + foot.d + ctx.gap,
      w: foot.w,
      d: region.d - foot.d - ctx.gap,
    });
  }
  return out;
}

/**
 * Fills one leaf. A stack level is one tray plus whatever leftover its room has:
 * - the bottom tray takes the leaf footprint minus any leftover; slack the tray can't absorb
 *   (elastic axes, `wallAbsorb`) becomes a leftover strip of any width from ctx.minFiller up
 *   that stands beside the whole stack, and a gap narrower than that is absorbed by the tray;
 *   bed and size-lock caps force a leftover of at least ctx.minFiller;
 * - tray k ≥ 1 stands flush in the tray below it (its groove takes the lip's place of the
 *   inset), is built at the smallest size
 *   that holds itself and the trays above it (levelMinFootprints), grows only as its own
 *   settings allow, and the rest of its room becomes fillers in that level, standing from the
 *   level's floor to the top of the stack (at least ctx.minFillerUpper wide, a narrower gap is
 *   absorbed), so a tray's walls never depend on what it is stacked on.
 * Heights come from stackHeights.
 */
export function placeStack(ctx: Ctx, levels: readonly Level[], rect: Rect): StackPlacement {
  if (levels.length === 0) {
    return { trays: [], leftovers: [rect], fillers: [], overflowZ: 0, overflowLock: 0 };
  }
  const mins = levelMinFootprints(levels);
  const heights = stackHeights(ctx, levels);
  let leftovers: Rect[] = [];
  const fillers: LevelFiller[] = [];
  let z = 0;
  let lockOver = heights.lockOverflow;
  let region = rect;
  // The walls with a finger cut among the tray of each level and everything above it
  const cutsFrom: OuterCutSides[] = [];
  for (let k = levels.length - 1; k >= 0; k--) {
    const l = levels[k];
    const own = l ? ctx.cutSides(l.item, l.item.rotated) : NO_CUTS;
    const above = cutsFrom[k + 1] ?? NO_CUTS;
    cutsFrom[k] = {
      left: own.left || above.left,
      right: own.right || above.right,
      front: own.front || above.front,
      back: own.back || above.back,
    };
  }
  const trays = levels.map((l, k) => {
    const F = mins[k] ?? { w: l.minW, d: l.minD };
    const { foot } = chooseTray(ctx, l, F, region, k === 0 ? ctx.minFiller : ctx.minFillerUpper);
    const h = heights.h[k] ?? 0;
    // An upper tray with slack beside it stands at the end of its axis that keeps the filler off
    // the walls a finger cut goes through, when only one of the two ends has one (spec §6.4). The
    // trays above stand inside it, so their cuts count too. The bottom tray stays in its corner:
    // a cut there faces the neighbouring leaf or the box wall either way.
    const cuts = k > 0 ? cutsFrom[k] : undefined;
    const highX = cuts !== undefined && foot.w < region.w && cuts.right && !cuts.left;
    const highY = cuts !== undefined && foot.d < region.d && cuts.back && !cuts.front;
    const at = {
      x: highX ? region.x + region.w - foot.w : region.x,
      y: highY ? region.y + region.d - foot.d : region.y,
    };
    const t = {
      level: k,
      item: l.item,
      x: at.x,
      y: at.y,
      z,
      w: foot.w,
      d: foot.d,
      h,
      lipped: l.lipped,
      top: k === levels.length - 1,
      minW: l.minW,
      minD: l.minD,
      needW: F.w,
      needD: F.d,
      // From its own minimum: what the stack asks of it is room its growing contents take free
      capW: l.capW + (l.growW > 0 ? Math.max(0, F.w - l.minW) : 0),
      capD: l.capD + (l.growD > 0 ? Math.max(0, F.d - l.minD) : 0),
    };
    if (l.fixed) {
      lockOver += Math.max(0, foot.w - l.fixed.w) + Math.max(0, foot.d - l.fixed.d);
    }
    const rest = beside(ctx, region, foot, highX, highY);
    if (k === 0) {
      leftovers = rest;
    } else {
      for (const r of rest) {
        fillers.push({ level: k, rect: r, z, h: 0 });
      }
    }
    // the next tray stands flush on this one: its groove takes this one's lip
    region = { x: at.x, y: at.y, w: foot.w, d: foot.d };
    z += h;
    return t;
  });
  // The trays above a level stand inside its tray, so beside it the stack is open to the top:
  // its filler is as tall as everything from its own floor up.
  const stackTop = z;
  return {
    trays,
    leftovers,
    fillers: fillers.map((f) => ({ ...f, h: stackTop - f.z })),
    overflowZ: heights.overflow,
    overflowLock: lockOver,
  };
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
  const inLevel: { path: string; stack: number; filler: LevelFiller }[] = [];
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
      for (const filler of sp.fillers) {
        inLevel.push({ path: pl.path, stack, filler });
      }
      stack++;
    }
    for (const r of sp.leftovers) {
      pending.push({ path: pl.path, rect: r });
    }
  }
  // A spare leftover needs a grip (≥ 25 mm inside) and a floor below its rim (roadmap §4.6); one
  // in a stack level has the groove's thicker wall.
  const solidFor = (piece: Rect, h: U, level = 0): boolean =>
    ctx.input.settings.leftover === "solid" ||
    h <= 2 * ctx.floor ||
    Math.min(piece.w, piece.d) < GRIP_U + 2 * (level > 0 ? ctx.upperWall : ctx.wall);
  for (const p of pending) {
    for (const piece of splitForBed(ctx.bed, p.rect, ctx.gap)) {
      leftovers.push({
        path: p.path,
        stack,
        level: 0,
        z: 0,
        ...piece,
        h: leftoverH,
        solid: solidFor(piece, leftoverH),
      });
      bed += bedExcess(ctx.bed, piece.w, piece.d, leftoverH);
      stack++;
    }
  }
  // A filler within a stack level belongs to its stack, as the tray beside it does.
  for (const f of inLevel) {
    for (const piece of splitForBed(ctx.bed, f.filler.rect, ctx.gap)) {
      leftovers.push({
        path: f.path,
        stack: f.stack,
        level: f.filler.level,
        z: f.filler.z,
        ...piece,
        h: f.filler.h,
        solid: solidFor(piece, f.filler.h, f.filler.level),
      });
      bed += bedExcess(ctx.bed, piece.w, piece.d, f.filler.h);
    }
  }
  const bottoms: Rect[] = [
    ...trays.filter((t) => t.level === 0),
    ...leftovers.filter((l) => l.level === 0),
  ];
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
