import { growthOf, togglesOf, type Toggles } from "../model/defaults";
import { roomOf } from "../model/room";
import { packingOf } from "../model/settings";
import type { BulkComponent, BulkItem, Component, GrowthMode, Settings } from "../model/types";
import {
  compartment,
  featuresOf,
  itemLabel,
  mainClearance,
  type OptionsResult,
  type StorageOption,
  wallCutout,
} from "./common";
import { BIN_FREEBOARD, BULK_MIN_SIDE, MAX_H_RATIO, SCOOP_REACH, SHALLOW_H } from "./constants";
import { growthMm } from "./growth";
import type { CompartmentReq } from "./types";

export type BulkShape = "shallow" | "deep";
export const BULK_SHAPES: readonly BulkShape[] = ["shallow", "deep"];

export interface BulkLine {
  volume: number; // mm³ the pile needs, packing included
  side0: number; // per-axis minimum width/depth
  hFloor: number; // smallest useful content depth
}

/**
 * The pile's line. `percent` is the item's "some" room: that many percent more pieces, which is that
 * much more volume in the bin (a pile given as a volume too).
 */
export function bulkLine(
  item: BulkItem,
  clearance: number,
  packingFactor: number,
  percent = 0,
): BulkLine {
  const more = 1 + percent / 100;
  if ("volumeMl" in item) {
    return { volume: item.volumeMl * 1000 * more, side0: BULK_MIN_SIDE, hFloor: 0 };
  }
  const largest = Math.max(item.w, item.d, item.h);
  const smallest = Math.min(item.w, item.d, item.h);
  return {
    volume: ((item.count * item.w * item.d * item.h) / packingFactor) * more,
    side0: Math.max(largest + clearance, BULK_MIN_SIDE),
    hFloor: smallest + clearance,
  };
}

/**
 * Square footprint `side` and content depth `h` with side²·h ≥ volume and h ≤ 1.5·side.
 *
 * `maxFill` caps how deep the pile may be: a bin you have to reach into keeps its pieces within
 * reach, and makes the volume up by spreading wider instead of deeper. A single piece taller
 * than the cap sets its own floor, since nothing can be done about that one.
 */
export function shapeLine(
  line: BulkLine,
  shape: BulkShape,
  maxFill = Number.POSITIVE_INFINITY,
): { side: number; h: number } {
  const cap = Math.max(line.hFloor, maxFill);
  if (shape === "shallow") {
    const h = Math.min(Math.max(SHALLOW_H, line.hFloor), cap);
    return { side: Math.max(line.side0, Math.sqrt(line.volume / h)), h };
  }
  const deepSide = Math.max(line.side0, Math.cbrt(line.volume / MAX_H_RATIO));
  const deepH = Math.max(line.hFloor, SHALLOW_H, line.volume / (deepSide * deepSide));
  if (deepH <= cap) {
    return { side: deepSide, h: deepH };
  }
  const side = Math.max(line.side0, Math.sqrt(line.volume / cap));
  return { side, h: Math.max(line.hFloor, Math.min(cap, line.volume / (side * side))) };
}

/** How much more room a bin's contents may have on each axis (spec §5). */
export type BulkGrowth = Record<"w" | "d" | "h", GrowthMode>;

/**
 * One bulk compartment with the toggles `on`: its curved floor makes it a scoop, its finger cuts a
 * centred cut through its front wall, half its depth (featuresOf).
 */
export function bulkCompartment(
  componentId: string,
  on: Toggles,
  modes: BulkGrowth,
  contents: string,
  line: BulkLine,
  shape: BulkShape,
): CompartmentReq {
  const features = featuresOf(on, [wallCutout("front", 0.5, false)]);
  // A bin with a curved floor is one you reach into, so it stays within reach and keeps a
  // little empty wall above the pile; the capacity comes back as a wider footprint. A bin you
  // open through the wall instead has no such limit.
  const scooped = features.some((f) => f.type === "scoop");
  const { side, h } = shapeLine(line, shape, scooped ? SCOOP_REACH - BIN_FREEBOARD : undefined);
  return compartment({
    componentId,
    contents,
    kind: features.some((f) => f.type === "scoop") ? "scoop" : "well",
    w: side,
    d: side,
    h,
    // More room is more loose pieces: each axis by its own setting, on the bin's own size.
    grow: {
      w: growthMm(modes.w, side),
      d: growthMm(modes.d, side),
      h: growthMm(modes.h, h),
    },
    minVolume: line.volume,
    maxHRatio: MAX_H_RATIO,
    features,
  });
}

/** The packing an item sets for its own pile; the other kinds, which fall back to a bin, have none. */
function ownPacking(c: Component): number | undefined {
  return c.kind === "bulk" || c.kind === "minis" ? c.packing : undefined;
}

/** Pieces of one kind and size, piled loose. */
export interface Pieces {
  name: string;
  count: number;
  w: number;
  d: number;
  h: number;
}

/**
 * Scoop bins for `pieces` of `c`, one per line, with the toggles `on`: the `bulk-shallow` and
 * `bulk-deep` options of minis bulk storage and of the bulk fallback (spec §7.1).
 */
export function binOptions(
  c: Component,
  pieces: readonly Pieces[],
  on: Toggles,
  modes: BulkGrowth,
  s: Settings,
): StorageOption[] {
  const clearance = mainClearance(c, s);
  return BULK_SHAPES.map((shape) => ({
    id: `bulk-${shape}`,
    blocks: pieces.map((p) => [
      bulkCompartment(
        c.id,
        on,
        modes,
        `${itemLabel(c, p.name)} ×${p.count}`,
        bulkLine(p, clearance, packingOf({ packing: ownPacking(c) }, s)),
        shape,
      ),
    ]),
  }));
}

function itemContents(c: BulkComponent, item: BulkItem): string {
  const name = itemLabel(c, item.name);
  return "volumeMl" in item ? `${name} ${item.volumeMl} ml` : `${name} ×${item.count}`;
}

/** Storage options for a bulk component. Precondition: it passes validateComponent. */
export function bulkOptions(c: BulkComponent, s: Settings): OptionsResult {
  const clearance = mainClearance(c, s);
  const on = togglesOf(c);
  const wells = s.biggerWells;
  const modes = {
    w: growthOf(c, "w", false, wells),
    d: growthOf(c, "d", false, wells),
    h: growthOf(c, "h", false, wells),
  };
  const room = roomOf(c);
  const percent = room.mode === "some" ? room.amount : 0;
  return {
    options: BULK_SHAPES.map((shape) => ({
      id: shape,
      blocks: c.items.map((item) => [
        bulkCompartment(
          c.id,
          on,
          modes,
          itemContents(c, item),
          bulkLine(item, clearance, packingOf(c, s), percent),
          shape,
        ),
      ]),
    })),
    notices: [],
  };
}
