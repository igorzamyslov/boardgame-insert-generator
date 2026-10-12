import type { BulkComponent, BulkItem, Component, Settings } from "../model/types";
import {
  compartment,
  displayName,
  featuresOf,
  label,
  mainClearance,
  type OptionsResult,
  wallCutout,
} from "./common";
import { BULK_MIN_SIDE, MAX_H_RATIO, SHALLOW_H } from "./constants";
import type { CompartmentReq } from "./types";

export type BulkShape = "shallow" | "deep";
export const BULK_SHAPES: readonly BulkShape[] = ["shallow", "deep"];

export interface BulkLine {
  volume: number; // mm³ the pile needs, packing included
  side0: number; // per-axis minimum width/depth
  hFloor: number; // smallest useful content depth
}

export function bulkLine(item: BulkItem, clearance: number, packingFactor: number): BulkLine {
  if ("volumeMl" in item) {
    return { volume: item.volumeMl * 1000, side0: BULK_MIN_SIDE, hFloor: 0 };
  }
  const largest = Math.max(item.w, item.d, item.h);
  const smallest = Math.min(item.w, item.d, item.h);
  return {
    volume: (item.count * item.w * item.d * item.h) / packingFactor,
    side0: Math.max(largest + clearance, BULK_MIN_SIDE),
    hFloor: smallest + clearance,
  };
}

/** Square footprint `side` and content depth `h` with side²·h ≥ volume and h ≤ 1.5·side. */
export function shapeLine(line: BulkLine, shape: BulkShape): { side: number; h: number } {
  if (shape === "shallow") {
    const h = Math.max(SHALLOW_H, line.hFloor);
    return { side: Math.max(line.side0, Math.sqrt(line.volume / h)), h };
  }
  const side = Math.max(line.side0, Math.cbrt(line.volume / MAX_H_RATIO));
  return { side, h: Math.max(line.hFloor, SHALLOW_H, line.volume / (side * side)) };
}

/**
 * One bulk compartment of `c` (bulk, or minis stored as bulk): its curved floor makes it a scoop,
 * its finger cuts a centred cut through its front wall, half its depth (featuresOf).
 */
export function bulkCompartment(
  c: Component,
  contents: string,
  line: BulkLine,
  shape: BulkShape,
): CompartmentReq {
  const { side, h } = shapeLine(line, shape);
  const features = featuresOf(c, [wallCutout("front", 0.5, false)], false);
  return compartment({
    componentId: c.id,
    contents,
    kind: features.some((f) => f.type === "scoop") ? "scoop" : "well",
    w: side,
    d: side,
    h,
    elastic: { w: true, d: true, h: true },
    minVolume: line.volume,
    maxHRatio: MAX_H_RATIO,
    features,
  });
}

function itemLabel(item: BulkItem, fallback: string): string {
  const name = label(item.name, fallback);
  return "volumeMl" in item ? `${name} ${item.volumeMl} ml` : `${name} ×${item.count}`;
}

/** Storage options for a bulk component. Precondition: it passes validateComponent. */
export function bulkOptions(c: BulkComponent, s: Settings): OptionsResult {
  const clearance = mainClearance(c, s);
  return {
    options: BULK_SHAPES.map((shape) => ({
      id: shape,
      blocks: c.items.map((item) => [
        bulkCompartment(
          c,
          itemLabel(item, displayName(c)),
          bulkLine(item, clearance, s.packingFactor),
          shape,
        ),
      ]),
    })),
    notices: [],
  };
}
