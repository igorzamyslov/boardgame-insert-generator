// src/ui/settingsGroups.ts
// The groups of "Exact numbers" (Settings): the board's five, and "Spacers and space" for what the
// board does not show (owner decision: the first screen is the board; everything else is here).
// Pure: the sheet draws them, the tests pin which number is in which.

export interface ExactGroup {
  id: string;
  /** The group's name, as the board says it (DESIGN §7 rules the two that are not the board's). */
  title: string;
  /** The `SETTING_RANGES` paths of the numbers inside, in the order they are drawn. */
  paths: readonly string[];
  /**
   * Choices that sit among the numbers (they are not in `SETTING_RANGES`). "spareRoom" is the choice
   * between a spacer, thicker walls and one thick wall: it draws the `wallAbsorb` number itself, so
   * that path is in `paths` (an error there opens the group) but is not a row of its own.
   */
  extras?: readonly ("leftover" | "spareRoom")[];
}

export const EXACT_GROUPS: readonly ExactGroup[] = [
  { id: "walls", title: "Walls and floors", paths: ["wall", "floor", "divider"] },
  {
    id: "room",
    title: "Room around trays and pieces",
    paths: ["fit", "pieceClearance", "boxClearance", "trayGap"],
  },
  {
    id: "cards",
    title: "Cards",
    paths: ["cardClearance", "cardStackClearance", "cardStackClearancePct", "cardThickness"],
  },
  {
    id: "fingers",
    title: "Finger cuts",
    paths: [
      "fingerPocket/width",
      "fingerPocket/floorNotch",
      "fingerPocket/wallRoom",
      "fingerPocket/dividerRoom",
    ],
  },
  {
    id: "rim",
    title: "Rim between layers",
    paths: ["lip/height", "lip/thickness", "lip/ledge", "lip/play", "topPressFit"],
  },
  {
    id: "shape",
    title: "Shape and printing",
    paths: ["bottomChamfer", "cornerRadius", "scoopRadius", "packingFactor", "infill", "playLimit"],
  },
  {
    id: "spacers",
    title: "Spacers and space",
    paths: ["wallAbsorb"],
    extras: ["leftover", "spareRoom"],
  },
];

/**
 * The numbers `SETTING_RANGES` has that the first screen of "This insert" draws, beside the
 * switches they belong with, so no group of Exact numbers does (DESIGN §7, 2026-10-21: "Separate
 * risers from", under Fill to the lid). An error at one is never hidden: that screen has no
 * disclosure.
 */
export const FIRST_SCREEN_PATHS: readonly string[] = ["minRiser"];

/** The group that holds the number an error at `/settings/<path>` is about. */
export function groupOfPath(errorPath: string): ExactGroup | undefined {
  const prefix = "/settings/";
  if (!errorPath.startsWith(prefix)) {
    return undefined;
  }
  const path = errorPath.slice(prefix.length);
  return EXACT_GROUPS.find((g) => g.paths.includes(path));
}
