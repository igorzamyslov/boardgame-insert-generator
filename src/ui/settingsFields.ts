// src/ui/settingsFields.ts
import { trayNames } from "../instructions/naming";
import { numberParts } from "../instructions/numbering";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Component, Settings, TraySpec } from "../model/types";

/** Pure setters keyed by plan 1's SETTING_RANGES paths. */
export const SETTING_SETTERS: Record<string, (s: Settings, v: number) => Settings> = {
  wall: (s, v) => ({ ...s, wall: v }),
  floor: (s, v) => ({ ...s, floor: v }),
  divider: (s, v) => ({ ...s, divider: v }),
  fit: (s, v) => ({ ...s, fit: v }),
  cardClearance: (s, v) => ({ ...s, cardClearance: v }),
  cardStackClearance: (s, v) => ({ ...s, cardStackClearance: v }),
  cardStackClearancePct: (s, v) => ({ ...s, cardStackClearancePct: v }),
  cardThickness: (s, v) => ({ ...s, cardThickness: v }),
  pieceClearance: (s, v) => ({ ...s, pieceClearance: v }),
  boxClearance: (s, v) => ({ ...s, boxClearance: v }),
  trayGap: (s, v) => ({ ...s, trayGap: v }),
  bottomChamfer: (s, v) => ({ ...s, bottomChamfer: v }),
  cornerRadius: (s, v) => ({ ...s, cornerRadius: v }),
  scoopRadius: (s, v) => ({ ...s, scoopRadius: v }),
  "fingerPocket/width": (s, v) => ({ ...s, fingerPocket: { ...s.fingerPocket, width: v } }),
  "fingerPocket/floorNotch": (s, v) => ({
    ...s,
    fingerPocket: { ...s.fingerPocket, floorNotch: v },
  }),
  "fingerPocket/wallRoom": (s, v) => ({ ...s, fingerPocket: { ...s.fingerPocket, wallRoom: v } }),
  "fingerPocket/dividerRoom": (s, v) => ({
    ...s,
    fingerPocket: { ...s.fingerPocket, dividerRoom: v },
  }),
  "lip/height": (s, v) => ({ ...s, lip: { ...s.lip, height: v } }),
  "lip/thickness": (s, v) => ({ ...s, lip: { ...s.lip, thickness: v } }),
  "lip/ledge": (s, v) => ({ ...s, lip: { ...s.lip, ledge: v } }),
  "lip/play": (s, v) => ({ ...s, lip: { ...s.lip, play: v } }),
  topPressFit: (s, v) => ({ ...s, topPressFit: v }),
  packingFactor: (s, v) => ({ ...s, packingFactor: v }),
  wallAbsorb: (s, v) => ({ ...s, wallAbsorb: v }),
  infill: (s, v) => ({ ...s, infill: v }),
  playLimit: (s, v) => ({ ...s, playLimit: v }),
};

const UNITLESS = new Set(["fit", "cardStackClearancePct", "packingFactor"]);

export function settingUnit(path: string): string | undefined {
  if (path === "infill") {
    return "%";
  }
  return UNITLESS.has(path) ? undefined : "mm";
}

function leavesDiffer(a: unknown, b: unknown): number {
  if (a !== null && typeof a === "object" && b !== null && typeof b === "object") {
    return Object.keys(a).reduce(
      (n, key) =>
        n + leavesDiffer((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      0,
    );
  }
  return a === b ? 0 : 1;
}

/**
 * How many settings differ from their defaults: every number, choice and switch, wherever the
 * sheet draws it. It is what "Reset all" puts back, so the header's "N changed" and the reset
 * agree.
 */
export function changedCount(s: Settings): number {
  return leavesDiffer(s, DEFAULT_SETTINGS);
}

/** A tray whose engraved name is shorter than its full one: the engraving hint's example. */
export interface NameExample {
  full: string;
  short: string;
}

export function nameExampleOf(
  trays: readonly TraySpec[],
  components: readonly Component[],
): NameExample | undefined {
  const parts = numberParts(trays);
  const names = trayNames(parts, components);
  // A tray's own name: a riser or a spacer is named after the tray it serves, which reads badly cut short.
  for (const part of parts) {
    const n = part.spec.part === "tray" ? names.get(part.spec.key) : undefined;
    if (n !== undefined && n.short !== "" && n.short.toLowerCase() !== n.full.toLowerCase()) {
      return { full: n.full, short: n.short };
    }
  }
  return undefined;
}
