// src/ui/noFit.ts
import { holdsOf, trayNames } from "../instructions/naming";
import { numberParts } from "../instructions/numbering";
import { topPlane } from "../model/settings";
import type { LockConflict } from "../layout/types";
import type { Box, Component, Lock, Settings, TraySpec } from "../model/types";

/** The tray a failed search could not fit, for the status line to name and open. */
export interface Misfit {
  /** The first component the tray holds: what Edit opens. */
  componentId: string;
  /** The tray itself in the attempt: the plan marks its tile. */
  trayKey: string;
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
    trayKey: best.tray.key,
    name: names.get(best.tray.key)?.full ?? best.held.name,
    reason: best.bed ? "bed" : "box",
  };
}

/**
 * The pins a run could not keep, called by the names the plan gives the trays ("Market deck", not
 * the engine's "Market deck ×80" or a list of every figure) and a pinned stack by its trays joined
 * with "and". A conflict whose tray is not in `trays` (no plan, or an old key) keeps the engine's
 * own name.
 */
export function namedConflicts(
  conflicts: readonly LockConflict[],
  trays: readonly TraySpec[] | undefined,
  components: readonly Component[],
  locks: readonly Lock[],
): LockConflict[] {
  if (trays === undefined) {
    return [...conflicts];
  }
  const names = trayNames(numberParts(trays as TraySpec[]), components);
  // only a tray that holds something has a name worth the person's reading ("Spare 1" is not one)
  const nameOf = (key: string): string | undefined => {
    const tray = trays.find((t) => t.key === key);
    return tray !== undefined && tray.part === "tray" && holdsOf(tray, components).length > 0
      ? names.get(key)?.full
      : undefined;
  };
  return conflicts.map((c) => {
    const keys =
      c.kind === "stack"
        ? (
            locks.find((l) => l.kind === "stack" && l.trayKeys[0] === c.trayKey) as
              { trayKeys: string[] } | undefined
          )?.trayKeys
        : [c.trayKey];
    const called = keys?.map(nameOf);
    if (called === undefined || called.length === 0 || called.some((n) => n === undefined)) {
      return c;
    }
    return { ...c, name: [...new Set(called)].join(" and ") };
  });
}
