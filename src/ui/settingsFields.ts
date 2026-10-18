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

/**
 * What happens to spare room that a tray cannot give its contents (the engine's two ways to absorb
 * it, `wallAbsorb` and `oneWall`, and the default of neither): it is printed as a separate spacer,
 * or the walls take it. They are one choice, because `oneWall` replaces `wallAbsorb` while it is on.
 */
export type SpareRoom = "spacer" | "walls" | "one";

/** What `wallAbsorb` starts at when "Thicker walls" is picked and none was set (mm; its range is 0 to 3). */
export const STARTING_WALL_ABSORB = 1;

export function spareRoomOf(s: Settings): SpareRoom {
  return s.oneWall ? "one" : s.wallAbsorb !== 0 ? "walls" : "spacer";
}

/**
 * The settings with `choice`: a spacer sets both to their defaults (no thicker walls, not one
 * thick wall); thicker walls start at 1 mm unless an amount was set (they stay in the file while
 * one thick wall is chosen, which ignores them, so going back to thicker walls finds them again);
 * one thick wall turns that setting on.
 */
export function applySpareRoom(s: Settings, choice: SpareRoom): Settings {
  switch (choice) {
    case "spacer":
      return {
        ...s,
        oneWall: DEFAULT_SETTINGS.oneWall,
        wallAbsorb: DEFAULT_SETTINGS.wallAbsorb,
      };
    case "walls":
      return {
        ...s,
        oneWall: false,
        wallAbsorb: s.wallAbsorb !== 0 ? s.wallAbsorb : STARTING_WALL_ABSORB,
      };
    case "one":
      return { ...s, oneWall: true };
  }
}

const UNITLESS = new Set(["fit", "cardStackClearancePct", "packingFactor"]);

export function settingUnit(path: string): string | undefined {
  if (path === "infill") {
    return "%";
  }
  return UNITLESS.has(path) ? undefined : "mm";
}

/** The settings that differ from `b`, as paths ("wall", "lip/enabled"), one per leaf. */
function leavesDiffer(a: unknown, b: unknown, path = ""): string[] {
  if (a !== null && typeof a === "object" && b !== null && typeof b === "object") {
    return Object.keys(a).flatMap((key) =>
      leavesDiffer(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        path === "" ? key : `${path}/${key}`,
      ),
    );
  }
  return a === b ? [] : [path];
}

/** The two numbers the "Room for fingers" switch writes: they are one setting to the person. */
const FINGER_ROOM_LEAVES = ["fingerPocket/wallRoom", "fingerPocket/dividerRoom"];

/** The two settings the "Fill small gaps with" choice writes: one setting to the person. */
const SPARE_ROOM_LEAVES = ["wallAbsorb", "oneWall"];

/**
 * The settings the "My printer" tab draws (the printing options and folding risers into the
 * joined spacers); every other one is on "This insert".
 */
const PRINTER_TAB_LEAVES = ["engraveNames", "mergeFillers", "mergeRisers"];

/**
 * The settings that differ from their defaults, each one as the sheet draws it: a number, a choice
 * or a switch is one, "Room for fingers" is one though its switch writes two numbers, and so is
 * "Fill small gaps with" though its choice writes two settings.
 */
function changedSettings(s: Settings): string[] {
  const leaves = leavesDiffer(s, DEFAULT_SETTINGS);
  const together = [...FINGER_ROOM_LEAVES, ...SPARE_ROOM_LEAVES];
  const fingers = leaves.some((l) => FINGER_ROOM_LEAVES.includes(l));
  const spare = leaves.some((l) => SPARE_ROOM_LEAVES.includes(l));
  const rest = leaves.filter((l) => !together.includes(l));
  return [...rest, ...(fingers ? ["fingerRoom"] : []), ...(spare ? ["spareRoom"] : [])];
}

/**
 * How many settings differ from their defaults: every number, choice and switch, wherever the
 * sheet draws it, "Room for fingers" once. It is what "Reset all" puts back, so the header's
 * "N changed" and the reset agree.
 */
export function changedCount(s: Settings): number {
  return changedSettings(s).length;
}

/** The same count by tab: "This insert" and "My printer" (which then carries a dot of its own). */
export function changedByTab(s: Settings): { insert: number; printer: number } {
  const changed = changedSettings(s);
  const printer = changed.filter((c) => PRINTER_TAB_LEAVES.includes(c)).length;
  return { insert: changed.length - printer, printer };
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
