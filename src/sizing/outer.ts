import {
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  chamferMinimums,
  effectiveBottomChamfer,
} from "../model/settings";
import type { Settings, Side } from "../model/types";
import { UPPER_TRAY_MIN_ABOVE_LIP } from "./constants";
import { cutoutSides, pocketSides } from "./common";
import type { CompartmentReq, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, maxOf, sum } from "./units";

/**
 * Outer wall thickness: max(wall, MIN_WALL_MM); lipped walls are at least lip.thickness +
 * lip.ledge (spec §6.1).
 */
export function wallFor(settings: Settings, lipped: boolean): number {
  const base = Math.max(settings.wall, MIN_WALL_MM);
  if (!lipped || !settings.lip.enabled) {
    return base;
  }
  return Math.max(base, settings.lip.thickness + settings.lip.ledge);
}

/**
 * chamferMinimums (model/settings: what planTray requires under the 45° bottom chamfer) in whole
 * 0.01 mm units, rounded up. Spacers pass level 0.
 */
export function chamferMinimumsU(settings: Settings, level: number): { side: number; h: number } {
  const min = chamferMinimums(settings, level);
  return { side: ceilU(min.side), h: ceilU(min.h) };
}

/** strip → one row; rows2 → first ceil(n/2) items, then the rest. Empty rows are dropped. */
export function rowsOf<T>(arrangement: TrayPartReq["arrangement"], items: readonly T[]): T[][] {
  if (arrangement === "strip") {
    return [items.slice()];
  }
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)].filter((row) => row.length > 0);
}

/**
 * The finger room (fingerPocket.wallRoom, units) the outer walls get where a wall cutout leaves
 * through them (spec §6.1): per row on the left and right (the row's first and last compartment
 * ask for a cutout there), and on the front (row 0) and the back (the last row). The walls grow
 * inward, so the tray is that much longer on those axes.
 */
export interface CutRoom {
  left: number[];
  right: number[];
  front: number;
  back: number;
}

/** Minimum layout in integer 0.01 mm units. */
export interface MinLayout {
  wall: number;
  divider: number;
  floor: number;
  chamfer: number; // the tray's bottom chamfer (effectiveBottomChamfer), rounded up
  room: CutRoom;
  rows: CompartmentReq[][]; // rowsOf(part.arrangement, part.compartments)
  widths: number[][]; // per row: each compartment's minW
  // per row: the divider after each compartment but the last, and before a spare at the row end;
  // dividers a finger cut passes through get fingerPocket.dividerRoom more (cutDividers)
  gaps: number[][];
  rowDepths: number[]; // per row: the deepest compartment's minD
  innerW: number;
  innerD: number;
  w: number; // innerW + 2·wall, or more for the bottom chamfer (chamferMinimumsU)
  d: number;
  h: number;
}

function hasPocketOn(part: TrayPartReq, sides: readonly Side[]): boolean {
  return part.compartments.some((c) => pocketSides(c.features).some((s) => sides.includes(s)));
}

function cutsOn(c: CompartmentReq | undefined, side: Side): boolean {
  return c !== undefined && cutoutSides(c.features).includes(side);
}

/**
 * The dividers of each row, in units: `divider`, plus fingerPocket.dividerRoom where a finger cut
 * passes through (the compartments on both sides ask for a cutout on that divider). The last entry
 * of a row is the divider before a spare at the row end, which the row's last cutout runs into.
 */
function cutDividers(
  rows: readonly CompartmentReq[][],
  divider: number,
  settings: Settings,
): number[][] {
  const room = ceilU(settings.fingerPocket.dividerRoom);
  return rows.map((row) =>
    row.map((c, i) => {
      const next = row[i + 1];
      const crossed = cutsOn(c, "right") && (next === undefined || cutsOn(next, "left"));
      return divider + (crossed ? room : 0);
    }),
  );
}

function cutRoom(rows: readonly CompartmentReq[][], settings: Settings): CutRoom {
  const room = ceilU(settings.fingerPocket.wallRoom);
  const on = (yes: boolean): number => (yes ? room : 0);
  return {
    left: rows.map((row) => on(cutsOn(row[0], "left"))),
    right: rows.map((row) => on(cutsOn(row[row.length - 1], "right"))),
    front: on((rows[0] ?? []).some((c) => cutsOn(c, "front"))),
    back: on((rows[rows.length - 1] ?? []).some((c) => cutsOn(c, "back"))),
  };
}

export function minLayoutU(part: TrayPartReq, settings: Settings, opts: RealizeOptions): MinLayout {
  if (part.compartments.length === 0) {
    throw new RangeError(`Tray part ${part.trayKey} has no compartments`);
  }
  // Every minimum rounds up, so a setting that is not a whole 0.01 mm is never undershot.
  // Compartment minimums too: size() emits whole units, but a hand-built part may not.
  const wall = ceilU(wallFor(settings, opts.lipped));
  const divider = ceilU(Math.max(settings.divider, MIN_FEATURE_MM));
  const floor = ceilU(Math.max(settings.floor, MIN_FEATURE_MM));
  // An even unit count, so the centred pocket slot can sit on whole units inside the walls.
  const pocketU = ceilU(settings.fingerPocket.width);
  const pocketWidth = pocketU + (pocketU % 2);
  const rows = rowsOf(part.arrangement, part.compartments);
  const room = cutRoom(rows, settings);
  const gaps = cutDividers(rows, divider, settings);
  const widths = rows.map((row) => row.map((c) => ceilU(c.minW)));
  const between = (r: number): number => sum((gaps[r] ?? []).slice(0, -1));
  const rowWidths = widths.map(
    (row, r) => sum(row) + between(r) + (room.left[r] ?? 0) + (room.right[r] ?? 0),
  );
  const rowDepths = rows.map((row) => maxOf(row.map((c) => ceilU(c.minD))));
  const innerW = Math.max(maxOf(rowWidths), hasPocketOn(part, ["front", "back"]) ? pocketWidth : 0);
  const innerD = Math.max(
    sum(rowDepths) + (rows.length - 1) * divider + room.front + room.back,
    hasPocketOn(part, ["left", "right"]) ? pocketWidth : 0,
  );
  const content = floor + maxOf(part.compartments.map((c) => ceilU(c.minH)));
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
    chamfer: ceilU(effectiveBottomChamfer(settings, opts.level)),
    room,
    rows,
    widths,
    gaps,
    rowDepths,
    innerW,
    innerD,
    w: Math.max(innerW + 2 * wall, chamfer.side),
    d: Math.max(innerD + 2 * wall, chamfer.side),
    h,
  };
}
