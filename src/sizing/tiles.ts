import type { Settings, Side, TileShape, TilesComponent } from "../model/types";
import {
  compartment,
  cornerRelief,
  displayName,
  mainClearance,
  wallCutout,
  type OptionsResult,
  type StorageOption,
} from "./common";
import { CHANNEL_DEPTH, TILE_STACK_TARGETS } from "./constants";
import type { CompartmentReq } from "./types";
import { ROUNDING_TOLERANCE, splitEven } from "./units";

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
function flatColumn(c: TilesComponent, n: number, clearance: number, s: Settings): CompartmentReq {
  const foot = flatFootprint(c.shape);
  const [a, b]: [Side, Side] = foot.x > foot.y ? ["front", "back"] : ["left", "right"];
  return compartment(
    {
      componentId: c.id,
      contents: `${displayName(c)} ×${n}`,
      kind: "well",
      w: foot.x + clearance,
      d: foot.y + clearance,
      h: n * c.thickness + clearance,
      features: [wallCutout(a, 1, true), wallCutout(b, 1, true), cornerRelief()],
    },
    s,
  );
}

function uprightStack(
  c: TilesComponent,
  n: number,
  clearance: number,
  s: Settings,
): CompartmentReq {
  const profile = uprightProfile(c.shape);
  return compartment(
    {
      componentId: c.id,
      contents: `${displayName(c)} ×${n}`,
      kind: "well",
      w: n * c.thickness + clearance,
      d: profile.length + clearance,
      h: profile.height + clearance,
      elastic: { w: true },
      spacerAxis: "w",
      features: [
        wallCutout("left", CHANNEL_DEPTH, false),
        wallCutout("right", CHANNEL_DEPTH, false),
        cornerRelief(),
      ],
    },
    s,
  );
}

/** Storage options for a tiles component. Precondition: it passes validateComponent. */
export function tileOptions(c: TilesComponent, s: Settings): OptionsResult {
  const clearance = mainClearance(c, s);
  const counts = columnCounts(c.count, c.thickness);
  const options: StorageOption[] = [];
  if (c.storage !== "upright") {
    for (const columns of counts) {
      options.push({
        id: `flat-c${columns}`,
        blocks: splitEven(c.count, columns).map((n) => [flatColumn(c, n, clearance, s)]),
      });
    }
  }
  if (c.storage !== "flat") {
    for (const columns of counts) {
      options.push({
        id: `upright-c${columns}`,
        blocks: splitEven(c.count, columns).map((n) => [uprightStack(c, n, clearance, s)]),
      });
    }
  }
  return { options, notices: [] };
}
