// src/viewer/transform.ts
import { effective } from "../model/settings";
import type { Box, Settings, TraySpec } from "../model/types";
import type { BoxOutline } from "./types";

export const EXPLODE_MM = 40;

/** How far apart trays move sideways at full explode, as a share of their distance from the centre. */
export const EXPLODE_SPREAD = 0.5;

/**
 * A tray's position at `explode` (0..1). Upper layers lift by EXPLODE_MM per level, and every
 * tray also moves away from `center` (the box's middle in x, y) so that a single layer, which
 * has nothing to lift, comes apart too. Without a centre only the lift applies.
 */
export function trayPosition(
  spec: TraySpec,
  explode: number,
  center?: readonly [number, number],
): [number, number, number] {
  const dx = center ? spec.x + spec.w / 2 - center[0] : 0;
  const dy = center ? spec.y + spec.d / 2 - center[1] : 0;
  return [
    spec.x + dx * explode * EXPLODE_SPREAD,
    spec.y + dy * explode * EXPLODE_SPREAD,
    spec.z + spec.level * explode * EXPLODE_MM,
  ];
}

export function isVisible(spec: TraySpec, maxLevel: number | null): boolean {
  return maxLevel === null || spec.level <= maxLevel;
}

/** Tray coordinates start after boxClearance, so the inner box starts at −boxClearance. */
export function boxOutline(box: Box, settings: Settings): BoxOutline {
  const bc = effective(settings).boxClearance;
  return { min: [-bc, -bc, 0], size: [box.innerWidth, box.innerDepth, box.innerHeight] };
}

export function trayColor(index: number): { h: number; s: number; l: number } {
  return { h: (index * 0.137) % 1, s: 0.45, l: 0.62 };
}
