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

import { OPTION_NOTE_TEXTS } from "../ui/components/optionNotes";
import { COMPARTMENT_WORDS } from "../ui/identity";

const FOOTER = "The footer moves into the project menu";
const SAVED = "The saved status has five states";
const DISMISS = "A menu note other than another tab's";
const INSERTS = "Your inserts is a page of the project menu";
const UNNAMED = "An unnamed insert reads (unnamed)";
const PAGE = ["inserts", "inserts-delete"] as const;
const REDO = "Redo sits beside Undo";
const PICKER = "Add opens a kind picker";
const SUMMARY = "A row's line under the name is short";
const CHIPS = "The rail's rule chips are one per rule";
const CLEAR = "Clear all my choices lifts every pin";
const ADDING = ["workspace-add", "m-workspace-add"] as const;
/** The rail's states and the phone sheet's (copy.board.test.tsx has a case for each). */
const RAIL = [
  "workspace",
  "workspace-rules",
  "workspace-add",
  "workspace-error",
  "no-fit",
  "no-fit-bed",
  "pin-conflict",
] as const;
const SHEET = [
  "m-workspace",
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
const HOMES = "The Summary's jobs have new homes";
const NOFIT = "The no-fit heading names the tray";
const PINS =
  "Pins in the way: the first conflict names the heading, the engine's reasons are its line, and each conflict is a card";
const FIT_PANEL = "The fit problems are a stage of their own";
const NOFIT_FIGURE = "The no-fit line gives the closest plan's shortfall";
const FIT_ROW = "The rail marks the tray that does not fit: Doesn't fit";
const BANNERS = "The plan banners use DESIGN's words";
const NOTES = "Layout and sizing notices sit under the plan caption";
// Task 7: the plan's caption and pin marks. The states are the plan cases of copy.board.test.tsx.
const CAPTION = "The plan's caption names its layer";
const PHONE_PINS = "A phone's plan shows the pin marks";
const FAILED = ["workspace-failed"] as const;
const ERRORS = ["workspace-error"] as const;
const FIT_PROBLEMS = ["no-fit", "no-fit-bed", "pin-conflict", "m-fix", "m-pin-conflict"] as const;
const NO_FIT = ["no-fit", "no-fit-bed", "m-fix"] as const;
const PIN_CONFLICT = ["pin-conflict", "m-pin-conflict"] as const;
// Task 8: the tray bar and the phone's tray sheet. The states are the tray cases of copy.board.test.tsx.
const MORE = "More holds Swap with… and Lock size";
const NO_ACTIONS = "Spacers, spare trays and risers show no actions";
const PIN_LABEL = "Pin/Unpin and Lock size carry no `aria-pressed`";
const TRAY_SHEET = "A phone's tray bar is a modal sheet";
const BAR_STATES = ["workspace-tray", "workspace-tray-more", "workspace-tray-spacer"] as const;
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
  "editor-tokens",
  "editor-tokens-more",
  "editor-tiles",
  "editor-tiles-more",
  "editor-custom",
  "editor-custom-more",
  "editor-minis",
  "editor-minis-more",
] as const;
const PHONE_EDITS = ["m-edit", "m-edit-more"] as const;
const EDITING = [...EDITS, ...PHONE_EDITS] as const;
const EDITOR_OPTIONS = "The editors name every option the engine has";
const EDITOR_SIZES = "Card sizes are the engine's presets";
const EDITOR_SUMMARY = "More options says what is inside it";
const EDITOR_NOTES = "An option change speaks through a note in the stage slot";
const EDITOR_SENTENCE = "The stage sentence is the page's h1 while editing";
const EDITOR_REMOVE = "Removing asks in place, and the removal is a note in the slot";
const EDITOR_NAME = "The phone editor has a Name field";
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
  "Room for expansions",
  "Extra width",
  "Extra length",
  "Extra height",
  "Looser pockets: width",
  "Looser pockets: length",
  "None",
  "Auto",
  "A set amount",
  "Max",
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
  "Decks",
  "Deck",
  "+ Another deck",
  "Per player",
  "Counts are per player",
  "Not available for grouped items.",
  "Players",
  "Group",
  "Extra room",
  "Use its own extra room",
  "Extra room mm",
  "Other sizes",
  "Auto is the default",
  "None is the default",
  "Don't know the size of {name}? Give a volume instead",
];

// Task 11: the box's editor. The states are the box cases of copy.board.test.tsx.
const BOX_WORDS = "The box editor has the board's words only";
const BOX_HINT = "The box's stored-on-its-side hint says what the engine does";

/** Ruled strings, added by the task that builds the screen that prints them. */
export const COPY_RULINGS: readonly CopyRuling[] = [
  // Task 4: the header and the project menu
  { text: "Insert Generator {version}", states: "all", ruling: FOOTER },
  { text: "Licences", states: "all", ruling: FOOTER },
  { text: "Redo", states: "all", ruling: REDO },
  { text: "Saving…", states: "all", ruling: SAVED },
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
  { text: "Size locked", states: RULED, ruling: CHIPS },
  {
    text: "These stay as you set them when the plan updates.",
    states: ["m-workspace-rules", "m-pin-conflict"],
    ruling: CLEAR,
  },
  { text: "Clear all my choices", states: ["m-workspace-rules", "m-pin-conflict"], ruling: CLEAR },
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
  { text: "Keep searching", states: NO_FIT, ruling: FIT_PANEL },
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
    text: "Lock size",
    states: ["workspace-tray-more", "m-tray-more", "m-tray-market"],
    ruling: MORE,
  },
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
  // MobileTray's tile says "Pin here" and never "Unpin"; the label is the action, as on the bar
  { text: "Pin", states: SHEET_STATES, ruling: PIN_LABEL },
  { text: "Unpin", states: SHEET_STATES, ruling: PIN_LABEL },
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
  // The kit's accessible-name convention is "<label> (<unit>)": the space field's name is "Space on top (mm)"
  // (Box's aria-label is "Space on top, mm"). Never drawn, so no case sees it; recorded here with the rest.
  { text: "Space on top (mm)", states: ["box", "m-box"], ruling: BOX_WORDS },
  // Task 10: the editors (Edit, EditKinds, MobileEdit) and the stage beside them
  ...EDITOR_LABELS.map((text) => ({ text, states: EDITING, ruling: EDITOR_OPTIONS })),
  // the engine's presets, as the chips and the size line say them
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
  { text: "Name", states: PHONE_EDITS, ruling: EDITOR_NAME },
  // the stage sentence: Edit's, for the kinds and the counts it does not draw
  {
    text: "tray, {name} × {name} mm.",
    states: [...EDITS, ...PHONE_EDITS],
    ruling: EDITOR_SENTENCE,
  },
  {
    text: "tray, {name} × {name} mm. It grows as you add cards.",
    states: ["workspace-failed", "no-fit", "pin-conflict"],
    ruling: EDITOR_SENTENCE,
  },
  { text: ", {n} trays.", states: [...EDITS, ...PHONE_EDITS], ruling: EDITOR_SENTENCE },
  ...OPTION_NOTE_TEXTS.map((text) => ({
    text,
    states: ["editor-note", ...PHONE_EDITS] as readonly string[],
    ruling: EDITOR_NOTES,
  })),
  // asking before a removal, and the note after it (it sits in the stage slot, as the option notes do)
  { text: "Remove “{name}” from the box?", states: EDITING, ruling: EDITOR_REMOVE },
  { text: "Remove", states: EDITING, ruling: EDITOR_REMOVE },
  { text: "Cancel", states: EDITING, ruling: EDITOR_REMOVE },
  { text: "Removed “{name}”.", states: ["editor-removed"], ruling: EDITOR_REMOVE },
  { text: "Undo removal", states: ["editor-removed"], ruling: EDITOR_REMOVE },
  { text: "Dismiss", states: ["editor-removed"], ruling: EDITOR_REMOVE },
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
  "Trays then fill up to the lid, so nothing falls out",
  "It's on the bottom layer, front right.",
  "A few cards",
  "A full expansion",
  "A bin each",
  "All in one bin",
  "Loose in a bin",
];
