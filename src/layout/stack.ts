import { fitsBed } from "./bed";
import { INF_U, type Ctx, type FixedSize } from "./context";
import type { StackItem } from "./tree";
import { roundDownTo, roundUpTo, type Ext, type U } from "./units";

/** One tray of a stack with its requirements in the box frame (rotation applied). */
export interface Level {
  readonly item: StackItem;
  readonly level: number;
  /** Carries a lip: something is stacked on it and the lip is enabled, or it is an alike tray. */
  readonly lipped: boolean;
  /** The set of alike trays it belongs to (`Ctx.alikeOf`), -1 for a tray of no set. */
  readonly alike: number;
  /**
   * An alike tray of a set that stands in a stack: built as a tray in the middle of one is (the lip
   * and the groove's wall, the least height a groove needs, the same height as the others of its
   * set) wherever it stands, so any of the set can take any other's place.
   */
  readonly plug: boolean;
  /**
   * The size every tray of its set is built at, in the box frame (0 for a tray of no set, or while
   * the sizes are not known): the largest its set's places ask of any of them, so they are one size.
   */
  readonly fitW: U;
  readonly fitD: U;
  readonly minW: U;
  readonly minD: U;
  readonly minH: U;
  readonly capW: U;
  readonly capD: U;
  /** The part of capW / capD that is room for the contents, without the walls (spec §5). */
  readonly growW: U;
  readonly growD: U;
  readonly elasticH: boolean;
  /** Most height slack the tray's deeper-growing compartments take. */
  readonly growH: U;
  readonly fixed: FixedSize | undefined;
}

export function stackLevels(
  ctx: Ctx,
  stack: readonly StackItem[],
  plugged?: ReadonlySet<number>,
  sizes?: ReadonlyMap<number, { w: U; d: U }>,
): Level[] {
  const n = stack.length;
  return stack.map((item, k) => {
    // A tray of a set of alike trays is built as one in the middle of a stack when any of its set
    // stands in one, so all of them are the same size and any can take another's place.
    const alike = ctx.alikeOf(item);
    const plug = alike >= 0 && (n > 1 || plugged?.has(alike) === true);
    const own = alike >= 0 ? sizes?.get(alike) : undefined;
    const lipped = ctx.lipOn && (k < n - 1 || plug);
    const m = ctx.metrics(item, lipped, plug ? Math.max(k, 1) : k);
    const rot = item.rotated;
    const fixed = ctx.sizeLocks.get(ctx.partId(item));
    const baseH = (k > 0 || plug) && ctx.lipOn ? Math.max(m.h, ctx.upperMinH) : m.h;
    return {
      item,
      level: k,
      lipped,
      alike,
      plug,
      fitW: own ? (item.rotated ? own.d : own.w) : 0,
      fitD: own ? (item.rotated ? own.w : own.d) : 0,
      minW: Math.max(rot ? m.d : m.w, fixed ? fixed.w : 0),
      minD: Math.max(rot ? m.w : m.d, fixed ? fixed.d : 0),
      minH: baseH,
      capW: rot ? m.capD : m.capW,
      capD: rot ? m.capW : m.capD,
      growW: rot ? m.growD : m.growW,
      growD: rot ? m.growW : m.growD,
      elasticH: m.elasticH,
      growH: m.growH,
      fixed,
    };
  });
}

/**
 * The smallest tray each level needs, bottom → top (spec: minimal trays). Every level stands in
 * the footprint of the tray below it (the lip is flush with the outer face and the tray above has
 * a groove for it, so a stack does not narrow as it rises), so tray k must hold its own
 * requirement and that of every tray above it: `max over j ≥ k of req_j`. Nothing else is asked of
 * a level: whatever room it has beyond that is the level's own slack, which `placeStack` turns
 * into growth the tray's settings allow or into filler parts beside the tray in the same level,
 * so a tray never gets thicker walls for what it happens to sit on.
 */
export function levelMinFootprints(levels: readonly Level[]): Ext[] {
  const out: Ext[] = new Array<Ext>(levels.length);
  let w = 0;
  let d = 0;
  for (let k = levels.length - 1; k >= 0; k--) {
    const l = levels[k];
    if (!l) {
      continue;
    }
    w = Math.max(l.minW, l.fitW, w);
    d = Math.max(l.minD, l.fitD, d);
    out[k] = { w, d };
  }
  return out;
}

/**
 * Smallest bottom footprint that holds every level: every level stands in the one below, flush,
 * so leaf ≥ req_k on both axes (spec §7.2). It is the minimum of the bottom tray
 * (`levelMinFootprints`), which a level's own filler never changes. An empty stack (leftover
 * leaf) needs `ctx.minFiller` on both axes.
 */
export function stackMinFootprint(ctx: Ctx, levels: readonly Level[]): Ext {
  return levelMinFootprints(levels)[0] ?? { w: ctx.minFiller, d: ctx.minFiller };
}

/**
 * A stack the bed can print: its minimum bottom footprint fits the bed in some orientation.
 * A part whose lipped walls (as a lower tray) or grooved walls (as an upper tray)
 * outgrow the bed while it fits plain can only stand alone, or only on top; the
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
 * absorb without a filler: room for its contents (growth: INF_U when unbounded) or the inward wall
 * growth the user allows (spec §7.2 "Fill"). Contents that may grow count the room a stack asks of
 * the tray (`foot` above the tray's own minimum) as free: it is not a choice, and the growth
 * setting bounds what is given beyond it. A tray whose contents cannot grow gets its walls
 * thickened by that room, which comes off the wall growth.
 */
export function levelAbsorb(level: Level, foot: Ext): Ext {
  return {
    w: Math.max(0, level.capW - (level.growW > 0 ? 0 : foot.w - level.minW)),
    d: Math.max(0, level.capD - (level.growD > 0 ? 0 : foot.d - level.minD)),
  };
}

/**
 * Extra size (beyond the size the stack asks of it) the level's tray can give to its own contents
 * alone, without thicker walls: the growth settings (spec §5). A bound on what becomes capacity rather than slop, so a
 * gap past it is a filler even where the walls could still have taken it.
 */
export function levelGrowth(level: Level): Ext {
  return { w: level.growW, d: level.growD };
}

export interface StackHeights {
  readonly h: U[];
  /** Σ minimum heights above topPlane. */
  readonly overflow: U;
  /** Size-locked heights that cannot be met. */
  readonly lockOverflow: U;
  /** The top alike copy carries its rim (best-effort: dropped when the stack cannot afford it). */
  readonly rim: boolean;
  /** The stack has the surplus for the riser its bottom alike copy stands on (best-effort too). */
  readonly riser: boolean;
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
    return { h: [], overflow: 0, lockOverflow: 0, rim: true, riser: true };
  }
  const top = levels[n - 1];
  let lockOverflow = 0;
  const base = levels.map((l, k) => {
    if (l.fixed) {
      lockOverflow += Math.max(0, l.minH - l.fixed.h);
      return l.fixed.h;
    }
    return k < n - 1 || l.plug ? roundUpTo(l.minH, ctx.layer) : l.minH;
  });
  const sum = base.reduce((s, v) => s + v, 0);
  const fill = ctx.input.settings.fillToTop;
  // The alike trays of a stack share the surplus in whole layers, each the same, so they are one
  // height, and the riser splitRisers makes takes it all and leaves them as they were. What is left
  // is a tray of another kind's.
  const plugs = levels.flatMap((l, k) => (l.plug && !l.fixed ? [k] : []));
  const share = (limit: U): U =>
    plugs.length === 0
      ? 0
      : Math.floor(Math.floor((limit - sum) / ctx.layer) / plugs.length) * ctx.layer;
  // The top alike copy's rim stands above the stack and the bottom one stands on a riser carrying the
  // joint, but both are best-effort (owner, 2026-10-23): the stack keeps them while it can afford
  // them, drops the top copy's rim first and then the riser and the groove under the bottom one, and
  // is out of height only when its trays alone are. The copies stay the same size, height and wells.
  const rimmed = top?.plug === true && top.lipped && ctx.lipHeight > 0;
  const tiers: { rim: boolean; riser: boolean }[] = [{ rim: true, riser: true }];
  if (rimmed) {
    tiers.push({ rim: false, riser: true });
  }
  if (plugs.length > 0 && fill && ctx.riserMin > 0) {
    tiers.push({ rim: true, riser: false });
    if (rimmed) {
      tiers.push({ rim: false, riser: false });
    }
  }
  const limitOf = (rim: boolean): U => ctx.topPlane - (rimmed && rim ? ctx.lipHeight : 0);
  const tier = tiers.find((t) => {
    const limit = limitOf(t.rim);
    if (sum > limit) {
      return false;
    }
    return !(fill && plugs.length > 0 && t.riser && share(limit) * plugs.length < ctx.riserMin);
  });
  if (tier === undefined) {
    return { h: base, overflow: sum - ctx.topPlane, lockOverflow, rim: false, riser: false };
  }
  const limit = limitOf(tier.rim);
  const riser = !fill || plugs.length === 0 || share(limit) * plugs.length >= ctx.riserMin;
  const h = [...base];
  if (!fill) {
    return { h, overflow: 0, lockOverflow, rim: tier.rim, riser };
  }
  let extra = limit - sum;
  // Without the riser the copies take no padding: a raised floor nothing takes off would make
  // their wells unlike those of the copies in a stack that has one. The stack stops short instead.
  if (plugs.length > 0 && tier.riser) {
    const each = share(limit);
    for (const k of plugs) {
      h[k] = (h[k] ?? 0) + each;
    }
    extra -= each * plugs.length;
  }
  const free = (l: Level): boolean => !l.fixed && !l.plug;
  let r = -1;
  for (let k = n - 1; k >= 0; k--) {
    if (levels[k] && free(levels[k] as Level)) {
      r = k;
      break;
    }
  }
  if (r < 0) {
    // all fixed: the surplus is a size lock's to answer for; alike trays leave it as air
    return {
      h,
      overflow: 0,
      lockOverflow: plugs.length > 0 ? lockOverflow : lockOverflow + extra,
      rim: tier.rim,
      riser,
    };
  }
  const b = levels.findIndex((l) => free(l) && l.elasticH);
  if (b >= 0 && b !== r) {
    // up to what the compartments that grow deeper may take (spec §5), the rest on to the top tray
    const add = Math.min(
      roundDownTo(extra, ctx.layer),
      roundDownTo(levels[b]?.growH ?? 0, ctx.layer),
    );
    h[b] = (h[b] ?? 0) + add;
    extra -= add;
  }
  h[r] = (h[r] ?? 0) + extra;
  return { h, overflow: 0, lockOverflow, rim: tier.rim, riser };
}
