// src/ui/settingsFields.ts
import type { Settings } from "../model/types";

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
};

const UNITLESS = new Set(["fit", "cardStackClearancePct", "packingFactor"]);

export function settingUnit(path: string): string | undefined {
  if (path === "infill") {
    return "%";
  }
  return UNITLESS.has(path) ? undefined : "mm";
}
