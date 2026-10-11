import type { Settings, TileShape, TilesComponent } from "../model/types";
import {
  compartment,
  componentIsValid,
  cornerRelief,
  displayName,
  fingerPocket,
  mainClearance,
  type OptionsResult,
  type StorageOption,
} from "./common";
import { TILE_STACK_TARGETS } from "./constants";
import type { CompartmentReq } from "./types";
import { splitEven } from "./units";

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
export function uprightProfile(shape: TileShape): { height: number; length: number } {
  if (shape.type === "rect") {
    return { height: Math.min(shape.w, shape.d), length: Math.max(shape.w, shape.d) };
  }
  return { height: shape.flatToFlat, length: hexCornerToCorner(shape.flatToFlat) };
}

/** Column (flat) or stack (upright) counts to offer as variants; sizing doesn't know topPlane. */
export function columnCounts(count: number, thickness: number): number[] {
  const total = count * thickness;
  const raw = [1, ...TILE_STACK_TARGETS.map((target) => Math.ceil(total / target - 1e-9))];
  const out: number[] = [];
  for (const columns of raw) {
    const clamped = Math.min(Math.max(columns, 1), count);
    if (!out.includes(clamped)) {
      out.push(clamped);
    }
  }
  return out;
}

function flatColumn(c: TilesComponent, n: number, clearance: number, s: Settings): CompartmentReq {
  const foot = flatFootprint(c.shape);
  return compartment(
    {
      componentId: c.id,
      contents: `${displayName(c)} ×${n}`,
      kind: "well",
      w: foot.x + clearance,
      d: foot.y + clearance,
      h: n * c.thickness + clearance,
      features: [fingerPocket("front", 1, true), fingerPocket("back", 1, true), cornerRelief()],
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
        fingerPocket("front", 1 / 3, true),
        fingerPocket("back", 1 / 3, true),
        cornerRelief(),
      ],
    },
    s,
  );
}

/** Storage options for a tiles component; none (and no notices) when it fails validation. */
export function tileOptions(c: TilesComponent, s: Settings, index: number): OptionsResult {
  if (!componentIsValid(c, index)) {
    return { options: [], notices: [] };
  }
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
