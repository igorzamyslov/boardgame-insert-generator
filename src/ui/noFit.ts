// src/ui/noFit.ts
import { componentName, holdsOf } from "../instructions/naming";
import { topPlane } from "../model/settings";
import type { Box, Component, Printer, Settings, TraySpec } from "../model/types";

/** The component a failed search could not fit, for the status line to name and open. */
export interface Misfit {
  componentId: string;
  name: string;
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

/** How far a tray is beyond the usable print bed, mm, in whichever turn suits it better. */
function overBed(t: TraySpec, printer: Printer): number {
  const bx = printer.bedX - 2 * printer.bedMargin;
  const by = printer.bedY - 2 * printer.bedMargin;
  const flat = Math.max(0, t.w - bx, t.d - by);
  const turned = Math.max(0, t.w - by, t.d - bx);
  return Math.max(Math.min(flat, turned), t.h - printer.bedZ, 0);
}

/**
 * The component that most clearly does not fit in the closest attempt of a search that found no
 * layout: the tray holding a component that sticks furthest out of the box, else the one furthest
 * beyond the print bed. Null when no tray stands out (the trays only fail together).
 */
export function misfitOf(
  attempt: { trays: readonly TraySpec[] } | null,
  box: Box,
  settings: Settings,
  printer: Printer,
  components: readonly Component[],
): Misfit | null {
  if (attempt === null) {
    return null;
  }
  let best: { misfit: Misfit; box: number; bed: number } | null = null;
  for (const tray of attempt.trays) {
    const held = tray.part === "tray" ? holdsOf(tray, components)[0] : undefined;
    if (held === undefined) {
      continue;
    }
    const score = { box: overBox(tray, box, settings), bed: overBed(tray, printer) };
    if (
      (score.box > 0 || score.bed > 0) &&
      (best === null || score.box > best.box || (score.box === best.box && score.bed > best.bed))
    ) {
      best = { misfit: { componentId: held.id, name: componentName(held) }, ...score };
    }
  }
  return best?.misfit ?? null;
}
