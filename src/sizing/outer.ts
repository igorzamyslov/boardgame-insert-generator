import { MIN_FEATURE_MM, MIN_WALL_MM, effectiveBottomChamfer } from "../model/settings";
import { bottomEdgeOf, bottomMinimums, grooveWall } from "../model/lip";
import type { BottomEdge } from "../model/lip";
import type { Settings, Side } from "../model/types";
import { UPPER_TRAY_MIN_ABOVE_LIP } from "./constants";
import { cutoutSides } from "./common";
import type { CompartmentReq, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, maxOf, sum } from "./units";

/**
 * Outer wall thickness: max(wall, MIN_WALL_MM); lipped walls are at least lip.thickness +
 * lip.ledge, and with the lip on a tray above level 0 (`level`) is at least what its groove
 * leaves around the wells (grooveWall; 2.25 mm at the defaults) (spec §6.1).
 */
export function wallFor(settings: Settings, lipped: boolean, level = 0): number {
  const base = Math.max(settings.wall, MIN_WALL_MM);
  const grooved = Math.max(base, grooveWall(settings, level));
  if (!lipped || !settings.lip.enabled) {
    return grooved;
  }
  return Math.max(grooved, settings.lip.thickness + settings.lip.ledge);
}

/**
 * bottomMinimums (model/lip: what planTray requires under the 45° bottom chamfer, or the groove
 * of a tray above level 0 with the lip on) in whole 0.01 mm units, rounded up. Spacers pass
 * level 0.
 */
export function chamferMinimumsU(settings: Settings, level: number): { side: number; h: number } {
  const min = bottomMinimums(settings, level);
  return { side: ceilU(min.side), h: ceilU(min.h) };
}

/**
 * The tray's bottom edge (a plain chamfer, or the groove of a tray above level 0 with the lip on)
 * in 0.01 mm units, every length rounded up so the rules cut placement keeps are never undershot.
 */
export function bottomEdgeU(settings: Settings, level: number): BottomEdge {
  const edge = bottomEdgeOf(settings, level);
  return {
    at: (z) => ceilU(edge.at(z / 100)),
    reach: ceilU(edge.reach),
    top: ceilU(edge.top),
    rise: (u) => ceilU(edge.rise(u / 100)),
  };
}

/**
 * strip → one row; rows2 → the first `front` items (the part's `rowBreak`; ceil(n/2) when absent),
 * then the rest. Empty rows are dropped.
 */
export function rowsOf<T>(
  arrangement: TrayPartReq["arrangement"],
  items: readonly T[],
  front: number = Math.ceil(items.length / 2),
): T[][] {
  if (arrangement === "strip") {
    return [items.slice()];
  }
  return [items.slice(0, front), items.slice(front)].filter((row) => row.length > 0);
}

/**
 * The walls and dividers the tray's wall cutouts pass through (placeCutouts), which get finger
 * room: per row its left and right end walls, the front and back walls, per row the divider after
 * each compartment (the last has no divider to widen: it is where the divider before a spare at the
 * row end used to be, and is kept only so requestedWalls and the placed cuts compare equal),
 * and the dividers between rows.
 */
export interface CutWalls {
  left: boolean[];
  right: boolean[];
  front: boolean;
  back: boolean;
  dividers: boolean[][];
  rows: boolean[];
}

/**
 * The finger room (fingerPocket.wallRoom, units) of the outer walls a wall cutout passes through
 * (spec §6.1): per row on the left and right, and on the front and back. The walls grow inward, so
 * the tray is that much longer on those axes.
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
  edge: BottomEdge; // its bottom edge: the chamfer, or the groove (bottomEdgeU), in units
  room: CutRoom;
  rows: CompartmentReq[][]; // rowsOf(part.arrangement, part.compartments, part.rowBreak)
  widths: number[][]; // per row: each compartment's minW
  // per row: the divider after each compartment but the last (the last entry is unused);
  // dividers a finger cut passes through get fingerPocket.dividerRoom more (CutWalls)
  gaps: number[][];
  // the dividers after each row but the last (the last entry is unused); likewise
  rowGaps: number[];
  rowDepths: number[]; // per row: the deepest compartment's minD
  innerW: number;
  innerD: number;
  w: number; // innerW + 2·wall, or more for the bottom chamfer (chamferMinimumsU)
  d: number;
  h: number;
}

function cutsOn(c: CompartmentReq | undefined, side: Side): boolean {
  return c !== undefined && cutoutSides(c.features).includes(side);
}

/**
 * The walls and dividers the requested cuts would pass through: the first guess, which realize
 * corrects to the cuts it places (settleRoom). A row's end walls where its first and last
 * compartment ask for a cut there, the front and back where the first and last row do, a divider
 * where the compartments on both sides ask for a cut on it.
 */
export function requestedWalls(part: TrayPartReq): CutWalls {
  const rows = rowsOf(part.arrangement, part.compartments, part.rowBreak);
  return {
    left: rows.map((row) => cutsOn(row[0], "left")),
    right: rows.map((row) => cutsOn(row[row.length - 1], "right")),
    front: (rows[0] ?? []).some((c) => cutsOn(c, "front")),
    back: (rows[rows.length - 1] ?? []).some((c) => cutsOn(c, "back")),
    dividers: rows.map((row) =>
      row.map((c, i) => {
        const next = row[i + 1];
        return cutsOn(c, "right") && (next === undefined || cutsOn(next, "left"));
      }),
    ),
    rows: rows.slice(1).map(() => false),
  };
}

/**
 * The minimum layout with finger room on the walls and dividers `walls` names (the cuts realize
 * places there; requestedWalls by default): fingerPocket.wallRoom on those outer walls,
 * fingerPocket.dividerRoom on those dividers.
 */
export function minLayoutU(
  part: TrayPartReq,
  settings: Settings,
  opts: RealizeOptions,
  walls: CutWalls = requestedWalls(part),
): MinLayout {
  if (part.compartments.length === 0) {
    throw new RangeError(`Tray ${part.trayKey} has no compartments`);
  }
  // Every minimum rounds up, so a setting that is not a whole 0.01 mm is never undershot.
  // Compartment minimums too: size() emits whole units, but a hand-built part may not.
  const wall = ceilU(wallFor(settings, opts.lipped, opts.level));
  const divider = ceilU(Math.max(settings.divider, MIN_FEATURE_MM));
  const floor = ceilU(Math.max(settings.floor, MIN_FEATURE_MM));
  const rows = rowsOf(part.arrangement, part.compartments, part.rowBreak);
  const wallRoom = ceilU(settings.fingerPocket.wallRoom);
  const dividerRoom = ceilU(settings.fingerPocket.dividerRoom);
  const on = (yes: boolean | undefined, room: number): number => (yes === true ? room : 0);
  const room: CutRoom = {
    left: rows.map((_, r) => on(walls.left[r], wallRoom)),
    right: rows.map((_, r) => on(walls.right[r], wallRoom)),
    front: on(walls.front, wallRoom),
    back: on(walls.back, wallRoom),
  };
  const gaps = rows.map((row, r) =>
    row.map((_, i) => divider + on(walls.dividers[r]?.[i], dividerRoom)),
  );
  const rowGaps = rows.map(
    (_, r) => divider + on(r < rows.length - 1 ? walls.rows[r] : walls.back, dividerRoom),
  );
  const widths = rows.map((row) => row.map((c) => ceilU(c.minW)));
  const between = (r: number): number => sum((gaps[r] ?? []).slice(0, -1));
  const rowWidths = widths.map(
    (row, r) => sum(row) + between(r) + (room.left[r] ?? 0) + (room.right[r] ?? 0),
  );
  const rowDepths = rows.map((row) => maxOf(row.map((c) => ceilU(c.minD))));
  const innerW = maxOf(rowWidths);
  const innerD = sum(rowDepths) + sum(rowGaps.slice(0, -1)) + room.front + room.back;
  // A divided well's floor is thicker by the depth of its slots (floorExtra).
  const content =
    floor + maxOf(part.compartments.map((c) => ceilU(c.minH) + ceilU(c.floorExtra ?? 0)));
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
    edge: bottomEdgeU(settings, opts.level),
    room,
    rows,
    widths,
    gaps,
    rowGaps,
    rowDepths,
    innerW,
    innerD,
    w: Math.max(innerW + 2 * wall, chamfer.side),
    d: Math.max(innerD + 2 * wall, chamfer.side),
    h,
  };
}
