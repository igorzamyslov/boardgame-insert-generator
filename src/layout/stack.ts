import { fitsBed } from "./bed";
import { INF_U, type Ctx, type FixedSize } from "./context";
import type { StackItem } from "./tree";
import { roundDownTo, roundUpTo, type Ext, type U } from "./units";

/** One tray of a stack with its requirements in the box frame (rotation applied). */
export interface Level {
  readonly item: StackItem;
  readonly level: number;
  /** Carries a lip: something is stacked on it and the lip is enabled. */
  readonly lipped: boolean;
  readonly minW: U;
  readonly minD: U;
  readonly minH: U;
  readonly capW: U;
  readonly capD: U;
  readonly elasticH: boolean;
  readonly fixed: FixedSize | undefined;
}

export function stackLevels(ctx: Ctx, stack: readonly StackItem[]): Level[] {
  const n = stack.length;
  return stack.map((item, k) => {
    const lipped = ctx.lipOn && k < n - 1;
    const m = ctx.metrics(item, lipped, k);
    const rot = item.rotated;
    const fixed = ctx.sizeLocks.get(ctx.partId(item));
    const baseH = k > 0 && ctx.lipOn ? Math.max(m.h, ctx.upperMinH) : m.h;
    return {
      item,
      level: k,
      lipped,
      minW: Math.max(rot ? m.d : m.w, fixed ? fixed.w : 0),
      minD: Math.max(rot ? m.w : m.d, fixed ? fixed.d : 0),
      minH: baseH,
      capW: rot ? m.capD : m.capW,
      capD: rot ? m.capW : m.capD,
      elasticH: m.elasticH,
      fixed,
    };
  });
}

/**
 * The smallest tray each level needs, bottom → top (spec: minimal trays). Level k is inset
 * `inset` per side inside the tray below it, so tray k must hold its own requirement and the
 * inset footprint of every tray above it: `max over j ≥ k of req_j + 2·(j − k)·inset`. Nothing
 * else is asked of a level: whatever room it has beyond that is the level's own slack, which
 * `placeStack` turns into growth the tray's settings allow or into filler parts beside the
 * tray in the same level, so a tray never gets thicker walls for what it happens to sit on.
 */
export function levelMinFootprints(ctx: Ctx, levels: readonly Level[]): Ext[] {
  const out: Ext[] = new Array<Ext>(levels.length);
  let w = 0;
  let d = 0;
  for (let k = levels.length - 1; k >= 0; k--) {
    const l = levels[k];
    if (!l) {
      continue;
    }
    // everything above is one inset smaller per side, so the tray under it is 2·inset larger
    w = Math.max(l.minW, w + (k < levels.length - 1 ? 2 * ctx.inset : 0));
    d = Math.max(l.minD, d + (k < levels.length - 1 ? 2 * ctx.inset : 0));
    out[k] = { w, d };
  }
  return out;
}

/**
 * Smallest bottom footprint that holds every level: level k is inset k·inset per side,
 * so leaf ≥ req_k + 2·k·inset on both axes (spec §7.2). It is the minimum of the bottom tray
 * (`levelMinFootprints`), which a level's own filler never changes. An empty stack (leftover
 * leaf) needs `ctx.minFiller` on both axes.
 */
export function stackMinFootprint(ctx: Ctx, levels: readonly Level[]): Ext {
  return levelMinFootprints(ctx, levels)[0] ?? { w: ctx.minFiller, d: ctx.minFiller };
}

/**
 * A stack the bed can print: its minimum bottom footprint fits the bed in some orientation.
 * A part whose lipped walls (as a lower tray) or inset footprint (as an upper tray, k·inset
 * per side) outgrow the bed while it fits plain can only stand alone, or only on top; the
 * search never builds a stack that overflows the bed this way (spec §7.2).
 */
export function stackAllowed(ctx: Ctx, stack: readonly StackItem[]): boolean {
  if (stack.length < 2) {
    return true;
  }
  const f = stackMinFootprint(ctx, stackLevels(ctx, stack));
  return fitsBed(ctx.bed, f.w, f.d, 0);
}

/** Largest tray a level may be, from its own size lock (INF_U when it has none). */
export function levelLockCap(level: Level): Ext {
  return level.fixed ? { w: level.fixed.w, d: level.fixed.d } : { w: INF_U, d: INF_U };
}

/**
 * Extra size (beyond `foot`, the size the level's tray is built at) the level's own tray can
 * absorb without a filler: an elastic axis (INF_U) or the inward wall growth the user allows
 * (spec §7.2 "Fill").
 */
export function levelAbsorb(level: Level, foot: Ext): Ext {
  return {
    w: Math.max(0, level.capW - (foot.w - level.minW)),
    d: Math.max(0, level.capD - (foot.d - level.minD)),
  };
}

export interface StackHeights {
  readonly h: U[];
  /** Σ minimum heights above topPlane. */
  readonly overflow: U;
  /** Size-locked heights that cannot be met. */
  readonly lockOverflow: U;
}

/**
 * Heights so that Σ h = topPlane exactly. Every tray except the top one is rounded up to a
 * multiple of the layer height; the top takes the remainder. Height slack goes to the
 * lowest tray with a deeper-growing compartment (scoop), in whole layers, else to the top
 * tray (realizeTray turns it into a raised floor, which materialize splits off as a riser
 * under the stack once it is tall enough, spec §3 rule 2). Size-locked heights are kept. With
 * `settings.fillToTop` off nothing is padded: every tray stays at its content height and the
 * stack may stop short of the top plane.
 */
export function stackHeights(ctx: Ctx, levels: readonly Level[]): StackHeights {
  const n = levels.length;
  if (n === 0) {
    return { h: [], overflow: 0, lockOverflow: 0 };
  }
  let lockOverflow = 0;
  const h = levels.map((l, k) => {
    if (l.fixed) {
      lockOverflow += Math.max(0, l.minH - l.fixed.h);
      return l.fixed.h;
    }
    return k < n - 1 ? roundUpTo(l.minH, ctx.layer) : l.minH;
  });
  const sum = h.reduce((s, v) => s + v, 0);
  if (sum > ctx.topPlane) {
    return { h, overflow: sum - ctx.topPlane, lockOverflow };
  }
  if (!ctx.input.settings.fillToTop) {
    return { h, overflow: 0, lockOverflow };
  }
  let extra = ctx.topPlane - sum;
  let r = -1;
  for (let k = n - 1; k >= 0; k--) {
    if (!levels[k]?.fixed) {
      r = k;
      break;
    }
  }
  if (r < 0) {
    return { h, overflow: 0, lockOverflow: lockOverflow + extra };
  }
  const b = levels.findIndex((l) => !l.fixed && l.elasticH);
  if (b >= 0 && b !== r) {
    const add = roundDownTo(extra, ctx.layer);
    h[b] = (h[b] ?? 0) + add;
    extra -= add;
  }
  h[r] = (h[r] ?? 0) + extra;
  return { h, overflow: 0, lockOverflow };
}
