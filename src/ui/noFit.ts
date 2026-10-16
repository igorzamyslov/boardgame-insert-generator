// src/ui/noFit.ts
import { holdsOf, trayNames } from "../instructions/naming";
import { numberParts } from "../instructions/numbering";
import { topPlane } from "../model/settings";
import type { Box, Component, Settings, TraySpec } from "../model/types";

/** The tray a failed search could not fit, for the status line to name and open. */
export interface Misfit {
  /** The first component the tray holds: what Edit opens. */
  componentId: string;
  /** What the tray is called (trayNames), a group of components included. */
  name: string;
  /** "bed": no print bed orientation holds it (a definite cause). "box": it overhangs the box in the closest attempt. */
  reason: "bed" | "box";
}

/** How far a tray of the closest attempt sticks out of the box, mm (0 when it is inside). */
function overBox(t: TraySpec, box: Box, settings: Settings): number {
  return Math.max(
    0,
    t.x + t.w - box.innerWidth,
    t.y + t.d - box.innerDepth,
    t.z + t.h - topPlane(box, settings),
  );
}

/**
 * The tray that most clearly does not fit in the closest attempt of a search that found no layout.
 * A tray beyond the print bed (the engine's own `overBedKeys`) comes first: that is a definite
 * cause. Otherwise the tray that overhangs the box furthest, which is only the least arbitrary
 * choice (where a failed attempt puts its overflow is not meaningful). Only trays that hold a
 * component count. Null when none stands out.
 */
export function misfitOf(
  attempt: { trays: readonly TraySpec[]; overBedKeys?: readonly string[] } | null,
  box: Box,
  settings: Settings,
  components: readonly Component[],
): Misfit | null {
  if (attempt === null) {
    return null;
  }
  const names = trayNames(numberParts(attempt.trays as TraySpec[]), components);
  const overBed = new Set(attempt.overBedKeys ?? []);
  let best: { tray: TraySpec; held: Component; bed: boolean; over: number } | null = null;
  for (const tray of attempt.trays) {
    const held = tray.part === "tray" ? holdsOf(tray, components)[0] : undefined;
    if (held === undefined) {
      continue;
    }
    const bed = overBed.has(tray.key);
    // beyond the bed: the biggest first; overhanging the box: the furthest first
    const over = bed ? tray.w * tray.d * tray.h : overBox(tray, box, settings);
    if (!bed && over <= 0) {
      continue;
    }
    if (best === null || (bed && !best.bed) || (bed === best.bed && over > best.over)) {
      best = { tray, held, bed, over };
    }
  }
  if (best === null) {
    return null;
  }
  return {
    componentId: best.held.id,
    name: names.get(best.tray.key)?.full ?? best.held.name,
    reason: best.bed ? "bed" : "box",
  };
}
