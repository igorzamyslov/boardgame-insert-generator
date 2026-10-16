import { POST_MM } from "../model/settings";
import type { GrowthMode } from "../model/types";
import {
  AUTO_GROWTH_CEILING,
  AUTO_GROWTH_FRACTION,
  MIN_REACH_OVERLAP,
  PLATED_RETENTION,
  UNPLATED_RETENTION,
} from "./constants";
import type { CompartmentReq } from "./types";
import { ceilU, floorU, fromU, maxOf } from "./units";

/** "No limit" for growth, in units: the layout's INF_U (src/layout/context.ts) is the same. */
export const UNBOUNDED_U = 1_000_000_000;

/**
 * How many mm more room a compartment may be given along an axis its contents measure `content`
 * mm on (spec §5): nothing for `off`; for `auto` the lesser of AUTO_GROWTH_FRACTION of the content
 * and AUTO_GROWTH_CEILING; the number itself; for `max` no limit (Infinity).
 */
export function growthMm(mode: GrowthMode, content: number): number {
  if (mode === "off") {
    return 0;
  }
  if (mode === "max") {
    return Number.POSITIVE_INFINITY;
  }
  if (mode === "auto") {
    return floorMm(Math.min(content * AUTO_GROWTH_FRACTION, AUTO_GROWTH_CEILING));
  }
  return Math.max(0, mode);
}

/** A growth cap rounded down to a whole 0.01 mm, the unit everything is built in (a cap is a maximum). */
function floorMm(mm: number): number {
  return fromU(floorU(mm));
}

/**
 * How much room a well of an upright stack `stack` mm thick may gain with nothing in it and still
 * leave the stack under its finger cut (minimal-trays spec §5.3). The cut is `cutWidth` wide and
 * centred on the well, width W = stack + room; the stack may stand anywhere in [0, W − stack], so
 * against an end it overlaps the cut by stack − (W − cutWidth) / 2. Asking that to be at least
 * MIN_REACH_OVERLAP gives room ≤ cutWidth + stack − 2 × MIN_REACH_OVERLAP. A stack that cannot
 * overlap by that much even in a well just wide enough for it (a cut leaves POST_MM of the well's
 * end, so it overlaps a stack by at most stack − POST_MM) is asked for that instead, which is the
 * room its cut stays as wide as the setting. Never negative.
 */
export function reachGrowthMm(stack: number, cutWidth: number): number {
  const overlap = Math.min(MIN_REACH_OVERLAP, Math.max(0, stack - POST_MM));
  return Math.max(0, cutWidth + stack - 2 * overlap);
}

/**
 * The same along the stack of an upright deck or stack of tiles, `stack` mm thick, bounded by
 * retention and reachability (spec §5, §5.3). With nothing in the gained room (`plated` false):
 * at most UNPLATED_RETENTION stack thicknesses, so it does not topple, and at most what leaves the
 * stack under its finger cut when it stands against an end (reachGrowthMm; `cutWidth`, the cut's
 * width setting, absent when the component has no cut), whichever is less. With the `separators`
 * plates (any count: a spacer fills the room solid and the cut is placed beside it) PLATED_RETENTION,
 * and with `dividers` that many more times UNPLATED_RETENTION (a divided well is held upright in
 * each of its sections, and the room is no spacer's: plates and dividers do not combine). A number
 * or `max` is cut back to that; `auto` is already below the retention.
 */
export function stackGrowthMm(
  mode: GrowthMode,
  stack: number,
  plated: boolean,
  dividers = 0,
  cutWidth?: number,
): number {
  // UNPLATED_RETENTION is an allowance of slack beyond the stack (growth ≤ stack × allowance), not a
  // multiplier on the width. Undivided, the cards lean across the whole slack W − T. Divided into
  // N + 1 equal sections of W / (N + 1), each holds T / (N + 1) of cards and has slack
  // (W − T) / (N + 1), so the lean per section is the undivided lean over N + 1. Keeping each
  // section within the undivided allowance A therefore gives W − T ≤ (N + 1) × A: the slack term
  // scales, the stack T does not. (The slots' own width is in the well's minimum, not in this.)
  const retention = plated ? PLATED_RETENTION : UNPLATED_RETENTION * (dividers + 1);
  const held = Math.min(growthMm(mode, stack), stack * retention);
  // Reachability needs the stack free to slide: not with plates (it is pinned) and not with
  // dividers, which this does not model (each section would need the same bound on its own).
  return plated || dividers > 0 || cutWidth === undefined
    ? held
    : Math.min(held, reachGrowthMm(stack, cutWidth));
}

type Axis = "w" | "d" | "h";

/** A compartment's growth cap along an axis, in units: 0 when it cannot grow, UNBOUNDED_U when it may take it all. */
export function growthCapU(c: CompartmentReq, axis: Axis): number {
  const spacer = axis === "w" && c.spacerAxis === "w";
  if (!c.elastic[axis] && !spacer) {
    return 0;
  }
  const cap = c.growth?.[axis];
  return cap === undefined ? UNBOUNDED_U : Math.min(UNBOUNDED_U, floorU(cap));
}

/** The loose (non-spacer) compartments of a row that may grow in width. */
function looseInWidth(row: readonly CompartmentReq[]): CompartmentReq[] {
  return row.filter((c) => c.elastic.w && c.spacerAxis !== "w");
}

/** The compartment of a row whose spacer takes the row's spare width: the last one with a spacer. */
function spacerOf(row: readonly CompartmentReq[]): CompartmentReq | undefined {
  for (let i = row.length - 1; i >= 0; i--) {
    if (row[i]?.spacerAxis === "w") {
      return row[i];
    }
  }
  return undefined;
}

/**
 * How much wider a row can be made for its contents, in units (UNBOUNDED_U: no limit): its loose
 * compartments' caps added, or, when it has none, the spacer's.
 */
export function rowWidthCapU(row: readonly CompartmentReq[]): number {
  const loose = looseInWidth(row);
  if (loose.length > 0) {
    return Math.min(
      UNBOUNDED_U,
      loose.reduce((total, c) => total + growthCapU(c, "w"), 0),
    );
  }
  const spacer = spacerOf(row);
  return spacer === undefined ? 0 : growthCapU(spacer, "w");
}

/**
 * How much deeper a row can be made for its contents, in units (0 when nothing in it grows in
 * depth): its elastic compartments all fill the row, so it grows as far as the least tolerant of
 * them allows, counting how much shallower its own minimum is than the row's.
 */
export function rowDepthCapU(row: readonly CompartmentReq[]): number {
  const elastic = row.filter((c) => c.elastic.d);
  if (elastic.length === 0) {
    return 0;
  }
  const depth = maxOf(row.map((c) => ceilU(c.minD)));
  const caps = elastic.map((c) => growthCapU(c, "d") - (depth - ceilU(c.minD)));
  return Math.max(0, Math.min(...caps));
}

/**
 * How much slack a part's tray can give to its contents along its width or depth, in units
 * (UNBOUNDED_U: all of it), for the layout to decide whether a gap becomes a filler or is absorbed.
 * Width: every row takes the slack, so it is the least any row can take. Depth: rows grow
 * separately, so what each can take adds. What a part can't give goes to the walls (`wallAbsorb`),
 * and past that to a filler.
 */
export function partGrowthCapU(rows: readonly CompartmentReq[][], axis: "w" | "d"): number {
  if (axis === "d") {
    return Math.min(
      UNBOUNDED_U,
      rows.reduce((total, row) => total + rowDepthCapU(row), 0),
    );
  }
  const minWidths = rows.map((row) => row.reduce((total, c) => total + ceilU(c.minW), 0));
  const widest = maxOf(minWidths);
  const caps = rows.map((row, r) => rowWidthCapU(row) - (widest - (minWidths[r] ?? 0)));
  return caps.length === 0 ? 0 : Math.max(0, Math.min(...caps));
}
