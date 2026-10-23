import { MIN_FEATURE_MM, chamferMinimums, effective, topPlane } from "../model/settings";
import { bottomMinimums, leastRiser, lipAbove, stepBelow, upperTrayMinH } from "../model/lip";
import type { Settings } from "../model/types";
import { minOuter, outerCutSides, wallFor, type OuterCutSides } from "../sizing";
import { growthCapU, partGrowthCapOf } from "../sizing/growth";
import { MIN_GRIP, ONE_WALL_MAX_MM } from "../sizing/constants";
import type { OuterSize, RealizeOptions, TrayPartReq, TrayRequirement } from "../sizing/types";
import { fitsBed, type Bed } from "./bed";
import type { LayoutInput } from "./types";
import { roundUpTo, toU, toUCeil, toUFloor, type U } from "./units";

/** Same signature as sizing's minOuter; injectable so unit tests can use fixed sizes. */
export type Measure = (part: TrayPartReq, settings: Settings, opts: RealizeOptions) => OuterSize;

/** "No limit" for slack capacities. */
export const INF_U: U = 1_000_000_000;
/** Most trays in one stack. */
export const MAX_LEVELS = 4;
/** Longest guillotine path accepted from locks or stored layouts. */
export const MAX_DEPTH = 32;
/** Smallest inner dimension that counts as a grip (hard rule 8): sizing's MIN_GRIP. */
export const GRIP_U: U = toU(MIN_GRIP);

export interface PartRef {
  readonly req: number;
  readonly variant: number;
  readonly part: number;
}

/** Minimum outer size of a part (unrotated frame) and how much slack it absorbs per axis. */
export interface PartMetrics {
  readonly w: U;
  readonly d: U;
  readonly h: U;
  /** Footprint slack absorbable without a filler part: what the contents may grow plus what the walls take (unbounded → INF_U). */
  readonly capW: U;
  readonly capD: U;
  /** The part of capW / capD that is room for the contents (growth, spec §5), without the walls. */
  readonly growW: U;
  readonly growD: U;
  /** Some compartment can grow deeper (scoop): height slack goes here first, up to `growH`. */
  readonly elasticH: boolean;
  /** Most height slack the compartments that grow deeper can take, in the part's own frame (unbounded → INF_U). */
  readonly growH: U;
}

/** A size lock in units, in the box frame (after rotation). */
export interface FixedSize {
  readonly w: U;
  readonly d: U;
  readonly h: U;
  readonly rotated: boolean;
}

export interface Ctx {
  readonly input: LayoutInput;
  /** Box floor minus 2·boxClearance. */
  readonly floorW: U;
  readonly floorD: U;
  readonly topPlane: U;
  readonly boxClearance: U;
  /**
   * What `oneWall` lets one wall take per axis (0 when off), already part of every part's capW /
   * capD. It is room the contents cannot use, so the score counts it as wasted, unlike
   * wallAbsorb's thin walls: the setting trades filament for parts, not for free space.
   */
  readonly oneWallCap: U;
  readonly gap: U;
  /** Nominal lateral play above this is penalized and warned about (hard rule 1): settings.playLimit. */
  readonly playLimit: U;
  readonly layer: U;
  /** The rim between layers is on (either joint): a tray with another on it is `lipped`. */
  readonly lipOn: boolean;
  /** The lip's height with the rim (0 with the stepped base); a lipped tray prints this much taller than its `h`. */
  readonly lipHeight: U;
  /** The step's slab with the stepped base (0 otherwise); a tray above level 0 prints this much taller. */
  readonly stepHeight: U;
  /** Minimum h of a tray at level ≥ 1 when the lip is on: what its groove needs (`upperTrayMinH`, 3.65 mm by default). */
  readonly upperMinH: U;
  /**
   * The surplus height a stack of alike trays must have beyond its trays, for the riser its bottom
   * tray stands on (`leastRiser`, in whole layers); 0 without the lip or without fillToTop, when
   * no riser is made.
   */
  readonly riserMin: U;
  /** Base outer wall and floor as sizing writes them: wallFor, floor ≥ MIN_FEATURE_MM, rounded up. */
  readonly wall: U;
  /**
   * The outer wall of a filler in a stack level (level ≥ 1), which has the groove a tray above
   * level 0 has when the lip is on: `wall`, or what the groove leaves around the wells.
   */
  readonly upperWall: U;
  readonly floor: U;
  /**
   * Thinnest leftover (filler) part there is: what planTray accepts, i.e. what the level-0 bottom
   * chamfer needs (2 × (chamfer + 0.8 mm)), and never under one wall. A gap narrower than this
   * cannot be a part, so the neighbouring tray absorbs it (spec §7.2).
   */
  readonly minFiller: U;
  /**
   * The same for a filler beside an upper tray (level 1 and up): trays above level 0 carry at
   * least UPPER_MIN_CHAMFER, and with the lip on a groove along their outer edge, so planTray
   * needs more of them.
   */
  readonly minFillerUpper: U;
  readonly bed: Bed;
  /** Size locks keyed by partId. */
  readonly sizeLocks: ReadonlyMap<number, FixedSize>;
  /**
   * Per requirement: some variant holds each copy in one tray, and each of those trays fits on its
   * own, i.e. alone in a stack (level 0, no lip), on the box floor (turned only if it may be)
   * under the top plane, and on the print bed in either orientation (groups spec §6.3). When it is
   * true the score charges a split (`split`); when no whole tray can fit, splitting is free.
   */
  readonly wholeFits: readonly boolean[];
  /**
   * The trays a variant has beyond one per copy: each copy's parts less one, summed over the
   * copies. A copy is the trays whose keys differ only in their part number
   * (`<key>:p<c>:<part>`), so one tray per player is no split, a three-tray split of one deck is
   * two, and four players' decks each split in two are four.
   */
  extraParts(req: number, variant: number): number;
  /** Which copy of its variant a part belongs to (see `extraParts`): 0, 1, … in order of first part. */
  copyOf(ref: PartRef): number;
  /**
   * The set of trays a part is one of: the same tray (its place in its copy) of every copy of its
   * variant, a number from 0, shared by all of them; -1 for a tray with no copy. Trays of a set are
   * built the same size and the same way wherever they stand (owner, 2026-10-23).
   */
  alikeOf(ref: PartRef): number;
  part(ref: PartRef): TrayPartReq | undefined;
  partId(ref: PartRef): number;
  metrics(ref: PartRef, lipped: boolean, level: number): PartMetrics;
  /**
   * The outer walls a finger cut passes through, in the box frame (a part turned 90° counter-
   * clockwise has its front wall on the right, its right on the back, and so on).
   */
  cutSides(ref: PartRef, rotated: boolean): OuterCutSides;
  refsOfKey(trayKey: string): PartRef[];
}

/**
 * How tall a tray prints: its height, plus the lip a lipped tray carries on top (the rim), or the
 * slab an `upper` tray (above level 0) hangs below it (the stepped base). The print bed's Z limit
 * (hard rule 5) applies to this, not to `h`.
 */
export function printedHeight(ctx: Ctx, h: U, lipped: boolean, upper = false): U {
  return h + (lipped ? ctx.lipHeight : 0) + (upper ? ctx.stepHeight : 0);
}

/** partId's base for the variant and part indices: each must be below it. */
const PART_ID_RADIX = 256;

export function partId(ref: PartRef): number {
  return (ref.req * PART_ID_RADIX + ref.variant) * PART_ID_RADIX + ref.part;
}

/**
 * How much room the part's contents can take along an axis (its growth settings, spec §5; INF_U
 * when unbounded). The sizing layer owns the arithmetic, so what the layout assumes a tray can
 * absorb is what realizeTray then does.
 */
function growth(part: TrayPartReq, axis: "w" | "d"): U {
  return Math.min(INF_U, partGrowthCapOf(part, axis));
}

/** The most height slack the part's compartments that grow deeper can take: the largest of their caps. */
function growthH(part: TrayPartReq): U {
  let best = 0;
  for (const c of part.compartments) {
    best = Math.max(best, growthCapU(c, "h"));
  }
  return Math.min(INF_U, best);
}

/** The copy a tray key belongs to: the key without its last segment, the part number. */
function copyKey(trayKey: string): string {
  const cut = trayKey.lastIndexOf(":");
  return cut < 0 ? trayKey : trayKey.slice(0, cut);
}

/** The parts of every copy of the variant beyond its first, summed over the copies (see Ctx.extraParts). */
function extraPartsOf(parts: readonly TrayPartReq[]): number {
  const perCopy = new Map<string, number>();
  for (const p of parts) {
    const c = copyKey(p.trayKey);
    perCopy.set(c, (perCopy.get(c) ?? 0) + 1);
  }
  let extra = 0;
  for (const n of perCopy.values()) {
    extra += n - 1;
  }
  return extra;
}

export function createCtx(input: LayoutInput, measure: Measure = minOuter): Ctx {
  const { box, printer, settings } = input;
  const eff = effective(settings);
  const boxClearance = toU(eff.boxClearance);
  // Rounded up like sizing (roadmap §4.7): never below MIN_WALL_MM.
  const wall = toUCeil(wallFor(settings, false));
  const upperWall = toUCeil(wallFor(settings, false, 1));
  // Walls thicken inward by at most `wallAbsorb` each, so both sides of an axis absorb twice that
  // (spec §7.2). Rounded down like realize's cap: it is a maximum.
  // With `oneWall` one wall on each axis takes up to ONE_WALL_MAX_MM instead (it subsumes wallAbsorb).
  const wallCap = settings.oneWall ? toUFloor(ONE_WALL_MAX_MM) : 2 * toUFloor(settings.wallAbsorb);
  const cache = new Map<number, PartMetrics>();
  const cutCache = new Map<number, OuterCutSides>();
  const byKey = new Map<string, PartRef[]>();
  input.requirements.forEach((r: TrayRequirement, req) => {
    // partId packs variant and part into one byte each
    if (r.variants.length > PART_ID_RADIX) {
      throw new RangeError(`requirement "${r.key}" has more than ${PART_ID_RADIX} variants`);
    }
    r.variants.forEach((v, variant) => {
      if (v.parts.length > PART_ID_RADIX) {
        throw new RangeError(
          `variant "${v.id}" of requirement "${r.key}" has more than ${PART_ID_RADIX} parts`,
        );
      }
      v.parts.forEach((p, part) => {
        const list = byKey.get(p.trayKey) ?? [];
        list.push({ req, variant, part });
        byKey.set(p.trayKey, list);
      });
    });
  });
  const part = (ref: PartRef): TrayPartReq | undefined =>
    input.requirements[ref.req]?.variants[ref.variant]?.parts[ref.part];
  const extra = input.requirements.map((r) => r.variants.map((v) => extraPartsOf(v.parts)));
  const copies = input.requirements.map((r) =>
    r.variants.map((v) => {
      const seen: string[] = [];
      return v.parts.map((p) => {
        const c = copyKey(p.trayKey);
        if (!seen.includes(c)) {
          seen.push(c);
        }
        return seen.indexOf(c);
      });
    }),
  );
  // The sets of alike trays: per requirement, variant and place in the copy, with a copy each
  let sets = 0;
  const alike = input.requirements.map((r) =>
    r.variants.map((v) => {
      const seen = new Map<string, number>();
      const place = v.parts.map((p) => {
        const c = copyKey(p.trayKey);
        const n = seen.get(c) ?? 0;
        seen.set(c, n + 1);
        return n;
      });
      const members = new Map<number, number[]>();
      place.forEach((n, part) => members.set(n, [...(members.get(n) ?? []), part]));
      const out: number[] = v.parts.map(() => -1);
      for (const parts of members.values()) {
        if (parts.length >= 2) {
          for (const part of parts) {
            out[part] = sets;
          }
          sets++;
        }
      }
      return out;
    }),
  );
  const ctx: Ctx = {
    input,
    floorW: toUFloor(box.innerWidth) - 2 * boxClearance,
    floorD: toUFloor(box.innerDepth) - 2 * boxClearance,
    topPlane: toUFloor(topPlane(box, settings)),
    boxClearance,
    oneWallCap: settings.oneWall ? toUFloor(ONE_WALL_MAX_MM) : 0,
    gap: toU(eff.trayGap),
    playLimit: toU(settings.playLimit),
    layer: Math.max(1, toU(printer.layerHeight)),
    lipOn: settings.lip.enabled,
    lipHeight: toU(lipAbove(settings, true)),
    stepHeight: toU(stepBelow(settings, 1)),
    upperMinH: toUCeil(upperTrayMinH(settings)),
    riserMin:
      settings.lip.enabled && settings.fillToTop
        ? roundUpTo(toUCeil(leastRiser(settings)), Math.max(1, toU(printer.layerHeight)))
        : 0,
    wall,
    upperWall,
    floor: toUCeil(Math.max(settings.floor, MIN_FEATURE_MM)),
    minFiller: Math.max(wall, toUCeil(chamferMinimums(settings, 0).side)),
    minFillerUpper: Math.max(upperWall, toUCeil(bottomMinimums(settings, 1).side)),
    bed: {
      w: toUFloor(printer.bedX - 2 * printer.bedMargin),
      d: toUFloor(printer.bedY - 2 * printer.bedMargin),
      z: toUFloor(printer.bedZ),
    },
    sizeLocks: new Map(),
    part,
    partId,
    metrics(ref, lipped, level) {
      const key = partId(ref) * 32 + (lipped ? 16 : 0) + Math.min(level, 15);
      const hit = cache.get(key);
      if (hit) {
        return hit;
      }
      const p = part(ref);
      if (!p) {
        throw new RangeError(`unknown tray ${ref.req}/${ref.variant}/${ref.part}`);
      }
      const o = measure(p, settings, { lipped, level });
      const growW = growth(p, "w");
      const growD = growth(p, "d");
      const m: PartMetrics = {
        w: toUCeil(o.w),
        d: toUCeil(o.d),
        h: toUCeil(o.h),
        capW: Math.min(INF_U, growW + wallCap),
        capD: Math.min(INF_U, growD + wallCap),
        growW,
        growD,
        elasticH: p.compartments.some((c) => c.elastic.h),
        growH: growthH(p),
      };
      cache.set(key, m);
      return m;
    },
    cutSides(ref, rotated) {
      const id = partId(ref);
      let own = cutCache.get(id);
      if (own === undefined) {
        const p = part(ref);
        own = p
          ? outerCutSides(p, settings, { lipped: false, level: 0 })
          : { left: false, right: false, front: false, back: false };
        cutCache.set(id, own);
      }
      // turned 90° counter-clockwise (sizing's rotateRealized): front → right → back → left → front
      return rotated ? { right: own.front, back: own.right, left: own.back, front: own.left } : own;
    },
    refsOfKey: (trayKey) => byKey.get(trayKey) ?? [],
    wholeFits: [],
    extraParts: (req, variant) => extra[req]?.[variant] ?? 0,
    copyOf: (ref) => copies[ref.req]?.[ref.variant]?.[ref.part] ?? 0,
    alikeOf: (ref) => alike[ref.req]?.[ref.variant]?.[ref.part] ?? -1,
  };
  return { ...ctx, wholeFits: input.requirements.map((_, req) => wholeFitsOf(ctx, req)) };
}

/**
 * Ctx.wholeFits for one requirement. Each tray is measured as it would stand alone in a stack:
 * level 0, without the lip a tray carries only under another, so this is the least room a whole
 * tray can ever need (a lower bound: a tray that does not fit here fits nowhere); the margins are the engine's own (the floor less the box clearance, the top
 * plane, the bed less its margin). Whether the rest of the box leaves it room is the search's
 * business, not this test's: a whole tray that fits here but not beside the others overflows, and
 * overflow outweighs the split term.
 */
function wholeFitsOf(ctx: Ctx, req: number): boolean {
  const variants = ctx.input.requirements[req]?.variants ?? [];
  return variants.some(
    (v, variant) =>
      v.parts.length > 0 &&
      ctx.extraParts(req, variant) === 0 &&
      v.parts.every((p, part) => {
        const m = ctx.metrics({ req, variant, part }, false, 0);
        const onFloor =
          (m.w <= ctx.floorW && m.d <= ctx.floorD) ||
          (p.rotatable && m.d <= ctx.floorW && m.w <= ctx.floorD);
        return onFloor && m.h <= ctx.topPlane && fitsBed(ctx.bed, m.w, m.d, m.h);
      }),
  );
}

export function withSizeLocks(ctx: Ctx, sizeLocks: ReadonlyMap<number, FixedSize>): Ctx {
  return { ...ctx, sizeLocks };
}
