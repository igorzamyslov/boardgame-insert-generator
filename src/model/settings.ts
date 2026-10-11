import { deepFreeze } from "./freeze";
import type { Box, Settings } from "./types";

/** Minimum printable feature width in mm: 2 lines of 0.4 mm (spec §6.1). */
export const MIN_FEATURE_MM = 0.8;

/**
 * Bottom chamfer of trays above level 0 is at least this, in mm (spec §6.1); spacers and
 * level-0 trays use bottomChamfer as set. Shared by sizing and geometry.
 */
export const UPPER_MIN_CHAMFER = 0.5;

/** Spec §5 defaults. Projects store resolved values, never "use the default". Deeply frozen. */
export const DEFAULT_SETTINGS: Settings = deepFreeze({
  wall: 1.6,
  floor: 1.2,
  divider: 1.2,
  fit: 1,
  cardClearance: 1.5,
  cardStackClearance: 1,
  cardStackClearancePct: 0.03,
  cardThickness: 0.32,
  pieceClearance: 1,
  boxClearance: 0.5,
  trayGap: 0.2,
  bottomChamfer: 0.4,
  cornerRadius: 3,
  scoopRadius: 12,
  fingerPocket: { width: 22, reach: 12 },
  lip: { enabled: true, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
  topPressFit: 0,
  packingFactor: 0.5,
  leftover: "spare",
});

export type WallChoice = "thin" | "normal" | "sturdy";
export type FitChoice = "tight" | "normal" | "loose";

/** Frozen. */
export const WALL_CHOICES: Record<WallChoice, number> = deepFreeze({
  thin: 1.2,
  normal: 1.6,
  sturdy: 2,
});
/** Frozen. */
export const FIT_CHOICES: Record<FitChoice, number> = deepFreeze({
  tight: 0.7,
  normal: 1,
  loose: 1.4,
});

// Choice values are stored exactly, so this only absorbs float noise; it is far tighter than round6's 1e-6.
const EPS = 1e-9;

/** Simple-mode "Walls" control: writes the resolved wall thickness. */
export function applyWallChoice(s: Settings, c: WallChoice): Settings {
  return { ...s, wall: WALL_CHOICES[c] };
}

/** Simple-mode "Fit" control: writes the resolved fit factor. */
export function applyFitChoice(s: Settings, c: FitChoice): Settings {
  return { ...s, fit: FIT_CHOICES[c] };
}

function choiceOf<C extends string>(table: Record<C, number>, value: number): C | "custom" {
  for (const [choice, v] of Object.entries(table) as [C, number][]) {
    if (Math.abs(v - value) < EPS) {
      return choice;
    }
  }
  return "custom";
}

/** Which simple-mode choice the current wall matches, or "custom" (set in advanced mode). */
export function wallChoiceOf(s: Settings): WallChoice | "custom" {
  return choiceOf(WALL_CHOICES, s.wall);
}

/** Which simple-mode choice the current fit matches, or "custom" (set in advanced mode). */
export function fitChoiceOf(s: Settings): FitChoice | "custom" {
  return choiceOf(FIT_CHOICES, s.fit);
}

/** Clearances after Fit scaling (spec §5 rows marked ×Fit). */
export interface Effective {
  cardClearance: number;
  cardStackClearance: number;
  pieceClearance: number;
  boxClearance: number;
  trayGap: number;
  lipPlay: number;
}

/** Rounds away float noise such as 1.5 × 0.7 = 1.0499999999999998. */
function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Base clearances × fit. `cardStackClearancePct` is not included; sizing scales it by `fit` itself. */
export function effective(s: Settings): Effective {
  return {
    cardClearance: round6(s.cardClearance * s.fit),
    cardStackClearance: round6(s.cardStackClearance * s.fit),
    pieceClearance: round6(s.pieceClearance * s.fit),
    boxClearance: round6(s.boxClearance * s.fit),
    trayGap: round6(s.trayGap * s.fit),
    lipPlay: round6(s.lip.play * s.fit),
  };
}

/** Height every stack must reach (spec §3 rule 2). */
export function topPlane(box: Box, s: Settings): number {
  return round6(box.innerHeight - box.headroom + s.topPressFit);
}
