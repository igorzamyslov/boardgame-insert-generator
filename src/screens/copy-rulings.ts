// src/screens/copy-rulings.ts
// What a screen may print beyond its board: rulings, and what it may never print from a board.
// `src/test-support/boardCopy.ts` reads both; `src/screens/copy.board.test.tsx` (from Task 4)
// enforces them.

/** A string the app prints that no board has, ruled in docs/DESIGN.md §7. */
export interface CopyRuling {
  /** The text; `{name}` stands for any text (a component or tray name, a number with a unit). */
  text: string;
  /** The states (`scripts/design/states.mjs`, or the copy test's own) that may print it, or all. */
  states: readonly string[] | "all";
  /** The first words of the §7 row's Decision cell that rules it. */
  ruling: string;
}

import {
  LIFT_LINES,
  LIFT_TEMPLATES,
  NO_GRIP_TAG,
  NO_GRIP_TEMPLATE,
  TAKE_OUT_HEADING,
  TAKE_OUT_NOTE,
} from "../instructions/lift";
import { SETTING_RANGES } from "../model/validate";
import { OPTION_NOTE_TEXTS } from "../ui/components/optionNotes";
import { COMPARTMENT_WORDS } from "../ui/identity";
import { EXACT_GROUPS } from "../ui/settingsGroups";

const FOOTER = "The footer moves into the project menu";
const SAVED = "The saved status shows only a problem";
const DISMISS = "A menu note other than another tab's";
const INSERTS = "Your inserts is a page of the project menu";
const UNNAMED = "An unnamed insert reads (unnamed)";
const PAGE = ["inserts", "inserts-delete"] as const;
const REDO = "Redo sits beside Undo";
const PICKER = "Add opens a kind picker";
const SUMMARY = "A row's line under the name is short";
const CHIPS = "The rail's rule chips are one per rule";
const CLEAR = "Clear all my choices lifts every pin";
const HIDE = "A note under the plan can be hidden";
const UPRIGHT = "A figure may lie on any side";
const MINIS_STATES = [
  "editor-minis",
  "editor-minis-more",
  "m-edit",
  "m-edit-more",
  "kit-member",
  "m-kit-member",
] as const;
const NOTE = "The rules note says what stays";
// 0.7.0 Task 13: Turned, the rules note's turn sentence and Between decks
const TURNED = "A tray turned and not pinned says";
const TURNS_NOTE = "The rules note names the turns";
const BETWEEN = "Between decks is a row under Cards stand";
/** The states that draw a turned tray's chip: the rail of the desktop and the phone's sheet. */
const TURNED_STATES = ["workspace-turned", "m-turned"] as const;
/** The Cards editor of an item with flat decks (copy.board.test.tsx has a case for each). */
const FLAT_DECKS = ["editor-flat-decks", "editor-flat-decks-upright"] as const;
const BOXCARD = "The rail's box card says its size on one line";
const BED = "The rail's footer line shows the insert's printer";
const NO_TIME = "The app gives no print time";
const ADDING = ["workspace-add", "m-workspace-add"] as const;
// 0.7.0 Task 9: a group's card in the rail and Add → Group. The states are the kit cases of copy.board.test.tsx.
const KIT_RAIL = ["kit-rail", "kit-add", "kit-picker", "kit-drag"] as const;
const GROUP_TILE = "Add's picker has a sixth tile";
const GROUP_COUNTS = "A group's card in the rail says its counts";
// 0.7.0 Task 10: a group's tray bar and the stage sentence of a split copy
const GROUP_BAR = "A group's tray bar says its size";
const SPLIT = "A split copy's stage sentence adds";
// 0.7.0 Task 11: the group editor (GroupEdit) and its Remove group… question and note
const GROUP_REMOVE = "Remove group… asks in place";
const GROUP_REMOVED = "A group's removal is one note";
const GROUP_ORDER = "The order of a group's items is set with";
/** What a removal's lock notes can say, as sentences: pins, a size lock, or both (the actions' own words). */
const GROUP_LOCK_NOTES: readonly string[] = (() => {
  const pins = ["1 pin removed.", "{n} pins removed."];
  const sizes = ["Size unlocked on 1 tray.", "Size unlocked on {n} trays."];
  return [...pins, ...sizes, ...pins.flatMap((p) => sizes.map((z) => `${p} ${z}`))];
})();
/** The group editor's states (copy.board.test.tsx has a case for each; `kit-removed` is the copy test's own). */
const GROUP_EDITS = [
  "kit-edit",
  "kit-remove",
  "kit-removed",
  "kit-split-edit",
  "m-kit-edit",
] as const;
/** The rail's states and the phone sheet's (copy.board.test.tsx has a case for each). */
const RAIL = [
  ...KIT_RAIL,
  "workspace",
  "workspace-rules",
  "workspace-add",
  "workspace-error",
  "no-fit",
  "no-fit-bed",
  "pin-conflict",
  "workspace-turned",
  "workspace-put-on",
  ...FLAT_DECKS,
] as const;
const SHEET = [
  "m-workspace",
  "m-turned",
  "m-put-on",
  "m-workspace-add",
  "m-workspace-rules",
  "m-fix",
  "m-pin-conflict",
] as const;
const RULED = ["workspace-rules", "m-workspace-rules", "pin-conflict", "m-pin-conflict"] as const;
// Task 6: the top of the stage. The states are the stage-top cases of copy.board.test.tsx.
const PLAN_STATES = [
  "workspace",
  "workspace-searching",
  "workspace-banner",
  "m-workspace",
] as const;
const LAYERS = "The layer switch uses DESIGN's names";
const LAYERS_3D = "In 3D the Layer switch peels the model";
const THREE_D = ["workspace-3d", "workspace-3d-selected"] as const;
// 0.23.0: the 3D view's own controls, in its caption row
const VIEW_3D = "The 3D view shows the plan's colours";
const EDITOR_LAYERS = "The editor's stage has the Layer switch";
const HOMES = "The Summary's jobs have new homes";
const NOFIT = "The no-fit heading names the tray";
const PINS =
  "Pins in the way: the first conflict names the heading, the engine's reasons are its line, and each conflict is a card";
const FIT_PANEL = "The fit problems are a stage of their own";
const NOFIT_FIGURE = "The no-fit line gives the closest plan's shortfall";
const VOLUME = "The no-fit screen says how much room the items need";
const FIT_ROW = "The rail marks the tray that does not fit: Doesn't fit";
const BANNERS = "The plan banners use DESIGN's words";
const NOTES = "Layout and sizing notices sit under the plan caption";
// Task 7: the plan's caption and pin marks. The states are the plan cases of copy.board.test.tsx.
const CAPTION = "The plan's caption names its layer";
// 0.14.0 board 1: the stage header
const HEADER = "The stage header is one toolbar row";
// 0.14.0 board 2: the Layer switch
const LAYER_ONE = "One Layer switch, the same in Top and 3D";
const PHONE_PINS = "A phone's plan shows the pin marks";
const FAILED = ["workspace-failed"] as const;
const ERRORS = ["workspace-error"] as const;
const FIT_PROBLEMS = ["no-fit", "no-fit-bed", "pin-conflict", "m-fix", "m-pin-conflict"] as const;
const NO_FIT = ["no-fit", "no-fit-bed", "m-fix"] as const;
/** The volume note's sentences; `{name}` stands for a figure in litres or an item's name. */
const NEEDS = "Your items need at least {name} L as trays.";
const HAS = ["The box has {name} L.", "The box has {name} L under the headroom."];
const OVER = [
  "This can't fit: take something out or reserve less space on top.",
  "This can't fit: take something out.",
];
const VOLUME_RULINGS: readonly CopyRuling[] = [
  ...HAS.map((has) => ({ text: `${NEEDS} ${has}`, states: NO_FIT, ruling: VOLUME })),
  ...OVER.map((text) => ({ text, states: NO_FIT, ruling: VOLUME })),
  // over the box's volume the heading says both: the figures, then the judgement
  ...HAS.flatMap((has) =>
    OVER.map((over) => ({ text: `${NEEDS} ${has} ${over}`, states: NO_FIT, ruling: VOLUME })),
  ),
  { text: "Very tight: expect to change settings.", states: NO_FIT, ruling: VOLUME },
  { text: "{name} takes {name} L", states: NO_FIT, ruling: VOLUME },
  {
    text: "Leaving out {name} would bring it under the box's {name} L.",
    states: NO_FIT,
    ruling: VOLUME,
  },
];
const PIN_CONFLICT = ["pin-conflict", "m-pin-conflict"] as const;
// Task 8: the tray bar and the phone's tray sheet. The states are the tray cases of copy.board.test.tsx.
const MORE = "More holds Swap with… and Lock size";
// 0.15.0: Put on… (a stack lock without a position: the pair moves anywhere together)
const PUT_ON = "Put on… stands one tray on another";
/** The states that draw a put-on: the plan's prompt while the base is chosen, and the rail after it. */
const PUT_ON_PICK = ["workspace-put-on-pick", "m-put-on-pick"] as const;
const PUT_ON_CHIP = ["workspace-put-on", "m-put-on"] as const;
const NO_ACTIONS = "Spacers, spare trays and risers show no actions";
const PIN_WORDS = "Pin and Turn say what they hold";
const TRAY_SHEET = "A phone's tray bar is a modal sheet";
// 0.7.0 Task 10: "kit-rail" has the bar of a group's tray selected (G1), the same buttons and words.
const BAR_STATES = [
  "workspace-tray",
  "workspace-tray-more",
  "workspace-tray-spacer",
  "workspace-put-on-pick",
  "kit-rail",
] as const;
const SHEET_STATES = ["m-tray", "m-tray-more", "m-tray-market", "m-tray-spacer"] as const;
/** Every stage-top case that has a plan under it, so a Layer switch. */
const SWITCHED = [
  ...BAR_STATES,
  ...SHEET_STATES,
  ...PLAN_STATES,
  ...ERRORS,
  ...FAILED,
  ...FIT_PROBLEMS,
  "workspace-making",
  "workspace-box-error",
] as const;

// Task 9: the first visit's box error. The state is the copy test's own (`first-visit-error`).
const ERROR_CARD = "The first visit's box error is a card";
const ITEMS = 'The first visit says "Trays appear in the box as you add items."';

// Task 10: the editors, desktop and phone. The states are the editor cases of copy.board.test.tsx.
const EDITS = [
  "editor",
  "editor-more",
  "editor-more-changed",
  "editor-tokens",
  "editor-tokens-more",
  "editor-tiles",
  "editor-tiles-more",
  "editor-custom",
  "editor-custom-more",
  "editor-minis",
  "editor-minis-more",
  ...FLAT_DECKS,
] as const;
const PHONE_EDITS = ["m-edit", "m-edit-more"] as const;
// 0.7.0 Task 12: an item's editor in a group's terms (a member's, the Move to group… panel, what moving
// and taking out say). The states are the member cases of copy.board.test.tsx.
const KIT_ITEM_EDITS = [
  "kit-member",
  "kit-move-panel",
  "kit-member-moved",
  "kit-member-out",
  "m-kit-member",
] as const;
const EDITING = [...EDITS, ...PHONE_EDITS, ...KIT_ITEM_EDITS] as const;
/** The states that draw the rows under More options with their contents open (the rows Task 12 adds or renames). */
const OPENED_ROWS = [
  "editor-more",
  "editor-more-changed",
  "editor-tokens-more",
  "editor-tiles-more",
  "editor-custom-more",
  "editor-minis-more",
  "m-edit-more",
  "kit-member",
  "kit-move-panel",
  "kit-member-moved",
  ...FLAT_DECKS,
] as const;
const EDITOR_OPTIONS = "The editors name every option the engine has";
const EDITOR_SIZES = "Card sizes are the engine's presets";
const EDITOR_SUMMARY = "More options says what is inside it";
const EDITOR_NOTES = "An option change speaks through a note in the stage slot";
const EDITOR_SENTENCE = "The stage sentence is the page's h1 while editing";
const EDITOR_ROOM_MORE = "Room for more is one row per item, in the contents' terms";
const RESIZE = "The rail's handle is named";
const EDITOR_REMOVE = "Removing asks in place, and the removal is a note in the slot";
const EDITOR_CHANGED = "More options marks what differs from its default";
const EDITOR_ROOM = "Room around the pieces shows the insert's number and lets the item change it";
const THIN_WALLS = "Walls' Thin choice is 1.0 mm all through";
const ITEM_PACKING = "An item's own packing is a row under More options";
const ITEM_COPIES = "An item's Copies and Group row replace Per player and the Group box";
const ITEM_MOVES = "Moving an item into or out of a group says what happens to its copies";
// 0.7.0 Task 14: a drop in the rail
const DROP = "A drop in the rail says what it did";
// 0.7.0 Task 15 fix round 1: an empty group on the phone
const EMPTY_PHONE = "An empty group on the phone says";
const EDITOR_NAME = "The phone editor has a Name field";
const EDITOR_BLOCKED = "A blocked option stays on screen and says why";
const EDITOR_WORDS = "The Words table beats MobileEdit's second way to store figures";
/** The strings the editors print that no board of theirs has (the boards have them in other states, or in the old words). */
const EDITOR_LABELS: readonly string[] = [
  // the kinds, as Empty's tiles say them
  "Cards",
  "Tokens and dice",
  "Tiles",
  "Miniatures",
  "Something else",
  // the panel's frame
  "What's inside",
  "Remove…",
  "Remove {name}…",
  // groups and their choices
  "None",
  "Auto",
  "How often you reach for it",
  "Often",
  "Sometimes",
  "Only at setup",
  "Cards stand",
  "Long edge",
  "Short edge",
  "Flat",
  "Upright",
  "Tiles stand",
  "Shape",
  "Which way up",
  "Tray shape",
  "Finger cuts",
  "Curved floor",
  "Corner holes",
  "Removable dividers",
  // fields
  "How many cards?",
  "Card size",
  "Sleeves",
  "Short side",
  "Long side",
  "Side mm",
  "Width mm",
  "Depth mm",
  "Height mm",
  "Across the flat sides (mm)",
  "Thickness (mm)",
  "How many tiles?",
  "Volume ml",
  "Know the size? Give a count and a size instead",
  "{name}, amount mm",
  // the rows under More options, and what is in them
  "Card thickness",
  "Correct the estimated thickness",
  "Measure a stack of cards (sleeves included)",
  "Cards in the measured stack",
  "Height of that stack",
  "Sleeve size",
  "Sleeve outer width",
  "Sleeve outer length",
  "Added thickness per card",
  "Spacer plates",
  "Dividers",
  "Number of dividers",
  "Deck",
  "Deck name",
  "+ Another deck",
  "Group",
  "Other sizes",
  "Don't know the size of {name}? Give a volume instead",
];

/** The way back from a changed option: "Back to <its default>", the default named there and nowhere else. */
const EDITOR_BACKS: readonly string[] = [
  "Back to None",
  "Back to Auto",
  "Back to Sometimes",
  "Back to the sleeve table",
  "Back to 0",
  "Back to off",
  "Back to no group",
  "Back to {n}",
  ...["finger cuts", "curved floor", "corner holes"].flatMap((chip) => [
    `Back to ${chip} on`,
    `Back to ${chip} off`,
  ]),
];

// The packing guide's Lift column and its note on taking things out (2026-10-23, "lifting trays").
/** The guide has no board and no state of the screenshot harness: this name is the test's own. */
const GUIDE_STATES = ["packing-guide"] as const;
const GUIDE_LIFT = "The packing guide says how to take each tray out";

// Task 11: the box's editor. The states are the box cases of copy.board.test.tsx.
const BOX_WORDS = "The box editor has the board's words only";
const BOX_AREA = "Part of it reserves only the area you give it";
const BOX_HINT = "The box's stored-on-its-side hint says what the engine does";

// Task 13: the Download dialog and the building of the file. The states are the dialog cases of
// copy.board.test.tsx (download, exporting, exporting-done, m-download) and the ones no case reaches.
/** The states whose copy may say "part" (the download list's word, DESIGN §2 Words): copy.test.ts checks it. */
export const DOWNLOAD_STATES = [
  "download",
  "m-download",
  "exporting",
  "exporting-done",
  "exporting-partial",
] as const;
const DOWNLOAD = DOWNLOAD_STATES;
const DL_COUNT = "The Download dialog counts trays and spacers";
const DL_FLOW = "The Download dialog's title and body follow the build";
const DL_NOT = "Exporting's report, partial download and Start again are not built";
const DL_PLAN = "The Download dialog is a print plan by layer";
const DL_BLOCKED = "The Download dialog says why it is blocked in its caption line";
/** "8 trays and 2 spacers for Harbour Kings" in each of its forms: the board has the plural one. */
const HOLDS: readonly string[] = [
  ...["{n} trays", "1 tray"].flatMap((trays) => [
    `${trays} for {name}`,
    ...["{n} spacers", "1 spacer"].map((spacers) => `${trays} and ${spacers} for {name}`),
  ]),
  "{n} spacers for {name}",
  "1 spacer for {name}",
];

// Task 14: the Settings drawer. The states are the drawer cases of copy.board.test.tsx: the two
// tabs, each group of Exact numbers opened, a search, Printer details, another printer on the insert.
export const SETTINGS_STATES: readonly string[] = [
  "settings",
  "settings-printer",
  "settings-printer-details",
  "settings-printer-other",
  "settings-printer-unsaved",
  "settings-search",
  "settings-nomatch",
  "settings-spacers-walls",
  ...EXACT_GROUPS.map((g) => `settings-${g.id}`),
];
const SET_FIRST = "Settings' first screen is the board's plain choices";
const SET_EXACT = "Every setting the board does not show is under Exact numbers";
const SET_PRINTER = "My printer shows another printer on this insert as a row with Apply";
const SET_DETAILS = "Printer details holds the own bed size, margin and layer height";
const SET_RISERS = "Settings' first screen also has two riser rows";
const SET_INTRO = "My printer's intro names the values it covers";
const SET_BACK = "Every switch in Settings has the changed dot and a way back";
const SET_WORDS = "Settings' hints follow the Words table";
const SET_GAPS = "Fill the space that's left is one choice of what the engine does with spare room";
const SET_KIND = "Rim between layers is a rim and groove or a stepped base";

/** Ruled strings, added by the task that builds the screen that prints them. */
export const COPY_RULINGS: readonly CopyRuling[] = [
  // The phone's tray sheet says the filament where its board says "Printing: about 3.5 h, 58 g".
  { text: "Filament", states: SHEET_STATES, ruling: NO_TIME },
  { text: "about {n} g", states: SHEET_STATES, ruling: NO_TIME },
  // Task 14: Settings. The board's words, except where the Words table or the owner rules otherwise.
  ...SETTING_RANGES.map((r) => ({ text: r.label, states: SETTINGS_STATES, ruling: SET_EXACT })),
  { text: "Room around trays and pieces", states: SETTINGS_STATES, ruling: SET_WORDS },
  { text: "Back to on", states: SETTINGS_STATES, ruling: SET_BACK },
  { text: "Back to off", states: SETTINGS_STATES, ruling: SET_BACK },
  { text: "Spacers and space", states: SETTINGS_STATES, ruling: SET_EXACT },
  { text: "Unused space", states: SETTINGS_STATES, ruling: SET_EXACT },
  { text: "Spare tray", states: SETTINGS_STATES, ruling: SET_EXACT },
  { text: "Solid block", states: SETTINGS_STATES, ruling: SET_EXACT },
  { text: "Fill the space that's left", states: SETTINGS_STATES, ruling: SET_GAPS },
  { text: "Separate spacers", states: SETTINGS_STATES, ruling: SET_GAPS },
  { text: "Bigger wells", states: SETTINGS_STATES, ruling: SET_GAPS },
  { text: "Thicker walls", states: SETTINGS_STATES, ruling: SET_GAPS },
  { text: "One thick wall", states: SETTINGS_STATES, ruling: SET_GAPS },
  {
    text: "Room left beside a tray is printed as separate spacers.",
    states: SETTINGS_STATES,
    ruling: SET_GAPS,
  },
  {
    text: "Room left goes into the wells of items set to As much as fits first, then into the others' wells as far as each can use it. What is still left is a separate spacer.",
    states: SETTINGS_STATES,
    ruling: SET_GAPS,
  },
  {
    text: "Instead of a spacer, every wall and divider may get up to {n} mm thicker.",
    states: SETTINGS_STATES,
    ruling: SET_GAPS,
  },
  {
    text: "Instead of a spacer, one outer wall in each direction takes up to {n} mm, avoiding walls with a finger cut. A bigger gap still gets a spacer.",
    states: SETTINGS_STATES,
    ruling: SET_GAPS,
  },
  { text: "{name} stays upright", states: MINIS_STATES, ruling: UPRIGHT },
  { text: "Never laid on its side", states: MINIS_STATES, ruling: UPRIGHT },
  { text: "Back to separate spacers", states: SETTINGS_STATES, ruling: SET_GAPS },
  { text: "You set the fit to {n} below.", states: SETTINGS_STATES, ruling: SET_FIRST },
  { text: "Thin", states: SETTINGS_STATES, ruling: THIN_WALLS },
  { text: "You set the floor or the dividers below.", states: SETTINGS_STATES, ruling: THIN_WALLS },
  { text: "Extra space beside walls to reach in", states: SETTINGS_STATES, ruling: SET_WORDS },
  { text: "No exact number matches.", states: SETTINGS_STATES, ruling: SET_EXACT },
  { text: "{n} of {n} shown.", states: SETTINGS_STATES, ruling: SET_EXACT },
  { text: "No tray will be bigger than this.", states: SETTINGS_STATES, ruling: SET_WORDS },
  { text: "Join spacers into fewer pieces to print", states: SETTINGS_STATES, ruling: SET_WORDS },
  {
    text: "Long names are shortened to fit, like “{name}” → “{name}”",
    states: SETTINGS_STATES,
    ruling: SET_WORDS,
  },
  { text: "Long names are shortened to fit", states: SETTINGS_STATES, ruling: SET_WORDS },
  {
    text: "Bed, margin and layer height are kept in this browser.",
    states: SETTINGS_STATES,
    ruling: SET_INTRO,
  },
  { text: "This insert uses another printer", states: SETTINGS_STATES, ruling: SET_PRINTER },
  { text: "Apply", states: SETTINGS_STATES, ruling: SET_PRINTER },
  ...["Bed X", "Bed Y", "Bed Z", "Bed margin", "Layer height"].map((text) => ({
    text,
    states: SETTINGS_STATES,
    ruling: SET_DETAILS,
  })),
  { text: "Separate risers from", states: SETTINGS_STATES, ruling: SET_RISERS },
  {
    text: "Smaller padding stays a thicker tray floor.",
    states: SETTINGS_STATES,
    ruling: SET_RISERS,
  },
  { text: "Fold risers into the joined spacers", states: SETTINGS_STATES, ruling: SET_RISERS },
  { text: "Needs joined spacers.", states: SETTINGS_STATES, ruling: SET_RISERS },
  { text: "Kind of rim", states: SETTINGS_STATES, ruling: SET_KIND },
  { text: "Rim and groove", states: SETTINGS_STATES, ruling: SET_KIND },
  { text: "Stepped base", states: SETTINGS_STATES, ruling: SET_KIND },
  { text: "Trays with one on top get thicker walls.", states: SETTINGS_STATES, ruling: SET_KIND },
  {
    text: "Walls stay thin; a tray with one on top is {n} deeper.",
    states: SETTINGS_STATES,
    ruling: SET_KIND,
  },
  { text: "Needs Rim between layers.", states: SETTINGS_STATES, ruling: SET_KIND },
  {
    text: "A step under each tray keeps the top layer from sliding",
    states: SETTINGS_STATES,
    ruling: SET_KIND,
  },
  { text: "Not saved: {name}", states: SETTINGS_STATES, ruling: SET_DETAILS },
  // Task 13: Export, Exporting and MobileDownload have the plural forms only, and no failure of a whole build
  ...HOLDS.map((text) => ({ text, states: DOWNLOAD, ruling: DL_COUNT })),
  { text: "1 spacer", states: DOWNLOAD, ruling: DL_COUNT },
  // 2026-10-24 board 8: the print plan (a layer's card, its pills, the total and the support line);
  // the copy check judges each part of a " · " line on its own
  ...[
    "Layer {n}",
    "Layer {n} (bottom)",
    "Layer {n} (top)",
    "{n} trays",
    "1 tray",
    "{n} spacers",
    "Total about {n} g",
    "{n} spacers included",
    "1 spacer included",
    "+ {n}",
    "about {n} g",
    "Support this tool",
    "·",
  ].map((text) => ({ text, states: DOWNLOAD, ruling: DL_PLAN })),
  { text: "One file with the part.", states: DOWNLOAD, ruling: DL_COUNT },
  { text: "The part is ready", states: DOWNLOAD, ruling: DL_FLOW },
  { text: "{n} of 1 part built", states: DOWNLOAD, ruling: DL_FLOW },
  { text: "{n} of 1 part is ready", states: DOWNLOAD, ruling: DL_FLOW },
  // a zip is not "one file with every part": the done phase says what was downloaded
  { text: "Downloaded {name}.", states: DOWNLOAD, ruling: DL_FLOW },
  { text: "Not exported", states: DOWNLOAD, ruling: DL_NOT },
  { text: "{name}: {name}", states: DOWNLOAD, ruling: DL_NOT },
  { text: "Try again", states: DOWNLOAD, ruling: DL_NOT },
  { text: "Error:", states: DOWNLOAD, ruling: DL_NOT },
  { text: "Download failed: {name}", states: DOWNLOAD, ruling: DL_NOT },
  { text: "Make a new plan first.", states: DOWNLOAD, ruling: DL_BLOCKED },
  { text: "The plan is updating.", states: DOWNLOAD, ruling: DL_BLOCKED },
  // Task 4: the header and the project menu
  { text: "Insert Generator {version}", states: "all", ruling: FOOTER },
  { text: "Licences", states: "all", ruling: FOOTER },
  { text: "Redo", states: "all", ruling: REDO },
  { text: "Couldn't save", states: "all", ruling: SAVED },
  { text: "Not saved: this browser blocks storage", states: "all", ruling: SAVED },
  { text: "(unnamed)", states: "all", ruling: UNNAMED },
  { text: "Dismiss", states: "all", ruling: DISMISS },
  { text: "Back", states: PAGE, ruling: INSERTS },
  { text: "Open now", states: PAGE, ruling: INSERTS },
  { text: "Delete…", states: PAGE, ruling: INSERTS },
  { text: "Delete", states: PAGE, ruling: INSERTS },
  { text: "Cancel", states: PAGE, ruling: INSERTS },
  {
    text: "Delete “{name}” from this browser? This can't be undone.",
    states: PAGE,
    ruling: INSERTS,
  },
  { text: "Nothing saved yet.", states: PAGE, ruling: INSERTS },
  // Task 5: the rail and the phone's sheet
  { text: "Cards", states: ADDING, ruling: PICKER },
  { text: "Tokens and dice", states: ADDING, ruling: PICKER },
  { text: "Tiles", states: ADDING, ruling: PICKER },
  { text: "Miniatures", states: ADDING, ruling: PICKER },
  { text: "Something else", states: ADDING, ruling: PICKER },
  // MobileWorkspace draws "+ Add" with a text plus; the app draws the plus as an icon
  { text: "Add", states: SHEET, ruling: PICKER },
  { text: "Pinned", states: ["m-workspace-rules", "m-pin-conflict"], ruling: CHIPS },
  { text: "Pinned, turned", states: RULED, ruling: CHIPS },
  { text: "Turned", states: TURNED_STATES, ruling: TURNED },
  { text: "Size locked", states: RULED, ruling: CHIPS },
  // Main's "These stay as you set them when the plan updates." is in COPY_DENIED: it does not say what stays
  {
    text: "Pinned trays stay where you put them when the plan updates.",
    states: RULED,
    ruling: NOTE,
  },
  {
    text: "Pinned and size-locked trays stay as you set them when the plan updates.",
    states: RULED,
    ruling: NOTE,
  },
  // a turn is its own rule: the note says what the plan keeps of it, after the pin sentence when there is one
  {
    text: "Turned trays keep their direction when the plan updates.",
    states: TURNED_STATES,
    ruling: TURNS_NOTE,
  },
  {
    text: "Pinned trays stay where you put them when the plan updates. Turned trays keep their direction when the plan updates.",
    states: TURNED_STATES,
    ruling: TURNS_NOTE,
  },
  {
    text: "Pinned and size-locked trays stay as you set them when the plan updates. Turned trays keep their direction when the plan updates.",
    states: TURNED_STATES,
    ruling: TURNS_NOTE,
  },
  // Main and MobileWorkspace draw five tiles; GroupAdd's sixth is the app's in every picker
  { text: "Group", states: ADDING, ruling: GROUP_TILE },
  // GroupRail draws "3 items · 4 trays" as one string; the app counts, and says one in the singular
  { text: "{n} items", states: KIT_RAIL, ruling: GROUP_COUNTS },
  { text: "1 item", states: KIT_RAIL, ruling: GROUP_COUNTS },
  { text: "{n} trays", states: KIT_RAIL, ruling: GROUP_COUNTS },
  { text: "1 tray", states: KIT_RAIL, ruling: GROUP_COUNTS },
  // the box card's unit is its own, smaller element: "285 × 285 × 70" and "mm"
  { text: "mm", states: RAIL, ruling: BOXCARD },
  // Main's footer says "Printer bed 256 × 256 mm", which wraps beside Settings in the 300 px rail
  { text: "Bed {n} × {n} mm", states: RAIL, ruling: BED },
  {
    text: "Clear all my choices",
    states: ["m-workspace-rules", "m-pin-conflict", "m-turned", "m-put-on"],
    ruling: CLEAR,
  },
  { text: "bottom layer", states: RAIL, ruling: SUMMARY },
  { text: "top layer", states: RAIL, ruling: SUMMARY },
  { text: "layer {n}", states: RAIL, ruling: SUMMARY },
  { text: "{n} pieces", states: [...RAIL, ...SHEET], ruling: SUMMARY },
  // the sheet's rows say what the rail's do: MobileWorkspace draws them shorter ("80 cards")
  { text: "{n} cards, sleeved", states: SHEET, ruling: SUMMARY },
  { text: "{n} decks of {n}", states: SHEET, ruling: SUMMARY },
  { text: "{n} kinds, {n} pieces", states: SHEET, ruling: SUMMARY },
  { text: "Needs attention", states: ["workspace-error"], ruling: SUMMARY },
  // Task 6: the status heading, the switches, the banner and the notes
  { text: "Layer {n} (bottom)", states: SWITCHED, ruling: LAYERS },
  { text: "Layer {n} (top)", states: SWITCHED, ruling: LAYERS },
  { text: "Layer {n}", states: SWITCHED, ruling: LAYERS },
  // The 3D caption row's Reset view and projection switch (the board draws Spread apart only)
  { text: "Reset view", states: THREE_D, ruling: VIEW_3D },
  // the projection is a browser choice in Settings, on the Display tab
  ...["Display", "3D view", "Perspective", "Orthographic"].map((text) => ({
    text,
    states: SETTINGS_STATES,
    ruling: VIEW_3D,
  })),
  // In 3D the switch starts with "All": layers 1 to n, nothing cut away
  { text: "All", states: THREE_D, ruling: LAYERS_3D },
  // the editor's stage has the same switch (it opens on the item's own layer)
  ...["Layer {n} (bottom)", "Layer {n} (top)", "Layer {n}"].map((text) => ({
    text,
    states: ["editor", "editor-note"] as readonly string[],
    ruling: EDITOR_LAYERS,
  })),
  { text: "Making a new plan…", states: ["workspace-making"], ruling: HOMES },
  { text: "No plan yet", states: ["workspace-noplan"], ruling: HOMES },
  { text: "Make a plan", states: ["workspace-noplan"], ruling: HOMES },
  { text: "The plan couldn't be updated", states: FAILED, ruling: HOMES },
  {
    text: "{message} The plan shown is the last good one, from before your latest change.",
    states: FAILED,
    ruling: HOMES,
  },
  { text: "Retry", states: FAILED, ruling: HOMES },
  {
    text: "Fix the errors marked in the inputs",
    states: [...ERRORS, "workspace-box-error"],
    ruling: HOMES,
  },
  { text: "Edit {name}", states: [...ERRORS, ...FIT_PROBLEMS], ruling: HOMES },
  // Task 12: the fit problems' panel offers what the engine can do, in its own words
  { text: "Try another arrangement", states: NO_FIT, ruling: FIT_PANEL },
  { text: "Change the box", states: ["workspace-box-error"], ruling: HOMES },
  { text: "The {name} tray doesn't fit yet", states: NO_FIT, ruling: NOFIT },
  { text: "Not everything fits yet", states: NO_FIT, ruling: NOFIT },
  { text: "There's no room left for it in the box.", states: ["no-fit", "m-fix"], ruling: NOFIT },
  // the engine's whole-plan shortfall, one sentence: "17.2 mm too tall", "17.2 mm too tall and 3.0 mm too wide"
  {
    text: "There's no room left for it in the box. The closest plan is {name}.",
    states: ["no-fit", "m-fix"],
    ruling: NOFIT_FIGURE,
  },
  { text: "The closest plan is {name}.", states: NO_FIT, ruling: NOFIT_FIGURE },
  // 0.15.0: the volume note under the cards, and (over the box's volume) the heading's line. Its
  // sentences are `volumeNote`'s (src/ui/volumeFit.ts), with and without a headroom.
  ...VOLUME_RULINGS,
  { text: "It's too big for your printer's bed.", states: ["no-fit-bed"], ruling: NOFIT },
  { text: "{name} doesn't fit with your pins", states: PIN_CONFLICT, ruling: PINS },
  { text: "{name} doesn't fit with its size locked", states: PIN_CONFLICT, ruling: PINS },
  { text: "Unpin {name}", states: PIN_CONFLICT, ruling: PINS },
  { text: "Unlock size of {name}", states: PIN_CONFLICT, ruling: PINS },
  { text: "Doesn't fit", states: FIT_PROBLEMS, ruling: FIT_ROW },
  { text: "Make a new plan", states: ["workspace-banner"], ruling: BANNERS },
  {
    text: "Trays printed from it won't stack with trays you print now.",
    states: ["workspace-older"],
    ruling: BANNERS,
  },
  { text: "Use the old plan", states: ["workspace-older"], ruling: BANNERS },
  { text: "Show all", states: ["workspace-notes"], ruling: NOTES },
  { text: "Warning:", states: ["workspace-notes"], ruling: NOTES },
  { text: "Note:", states: ["workspace-notes"], ruling: NOTES },
  { text: "Error:", states: ["workspace-notes", "no-fit", "no-fit-bed"], ruling: NOTES },
  // 0.14.0 board 1: the toolbar's sub-line, "Searching…", and the hint that ends the caption
  { text: "All", states: "all", ruling: LAYER_ONE },
  { text: "All layers, seen from above. Front of the box", states: "all", ruling: LAYER_ONE },
  { text: "{name} trays", states: "all", ruling: HEADER },
  { text: "{name} tray", states: "all", ruling: HEADER },
  { text: "{name} layers", states: "all", ruling: HEADER },
  { text: "{name} layer", states: "all", ruling: HEADER },
  { text: "{name} of {name} mm", states: "all", ruling: HEADER },
  { text: "Searching…", states: "all", ruling: HEADER },
  { text: "Top", states: ["kit-member-moved", "kit-member-out"], ruling: HEADER },
  { text: "3D", states: ["kit-member-moved", "kit-member-out"], ruling: HEADER },
  { text: "· tap a tray for details", states: "all", ruling: HEADER },
  // Task 7: under the box, and the marks a phone's plan keeps
  {
    text: "{name}, seen from above. Front of the box",
    states: [
      "workspace",
      "workspace-rules",
      "workspace-failed",
      "no-fit",
      "pin-conflict",
      "editor",
      "editor-more",
      "editor-note",
      "editor-removed",
      "kit-edit",
      "kit-removed",
      "kit-split-edit",
      "kit-member",
      "kit-drag",
    ],
    ruling: CAPTION,
  },
  { text: "Turned", states: ["m-workspace-rules"], ruling: PHONE_PINS },
  {
    text: "Spacers fill the gaps again when the plan updates.",
    states: ["m-workspace-rules"],
    ruling: PHONE_PINS,
  },
  // Task 9: Empty's line says "things", a retired word (the Words table: What's inside)
  {
    text: "Trays appear in the box as you add items.",
    states: ["first-visit"],
    ruling: ITEMS,
  },
  // Task 9: the words of a measure the rules refuse, in the card under the three fields
  { text: "Enter a number.", states: ["first-visit-error"], ruling: ERROR_CARD },
  {
    text: "Not a number. Use digits with one decimal point or comma, e.g. 63,5.",
    states: ["first-visit-error"],
    ruling: ERROR_CARD,
  },
  { text: "Must be more than {n}.", states: ["first-visit-error"], ruling: ERROR_CARD },
  { text: "Must be at most {n}.", states: ["first-visit-error"], ruling: ERROR_CARD },
  // Task 8: the tray bar (desktop) and the tray sheet (phone)
  { text: "More", states: [...BAR_STATES, ...SHEET_STATES], ruling: MORE },
  {
    text: "Swap with…",
    states: ["workspace-tray-more", "m-tray-more", "m-tray-market"],
    ruling: MORE,
  },
  {
    text: "Put on…",
    states: ["workspace-tray-more", "m-tray-more", "m-tray-market", ...PUT_ON_PICK],
    ruling: PUT_ON,
  },
  {
    text: "Lock size",
    states: ["workspace-tray-more", "m-tray-more", "m-tray-market"],
    ruling: MORE,
  },
  { text: "Pick the tray to put {name} on.", states: PUT_ON_PICK, ruling: PUT_ON },
  {
    text: "Spare trays and spacers can't be stood on. Pick another tray.",
    states: PUT_ON_PICK,
    ruling: PUT_ON,
  },
  { text: "On {name}", states: PUT_ON_CHIP, ruling: PUT_ON },
  {
    text: "Trays put on another stay on it when the plan updates.",
    states: PUT_ON_CHIP,
    ruling: PUT_ON,
  },
  {
    text: "{name} is pinned. Unpin it before you put trays on it.",
    states: PUT_ON_PICK,
    ruling: PUT_ON,
  },
  {
    text: "{name} already has {n} trays on it. A stack holds at most {n}.",
    states: PUT_ON_PICK,
    ruling: PUT_ON,
  },
  {
    text: "{name} doesn't go on {name}: the stack is taller than the space in the box.",
    states: PUT_ON_PICK,
    ruling: PUT_ON,
  },
  { text: "Pick another tray to put it on.", states: PUT_ON_PICK, ruling: PUT_ON },
  { text: "Unlock size", states: ["workspace-tray-more", "m-tray-more"], ruling: MORE },
  {
    text: "Fills the gap so the trays can't slide. Print it too. {size}",
    states: ["workspace-tray-spacer", "m-tray-spacer"],
    ruling: NO_ACTIONS,
  },
  {
    text: "Carries {name}",
    // no copy case: a riser is not in the seed (TrayBar.test covers it)
    states: ["workspace-tray-riser"],
    ruling: NO_ACTIONS,
  },
  { text: "Edit {name}", states: SHEET_STATES, ruling: TRAY_SHEET },
  // the buttons say what they hold: this tray alone, or the stack it is in (its tray count follows, for a reader)
  ...["tray", "stack"].flatMap((what) =>
    [`Pin this ${what}`, `Unpin this ${what}`, `Turn this ${what} 90°`].map((text) => ({
      text,
      states: [...BAR_STATES, ...SHEET_STATES],
      ruling: PIN_WORDS,
    })),
  ),
  { text: ", {n} trays", states: [...BAR_STATES, ...SHEET_STATES], ruling: PIN_WORDS },
  // "6 figure pockets" is MobileTray's own; the others say the same of the other kinds
  ...Object.values(COMPARTMENT_WORDS).flatMap(([one, many]) => [
    { text: `{n} ${one}`, states: SHEET_STATES, ruling: TRAY_SHEET },
    { text: `{n} ${many}`, states: SHEET_STATES, ruling: TRAY_SHEET },
  ]),
  // Task 11: Box's hint is "Trays then fill up to the lid, so nothing falls out" (in COPY_DENIED: not what the engine does)
  {
    text: "Loose pieces go under other trays where they can, so nothing spills.",
    states: ["box", "m-box"],
    ruling: BOX_HINT,
  },
  // Task 11: the rail's three fields say their unit once, above them (80 px boxes keep their room for "285.5")
  { text: "In mm", states: ["box"], ruling: BOX_WORDS },
  // Kept-free areas (schema 0.3.1): the size of what lies on top, and a line true of each state of the choice
  { text: "What lies there", states: ["box", "m-box"], ruling: BOX_AREA },
  ...[
    "Trays stop {n} mm below the lid, everywhere.",
    "Give its width and length to reserve only that much. Until then the whole top is reserved.",
    "Reserved: {n} × {n} mm, in a corner the plan picks. Trays reach the lid everywhere else.",
    "The space kept on top is larger than the floor of the box.",
  ].map((text) => ({ text, states: ["box", "m-box"], ruling: BOX_AREA })),
  // The kit's accessible-name convention is "<label> (<unit>)": the space field's name is "Space on top (mm)"
  // (Box's aria-label is "Space on top, mm"). Never drawn, so no case sees it; recorded here with the rest.
  { text: "Space on top (mm)", states: ["box", "m-box"], ruling: BOX_WORDS },
  // Task 10: the editors (Edit, EditKinds, MobileEdit) and the stage beside them
  ...EDITOR_LABELS.map((text) => ({ text, states: EDITING, ruling: EDITOR_OPTIONS })),
  // a blocked option says why in one line (DESIGN, Flow): the spacer plates, the dividers and their chip
  ...[
    "Dividers need Room for more cards.",
    "Dividers need Room for more tiles.",
    "Spacer plates need Room for more cards.",
    "Spacer plates need Room for more tiles.",
    "Dividers take the place of spacer plates.",
  ].map((text) => ({ text, states: EDITING, ruling: EDITOR_BLOCKED })),
  // What a flat deck's or stack's dividers are (the Dividers row's note)
  ...[
    "Lying flat, a deck gets plates between groups of cards. Lift a group out with the plate under it.",
    "Lying flat, a stack gets plates between groups of tiles. Lift a group out with the plate under it.",
  ].map((text) => ({
    text,
    states: EDITING,
    ruling: "A flat deck or stack of tiles has dividers too",
  })),
  // the engine's presets, as the chips and the size line say them
  // Between decks, and the reasons its blocked rows give (the stand and the dividers of a flat deck)
  // the deck list's label over each deck's stepper (the decks list is in the basics from the second deck on)
  { text: "How many", states: FLAT_DECKS, ruling: "Decks live in the basics" },
  { text: "Between decks", states: FLAT_DECKS, ruling: BETWEEN },
  { text: "Fixed walls", states: FLAT_DECKS, ruling: BETWEEN },
  { text: "Only flat decks can share one well.", states: FLAT_DECKS, ruling: BETWEEN },
  { text: "For flat decks, see Between decks.", states: FLAT_DECKS, ruling: BETWEEN },
  { text: "Standard American", states: EDITING, ruling: EDITOR_SIZES },
  { text: "Euro", states: EDITING, ruling: EDITOR_SIZES },
  { text: "Mini Euro", states: EDITING, ruling: EDITOR_SIZES },
  { text: "French Tarot", states: EDITING, ruling: EDITOR_SIZES },
  { text: "Mini American", states: EDITING, ruling: EDITOR_SIZES },
  { text: "Extra Large", states: EDITING, ruling: EDITOR_SIZES },
  { text: "Dixit", states: EDITING, ruling: EDITOR_SIZES },
  { text: "Custom", states: EDITING, ruling: EDITOR_SIZES },
  { text: "Loose in a tray", states: EDITING, ruling: EDITOR_WORDS },
  { text: "Finger cuts {name}", states: EDITING, ruling: EDITOR_SUMMARY },
  { text: "{n} changed", states: EDITING, ruling: EDITOR_SUMMARY },
  ...EDITOR_BACKS.map((text) => ({ text, states: EDITING, ruling: EDITOR_CHANGED })),
  {
    text: "The insert's setting. Type another number to give this item its own.",
    states: EDITING,
    ruling: EDITOR_ROOM,
  },
  {
    text: "This item's own, whatever Fit says. The insert's is {n} mm.",
    states: EDITING,
    ruling: EDITOR_ROOM,
  },
  { text: "Name", states: [...PHONE_EDITS, "m-kit-edit", "m-kit-member"], ruling: EDITOR_NAME },
  // 0.7.0 Task 12 (spec §7.3, §7.5, §8): Copies replaces Per player; the Group row replaces the Group box
  { text: "Copies", states: OPENED_ROWS, ruling: ITEM_COPIES },
  { text: "Each copy is its own tray.", states: OPENED_ROWS, ruling: ITEM_COPIES },
  { text: "Move to group…", states: OPENED_ROWS, ruling: ITEM_COPIES },
  { text: "New group", states: ["kit-move-panel"], ruling: ITEM_COPIES },
  { text: "×{n}", states: ["kit-move-panel"], ruling: ITEM_COPIES },
  { text: "In {name}", states: [...KIT_ITEM_EDITS], ruling: ITEM_COPIES },
  { text: "Edit {name}", states: [...KIT_ITEM_EDITS], ruling: ITEM_COPIES },
  { text: "Take out of group", states: ["kit-member", "kit-member-moved"], ruling: ITEM_COPIES },
  {
    text: "Copies and how often you reach for it are set on {name}.",
    states: ["kit-member", "kit-member-moved", "m-kit-member"],
    ruling: ITEM_COPIES,
  },
  { text: "Room around the pieces", states: OPENED_ROWS, ruling: EDITOR_ROOM },
  { text: "How tightly it packs", states: OPENED_ROWS, ruling: ITEM_PACKING },
  ...["Loose", "Snug", "Tight"].map((text) => ({
    text,
    states: OPENED_ROWS,
    ruling: ITEM_PACKING,
  })),
  ...["Loose", "Snug", "Tight"].map((word) => ({
    text: `Back to ${word}`,
    states: OPENED_ROWS,
    ruling: ITEM_PACKING,
  })),
  {
    text: "How much of the tray's space the pieces fill.",
    states: OPENED_ROWS,
    ruling: ITEM_PACKING,
  },
  { text: "Needs the figures loose in a tray.", states: OPENED_ROWS, ruling: ITEM_PACKING },
  { text: "This item packs at {n}.", states: OPENED_ROWS, ruling: ITEM_PACKING },
  { text: "The insert packs at {n}.", states: OPENED_ROWS, ruling: ITEM_PACKING },
  {
    text: "{name} now has the group's {n} copies.",
    states: ["kit-member-moved", "kit-drag"],
    ruling: ITEM_MOVES,
  },
  {
    text: "{name} now has the group's single copy.",
    states: ["kit-member-moved", "kit-drag"],
    ruling: ITEM_MOVES,
  },
  { text: "{name} is out of {name}.", states: ["kit-member-out", "kit-drag"], ruling: ITEM_MOVES },
  // a drop in the rail (the live region says the first, the toast the notes and the button)
  { text: "{name} moved to {name}.", states: ["kit-drag"], ruling: DROP },
  { text: "Undo move", states: ["kit-drag"], ruling: DROP },
  // an empty group on the phone: no drag there, so the card and the group editor offer only Move to group…
  {
    text: "Use Move to group… in an item.",
    states: ["m-workspace", "m-kit-edit"],
    ruling: EMPTY_PHONE,
  },
  // the stage sentence: Edit's, for the kinds and the counts it does not draw
  {
    text: "tray, {name} × {name} mm.",
    states: [...EDITS, ...PHONE_EDITS, "workspace-failed", "no-fit", "pin-conflict"],
    ruling: EDITOR_SENTENCE,
  },
  {
    text: "tray, {name} × {name} mm. It grows as you add cards.",
    states: ["workspace-failed", "no-fit", "pin-conflict"],
    ruling: EDITOR_SENTENCE,
  },
  {
    text: ", {n} trays.",
    states: [...EDITS, ...PHONE_EDITS, ...KIT_ITEM_EDITS],
    ruling: EDITOR_SENTENCE,
  },
  // GroupRail draws "5 compartments" in the tray bar's line (the app says one in the singular)
  { text: "{n} compartments", states: ["kit-rail"], ruling: GROUP_BAR },
  { text: "1 compartment", states: ["kit-rail"], ruling: GROUP_BAR },
  // a copy that had to split (spec §7.4, §8): the group's editor (Task 11) and the item's say it after the count
  {
    text: ", {n} trays. Too big for one tray, so it is split.",
    states: ["kit-edit", "kit-split-edit"],
    ruling: SPLIT,
  },
  ...OPTION_NOTE_TEXTS.map((text) => ({
    text,
    states: ["editor-note", ...PHONE_EDITS] as readonly string[],
    ruling: EDITOR_NOTES,
  })),
  // Room for more (cards, tiles, pieces): the row, its choices, its amount and its line
  ...[
    "Room for more cards",
    "Room for more tiles",
    "Room for more pieces",
    "Room for more cards, amount",
    "Room for more tiles, amount",
    "Room for more pieces, amount",
    "Some",
    "As much as fits",
    "The tray is planned with room for {n} more cards.",
    "The tray is planned with room for {n} more tiles.",
    "The tray is planned with room for {n}% more pieces.",
    "Takes the room left over once the layout is chosen.",
    "Fills the room left in {name}'s tray. The tray doesn't get bigger.",
  ].map((text) => ({ text, states: EDITING, ruling: EDITOR_ROOM_MORE })),
  // asking before a removal, and the note after it (it sits in the stage slot, as the option notes do)
  { text: "Remove “{name}” from the box?", states: EDITING, ruling: EDITOR_REMOVE },
  { text: "Remove", states: EDITING, ruling: EDITOR_REMOVE },
  { text: "Cancel", states: EDITING, ruling: EDITOR_REMOVE },
  { text: "Removed “{name}”.", states: ["editor-removed"], ruling: EDITOR_REMOVE },
  { text: "Undo removal", states: ["editor-removed"], ruling: EDITOR_REMOVE },
  { text: "Dismiss", states: ["editor-removed", "kit-removed"], ruling: EDITOR_REMOVE },
  // Remove group… (spec §7.4, §8): GroupEdit draws the button alone; the app asks, and says what went
  {
    text: "Remove the group “{name}”? Its {n} items stay, with {n} copies each.",
    states: GROUP_EDITS,
    ruling: GROUP_REMOVE,
  },
  {
    text: "Remove the group “{name}”? Its {n} items stay.",
    states: GROUP_EDITS,
    ruling: GROUP_REMOVE,
  },
  {
    text: "Remove the group “{name}”? Its 1 item stays, with {n} copies.",
    states: GROUP_EDITS,
    ruling: GROUP_REMOVE,
  },
  {
    text: "Remove the group “{name}”? Its 1 item stays.",
    states: GROUP_EDITS,
    ruling: GROUP_REMOVE,
  },
  { text: "Remove the group “{name}”?", states: GROUP_EDITS, ruling: GROUP_REMOVE },
  { text: "Remove group", states: GROUP_EDITS, ruling: GROUP_REMOVE },
  { text: "Cancel", states: GROUP_EDITS, ruling: GROUP_REMOVE },
  {
    text: "{name} removed. Its items are back in the list.",
    states: ["kit-removed"],
    ruling: GROUP_REMOVED,
  },
  // after it, what the group's trays' rules lost, each note a sentence (spec §8): pins, a size lock, or both
  ...GROUP_LOCK_NOTES.map((notes) => ({
    text: `{name} removed. Its items are back in the list. ${notes}`,
    states: ["kit-removed"] as readonly string[],
    ruling: GROUP_REMOVED,
  })),
  // the group editor's order buttons: their titles and what a move says aloud, by names (spec §7.9, §8)
  ...[
    "{name} is already first.",
    "{name} is already last.",
    "{name} is now after {name}.",
    "{name} is now first.",
  ].map((text) => ({ text, states: GROUP_EDITS, ruling: GROUP_ORDER })),
  { text: "Undo removal", states: ["kit-removed"], ruling: GROUP_REMOVED },
  // the rail's handle (every screen with a rail, beside the stage)
  { text: "Resize the list", states: "all", ruling: RESIZE },
  // The packing guide (no board draws it, so no copy case reads it: AssemblyPage.test.tsx checks
  // that every line of its Lift column, its note and its flag is one of these). LIFT_LINES holds
  // every way out, "Lift it by the finger dip beside it" (a tray with only a dip of the filler
  // beside it) included.
  ...[
    ...Object.values(LIFT_LINES),
    ...LIFT_TEMPLATES,
    "Lift",
    TAKE_OUT_HEADING,
    TAKE_OUT_NOTE,
    NO_GRIP_TAG,
    NO_GRIP_TEMPLATE,
  ].map((text) => ({ text, states: GUIDE_STATES, ruling: GUIDE_LIFT })),
  // 0.21.0: a note under the plan closes with a ×, and the hidden ones are one quiet button.
  { text: "Hide this note", states: "all", ruling: HIDE },
  { text: "Show {n} hidden", states: "all", ruling: HIDE },
];

/**
 * Board strings the app does not print: board items the app does not build, and the left column of
 * "Board copy conflicts" in the rebuild plan. Spelled as on the boards. `boardLiterals` drops each
 * of them, and every literal that contains one, so no screen can borrow them by accident.
 */
export const COPY_DENIED: readonly string[] = [
  "Update the plan",
  "Keep the old plan",
  "Turn back",
  "Top layer stays put",
  "+ Add",
  "Heroes don't fit yet",
  "Lay the figures down",
  "Everything fits. One layer gets shallower.",
  "Make the top layer shallower",
  "Fits. Event cards lie flat instead of standing.",
  "Keep them loose in one bin",
  "No pockets, smaller tray",
  "Let Dice go on any layer",
  "Everything fits, 1 more spacer",
  "Still doesn't fit",
  "Best",
  "needs 6 mm more height",
  "Heroes, a little too tall",
  "Too tall for this spot",
  "No room left",
  "Unpin one and everything fits.",
  "Keep it next to",
  "Choose…",
  "Still fits",
  "Use 70 mm",
  "Trays appear in the box as you add things.",
  "Copy a report",
  "Start again",
  // Exporting's failed-part rows: the report, the partial download and the retry's own phases are not built (DESIGN §7)
  "Download without Heroes (that tray will be missing)",
  "Heroes couldn't be built. That's a bug on our side. Try again, or copy a report for us.",
  "Trying Heroes again",
  "Nothing was downloaded.",
  "Trays then fill up to the lid, so nothing falls out",
  "These stay as you set them when the plan updates.",
  "Saved in this browser",
  "It's on the bottom layer, front right.",
  "A few cards",
  "A full expansion",
  "A bin each",
  "All in one bin",
  "Loose in a bin",
];
