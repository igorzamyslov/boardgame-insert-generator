import { dividersOf, growthOf, separatorsOf, togglesOf } from "../model/defaults";
import { roomOf } from "../model/room";
import { FLOAT_EPSILON, POST_MM, reachableCutMm } from "../model/settings";
import type { Notice, Settings, Side, TileShape, TilesComponent } from "../model/types";
import {
  compartment,
  displayName,
  featuresOf,
  mainClearance,
  wallCutout,
  type OptionsResult,
  type StorageOption,
} from "./common";
import { CHANNEL_DEPTH, DIVIDER_GROOVE, TILE_STACK_TARGETS } from "./constants";
import { dividedWidth } from "./dividers";
import { growthMm, stackGrowthMm } from "./growth";
import type { CompartmentReq } from "./types";
import { ROUNDING_TOLERANCE, ceilU, fromU, splitEven } from "./units";

export function hexCornerToCorner(flatToFlat: number): number {
  return (flatToFlat * 2) / Math.sqrt(3);
}

/** Footprint of one tile lying flat, tray-local: x along X, y along Y (front → back). */
export function flatFootprint(shape: TileShape): { x: number; y: number } {
  if (shape.type === "rect") {
    return { x: shape.w, y: shape.d };
  }
  const c2c = hexCornerToCorner(shape.flatToFlat);
  // "flat": a flat edge faces the tray front, so front-to-back is flat-to-flat.
  return shape.orientation === "flat"
    ? { x: c2c, y: shape.flatToFlat }
    : { x: shape.flatToFlat, y: c2c };
}

/** A standing tile: rect on its longer edge, hex on a flat edge (spec §6.2). */
function uprightProfile(shape: TileShape): { height: number; length: number } {
  if (shape.type === "rect") {
    return { height: Math.min(shape.w, shape.d), length: Math.max(shape.w, shape.d) };
  }
  return { height: shape.flatToFlat, length: hexCornerToCorner(shape.flatToFlat) };
}

/** Column (flat) or stack (upright) counts to offer as variants; sizing doesn't know topPlane. */
export function columnCounts(count: number, thickness: number): number[] {
  const total = count * thickness;
  const raw = [
    1,
    ...TILE_STACK_TARGETS.map((target) => Math.ceil(total / target - ROUNDING_TOLERANCE)),
  ];
  const out: number[] = [];
  for (const columns of raw) {
    const clamped = Math.min(Math.max(columns, 1), count);
    if (!out.includes(clamped)) {
      out.push(clamped);
    }
  }
  return out;
}

/** Flat tiles: half-round cutouts through the two long walls (left and right for a square). */
function flatColumn(
  c: TilesComponent,
  n: number,
  more: number,
  clearance: number,
  s: Settings,
): CompartmentReq {
  const foot = flatFootprint(c.shape);
  const [a, b]: [Side, Side] = foot.x > foot.y ? ["front", "back"] : ["left", "right"];
  return compartment({
    componentId: c.id,
    contents: `${displayName(c)} ×${n}`,
    kind: "well",
    w: foot.x + clearance,
    d: foot.y + clearance,
    h: (n + more) * c.thickness + clearance,
    grow: { h: growthMm(growthOf(c, "stack", true, s.biggerWells), (n + more) * c.thickness) },
    features: featuresOf(togglesOf(c), [wallCutout(a, 1, true), wallCutout(b, 1, true)]),
  });
}

function uprightStack(
  c: TilesComponent,
  n: number,
  more: number,
  clearance: number,
  s: Settings,
): CompartmentReq {
  const profile = uprightProfile(c.shape);
  const dividers = dividersOf(c);
  const plates = separatorsOf(c);
  // Retention and reachability bound it (stackGrowthMm); no spacer unless `separators` is set.
  const grow = stackGrowthMm(
    growthOf(c, "stack", false, s.biggerWells),
    fromU(ceilU((n + more) * c.thickness)),
    dividers === 0 && plates > 0,
    dividers,
    togglesOf(c).fingerCuts ? s.fingerPocket.width : undefined,
  );
  const stack = (n + more) * c.thickness + clearance;
  // With plates, the planned room is a spacer's (see cards.ts)
  const planned = more * c.thickness;
  const spacer = dividers === 0 && plates > 0 && (grow > 0 || planned > 0);
  return compartment({
    componentId: c.id,
    contents: `${displayName(c)} ×${n}`,
    kind: "well",
    w: dividers > 0 ? dividedWidth(stack, dividers, s) : stack,
    d: profile.length + clearance,
    h: profile.height + clearance,
    ...(dividers > 0
      ? { grow: { w: grow }, dividers, floorExtra: DIVIDER_GROOVE }
      : spacer
        ? {
            grow: { w: grow },
            spacerAxis: "w" as const,
            separators: plates,
            ...(planned > 0 ? { spacerRoom: planned } : {}),
          }
        : grow > 0
          ? { grow: { w: grow } }
          : {}),
    // No corner reliefs: they let a tile sit flat, and one on its edge doesn't need them. Toggles
    // are per component and "auto" storage offers flat and upright from one, so the rule lives
    // here, not in kindDefaults; an explicit cornerReliefs: true applies to the flat variant only.
    features: featuresOf({ ...togglesOf(c), cornerReliefs: false }, [
      wallCutout("left", CHANNEL_DEPTH, false),
      wallCutout("right", CHANNEL_DEPTH, false),
    ]),
  });
}

/**
 * Whether a finger can get into the cut an upright stack gets: its slot is as long as the tile
 * (plus clearance) and the cut leaves POST_MM at each end, so it is that much narrower. Under
 * reachableCutMm it only touches the end tile, through a gap narrower than a fingertip. Always
 * true with finger cuts off: there is no cut to reach into.
 */
function uprightReachable(c: TilesComponent, clearance: number, s: Settings): boolean {
  if (!togglesOf(c).fingerCuts) {
    return true;
  }
  const room = uprightProfile(c.shape).length + clearance - 2 * POST_MM;
  return room >= reachableCutMm(s.fingerPocket.width) - FLOAT_EPSILON;
}

/** The warning for an upright choice whose cut is under a fingertip's width. */
function hardToReach(c: TilesComponent, s: Settings, index: number): Notice {
  return {
    level: "warning",
    code: "sizing.uprightHardToReach",
    message: `${displayName(c)}: standing upright, its finger cuts are narrower than ${reachableCutMm(s.fingerPocket.width)} mm, so only the tile at the end of each stack can be taken out. Lying flat is easier to reach.`,
    path: `/components/${index}`,
  };
}

/**
 * Storage options for a tiles component. Precondition: it passes validateComponent. `auto` offers
 * upright only where a finger can reach into its cut (uprightReachable) and lies the tiles flat
 * otherwise; an explicit `upright` is kept, with a warning where it is hard to reach.
 */
export function tileOptions(c: TilesComponent, s: Settings, index = 0): OptionsResult {
  const clearance = mainClearance(c, s);
  const reachable = uprightReachable(c, clearance, s);
  const counts = columnCounts(c.count, c.thickness);
  // The item's "some" room is more tiles in all, shared by the stacks as the tiles are.
  const room = roomOf(c);
  const extra = room.mode === "some" ? room.amount : 0;
  const withRoom = (columns: number, make: (n: number, more: number) => CompartmentReq) => {
    const mores = splitEven(extra, columns);
    return splitEven(c.count, columns).map((n, i) => [make(n, mores[i] ?? 0)]);
  };
  const options: StorageOption[] = [];
  if (c.storage !== "upright") {
    for (const columns of counts) {
      options.push({
        id: `flat-c${columns}`,
        blocks: withRoom(columns, (n, more) => flatColumn(c, n, more, clearance, s)),
      });
    }
  }
  if (c.storage === "upright" || (c.storage === "auto" && reachable)) {
    for (const columns of counts) {
      options.push({
        id: `upright-c${columns}`,
        blocks: withRoom(columns, (n, more) => uprightStack(c, n, more, clearance, s)),
      });
    }
  }
  return {
    options,
    notices: c.storage === "upright" && !reachable ? [hardToReach(c, s, index)] : [],
  };
}
