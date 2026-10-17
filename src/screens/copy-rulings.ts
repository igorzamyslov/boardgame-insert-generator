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
const RAIL = ["workspace", "workspace-rules", "workspace-add", "workspace-error"] as const;
const SHEET = ["m-workspace", "m-workspace-add", "m-workspace-rules"] as const;
const RULED = ["workspace-rules", "m-workspace-rules"] as const;
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
const PINS = "Pins in the way are the heading's, one pill each (interim until Task 12)";
const BANNERS = "The plan banners use DESIGN's words";
const NOTES = "Layout and sizing notices sit under the plan caption";
// Task 7: the plan's caption and pin marks. The states are the plan cases of copy.board.test.tsx.
const CAPTION = "The plan's caption names its layer";
const PHONE_PINS = "A phone's plan shows the pin marks";
const FAILED = ["workspace-failed"] as const;
const ERRORS = ["workspace-error"] as const;
const FIT_PROBLEMS = ["no-fit", "no-fit-bed", "pin-conflict"] as const;
/** Every stage-top case that has a plan under it, so a Layer switch. */
const SWITCHED = [
  ...PLAN_STATES,
  ...ERRORS,
  ...FAILED,
  ...FIT_PROBLEMS,
  "workspace-making",
  "workspace-box-error",
] as const;

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
  { text: "Pinned", states: ["m-workspace-rules"], ruling: CHIPS },
  { text: "Pinned, turned", states: RULED, ruling: CHIPS },
  { text: "Size locked", states: RULED, ruling: CHIPS },
  {
    text: "These stay as you set them when the plan updates.",
    states: ["m-workspace-rules"],
    ruling: CLEAR,
  },
  { text: "Clear all my choices", states: ["m-workspace-rules"], ruling: CLEAR },
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
  { text: "Change the box", states: ["workspace-box-error"], ruling: HOMES },
  { text: "The {name} tray doesn't fit yet", states: ["no-fit"], ruling: NOFIT },
  { text: "Not everything fits yet", states: ["no-fit"], ruling: NOFIT },
  { text: "There's no room left for it in the box.", states: ["no-fit"], ruling: NOFIT },
  { text: "It's too big for your printer's bed.", states: ["no-fit-bed"], ruling: NOFIT },
  { text: "The {name} tray doesn't fit yet", states: ["no-fit-bed"], ruling: NOFIT },
  { text: "{name} doesn't fit with your pins", states: ["pin-conflict"], ruling: PINS },
  { text: "Unpin {name}", states: ["pin-conflict"], ruling: PINS },
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
  { text: "Error:", states: ["workspace-notes"], ruling: NOTES },
  // Task 7: under the box, and the marks a phone's plan keeps
  {
    text: "{name}, seen from above. Front of the box",
    states: ["workspace", "workspace-rules"],
    ruling: CAPTION,
  },
  { text: "Turned", states: ["m-workspace-rules"], ruling: PHONE_PINS },
  {
    text: "Spacers fill the gaps again when the plan updates.",
    states: ["m-workspace-rules"],
    ruling: PHONE_PINS,
  },
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
  "Copy a report",
  "Start again",
  "Trays then fill up to the lid, so nothing falls out",
  "It's on the bottom layer, front right.",
];
