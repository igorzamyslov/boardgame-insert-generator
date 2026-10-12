import { MIN_FEATURE_MM, chamferMinimums, effective, topPlane } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter, wallFor } from "../sizing";
import { MIN_GRIP, UPPER_TRAY_MIN_ABOVE_LIP, WALL_GROW_LIMIT } from "../sizing/constants";
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
/** Leftover regions narrower than this are absorbed into the neighbouring tray (spec §7.2). */
export const SLIVER_U: U = 1200;
/**
 * Thinnest leftover piece that is ever printed (forced by a bed or size-lock cap); Ctx.minPiece
 * raises it to what the bottom chamfer needs.
 */
export const MIN_PIECE_U: U = 300;
/** Smallest inner dimension that counts as a grip (hard rule 8): sizing's MIN_GRIP. */
export const GRIP_U: U = toU(MIN_GRIP);
/** Nominal lateral play above this is penalized and warned about (hard rule 1). */
export const PLAY_LIMIT_U: U = 150;

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
  /** Footprint slack absorbable without a spare compartment (elastic axis → INF_U). */
  readonly capW: U;
  readonly capD: U;
  /** Some compartment can grow deeper (scoop): height slack goes here first. */
  readonly elasticH: boolean;
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
  readonly gap: U;
  /** Per-level inset per side: lip.thickness + effective lip play. */
  readonly inset: U;
  readonly layer: U;
  readonly lipOn: boolean;
  /** The lip's height; a lipped tray prints this much taller than its `h`. */
  readonly lipHeight: U;
  /** Minimum h of a tray at level ≥ 1 when the lip is on: lip.height + UPPER_TRAY_MIN_ABOVE_LIP (3 mm). */
  readonly upperMinH: U;
  /** Base outer wall and floor as sizing writes them: wallFor, floor ≥ MIN_FEATURE_MM, rounded up. */
  readonly wall: U;
  readonly floor: U;
  /** Thinnest leftover piece: MIN_PIECE_U, or more for the level-0 bottom chamfer. */
  readonly minPiece: U;
  readonly bed: Bed;
  /** Size locks keyed by partId. */
  readonly sizeLocks: ReadonlyMap<number, FixedSize>;
  part(ref: PartRef): TrayPartReq | undefined;
  partId(ref: PartRef): number;
  metrics(ref: PartRef, lipped: boolean, level: number): PartMetrics;
  refsOfKey(trayKey: string): PartRef[];
}

/**
 * How tall a tray prints: its height, plus the lip a lipped tray carries on top. The print
 * bed's Z limit (hard rule 5) applies to this, not to `h`.
 */
export function printedHeight(ctx: Ctx, h: U, lipped: boolean): U {
  return lipped ? h + ctx.lipHeight : h;
}

export function partId(ref: PartRef): number {
  return (ref.req * 256 + ref.variant) * 256 + ref.part;
}

function capacity(part: TrayPartReq, axis: "w" | "d", wallCap: U): U {
  const elastic = part.compartments.some((c) => c.elastic[axis] || c.spacerAxis === axis);
  return elastic ? INF_U : wallCap;
}

export function createCtx(input: LayoutInput, measure: Measure = minOuter): Ctx {
  const { box, printer, settings } = input;
  const eff = effective(settings);
  const boxClearance = toU(eff.boxClearance);
  // Rounded up like sizing (roadmap §4.7): never below MIN_WALL_MM.
  const wall = toUCeil(wallFor(settings, false));
  // Walls may thicken inward up to min(2 × wall, WALL_GROW_LIMIT = 4 mm) on both sides (spec §7.2).
  const wallCap = Math.max(0, 2 * (Math.min(2 * wall, toU(WALL_GROW_LIMIT)) - wall));
  const cache = new Map<number, PartMetrics>();
  const byKey = new Map<string, PartRef[]>();
  input.requirements.forEach((r: TrayRequirement, req) => {
    r.variants.forEach((v, variant) => {
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
    gap: toU(eff.trayGap),
    inset: toU(settings.lip.thickness + eff.lipPlay),
    layer: Math.max(1, toU(printer.layerHeight)),
    lipOn: settings.lip.enabled,
    lipHeight: toU(settings.lip.height),
    upperMinH: toU(settings.lip.height) + toU(UPPER_TRAY_MIN_ABOVE_LIP),
    wall,
    floor: toUCeil(Math.max(settings.floor, MIN_FEATURE_MM)),
    minPiece: Math.max(MIN_PIECE_U, toUCeil(chamferMinimums(settings, 0).side)),
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
        throw new RangeError(`unknown part ${ref.req}/${ref.variant}/${ref.part}`);
      }
      const o = measure(p, settings, { lipped, level });
      const m: PartMetrics = {
        w: toUCeil(o.w),
        d: toUCeil(o.d),
        h: toUCeil(o.h),
        capW: capacity(p, "w", wallCap),
        capD: capacity(p, "d", wallCap),
        elasticH: p.compartments.some((c) => c.elastic.h),
      };
      cache.set(key, m);
      return m;
    },
    refsOfKey: (trayKey) => byKey.get(trayKey) ?? [],
  };
}

export function withSizeLocks(ctx: Ctx, sizeLocks: ReadonlyMap<number, FixedSize>): Ctx {
  return { ...ctx, sizeLocks };
}
