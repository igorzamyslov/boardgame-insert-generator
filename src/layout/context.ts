import { MIN_FEATURE_MM, chamferMinimums, effective, topPlane } from "../model/settings";
import { bottomMinimums } from "../model/lip";
import type { Settings } from "../model/types";
import { minOuter, outerCutSides, wallFor, type OuterCutSides } from "../sizing";
import { growthCapU, partGrowthCapU } from "../sizing/growth";
import { rowsOf } from "../sizing/outer";
import { MIN_GRIP, ONE_WALL_MAX_MM, UPPER_TRAY_MIN_ABOVE_LIP } from "../sizing/constants";
import type { OuterSize, RealizeOptions, TrayPartReq, TrayRequirement } from "../sizing/types";
import type { Bed } from "./bed";
import type { LayoutInput } from "./types";
import { toU, toUCeil, toUFloor, type U } from "./units";

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
  readonly lipOn: boolean;
  /** The lip's height; a lipped tray prints this much taller than its `h`. */
  readonly lipHeight: U;
  /** Minimum h of a tray at level ≥ 1 when the lip is on: lip.height + UPPER_TRAY_MIN_ABOVE_LIP (3 mm). */
  readonly upperMinH: U;
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
 * How tall a tray prints: its height, plus the lip a lipped tray carries on top. The print
 * bed's Z limit (hard rule 5) applies to this, not to `h`.
 */
export function printedHeight(ctx: Ctx, h: U, lipped: boolean): U {
  return lipped ? h + ctx.lipHeight : h;
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
  return Math.min(INF_U, partGrowthCapU(rowsOf(part.arrangement, part.compartments), axis));
}

/** The most height slack the part's compartments that grow deeper can take: the largest of their caps. */
function growthH(part: TrayPartReq): U {
  let best = 0;
  for (const c of part.compartments) {
    best = Math.max(best, growthCapU(c, "h"));
  }
  return Math.min(INF_U, best);
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
  return {
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
    lipHeight: toU(settings.lip.height),
    upperMinH: toU(settings.lip.height) + toU(UPPER_TRAY_MIN_ABOVE_LIP),
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
  };
}

export function withSizeLocks(ctx: Ctx, sizeLocks: ReadonlyMap<number, FixedSize>): Ctx {
  return { ...ctx, sizeLocks };
}
