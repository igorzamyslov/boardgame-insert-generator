import { deepFreeze } from "./freeze";
import type { Box, Settings } from "./types";

/** Minimum printable feature width in mm: 2 lines of 0.4 mm (spec §6.1). */
export const MIN_FEATURE_MM = 0.8;

/**
 * Bottom chamfer of trays above level 0 is at least this, in mm (spec §6.1); spacers and
 * level-0 trays use bottomChamfer as set. Shared by sizing and geometry.
 */
export const UPPER_MIN_CHAMFER = 0.5;

/**
 * TraySpec lengths are rounded to 0.01 mm, but sums and differences of them carry float noise
 * (8.29 − 7.29 = 0.9999999999999991), so every geometry limit allows half a grid step (spec §6.1).
 */
export const SPEC_TOLERANCE = 0.005;

/** The outer corner arc polygon lies up to 0.08 mm inside the true arc; plus a little margin. */
export const CORNER_MARGIN = 0.1;

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

/**
 * The 45° bottom chamfer of a tray at `level` in mm: bottomChamfer, at least UPPER_MIN_CHAMFER
 * above level 0 (spacers always pass level 0), never negative (spec §6.1).
 */
export function effectiveBottomChamfer(s: Settings, level: number): number {
  const base = Math.max(0, s.bottomChamfer);
  return level > 0 ? Math.max(base, UPPER_MIN_CHAMFER) : base;
}

/**
 * The smallest outer footprint side and height in mm that fit the chamfer c at `level`:
 * 2·(c + MIN_FEATURE_MM) and c + MIN_FEATURE_MM. Shared by sizing and geometry.
 */
export function chamferMinimums(s: Settings, level: number): { side: number; h: number } {
  const c = effectiveBottomChamfer(s, level);
  return { side: 2 * (c + MIN_FEATURE_MM), h: c + MIN_FEATURE_MM };
}

/**
 * Largest outer corner radius that keeps MIN_FEATURE_MM + CORNER_MARGIN between the rounded
 * outer corner and a cut disc whose centre is p and q from the corner's two outer faces (radius
 * rho; 0 for a sharp cut corner). Solves R − hypot(R − p, R − q) = m with
 * m = MIN_FEATURE_MM + CORNER_MARGIN + rho, i.e. R² − 2(p + q − m)R + p² + q² − m² = 0, for the
 * larger root.
 */
export function maxCornerRadius(p: number, q: number, rho: number): number {
  const m = MIN_FEATURE_MM + CORNER_MARGIN + rho;
  if (p < m || q < m) {
    // Too close to a straight face for any arc: keep the disc out of the arc
    // zone (it is in the zone only while p < R and q < R).
    return Math.max(p, q);
  }
  return p + q - m + Math.sqrt(2 * (p - m) * (q - m));
}

/**
 * Largest bottomChamfer the wall and floor allow (spec §6.1). Validation and sizing refuse
 * settings above it. The 45° chamfer c pulls the outer contour in by e = c − z at height z < c
 * (corner arc radius R − e), and the corner is never rounder than the chamfer (R ≥ c). Three
 * bounds, for a sharp well corner at the wall at the well floor f:
 * - straight faces keep wall + f − c ≥ MIN_FEATURE_MM;
 * - at the corner R = c is the worst case, with material f − √2·(c − wall) (arc distance
 *   R − e − √2·(R − wall), e = c − f), so c ≤ wall + (f − MIN_FEATURE_MM)/√2. This implies the
 *   straight-face bound whenever f ≥ MIN_FEATURE_MM; both are kept for out-of-range input;
 * - without the chamfer's e (c ≤ f), the corner limit maxCornerRadius(wall, wall, 0), which
 *   also keeps CORNER_MARGIN clear of the polygon-approximated arc.
 */
export function maxBottomChamfer(s: Settings): number {
  return Math.min(
    s.wall + s.floor - MIN_FEATURE_MM,
    s.wall + (s.floor - MIN_FEATURE_MM) / Math.SQRT2,
    maxCornerRadius(s.wall, s.wall, 0),
  );
}
