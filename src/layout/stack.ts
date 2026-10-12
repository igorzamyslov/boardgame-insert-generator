import { fitsBed } from "./bed";
import { INF_U, SLIVER_U, type Ctx, type FixedSize } from "./context";
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
 * Smallest bottom footprint that holds every level: level k is inset k·inset per side,
 * so leaf ≥ req_k + 2·k·inset on both axes (spec §7.2). An empty stack (leftover leaf)
 * needs SLIVER_U on both axes.
 */
export function stackMinFootprint(ctx: Ctx, levels: readonly Level[]): Ext {
  if (levels.length === 0) {
    return { w: SLIVER_U, d: SLIVER_U };
  }
  let w = 0;
  let d = 0;
  for (const l of levels) {
    w = Math.max(w, l.minW + 2 * l.level * ctx.inset);
    d = Math.max(d, l.minD + 2 * l.level * ctx.inset);
  }
  return { w, d };
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

/** Largest bottom footprint allowed by size locks in the stack (INF_U when none). */
export function stackLockCap(ctx: Ctx, levels: readonly Level[]): Ext {
  let w = INF_U;
  let d = INF_U;
  for (const l of levels) {
    if (l.fixed) {
      w = Math.min(w, l.fixed.w + 2 * l.level * ctx.inset);
      d = Math.min(d, l.fixed.d + 2 * l.level * ctx.inset);
    }
  }
  return { w, d };
}

/**
 * Extra bottom footprint (beyond `foot`) every level can absorb without a spare compartment:
 * elastic axes and inward wall growth (spec §7.2 "Fill").
 */
export function stackAbsorb(ctx: Ctx, levels: readonly Level[], foot: Ext): Ext {
  let w = INF_U;
  let d = INF_U;
  for (const l of levels) {
    const usedW = foot.w - 2 * l.level * ctx.inset - l.minW;
    const usedD = foot.d - 2 * l.level * ctx.inset - l.minD;
    w = Math.min(w, Math.max(0, l.capW - usedW));
    d = Math.min(d, Math.max(0, l.capD - usedD));
  }
  return levels.length === 0 ? { w: 0, d: 0 } : { w, d };
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
 * tray (realizeTray turns it into a solid raised floor). Size-locked heights are kept.
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
