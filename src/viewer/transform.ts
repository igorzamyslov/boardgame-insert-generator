// src/viewer/transform.ts
import { effective } from "../model/settings";
import type { Box, Settings, TraySpec } from "../model/types";
import type { BoxOutline } from "./types";

export const EXPLODE_MM = 40;

export function trayPosition(spec: TraySpec, explode: number): [number, number, number] {
  return [spec.x, spec.y, spec.z + spec.level * explode * EXPLODE_MM];
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
