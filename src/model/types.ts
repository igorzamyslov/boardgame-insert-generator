// Cross-plan contract: roadmap §4.1 (spec §5 types plus shared helpers).
// Do not rename or change anything here without a roadmap contract change.
// All lengths are millimetres.

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
  locks: Lock[];
  layout?: StoredLayout;
}

export interface Box {
  innerWidth: number;
  innerDepth: number;
  innerHeight: number;
  headroom: number;
  headroomCoverage: "full" | "partial";
  storedOnSide: boolean;
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
  groupId?: string;
  perPlayer?: { players: number };
  clearance?: number;
  // Absent: the kind's default (fingerCutsOn, curvedFloorOn, cornerReliefsOn, stretchOn, separatorsOf in ./defaults; spec §5).
  fingerCuts?: boolean; // a centred finger cut through a wall of each compartment
  curvedFloor?: boolean; // a scoop ramp on the floor (bulk, minis, custom only)
  cornerReliefs?: boolean; // advanced: Ø 3 mm reliefs in the corners of each compartment
  // cards and tiles stored upright only: the tray grows to fill its space instead of staying
  // content-sized, a spacer or an end wall taking up the slack
  stretch?: boolean;
  // cards and tiles with `stretch` on only: how many thin loose plates the stretch spacer is
  // printed as, so one can be pulled out as the collection grows (absent: 1, a single spacer).
  // The plates are derived for printing (splitSeparators). Before geometry 0.5.1 a count above 1
  // also made the layout build a spacer where it would build a spare pocket, which is why it is
  // still part of the inputs hash.
  separators?: number;
}

export type Sleeve = "none" | "standard" | "premium" | { w: number; h: number; thickness: number };

export interface CardsComponent extends ComponentBase {
  kind: "cards";
  shortSide: number;
  longSide: number;
  decks: { name: string; count: number }[];
  sleeve: Sleeve;
  thickness: { mode: "preset" } | { mode: "measured"; cards: number; stackMm: number };
  storage: "upright-long" | "upright-short" | "flat" | "auto";
}

export type BulkItem =
  | { name: string; count: number; w: number; d: number; h: number }
  | { name: string; volumeMl: number };

export interface BulkComponent extends ComponentBase {
  kind: "bulk";
  items: BulkItem[];
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
  figures: { name: string; w: number; d: number; h: number; count: number }[];
  storage: "pockets" | "bulk";
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
  | { kind: "stack"; trayKeys: string[] };

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
  lip: { enabled: boolean; height: number; thickness: number; ledge: number; play: number };
  topPressFit: number;
  packingFactor: number;
  leftover: "spare" | "solid";
  /** Pad every stack to the top plane, so nothing shifts (spec §3 rule 2); off = trays stay at content height. */
  fillToTop: boolean;
  /**
   * Most extra thickness (mm) each wall or divider may take on to soak up leaf slack instead of
   * the slack becoming a filler part (spec §7.2). 0 = never thicken: slack is printed as a filler.
   * This is absorption, not growth: a thicker wall gives the contents no more room (spec §4).
   * Called `wallGrowth` up to schema 0.1.7; the reader still accepts that key.
   */
  wallAbsorb: number;
  /**
   * Infill (percent) the filament estimate assumes for the sparse interior of thick parts (spec
   * §8.3). Display only: it changes no geometry, so it is not part of the inputs hash.
   */
  infill: number;
}

export interface StoredLayout {
  createdWith: string;
  geometryVersion: string;
  inputsHash: string;
  seed: number;
  iterations: number;
  capped: boolean;
  trays: TraySpec[];
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
  | { type: "scoop"; side: Side; r: number }
  | { type: "cornerRelief"; d: number };

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

export interface TraySpec {
  key: string;
  part: "tray" | "leftover" | "spacer" | "riser"; // "riser" is derived for printing (splitRisers), never stored; a spacer stored is always one block, split into plates for printing (splitSeparators)
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
  lip: boolean; // true when another tray is stacked on this one and settings.lip.enabled
  solid: boolean;
  compartments: CompartmentSpec[];
  features?: FeatureSpec[]; // the part's own: a card spacer's notch (spacerNotch)
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
