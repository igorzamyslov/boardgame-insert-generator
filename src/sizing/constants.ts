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
/**
 * Thinnest wall of a hollow spacer, mm (spec §6.2): five perimeter lines at a 0.4 mm nozzle. A
 * spacer carries the deck's squeeze, so its walls are never thinner than this even where the
 * tray's own `wall` setting is (`openSpacers` takes the larger of the two).
 */
export const SPACER_MIN_WALL = 2;
/** Card spacer: this much lower than the well (spec §6.2: well height − 5). */
export const SPACER_TOP_GAP = 5;
/**
 * Deepest pocket a riser must have to print as an open walled box; a riser whose pocket (its
 * height less the floor) is shallower prints solid, as a spacer does (MIN_SPACER, the same 5 mm).
 * Under it the walls and floor are most of the part anyway, and a pocket that shallow saves
 * under a millimetre of plastic.
 *
 * The least height of padding worth printing as a riser at all is a setting, `minRiser`
 * (spec §3 rule 2; 10 mm until 0.10.0, 3 mm now). A riser's key is its bottom tray's key plus
 * RISER_SUFFIX.
 */
export const MIN_RISER_POCKET = MIN_SPACER;
export const RISER_SUFFIX = ":riser";
/**
 * The most slack (mm, per axis) the `oneWall` setting lets a tray's one thick wall take beyond what
 * its contents may grow into (minimal-trays spec §6). A wall this thick (about ten normal walls)
 * still reads as a deliberate block against the box edge; a larger gap is printed as a filler
 * beside the tray as usual, so a 60 mm gap never becomes a 60 mm wall.
 */
export const ONE_WALL_MAX_MM = 20;
/** Corner relief diameter in tile and custom wells (spec §6.1). */
export const CORNER_RELIEF_D = 3;
/**
 * At most this many variants per storage option of a requirement (spec §7.1): every arrangement
 * (strip, rows2, columns) × every split (MAX_SPLITS). It was 8 (2 × 3 and room to spare) until
 * group-tray-fill spec §3 (b) added columns, and 12 since a split in four.
 */
export const MAX_VARIANTS = 12;
/**
 * Splits across at most this many trays (spec §7.1; four since 0.14.0, so four entries can be
 * one tray each). Only even splits are offered (`offeredSplit`), so this is the most any item
 * is cut into, not how many variants it gets.
 */
export const MAX_SPLITS = 4;
/** The most trays `splitBlocks` balances by weight: what an item with no even split falls back to. */
export const MAX_WEIGHTED_SPLITS = 3;
/** A measured card thickness below this (mm per card) is implausible; the preset is used. */
export const MIN_MEASURED_CARD_T = 0.1;
/** Tile column / stack variants: target stack heights in mm (1 column is always offered). */
export const TILE_STACK_TARGETS: readonly number[] = [50, 25];
/** Upright cards and tiles: the finger channel is this fraction of the shallowest well deep. */
export const CHANNEL_DEPTH = 1 / 2;
/**
 * What `auto` growth is (minimal-trays spec §5), per axis: the lesser of this fraction of the
 * content's own size on that axis and AUTO_GROWTH_CEILING. The content's own size is the most a bin,
 * a pocket or a stack can take before it is no longer "that bin with a little give" but a bigger
 * one; the ceiling is what stops a large bin or a thick deck from taking a hand's breadth.
 */
export const AUTO_GROWTH_FRACTION = 1;
/** The most `auto` growth ever gives an axis, mm: past it the slack is a filler (spec §5). */
export const AUTO_GROWTH_CEILING = 50;
/**
 * Retention (spec §5): an upright stack with nothing in the room it gained starts to topple once
 * that room is about its own thickness, so growth along a stack is capped at this many stack
 * thicknesses unless the room is filled by the `separators` plates (a spacer plate holds the
 * stack). With plates the room is solid, nothing can fall over, and the cap rises to
 * PLATED_RETENTION stack thicknesses: considerably further, but still a limit, because a
 * deck that has grown six times over wants dividers and its own tray, not a longer well.
 */
export const UNPLATED_RETENTION = 1;
export const PLATED_RETENTION = 6;

/**
 * Reachability (minimal-trays spec §5.3): with nothing in the room it gained an upright stack is
 * not pinned, it slides within the well, and the finger cut that reaches it across the row is
 * centred on the well. At worst the stack stands against one end, and the cut must still lie over
 * at least this much of its thickness for a fingertip to get onto the cards. 10 mm is a
 * fingertip's width, the figure MIN_CUT_MM already takes as the narrowest cut a finger fits
 * (model/settings.ts; a test holds them equal). A stack thinner than that, or thinner than that
 * plus POST_MM (the post a cut leaves at the well's end), is asked for what it can have.
 */
export const MIN_REACH_OVERLAP = 10;

/**
 * Short pieces (custom items and minis, `pieceCutout`): a piece lower than this gets the
 * full-depth finger cut with the floor notch that flat cards and tiles get, instead of the
 * half-deep plain cut. A half-deep cut shows half the piece's side; a fingertip needs
 * MIN_REACH_OVERLAP (10 mm, the narrowest cut a finger fits) of it to take hold, so below twice
 * that the half-deep cut leaves the piece mostly under the wall (a 2 mm board gets 1 mm of it, a
 * 12 mm figure 6 mm) and it can only be lifted by tipping the tray. A fingertip gets under such a
 * piece through the notch instead. From 20 mm up the half-deep cut shows 10 mm or more of the
 * side, and the piece is lifted by its top as before. Judged on the piece's own height, so the
 * clearance around it (a setting) does not move it across.
 *
 * The notch goes down through the bottom, so it is only for a well on the tray's own floor
 * (`placeCutouts`, `raised`): a short pocket whose floor is raised above the tray's, beside a
 * taller one, gets the same full-depth cut down to its own floor with no notch.
 */
export const SHORT_PIECE_H = 2 * MIN_REACH_OVERLAP;

/**
 * Dividers (a component's `dividers`, minimal-trays spec §5): thin loose plates that split a grown
 * deck well into sections, each standing in a slot cut into the tray's floor. The plate is at
 * least DIVIDER_THICKNESS thick (3 mm, as thin as a separator plate and for the same reason: it
 * prints rigid standing on its edge) and at least what its bottom chamfer needs; its slot is
 * DIVIDER_PLAY wider, so it goes in by hand and is not wedged.
 */
export const DIVIDER_THICKNESS = 3;
export const DIVIDER_PLAY = 0.4;
/**
 * How deep the slot is cut into the floor, mm. A floor is only settings.floor thick, so the floor
 * under a divided well is that much thicker still (the tray is that much taller where it is not
 * raised anyway): a slot over the floor's own thickness plus MIN_FEATURE_MM would cut through, and
 * a plate standing in a slot shallower than this tips under the stack's lean.
 */
export const DIVIDER_GROOVE = 2;
/** Clear space at each end of a divider, between it and the well's walls, mm. */
export const DIVIDER_END_PLAY = 0.2;
/** Narrowest section a divided well is made, mm: a divider must have room on both sides. */
export const MIN_SECTION = 5;
