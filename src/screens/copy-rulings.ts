// src/screens/copy-rulings.ts
// What a screen may print beyond its board: rulings, and what it may never print from a board.
// `src/test-support/boardCopy.ts` reads both; `src/screens/copy.board.test.tsx` (from Task 4)
// enforces them.

/** A string the app prints that no board has, ruled in docs/DESIGN.md. */
export interface CopyRuling {
  /** The text; `{name}` stands for any text (a component or tray name, a number with a unit). */
  text: string;
  /** The DESIGN §7 row (decision log) that rules it. */
  row: string;
}

/** Ruled strings, added by the task that builds the screen that prints them. */
export const COPY_RULINGS: readonly CopyRuling[] = [];

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
