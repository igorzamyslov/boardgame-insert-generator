// Cross-plan contract: roadmap §4.1 (spec §5 types plus shared helpers).
// Do not rename or change anything here without a roadmap contract change.
// All lengths are millimetres.

import type { Room } from "./room";

export type Access = "often" | "sometimes" | "setup";
export type Side = "front" | "back" | "left" | "right"; // tray-local: front = −Y, back = +Y, left = −X, right = +X

export interface Project {
  schemaVersion: string;
  createdWith: string;
  id: string;
  name: string;
  box: Box;
  printer: Printer;
  settings: Settings;
  components: Component[];
  /** Absent: no groups. A group's members are components, named by id in `memberIds`. */
  groups?: Group[];
  /**
   * Absent: the list shows the items in `components` order. Else the order the rail lists its items
   * in (component ids; an id it lacks goes last, in `components` order). A person's order, kept
   * with the project: the plan ignores it, so it is no input of the layout (not in the hash).
   */
  listOrder?: string[];
  locks: Lock[];
  layout?: StoredLayout;
}

/**
 * Items printed as one tray (one per copy), named and reached for together (groups spec §3.1).
 * Its members stay in `components`; moving an item in or out only changes `memberIds`.
 */
export interface Group {
  /** The same alphabet and namespace as component ids (newId), and never equal to one. */
  id: string;
  /** The tray's name; "" shows as "Group". */
  name: string;
  /** 1..10; absent = 1. N identical, separate trays. */
  copies?: number;
  /** "How often you reach for it", for the whole tray: a member's own `access` is not used. */
  access: Access;
  /** Component ids, in compartment order. */
  memberIds: string[];
}

export interface Box {
  innerWidth: number;
  innerDepth: number;
  innerHeight: number;
  headroom: number;
  headroomCoverage: "full" | "partial";
  /**
   * With "partial" coverage: where the kept space is, as the flat things that lie there (the
   * rulebook, a board, a stack of player mats), each a width and length in mm; `headroom` is their
   * thickness. The layout picks where each lies and keeps the stacks under it that much lower.
   * Absent or empty (or coverage "full"): no area, the whole top is kept, as before schema 0.3.1.
   */
  headroomAreas?: TopArea[];
  storedOnSide: boolean;
}

/** One flat thing that lies on the trays, in mm. `name` shows on the plan; absent: "Rulebook". */
export interface TopArea {
  name?: string;
  w: number;
  d: number;
}

export interface Printer {
  bedX: number;
  bedY: number;
  bedZ: number;
  bedMargin: number;
  layerHeight: number;
}

export type Component =
  CardsComponent | BulkComponent | TilesComponent | MinisComponent | CustomComponent;
export type ComponentKind = Component["kind"];

export interface ComponentBase {
  id: string;
  name: string;
  access: Access;
  /** 1..10; absent = 1. N identical, separate trays. Only on an item that is in no group. */
  copies?: number;
  clearance?: number;
  // Absent: the kind's default (fingerCutsOn, curvedFloorOn, cornerReliefsOn, growthOf, separatorsOf in ./defaults; spec §5).
  fingerCuts?: boolean; // a centred finger cut through a wall of each compartment
  curvedFloor?: boolean; // a scoop ramp on the floor (bulk, minis, custom only)
  cornerReliefs?: boolean; // Ø 3 mm reliefs in the corners of each compartment
  // "Room for more" (./room.ts): how much more of its own contents the tray is given. Absent: none,
  // a tray never grows on its own. A number: that many more cards or tiles, or that many percent more
  // pieces, part of the planned size. "max": as much as fits, taken from the room left after the
  // plan is made. Replaces `growth` and `stretch` (schema 0.3.0).
  room?: Room;
  // cards and tiles that grow along the stack only: whether the room it grows into is filled by a
  // spacer, and how many thin loose plates that is printed as, so one can be pulled out as the
  // collection grows (absent, or 0: no spacer at all, never unless asked for; 1: a single block;
  // more: that many plates). Before geometry 0.7.2 absent meant a single spacer.
  // The plates are derived for printing (splitSeparators). Before geometry 0.5.1 a count above 1
  // also made the layout build a spacer where it would build a spare pocket, which is why it is
  // still part of the inputs hash.
  separators?: number;
  // Upright cards and tiles that may grow along the stack: how many thin loose dividers split the
  // grown well into that many plus one sections, each held in a slot in the tray's floor (absent:
  // 0, none; dividersOf in ./defaults). Unlike `separators` this changes the tray itself (the
  // slots), so it is part of the inputs hash and the geometry version; the dividers are derived
  // from the stored slots (splitDividers). With dividers the well has no spacer, whatever
  // `separators` says.
  dividers?: number;
}

/**
 * One axis of growth, as sizing hands it to the layout (never stored; `growthOf` in ./defaults
 * works it out from an item's `room` and the fill setting): `off` (never), `auto` (up to a
 * conservative cap, `AUTO_GROWTH_*` in sizing), a number (that many mm beyond the minimum) or
 * `max` (whatever the layout has to give).
 */
export type GrowthMode = "off" | "auto" | "max" | number;

/**
 * The axes a component's growth is worked out on: the width, length (front to back) and height of
 * what is stored, or `stack` for the stack of cards or tiles, whichever way it lies (a deck on its
 * edge grows sideways, a flat one grows taller). Sizing maps each to the physical axis of the tray
 * (growthOf in ./defaults).
 */
export type GrowthAxis = "w" | "d" | "h" | "stack";

export type Sleeve = "none" | "standard" | "premium" | { w: number; h: number; thickness: number };

export interface CardsComponent extends ComponentBase {
  kind: "cards";
  shortSide: number;
  longSide: number;
  decks: { name: string; count: number }[];
  sleeve: Sleeve;
  /**
   * Preset: the sleeve table's thickness per card, times `scale` when set (1 = as tabulated; a
   * correction for cards the table gets wrong). Measured: as stored, sleeves included, and `scale`
   * has no place: a measurement already is the correction.
   */
  thickness:
    { mode: "preset"; scale?: number } | { mode: "measured"; cards: number; stackMm: number };
  storage: "upright-long" | "upright-short" | "flat" | "auto";
  /**
   * Several flat decks in one well: `walls` (each deck keeps its own wall) or `dividers` (loose
   * dividers between them, in slots in the floor). Absent: one well per deck, as before.
   */
  flatDecks?: "walls" | "dividers";
}

export type BulkItem =
  | { name: string; count: number; w: number; d: number; h: number }
  | { name: string; volumeMl: number };

export interface BulkComponent extends ComponentBase {
  kind: "bulk";
  items: BulkItem[];
  /**
   * How much of the bin's space its pieces fill, 0.05 to 1 (packingOf in ./settings). Absent: the
   * insert's `packingFactor`. Only count-and-size pieces read it: a pile given as a volume is
   * already the room it takes.
   */
  packing?: number;
}

export type TileShape =
  | { type: "rect"; w: number; d: number }
  | { type: "hex"; flatToFlat: number; orientation: "flat" | "pointy" };

export interface TilesComponent extends ComponentBase {
  kind: "tiles";
  shape: TileShape;
  thickness: number;
  count: number;
  storage: "flat" | "upright" | "auto";
}

export interface MinisComponent extends ComponentBase {
  kind: "minis";
  /**
   * keepUpright: never laid on its side or its back, for a fragile figure: only `w` and `d` may
   * swap (a turn in plan). Absent: the figure may be laid down where that makes a smaller tray.
   */
  figures: {
    name: string;
    w: number;
    d: number;
    h: number;
    count: number;
    keepUpright?: boolean;
  }[];
  storage: "pockets" | "bulk";
  /** Like BulkComponent.packing, for the figures stored loose in a tray (`storage` "bulk"). */
  packing?: number;
}

export interface CustomComponent extends ComponentBase {
  kind: "custom";
  w: number;
  d: number;
  h: number;
  count: number;
}

export type Lock =
  | { kind: "position"; trayKey: string; path: string; rotated: boolean }
  | { kind: "size"; trayKey: string; w: number; d: number; h: number }
  | { kind: "stack"; trayKeys: string[] }
  // Turn only: fixes the tray's rotation, and nothing else (it stays free to move).
  | { kind: "turn"; trayKey: string; rotated: boolean };

/**
 * The joint a plan is made with: none, a lip and groove ("rim"), or a stepped base ("step").
 * A stored layout carries the one it was planned with (StoredLayout.joint).
 */
export type Joint = "off" | "rim" | "step";

/** What Settings.lip.joint holds: a joint, or "auto", which plans with both and keeps the better. */
export type LipJoint = Joint | "auto";

export interface Settings {
  wall: number;
  floor: number;
  divider: number;
  fit: number;
  cardClearance: number;
  cardStackClearance: number;
  cardStackClearancePct: number;
  cardThickness: number;
  pieceClearance: number;
  boxClearance: number;
  trayGap: number;
  bottomChamfer: number;
  cornerRadius: number;
  scoopRadius: number;
  fingerPocket: {
    width: number;
    floorNotch: number;
    wallRoom: number;
    dividerRoom: number;
  };
  /**
   * Rim between layers: how a tray stacked on another keys into it. `joint` "rim": a lip on the
   * lower tray's rim and a groove under the upper tray's edge (lipped walls of thickness +
   * ledge). "step": a solid slab `stepHeight` tall under the upper part's floor drops into the
   * opening of the part below, which keeps that much room above its contents; walls stay at
   * `wall` (model/lip.ts stepOf). "off": trays are not keyed. "auto" (the default): the optimizer
   * plans with both and keeps the better plan (layout/auto.ts); the layout then says which it
   * used (StoredLayout.joint), and everything downstream sees that one (model/lip.ts jointOf).
   */
  lip: {
    joint: LipJoint;
    height: number;
    thickness: number;
    ledge: number;
    play: number;
    stepHeight: number;
  };
  topPressFit: number;
  packingFactor: number;
  leftover: "spare" | "solid";
  /** Pad every stack to the top plane, so nothing shifts (spec §3 rule 2); off = trays stay at content height. */
  fillToTop: boolean;
  /**
   * The least height (mm) of padding that is printed as a riser of its own under a stack (spec §3
   * rule 2) rather than left as a raised floor in its trays. A print-time decomposition like the
   * merge switches: splitRisers reads it from the stored layout, so it is no part of the inputs
   * hash. It never goes below what a part with a chamfer can be (splitRisers). Default 3.
   */
  minRiser: number;
  /**
   * Most extra thickness (mm) each wall or divider may take on to soak up leaf slack instead of
   * the slack becoming a filler part (spec §7.2). 0 = never thicken: slack is printed as a filler.
   * This is absorption, not growth: a thicker wall gives the contents no more room (spec §4).
   * Called `wallGrowth` up to schema 0.1.7; the reader still accepts that key.
   */
  wallAbsorb: number;
  /**
   * Let one wall take the room a filler would have (minimal-trays spec §6, "An escape hatch"):
   * the slack a tray cannot give its contents, up to ONE_WALL_MAX_MM per axis, goes into ONE outer
   * wall on each axis, never one a finger cut passes through, instead of becoming a filler part.
   * Trades honest geometry for fewer parts. It replaces `wallAbsorb` while on (which then does
   * nothing), and is part of the inputs hash only when on. Default off.
   */
  oneWall: boolean;
  /**
   * "Fill the space that's left" with bigger wells: after the plan is made, the room left beside a
   * tray goes into the wells of its items, those set to "as much as fits" first, as far as each
   * kind may take it (`AUTO_GROWTH_*`, retention), and what is still left stays a separate spacer.
   * Off (the default): spacers take it, and only an item set to "as much as fits" grows. Excludes
   * the thick-walls choices (`wallAbsorb`, `oneWall`), which are the other ways to fill it. In the
   * inputs hash only when on.
   */
  biggerWells: boolean;
  /**
   * Print connected filler parts as one part, up to the largest that fits the print bed (spec
   * minimal-trays §6.1, lever 1). A print-time decomposition like the riser split: no part of the
   * inputs hash, so toggling it never stales a plan or changes the stored layout.
   */
  mergeFillers: boolean;
  /**
   * With `mergeFillers`, fold the risers into the merged fillers too (lever 1b): a riser stands
   * under a tray and a filler beside it, so a part with both is an L in elevation. Also
   * print-time, and no part of the inputs hash. Does nothing while `mergeFillers` is off. On by
   * default (0.10.0), a file that says nothing included; an explicit off is kept.
   */
  mergeRisers: boolean;
  /**
   * Infill (percent) the filament estimate assumes for the sparse interior of thick parts (spec
   * §8.3). Display only: it changes no geometry, so it is not part of the inputs hash.
   */
  infill: number;
  /**
   * Most nominal sideways play (mm) a tray may have in the box before it is penalized and warned
   * about (spec §7.3, hard rule 1). In the inputs hash: it moves the score, so it can move the layout.
   */
  playLimit: number;
  /**
   * Engrave each part's short name (trayNames) into one of its outer walls (spec §6.1 "Part
   * names"), so a printed part can be told from the others. Changes the mesh and nothing else, so,
   * like `infill` and the merge switches, it is no part of the inputs hash. Files before schema
   * 0.1.16 call it `engraveNames` (they engraved the part's number).
   */
  engraveNames: boolean;
}

export interface StoredLayout {
  createdWith: string;
  geometryVersion: string;
  inputsHash: string;
  seed: number;
  iterations: number;
  capped: boolean;
  /**
   * The joint the layout was planned with, set when `settings.lip.joint` is "auto" (the settings
   * alone do not say which one was chosen). Absent otherwise: the settings are the joint.
   */
  joint?: Joint;
  trays: TraySpec[];
  /** Where each of the box's `headroomAreas` lies in this plan; absent when it has none. */
  reserved?: ReservedSpec[];
}

/**
 * The place the layout chose for one kept-free area, in the trays' frame (x, y from the floor's
 * corner, like `TraySpec`): its rectangle as the person's width and length (turned 90° or not),
 * and `z`, the height it lies at (the tops of the stacks under it).
 */
export interface ReservedSpec {
  /** Index into `box.headroomAreas`. */
  area: number;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
}

export type FeatureSpec =
  | {
      type: "wallCutout";
      side: Side;
      at: number;
      width: number;
      depth: number;
      floorNotch: number;
    }
  | { type: "spacerNotch"; axis: "x" | "y"; at: number; width: number; depth: number }
  // A slot in the floor of a well that a divider stands in (minimal-trays spec §5): `width` wide,
  // `depth` into the floor, running along `axis` across the whole well and centred on `at` across
  // it (tray-local, like a wall cutout's `at`). The divider itself is derived (splitDividers).
  | { type: "dividerSlot"; axis: "x" | "y"; at: number; width: number; depth: number }
  // A loose horizontal plate between two groups of a flat stack (splitDividers): its underside is
  // `at` mm above the well's floor, it is `thickness` thick and as wide as the well less its play.
  // It changes nothing in the tray itself.
  | { type: "separatorPlate"; at: number; thickness: number }
  | { type: "scoop"; side: Side; r: number }
  | { type: "cornerRelief"; d: number }
  // A top chamfer (model/top-chamfer.ts): a 45° chamfer `size` across, cut along the top edge of a
  // solid filler where it touches a tray, on the filler's face `side` and along it from `from` to
  // `to` (part-local, like a wall cutout's `at`). On a part's own `features`, never stored: the app
  // derives it at print time (layout/chamfers.ts), and a merged part carries it on its members.
  | { type: "topChamfer"; side: Side; from: number; to: number; size: number };

export interface CompartmentSpec {
  x: number; // inner, tray-local, min corner; origin = tray outer min corner
  y: number;
  w: number;
  d: number;
  floorZ: number; // tray-local; = settings.floor unless raised
  kind: "well" | "scoop" | "pocket" | "spare";
  contents: string;
  // Which component this compartment holds. Identity (its tint, glyph and "trays 1, 3" list)
  // reads this, rather than matching the `contents` text against component names, so two
  // components with the same name stay apart. Absent on spares, and on layouts stored before
  // schema 0.1.2, which fall back to matching the text.
  componentId?: string;
  features: FeatureSpec[];
}

/**
 * A half-round finger cut in a divider plate (splitDividers), radius `r`: through the plate at its
 * `left`, `right`, `front` or `back` edge (a flat plate, lined up with the tray's side cut), or
 * into its `top` edge (a standing plate), `at` mm along that edge (along the plate's long side for
 * the top). Derived for printing, never stored.
 */
export interface PlateNotch {
  face: "left" | "right" | "front" | "back" | "top";
  at: number;
  r: number;
}

export interface TraySpec {
  key: string;
  // "riser" and "divider" are derived for printing (splitRisers, splitDividers), never stored; a
  // spacer stored is always one block, split into plates for printing (splitSeparators)
  part: "tray" | "leftover" | "spacer" | "riser" | "divider";
  path: string;
  stack: number;
  level: number;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rotated: boolean;
  wall: number;
  floor: number;
  // true when another tray is stacked on this one and the rim between layers is on: it carries the lower
  // half of the joint, the lip (rim) or the socket the slab above drops into (step). Also true of
  // the top tray of a stack of alike trays (copies), which any of them may be: it carries them too
  lip: boolean;
  /**
   * Set on a tray that stands on a riser carrying the joint (splitRisers), never stored: the tray
   * has the groove (rim) or the slab (step) under it, as any tray above level 0 has with the rim
   * between layers on. Absent: the tray stands on the box floor or a plain riser, with the plain
   * bottom chamfer.
   */
  onRiser?: boolean;
  solid: boolean;
  compartments: CompartmentSpec[];
  // A divider's finger cuts (PlateNotch), derived with the plate and never stored.
  notches?: PlateNotch[];
  features?: FeatureSpec[]; // the part's own: a card spacer's notch (spacerNotch)
  /**
   * Set on a printed part that is several connected fillers (and risers) printed as one, never
   * stored (mergeParts derives it). The part's own x, y, z, w, d, h are the bounding box of the
   * union; `members` (absolute coordinates, each one built as it would be alone) and `bridges`
   * (solid boxes across the tray gaps between members) are the union itself.
   */
  merged?: MergedPart;
  /**
   * The part's short name (trayNames: letters, digits, space and hyphen), to engrave on it
   * (settings.engraveNames, spec §6.1 "Part names"). Never stored: the app sets it on the copy of a
   * spec it sends to the geometry layer, as the name depends on the whole part list. Absent: no
   * engraving.
   */
  partName?: string;
  /**
   * Longer names to try before `partName`, longest first (trayNames `options`; `partName` is the
   * last). The geometry engraves the first that fits at a size worth printing (`planNamed`).
   * Never stored, like `partName`. Absent: only `partName`.
   */
  partNames?: string[];
  /**
   * The kind each compartment holds, engraved on its floor ("Oil", "Metal"; "" for none), one per
   * compartment (trayNames `wells`). Never stored. Absent or empty: no well carries a kind name,
   * and the part's own name may go on the floor of a well instead.
   */
  wellNames?: string[];
}

/** An axis-aligned box in box coordinates, mm. */
export interface BoxMm {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface MergedPart {
  members: TraySpec[];
  bridges: BoxMm[];
  /**
   * The members stand on different floors (an in-level filler beside a ground one), so the part
   * only prints without supports upside down, its top face on the bed: every member runs from the
   * top plane downwards. Only solid members merge this way.
   */
  flipped: boolean;
}

// Shared helpers
export interface Notice {
  level: "info" | "warning" | "error";
  code: string; // stable machine code, e.g. "lock.dropped", "schema.newerMinor"
  message: string; // human-readable, English
  path?: string; // JSON-pointer-like field path for field-level validation, e.g. "/components/2/decks/0/count"
}

export interface ForeignData {
  // Unknown components from a newer-minor file, kept verbatim and re-inserted on save
  components: { index: number; raw: unknown }[];
  // Unknown enum values inside box/settings/printer/locks, kept verbatim and written back on save
  values?: { path: string; raw: unknown }[]; // path: JSON-pointer, e.g. "/settings/leftover"
}

export type ParseResult =
  | { ok: true; project: Project; foreign: ForeignData; notices: Notice[] }
  | { ok: false; error: string };
