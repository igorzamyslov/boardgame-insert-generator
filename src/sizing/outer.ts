import { MIN_FEATURE_MM, MIN_WALL_MM, effectiveBottomChamfer } from "../model/settings";
import { bottomEdgeOf, bottomMinimums, grooveWall, rimOn, socketOf, stepWall } from "../model/lip";
import type { BottomEdge } from "../model/lip";
import type { Settings, Side } from "../model/types";
import { cutoutSides } from "./common";
import type { CompartmentReq, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, maxOf, sum } from "./units";

/**
 * Outer wall thickness: max(wall, MIN_WALL_MM); with the rim, lipped walls are at least
 * lip.thickness + lip.ledge, and a tray above level 0 (`level`) is at least what its groove
 * leaves around the wells (grooveWall; 2.25 mm at the defaults) (spec §6.1). The stepped base
 * keeps the base wall on both sides of the joint (its stepWall is under it at the defaults).
 */
export function wallFor(settings: Settings, lipped: boolean, level = 0): number {
  const base = Math.max(settings.wall, MIN_WALL_MM);
  const grooved = Math.max(base, grooveWall(settings, level), stepWall(settings, level));
  if (!lipped || !rimOn(settings)) {
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
 * then the rest; columns → the columns, cut before each index of `breaks` (the part's
 * columnBreaks), each front to back. Empty rows are dropped.
 */
export function rowsOf<T>(
  arrangement: TrayPartReq["arrangement"],
  items: readonly T[],
  front: number = Math.ceil(items.length / 2),
  breaks: readonly number[] = [],
): T[][] {
  if (arrangement === "strip") {
    return [items.slice()];
  }
  if (arrangement === "columns") {
    const bounds = [0, ...breaks, items.length];
    return bounds
      .slice(1)
      .map((end, k) => items.slice(bounds[k] ?? 0, end))
      .filter((column) => column.length > 0);
  }
  return [items.slice(0, front), items.slice(front)].filter((row) => row.length > 0);
}

/** The part's lines in order: its rows (strip, rows2), or its columns (rowsOf). */
export function linesOf(part: TrayPartReq): CompartmentReq[][] {
  return rowsOf(part.arrangement, part.compartments, part.rowBreak, part.columnBreaks);
}

/**
 * The walls and dividers the tray's wall cutouts pass through (placeCutouts), which get finger
 * room. Rows (strip, rows2): per row its left and right end walls, the front and back walls (one
 * entry each), per row the divider after each compartment (the last has no divider to widen: it is
 * where the divider before a spare at the row end used to be, and is kept only so requestedWalls and
 * the placed cuts compare equal), and the dividers between rows. Columns (group-tray-fill spec §3
 * (b)), the same turned: per column its front and back end walls, the left and right walls (one
 * entry each), per column the divider behind each compartment (the last likewise unused), and the
 * dividers between columns (`rows`).
 */
export interface CutWalls {
  left: boolean[];
  right: boolean[];
  front: boolean[];
  back: boolean[];
  dividers: boolean[][];
  rows: boolean[];
}

/**
 * The finger room (fingerPocket.wallRoom, units) of the outer walls a wall cutout passes through
 * (spec §6.1), entry for entry as CutWalls: rows have it per row on the left and right, columns per
 * column on the front and back. The walls grow inward, so the tray is that much longer on those
 * axes.
 */
export interface CutRoom {
  left: number[];
  right: number[];
  front: number[];
  back: number[];
}

/** Minimum layout in integer 0.01 mm units. */
export interface MinLayout {
  wall: number;
  divider: number;
  floor: number;
  chamfer: number; // the tray's bottom chamfer (effectiveBottomChamfer), rounded up
  edge: BottomEdge; // its bottom edge: the chamfer, or the groove (bottomEdgeU), in units
  room: CutRoom;
  // linesOf(part): the rows, or for columns the columns (every per-row field below is then per
  // column, its gaps the dividers behind each compartment, rowGaps those right of each column)
  rows: CompartmentReq[][];
  widths: number[][]; // per row: each compartment's minW
  depths: number[][]; // per row: each compartment's minD
  // per row: the divider after each compartment but the last (the last entry is unused);
  // dividers a finger cut passes through get fingerPocket.dividerRoom more (CutWalls)
  gaps: number[][];
  // the dividers after each row but the last (the last entry is unused); likewise
  rowGaps: number[];
  rowDepths: number[]; // per row: the deepest compartment's minD (columns: unused, empty)
  columnWidths: number[]; // columns only (else empty): per column, its widest compartment's minW
  innerW: number;
  innerD: number;
  w: number; // innerW + 2·wall, or more for the bottom chamfer (chamferMinimumsU)
  d: number;
  h: number;
  /**
   * The height the contents alone ask for: the floor and the deepest compartment (and the
   * slots of a divided well's floor). `h` is this, or more where the bottom chamfer or the upper
   * tray's minimum asks for more; the difference is height the tray has beyond its contents.
   */
  content: number;
  /**
   * The room a socketed tray (lipped, with the stepped base) keeps over its contents for the slab
   * of the tray above (model/lip socketOf: its depth), rounded up; 0 otherwise. `h` is at least
   * content + socket, and every well's contents stay that far under the rim.
   */
  socket: number;
}

function cutsOn(c: CompartmentReq | undefined, side: Side): boolean {
  return c !== undefined && cutoutSides(c.features).includes(side);
}

/**
 * The walls and dividers the requested cuts would pass through: the first guess, which realize
 * corrects to the cuts it places (settleRoom). A row's end walls where its first and last
 * compartment ask for a cut there, the front and back where the first and last row do, a divider
 * where the compartments on both sides ask for a cut on it. Columns the same turned: a column's
 * front and back walls by its first and last compartment, the left and right walls by the first
 * and last column.
 */
export function requestedWalls(part: TrayPartReq): CutWalls {
  const rows = linesOf(part);
  if (part.arrangement === "columns") {
    return {
      left: [(rows[0] ?? []).some((c) => cutsOn(c, "left"))],
      right: [(rows[rows.length - 1] ?? []).some((c) => cutsOn(c, "right"))],
      front: rows.map((column) => cutsOn(column[0], "front")),
      back: rows.map((column) => cutsOn(column[column.length - 1], "back")),
      dividers: rows.map((column) =>
        column.map((c, i) => {
          const next = column[i + 1];
          return cutsOn(c, "back") && (next === undefined || cutsOn(next, "front"));
        }),
      ),
      rows: rows.slice(1).map(() => false),
    };
  }
  return {
    left: rows.map((row) => cutsOn(row[0], "left")),
    right: rows.map((row) => cutsOn(row[row.length - 1], "right")),
    front: [(rows[0] ?? []).some((c) => cutsOn(c, "front"))],
    back: [(rows[rows.length - 1] ?? []).some((c) => cutsOn(c, "back"))],
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
  const rows = linesOf(part);
  const wallRoom = ceilU(settings.fingerPocket.wallRoom);
  const dividerRoom = ceilU(settings.fingerPocket.dividerRoom);
  const on = (yes: boolean | undefined, room: number): number => (yes === true ? room : 0);
  const columns = part.arrangement === "columns";
  const room: CutRoom = {
    left: walls.left.map((yes) => on(yes, wallRoom)),
    right: walls.right.map((yes) => on(yes, wallRoom)),
    front: walls.front.map((yes) => on(yes, wallRoom)),
    back: walls.back.map((yes) => on(yes, wallRoom)),
  };
  const gaps = rows.map((row, r) =>
    row.map((_, i) => divider + on(walls.dividers[r]?.[i], dividerRoom)),
  );
  // The last entry (unused) follows the outer wall past the last row or column, as the dividers'.
  const past = columns ? walls.right[0] : walls.back[0];
  const rowGaps = rows.map(
    (_, r) => divider + on(r < rows.length - 1 ? walls.rows[r] : past, dividerRoom),
  );
  const widths = rows.map((row) => row.map((c) => ceilU(c.minW)));
  const depths = rows.map((row) => row.map((c) => ceilU(c.minD)));
  const between = (r: number): number => sum((gaps[r] ?? []).slice(0, -1));
  const across = sum(rowGaps.slice(0, -1));
  let innerW: number;
  let innerD: number;
  let rowDepths: number[] = [];
  let columnWidths: number[] = [];
  if (columns) {
    // Columns stand side by side, each as wide as its widest compartment; each stacks its
    // compartments front to back, so the deepest column (with its finger room) sets the depth.
    columnWidths = widths.map((column) => maxOf(column));
    innerW = sum(columnWidths) + across + (room.left[0] ?? 0) + (room.right[0] ?? 0);
    innerD = maxOf(
      depths.map(
        (column, c) => sum(column) + between(c) + (room.front[c] ?? 0) + (room.back[c] ?? 0),
      ),
    );
  } else {
    const rowWidths = widths.map(
      (row, r) => sum(row) + between(r) + (room.left[r] ?? 0) + (room.right[r] ?? 0),
    );
    rowDepths = depths.map((row) => maxOf(row));
    innerW = maxOf(rowWidths);
    innerD = sum(rowDepths) + across + (room.front[0] ?? 0) + (room.back[0] ?? 0);
  }
  // A divided well's floor is thicker by the depth of its slots (floorExtra).
  const content =
    floor + maxOf(part.compartments.map((c) => ceilU(c.minH) + ceilU(c.floorExtra ?? 0)));
  const chamfer = chamferMinimumsU(settings, opts.level);
  // The slab of the tray above drops into a socketed tray's opening: its contents stay under it.
  const socketed = socketOf(settings, opts.lipped);
  const socket = socketed === null ? 0 : ceilU(socketed.depth);
  // chamfer.h is, above level 0 with the lip on, what the groove (or the step) needs (upperTrayMinH).
  const h = Math.max(content + socket, chamfer.h);
  return {
    wall,
    divider,
    floor,
    chamfer: ceilU(effectiveBottomChamfer(settings, opts.level)),
    edge: bottomEdgeU(settings, opts.level),
    room,
    rows,
    widths,
    depths,
    gaps,
    rowGaps,
    rowDepths,
    columnWidths,
    innerW,
    innerD,
    w: Math.max(innerW + 2 * wall, chamfer.side),
    d: Math.max(innerD + 2 * wall, chamfer.side),
    h,
    content,
    socket,
  };
}
