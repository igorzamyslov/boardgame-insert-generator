import { MIN_FEATURE_MM } from "../model/settings";

/** Minimum printable feature width: 2 lines of 0.4 mm (spec §6.1). */
export const MIN_FEATURE = MIN_FEATURE_MM;
/** A compartment whose smaller inner side is at least this is a grip (spec §3 rule 8). */
export const MIN_GRIP = 25;
/** Bulk compartments: minimum width and depth (spec §7.1). */
export const BULK_MIN_SIDE = 25;
/** Bulk compartments: content depth ≤ MAX_H_RATIO × min(w, d) (spec §7.1). */
export const MAX_H_RATIO = 1.5;
/** Bulk "wide-and-shallow" content depth, and the lower bound of the "deep" shape. */
export const SHALLOW_H = 20;
/** Smallest extra empty ("spare") compartment realizeTray adds, inner mm. */
export const MIN_SPARE = 10;
/** Card spacer: minimum spare stack length and minimum spacer height (spec §6.2). */
export const MIN_SPACER = 5;
/** Card spacer: this much lower than the well (spec §6.2: well height − 5). */
export const SPACER_TOP_GAP = 5;
/** Corner relief diameter in tile and custom wells (spec §6.1). */
export const CORNER_RELIEF_D = 3;
/** At most this many variants per requirement (spec §7.1). */
export const MAX_VARIANTS = 8;
/** Splits across at most this many trays (spec §7.1). */
export const MAX_SPLITS = 3;
/** A measured card thickness below this (mm per card) is implausible; the preset is used. */
export const MIN_MEASURED_CARD_T = 0.1;
/** Tile column / stack variants: target stack heights in mm (1 column is always offered). */
export const TILE_STACK_TARGETS: readonly number[] = [50, 25];
/** Upper trays must be at least lip.height + this tall (spec §6.1). */
export const UPPER_TRAY_MIN_ABOVE_LIP = 3;
/** Walls and dividers thicken inward up to min(2 × setting, this) (spec §7.2 Fill). */
export const WALL_GROW_LIMIT = 4;
