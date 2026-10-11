import { MIN_FEATURE_MM } from "../model/settings";
import type { Settings, Side } from "../model/types";
import { UPPER_MIN_CHAMFER, UPPER_TRAY_MIN_ABOVE_LIP } from "./constants";
import { pocketSides } from "./common";
import type { CompartmentReq, OuterSize, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, fromU, maxOf, sum, toU } from "./units";

/** Outer wall thickness: lipped walls are max(wall, lip.thickness + lip.ledge) (spec §6.1). */
export function wallFor(settings: Settings, lipped: boolean): number {
  const base = Math.max(settings.wall, MIN_FEATURE_MM);
  if (!lipped || !settings.lip.enabled) {
    return base;
  }
  return Math.max(base, settings.lip.thickness + settings.lip.ledge);
}

/**
 * The smallest outer footprint side and height (0.01 mm units) the geometry builds under a 45°
 * bottom chamfer c: 2·(c + MIN_FEATURE_MM) and c + MIN_FEATURE_MM (plan 3, planTray). c is
 * bottomChamfer, at least UPPER_MIN_CHAMFER above level 0; spacers pass level 0.
 */
export function chamferMinimumsU(settings: Settings, level: number): { side: number; h: number } {
  const base = Math.max(0, settings.bottomChamfer);
  const c = level > 0 ? Math.max(base, UPPER_MIN_CHAMFER) : base;
  return { side: ceilU(2 * (c + MIN_FEATURE_MM)), h: ceilU(c + MIN_FEATURE_MM) };
}

/** strip → one row; rows2 → first ceil(n/2) items, then the rest. Empty rows are dropped. */
export function rowsOf<T>(arrangement: TrayPartReq["arrangement"], items: readonly T[]): T[][] {
  if (arrangement === "strip") {
    return [items.slice()];
  }
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)].filter((row) => row.length > 0);
}

/** Minimum layout in integer 0.01 mm units. */
export interface MinLayout {
  wall: number;
  divider: number;
  floor: number;
  rows: CompartmentReq[][]; // rowsOf(part.arrangement, part.compartments)
  widths: number[][]; // per row: each compartment's minW, rounded up
  rowDepths: number[]; // per row: the deepest compartment's minD, rounded up
  innerW: number;
  innerD: number;
  w: number; // innerW + 2·wall, or more for the bottom chamfer (chamferMinimumsU)
  d: number;
  h: number;
}

function hasPocketOn(part: TrayPartReq, sides: readonly Side[]): boolean {
  return part.compartments.some((c) => pocketSides(c.features).some((s) => sides.includes(s)));
}

export function minLayoutU(part: TrayPartReq, settings: Settings, opts: RealizeOptions): MinLayout {
  if (part.compartments.length === 0) {
    throw new RangeError(`Tray part ${part.trayKey} has no compartments`);
  }
  // Every minimum rounds up, so a setting that is not a whole 0.01 mm is never undershot.
  // Compartment minimums are already whole units (see compartment()).
  const wall = ceilU(wallFor(settings, opts.lipped));
  const divider = ceilU(Math.max(settings.divider, MIN_FEATURE_MM));
  const floor = ceilU(Math.max(settings.floor, MIN_FEATURE_MM));
  // An even unit count, so the centred pocket slot can sit on whole units inside the walls.
  const pocketU = ceilU(settings.fingerPocket.width);
  const pocketWidth = pocketU + (pocketU % 2);
  const rows = rowsOf(part.arrangement, part.compartments);
  const widths = rows.map((row) => row.map((c) => toU(c.minW)));
  const rowWidths = widths.map((row) => sum(row) + (row.length - 1) * divider);
  const rowDepths = rows.map((row) => maxOf(row.map((c) => toU(c.minD))));
  const innerW = Math.max(maxOf(rowWidths), hasPocketOn(part, ["front", "back"]) ? pocketWidth : 0);
  const innerD = Math.max(
    sum(rowDepths) + (rows.length - 1) * divider,
    hasPocketOn(part, ["left", "right"]) ? pocketWidth : 0,
  );
  const content = floor + maxOf(part.compartments.map((c) => toU(c.minH)));
  const chamfer = chamferMinimumsU(settings, opts.level);
  const h = Math.max(
    content,
    chamfer.h,
    opts.level > 0 && settings.lip.enabled
      ? ceilU(settings.lip.height + UPPER_TRAY_MIN_ABOVE_LIP)
      : 0,
  );
  return {
    wall,
    divider,
    floor,
    rows,
    widths,
    rowDepths,
    innerW,
    innerD,
    w: Math.max(innerW + 2 * wall, chamfer.side),
    d: Math.max(innerD + 2 * wall, chamfer.side),
    h,
  };
}

/** Smallest outer box (tray's own frame, lip excluded) that holds the part (roadmap §4.2). */
export function minOuter(part: TrayPartReq, settings: Settings, opts: RealizeOptions): OuterSize {
  const m = minLayoutU(part, settings, opts);
  return { w: fromU(m.w), d: fromU(m.d), h: fromU(m.h) };
}
