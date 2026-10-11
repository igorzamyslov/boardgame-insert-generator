import { MIN_FEATURE_MM } from "../model/settings";
import type { Settings, Side } from "../model/types";
import { UPPER_TRAY_MIN_ABOVE_LIP } from "./constants";
import type { OuterSize, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, fromU, maxOf, sum, toU } from "./units";

/** Outer wall thickness: lipped walls are max(wall, lip.thickness + lip.ledge) (spec §6.1). */
export function wallFor(settings: Settings, lipped: boolean): number {
  const base = Math.max(settings.wall, MIN_FEATURE_MM);
  if (!lipped || !settings.lip.enabled) {
    return base;
  }
  return Math.max(base, settings.lip.thickness + settings.lip.ledge);
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
  innerW: number;
  innerD: number;
  w: number;
  d: number;
  h: number;
}

function hasPocketOn(part: TrayPartReq, sides: readonly Side[]): boolean {
  return part.compartments.some((c) =>
    c.features.some(
      (f) => f.type === "fingerPocket" && f.side !== undefined && sides.includes(f.side),
    ),
  );
}

export function minLayoutU(part: TrayPartReq, settings: Settings, opts: RealizeOptions): MinLayout {
  if (part.compartments.length === 0) {
    throw new RangeError(`Tray part ${part.trayKey} has no compartments`);
  }
  // Every minimum rounds up, so a setting that is not a whole 0.01 mm is never undershot.
  const wall = ceilU(wallFor(settings, opts.lipped));
  const divider = ceilU(Math.max(settings.divider, MIN_FEATURE_MM));
  const floor = ceilU(Math.max(settings.floor, MIN_FEATURE_MM));
  // An even unit count, so the centred pocket slot can sit on whole units inside the walls.
  const pocketU = toU(settings.fingerPocket.width);
  const pocketWidth = pocketU + (pocketU % 2);
  const rows = rowsOf(part.arrangement, part.compartments);
  const rowWidths = rows.map(
    (row) => sum(row.map((c) => ceilU(c.minW))) + (row.length - 1) * divider,
  );
  const rowDepths = rows.map((row) => maxOf(row.map((c) => ceilU(c.minD))));
  const innerW = Math.max(maxOf(rowWidths), hasPocketOn(part, ["front", "back"]) ? pocketWidth : 0);
  const innerD = Math.max(
    sum(rowDepths) + (rows.length - 1) * divider,
    hasPocketOn(part, ["left", "right"]) ? pocketWidth : 0,
  );
  const content = floor + maxOf(part.compartments.map((c) => ceilU(c.minH)));
  const h =
    opts.level > 0 && settings.lip.enabled
      ? Math.max(content, ceilU(settings.lip.height + UPPER_TRAY_MIN_ABOVE_LIP))
      : content;
  return { wall, divider, floor, innerW, innerD, w: innerW + 2 * wall, d: innerD + 2 * wall, h };
}

/** Smallest outer box (tray's own frame, lip excluded) that holds the part (roadmap §4.2). */
export function minOuter(part: TrayPartReq, settings: Settings, opts: RealizeOptions): OuterSize {
  const m = minLayoutU(part, settings, opts);
  return { w: fromU(m.w), d: fromU(m.d), h: fromU(m.h) };
}
