import { bedExcess, bedOrientations, fitsBed, splitForBed } from "./bed";
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
import { overlaps, reserveClash, reservedOf, snapOf, type PlacedReserve } from "./reserve";
import type { OuterCutSides } from "../sizing";
import {
  packedToWall,
  placeLeaves,
  type Leaf,
  type PlacedLeaf,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";
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
  /**
   * The tray has the lip printed on it: `lipped`, but for the top copy of a stack of alike trays
   * whose stack cannot afford its rim (it is built as if lipped, so it is the same size, and has no
   * lip).
   */
  readonly rim: boolean;
  /**
   * An alike tray of a set that stands in a stack (`Level.plug`): built, and realized, as a tray in
   * the middle of one is, wherever it stands.
   */
  readonly plug: boolean;
  /** Nothing is stacked on it. */
  readonly top: boolean;
  /** Its stack stands under a kept-free area, so it stops at the low plane (`Ctx.lowPlane`). */
  readonly under: boolean;
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

/** Room left empty, because it is too thin to be a filler: a box in units. */
export interface Air {
  readonly w: U;
  readonly d: U;
  readonly h: U;
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
  /** Room no part fills, beside the trays of a set: thinner than a filler can be. */
  readonly air: Air[];
  /** Per axis: how much larger the box would have to be (z: worst stack). */
  readonly shortfall: { readonly x: U; readonly y: U; readonly z: U };
  /** Where each kept-free area lies in this plan (empty without areas). */
  readonly reserved: PlacedReserve[];
  /** Most bottom-level parts crossed by a line along X / along Y. */
  readonly crossX: number;
  readonly crossY: number;
  /** The most a tray can shift left to right and front to back, `rowPlayU`. */
  readonly playX: U;
  readonly playY: U;
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

/** An alike tray's footprint: its set's size, and the room its set was given (`alikeGrowth`), turned as the tray is. */
function alikeFoot(l: Level, F: Ext, extras: ReadonlyMap<number, Ext> | undefined): Ext {
  const e = extras?.get(l.alike);
  if (e === undefined) {
    return F;
  }
  return l.item.rotated ? { w: F.w + e.d, d: F.d + e.w } : { w: F.w + e.w, d: F.d + e.d };
}

/**
 * The room each set of alike trays may be given beyond its size, in the tray's own frame: what its
 * least roomy place leaves it, up to what its contents may take (`levelGrowth`), so every tray of a
 * set grows by the same and stays one size, with the same wells (owner, 2026-10-23: copies are
 * alike, "if one copy's well grows, every copy's does"). A set that stands in a stack with another of
 * its own gets none, as the tray above stands flush in the one below. Nothing without room for
 * growth in the context (planning) or for a tray on a size lock.
 */
export function alikeGrowth(
  ctx: Ctx,
  leaves: readonly PlacedLeaf[],
  levelsOf: (leaf: Leaf) => Level[],
): Map<number, Ext> | undefined {
  const given = new Map<number, Ext>();
  for (const pl of leaves) {
    const levels = levelsOf(pl.leaf);
    const mins = levelMinFootprints(levels);
    let region: Ext = { w: pl.rect.w, d: pl.rect.d };
    levels.forEach((l, k) => {
      const F = mins[k];
      if (F === undefined) {
        return;
      }
      if (l.alike >= 0) {
        const g = levelGrowth(l);
        const lock = levelLockCap(l);
        let e: Ext = {
          w: Math.max(0, Math.min(g.w, Math.min(region.w, lock.w) - F.w)),
          d: Math.max(0, Math.min(g.d, Math.min(region.d, lock.d) - F.d)),
        };
        if (!fitsBed(ctx.bed, F.w + e.w, F.d + e.d, 0)) {
          e = { w: 0, d: 0 };
        }
        const own = l.item.rotated ? { w: e.d, d: e.w } : e;
        const had = given.get(l.alike);
        given.set(
          l.alike,
          had === undefined ? own : { w: Math.min(had.w, own.w), d: Math.min(had.d, own.d) },
        );
      }
      // the next tray stands flush in this one, at its size
      region = { w: F.w, d: F.d };
    });
  }
  for (const [set, e] of given) {
    if (e.w <= 0 && e.d <= 0) {
      given.delete(set);
    }
  }
  return given.size > 0 ? given : undefined;
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
  readonly trays: Omit<PlacedTray, "path" | "stack" | "under">[];
  /** Beside the whole stack, as tall as the box. */
  readonly leftovers: Rect[];
  /** Beside a tray of level 1 and up, from that level's floor to the top of the stack. */
  readonly fillers: LevelFiller[];
  readonly overflowZ: U;
  readonly overflowLock: U;
  /** Room beside an alike tray that is too thin to be a filler. */
  readonly air: Air[];
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
export function placeStack(
  ctx: Ctx,
  levels: readonly Level[],
  rect: Rect,
  /** The room each set of alike trays is given beyond its size, in the tray's own frame (`alikeGrowth`). */
  extras?: ReadonlyMap<number, Ext>,
): StackPlacement {
  if (levels.length === 0) {
    return {
      trays: [],
      leftovers: [rect],
      fillers: [],
      overflowZ: 0,
      overflowLock: 0,
      air: [],
    };
  }
  const mins = levelMinFootprints(levels);
  const heights = stackHeights(ctx, levels);
  let leftovers: Rect[] = [];
  const fillers: LevelFiller[] = [];
  let z = 0;
  let lockOver = heights.lockOverflow;
  const empty: { rect: Rect; level: number; z: U }[] = [];
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
    const minFiller = k === 0 ? ctx.minFiller : ctx.minFillerUpper;
    // An alike tray is as big as its set asks and no bigger, wherever it stands and whatever room
    // it has: what is left of its room is for fillers (owner, 2026-10-23: "where a copy's slot has
    // spare room, spacers take it, not the tray"), so every tray of the set is the same size.
    const foot =
      l.alike >= 0 ? alikeFoot(l, F, extras) : chooseTray(ctx, l, F, region, minFiller).foot;
    const h = heights.h[k] ?? 0;
    // An upper tray with slack beside it stands at the end of its axis that keeps the filler off
    // the walls a finger cut goes through, when only one of the two ends has one (spec §6.4). The
    // trays above stand inside it, so their cuts count too. The bottom tray stays in its corner:
    // a cut there faces the neighbouring leaf or the box wall either way.
    const cuts = k > 0 ? cutsFrom[k] : undefined;
    // In the last step the bottom tray also moves away from a box wall its leaf touches, when the room
    // beside it would otherwise lie between it and its neighbours: the room goes against the wall
    // (owner, 2026-10-23), unless a cut goes through that wall's side of the tray.
    const own = cutsFrom[k] ?? NO_CUTS;
    const wallX =
      k === 0 && ctx.growing && region.x === 0 && region.x + region.w < ctx.floorW && !own.left;
    const wallY =
      k === 0 && ctx.growing && region.y === 0 && region.y + region.d < ctx.floorD && !own.front;
    const highX = foot.w < region.w && (wallX || (cuts !== undefined && cuts.right && !cuts.left));
    const highY = foot.d < region.d && (wallY || (cuts !== undefined && cuts.back && !cuts.front));
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
      rim: l.lipped && !(k === levels.length - 1 && l.plug && !heights.rim),
      plug: l.plug,
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
    // Room too thin to be a filler cannot go into an alike tray either: it stays empty.
    const made = beside(ctx, region, foot, highX, highY);
    const rest = l.alike >= 0 ? made.filter((r) => Math.min(r.w, r.d) >= minFiller) : made;
    for (const r of made) {
      if (!rest.includes(r)) {
        empty.push({ rect: r, level: k, z });
      }
    }
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
    air: empty.map((e) => ({
      w: e.rect.w,
      d: e.rect.d,
      h: e.level === 0 ? Math.max(0, ctx.topPlane) : stackTop - e.z,
    })),
  };
}

/**
 * The most a tray can shift along one axis (alongX: left to right), units: what is left of the
 * box's `room` on the line through a part, beyond the parts that line crosses. With the parts
 * tiling the floor with only the tray gap it is `nominalPlayU`; room left empty beside an alike
 * tray adds to it.
 */
export function rowPlayU(room: U, rects: readonly Rect[], alongX: boolean): U {
  let worst = 0;
  for (const r of rects) {
    const line = alongX ? r.y : r.x;
    let used = 0;
    for (const s of rects) {
      const lo = alongX ? s.y : s.x;
      const hi = alongX ? s.y + s.d : s.x + s.w;
      if (lo <= line && line < hi) {
        used += alongX ? s.w : s.d;
      }
    }
    worst = Math.max(worst, room - used);
  }
  return worst;
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

/**
 * What a tree holds of alike trays: the sets with one of their trays in a stack of two or more (all
 * of the set are built as a tray in the middle of a stack is, wherever they stand: `Level.plug`),
 * and the leaves with a tray of a set in them.
 */
function alikeIn(
  ctx: Ctx,
  node: TreeNode,
  into: { plugged: Set<number>; leaves: Leaf[] } = { plugged: new Set(), leaves: [] },
): { plugged: Set<number>; leaves: Leaf[] } {
  if (node.kind === "leaf") {
    const sets = node.stack.map((item) => ctx.alikeOf(item)).filter((set) => set >= 0);
    if (sets.length > 0) {
      into.leaves.push(node);
      if (node.stack.length > 1) {
        sets.forEach((set) => into.plugged.add(set));
      }
    }
    return into;
  }
  alikeIn(ctx, node.a, into);
  return alikeIn(ctx, node.b, into);
}

/**
 * The size every tray of each set of alike trays is built at (owner, 2026-10-23: all trays of one
 * set are the same size): the largest any place of the set asks of it, in the tray's own frame. A
 * place asks the tray's own minimum, or more under a wider tray, whose size may be its own set's:
 * so the sizes are found by raising them until no place asks for more.
 */
function setSizes(
  ctx: Ctx,
  leaves: readonly Leaf[],
  plugged: ReadonlySet<number>,
): Map<number, { w: U; d: U }> {
  const sizes = new Map<number, { w: U; d: U }>();
  for (let round = 0; round < 8; round++) {
    let raised = false;
    for (const leaf of leaves) {
      const levels = stackLevels(ctx, leaf.stack, plugged, sizes);
      const need = levelMinFootprints(levels);
      levels.forEach((l, k) => {
        const f = need[k];
        if (l.alike < 0 || !f) {
          return;
        }
        const w = l.item.rotated ? f.d : f.w;
        const d = l.item.rotated ? f.w : f.d;
        const had = sizes.get(l.alike);
        if (!had || w > had.w || d > had.d) {
          sizes.set(l.alike, { w: Math.max(w, had?.w ?? 0), d: Math.max(d, had?.d ?? 0) });
          raised = true;
        }
      });
    }
    if (!raised) {
      break;
    }
  }
  return sizes;
}

/** The context for a stack under a kept-free area: it stops at the low plane, filled up to it. */
function underCtx(ctx: Ctx): Ctx {
  return ctx.areas.length === 0
    ? ctx
    : { ...ctx, topPlane: ctx.lowPlane, fillToTop: true, riserMin: ctx.riserMinFilled };
}

/** Turns a tree into concrete integer placements, leftovers and overflow (the "fill" step). */
export function evaluate(ctx: Ctx, tree: Tree): Plan {
  const { plugged, leaves: withAlike } = alikeIn(ctx, tree.root);
  const sizes = withAlike.length > 0 ? setSizes(ctx, withAlike, plugged) : undefined;
  const levelCache = new Map<Leaf, Level[]>();
  const levelsOf = (leaf: Leaf): Level[] => {
    const hit = levelCache.get(leaf);
    if (hit) {
      return hit;
    }
    const lv = stackLevels(ctx, leaf.stack, plugged, sizes);
    levelCache.set(leaf, lv);
    return lv;
  };
  const floor: Rect = { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD };
  // The last step of planning (the context may grow trays) puts the room left where it belongs: with
  // the trays that grow, else at the wall (`packedToWall`). The search itself keeps the shares it
  // moves: it scores the same tree, and packing is no part of finding a fit (measured: with it in
  // the search, a tight box lost its fit on the default seed).
  const reserved = ctx.areas.length > 0 ? reservedOf(ctx, tree) : [];
  // With areas the trays stay where the search put them: its cuts were drawn to the areas' edges,
  // and packing the room to the wall would move stacks across them.
  const growsIn =
    ctx.growing && reserved.length === 0
      ? (leaf: Leaf, axis: "x" | "y"): boolean =>
          levelsOf(leaf).some((l) => (axis === "x" ? l.growW > 0 : l.growD > 0))
      : undefined;
  const placement = placeLeaves(
    growsIn === undefined ? tree.root : packedToWall(tree.root, growsIn),
    floor,
    ctx.gap,
    (leaf) => stackMinFootprint(ctx, levelsOf(leaf)),
    reserved.length > 0 ? snapOf(ctx, reserved) : undefined,
  );
  // The stacks under an area stop at the low plane and are filled to it, whatever the fill setting
  // says: the paper needs one level top. The leaves tile the floor, so nothing under it is bare.
  const under = underCtx(ctx);
  const trays: PlacedTray[] = [];
  const leftovers: PlacedLeftover[] = [];
  let z = 0;
  let zMax = 0;
  let bed = 0;
  let lock = 0;
  const air: Air[] = [];
  let stack = 0;
  const pending: { path: string; rect: Rect; h: U }[] = [];
  const inLevel: { path: string; stack: number; filler: LevelFiller }[] = [];
  const extras = withAlike.length > 0 ? alikeGrowth(ctx, placement.leaves, levelsOf) : undefined;
  for (const pl of placement.leaves) {
    const levels = levelsOf(pl.leaf);
    const below = reserved.some((r) => overlaps(r.rect, pl.rect));
    const sctx = below ? under : ctx;
    const sp = placeStack(sctx, levels, pl.rect, extras);
    z += sp.overflowZ;
    zMax = Math.max(zMax, sp.overflowZ);
    lock += sp.overflowLock;
    air.push(...sp.air);
    if (sp.trays.length > 0) {
      for (const t of sp.trays) {
        trays.push({ ...t, path: pl.path, stack, under: below });
        bed += bedExcess(ctx.bed, t.w, t.d, printedHeight(ctx, t.h, t.rim, t.level > 0 || t.plug));
      }
      for (const filler of sp.fillers) {
        inLevel.push({ path: pl.path, stack, filler });
      }
      stack++;
    }
    for (const r of sp.leftovers) {
      pending.push({ path: pl.path, rect: r, h: Math.max(0, sctx.topPlane) });
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
        h: p.h,
        solid: solidFor(piece, p.h),
      });
      bed += bedExcess(ctx.bed, piece.w, piece.d, p.h);
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
    overflow: { x: ox + reserveClash(reserved), y: oy, z, bed, lock },
    air,
    reserved,
    shortfall: { x: ox, y: oy, z: zMax },
    crossX: maxCrossing(bottoms, true),
    crossY: maxCrossing(bottoms, false),
    playX: rowPlayU(ctx.floorW + 2 * ctx.boxClearance, bottoms, true),
    playY: rowPlayU(ctx.floorD + 2 * ctx.boxClearance, bottoms, false),
  };
}
