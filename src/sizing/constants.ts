/** A compartment whose smaller inner side is at least this is a grip (spec §3 rule 8). */
export const MIN_GRIP = 25;
/** Bulk compartments: minimum width and depth (spec §7.1). */
export const BULK_MIN_SIDE = 25;
/** Bulk compartments: content depth ≤ MAX_H_RATIO × min(w, d) (spec §7.1). */
export const MAX_H_RATIO = 1.5;
/** Bulk "wide-and-shallow" content depth, and the lower bound of the "deep" shape. */
export const SHALLOW_H = 20;
/**
 * The deepest a compartment you scoop from may be, floor to rim. A curved floor rounds the
 * bottom corner out so a fingertip can get under the pieces; what it cannot do is get your
 * hand down a pit. Past this the ramp sits at the bottom of a well you cannot reach, so a bin
 * that wants one is spread wider rather than deeper, and the grip rule stops counting it.
 */
export const SCOOP_REACH = 35;
/**
 * Flat floor a second, opposite scoop ramp must leave between the two (spec §6.1): two ramps of
 * half the width each would otherwise meet in the middle, and nothing would sit flat. About a
 * fingertip and a half, enough for a piece to rest on.
 */
export const MIN_FLAT_FLOOR = 15;
/** Empty wall left above a loose pile, so pieces don't spill over the rim when the box moves. */
export const BIN_FREEBOARD = 5;
/** Smallest inner size at which a riser opens into a walled box rather than staying solid, mm. */
export const MIN_SPARE = 10;
/** Card spacer: minimum spare stack length and minimum spacer height (spec §6.2). */
export const MIN_SPACER = 5;
/**
 * Thinnest loose spacer plate worth printing when a stretch spacer is split into several
 * (a component's `separators`, spec §6.2). Thinner than MIN_SPACER because a plate carries no
 * load: it only takes up slack between decks, in the same well as the others, and the stack is
 * pressed together from both sides. 3 mm is about seven perimeter lines, solid, so it prints
 * rigid standing on its edge; the bottom chamfer's own minimum applies on top (planTray).
 */
export const MIN_SEPARATOR = 3;
/** Card spacer: this much lower than the well (spec §6.2: well height − 5). */
export const SPACER_TOP_GAP = 5;
/**
 * Smallest height of padding worth printing as a riser of its own under a stack (spec §3 rule 2).
 * 10 mm is 50 layers at 0.2 mm: below it the raised floor it would replace costs less plastic
 * than a second part (a bed slot, a print job, a step in the instructions) and is not what makes
 * a tray look bulky. A riser's key is its bottom tray's key plus this suffix.
 */
export const MIN_RISER = 10;
export const RISER_SUFFIX = ":riser";
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
/** Upright cards and tiles: the finger channel is this fraction of the shallowest well deep. */
export const CHANNEL_DEPTH = 1 / 2;
