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

/**
 * Absorbs float noise when a computed value is compared with an exact one (a stored choice, a
 * derived limit). Far tighter than round6's 1e-6 and than SPEC_TOLERANCE: settings are not on the
 * TraySpec 0.01 mm grid, so only noise is forgiven.
 */
export const FLOAT_EPSILON = 1e-9;

/**
 * A finger cut leaves a full-height post at least this long, along the wall or divider it crosses,
 * between its side and the inner face of every compartment it passes (spec §6.1): the wall still
 * holds the contents, and no cut side comes near a well's rounded corner.
 */
export const POST_MM = 3;

/** A finger cut narrower than this (or the fingerPocket.width setting, if smaller) is left out. */
export const MIN_CUT_MM = 10;

/** The outer corner arc polygon lies up to 0.08 mm inside the true arc; plus a little margin. */
export const CORNER_MARGIN = 0.1;

/**
 * Thinnest outer wall and lip, in mm (0.9): MIN_FEATURE_MM plus CORNER_MARGIN. A sharp cut corner
 * at the wall keeps MIN_FEATURE_MM to the polygon of the rounded outer corner only with that
 * margin (maxCornerRadius), and a lip ring between two concentric polygons is only t·cos(Δ/2)
 * thick at a corner facet. SETTING_RANGES, wallFor and planTray use it.
 */
export const MIN_WALL_MM = MIN_FEATURE_MM + CORNER_MARGIN;

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
  fingerPocket: { width: 25, floorNotch: 12.5, wallRoom: 0, dividerRoom: 0 },
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
    // Choice values are stored exactly, so only float noise is forgiven.
    if (Math.abs(v - value) < FLOAT_EPSILON) {
      return choice;
    }
  }
  return "custom";
}

/**
 * Simple-mode "Extra finger room in the box" toggle: on writes this wall room (mm), off writes 0.
 * The outer walls a finger channel or cutout passes through become that much thicker, so the cut
 * itself leaves room for a finger when the tray sits flush against its neighbours.
 */
export const FINGER_ROOM_MM = 10;

/**
 * The same toggle's divider room (mm): the dividers a finger cut passes through get this much
 * thicker, so a finger fits between the stacks too.
 */
export const FINGER_DIVIDER_ROOM_MM = 5;

/**
 * Simple-mode finger room toggle: writes the resolved fingerPocket.wallRoom and .dividerRoom
 * (FINGER_ROOM_MM and FINGER_DIVIDER_ROOM_MM, or 0 and 0).
 */
export function applyFingerRoom(s: Settings, on: boolean): Settings {
  return {
    ...s,
    fingerPocket: {
      ...s.fingerPocket,
      wallRoom: on ? FINGER_ROOM_MM : 0,
      dividerRoom: on ? FINGER_DIVIDER_ROOM_MM : 0,
    },
  };
}

/**
 * Whether the finger room toggle is on (exactly its wall and divider room), off (no room) or
 * "custom" (any other pair, set in advanced mode).
 */
export function fingerRoomOf(s: Settings): boolean | "custom" {
  const wall = choiceOf({ on: FINGER_ROOM_MM, off: 0 }, s.fingerPocket.wallRoom);
  const divider = choiceOf({ on: FINGER_DIVIDER_ROOM_MM, off: 0 }, s.fingerPocket.dividerRoom);
  return wall === "custom" || wall !== divider ? "custom" : wall === "on";
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
    // zone (it is in the zone only while p < R and q < R). This keeps no CORNER_MARGIN for the
    // polygon arc. A safeguard for hand-built specs: the wall minimum MIN_FEATURE_MM +
    // CORNER_MARGIN (SETTING_RANGES) keeps sharp cut corners of valid settings out of here,
    // except where the chamfer pulls the contour in below the cut (m includes e; a floor under
    // MIN_FEATURE_MM + CORNER_MARGIN with a chamfer above it). maxBottomChamfer's corner term
    // keeps MIN_FEATURE_MM on the polygon there; geometry/plan-corners.test.ts measures it.
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
 *   R − e − √2·(R − wall), e = c − f); like every corner term it keeps CORNER_MARGIN on top
 *   (the polygon approximating the arc lies up to 0.08 mm inside it), so
 *   c ≤ wall + (f − MIN_FEATURE_MM − CORNER_MARGIN)/√2. For f ≥ MIN_FEATURE_MM + CORNER_MARGIN this
 *   implies the straight-face bound; both are kept for other input;
 * - without the chamfer's e (c ≤ f), the corner limit maxCornerRadius(wall, wall, 0).
 */
export function maxBottomChamfer(s: Settings): number {
  return Math.min(
    s.wall + s.floor - MIN_FEATURE_MM,
    s.wall + (s.floor - MIN_FEATURE_MM - CORNER_MARGIN) / Math.SQRT2,
    maxCornerRadius(s.wall, s.wall, 0),
  );
}
