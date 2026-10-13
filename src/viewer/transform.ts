// src/viewer/transform.ts
import { effective } from "../model/settings";
import type { Box, Settings, TraySpec } from "../model/types";
import type { BoxOutline } from "./types";

export const EXPLODE_MM = 40;

/** How far apart trays move sideways at full explode, as a share of their distance from the centre. */
export const EXPLODE_SPREAD = 0.5;

/** How far a card spacer rises out of its tray at full explode; well under one level's lift. */
export const SPACER_LIFT_MM = 20;

/**
 * A tray's position at `explode` (0..1). Upper layers lift by EXPLODE_MM per level, and every
 * tray also moves away from `center` (the box's middle in x, y) so that a single layer, which
 * has nothing to lift, comes apart too. Without a centre only the lift applies.
 *
 * `anchor` is the part the sideways move is measured from, and defaults to the part itself. A
 * card spacer passes its tray, because the move grows with the distance from the box centre:
 * measured from its own centre a spacer drifts relative to the tray it sits in and slides
 * through its wall. Measured from the tray, the two keep station, and the spacer instead rises
 * clear so it still reads as a separate part.
 */
export function trayPosition(
  spec: TraySpec,
  explode: number,
  center?: readonly [number, number],
  anchor?: TraySpec,
): [number, number, number] {
  const from = anchor ?? spec;
  const dx = center ? from.x + from.w / 2 - center[0] : 0;
  const dy = center ? from.y + from.d / 2 - center[1] : 0;
  const lift = spec.part === "spacer" ? SPACER_LIFT_MM * explode : 0;
  return [
    spec.x + dx * explode * EXPLODE_SPREAD,
    spec.y + dy * explode * EXPLODE_SPREAD,
    spec.z + spec.level * explode * EXPLODE_MM + lift,
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
