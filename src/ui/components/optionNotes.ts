// src/ui/components/optionNotes.ts
import {
  cornerReliefsOn,
  curvedFloorOn,
  dividersOf,
  fingerCutsOn,
  growthAxesOf,
  growthOf,
  separatorsOf,
} from "../../model/defaults";
import type { CardsComponent, Component } from "../../model/types";

/** Whether the component leaves room to grow on any axis it offers, lying flat or not. */
function growsOn(c: Component, lying: boolean): boolean {
  return growthAxesOf(c).some((axis) => growthOf(c, axis, lying) !== "off");
}

function growthNote(prev: Component, next: Component): string | null {
  // Both judged by how the next one sits (a change of storage moves the default; its note comes first).
  const lying = (next.kind === "cards" || next.kind === "tiles") && next.storage === "flat";
  const before = growsOn(prev, lying);
  const after = growsOn(next, lying);
  if (before === after) {
    return null;
  }
  if (!after) {
    return "No room is kept to grow.";
  }
  if (next.kind === "cards") {
    return "Leaves room to grow. The deck stands in a wider well.";
  }
  if (next.kind === "tiles") {
    return "Leaves room to grow. The tiles stand in a wider well.";
  }
  return "Leaves room to grow.";
}

function separatorNote(prev: Component, next: Component): string | null {
  const [a, b] = [separatorsOf(prev), separatorsOf(next)];
  if (a === b) {
    return null;
  }
  if (b === 0) {
    return "No spacer is printed.";
  }
  return b === 1
    ? "A removable spacer fills the gap."
    : `The spacer is printed as ${b} thin plates.`;
}

function dividerNote(prev: Component, next: Component): string | null {
  const [a, b] = [dividersOf(prev), dividersOf(next)];
  if (a === b) {
    return null;
  }
  if (b === 0) {
    return "No dividers in the well.";
  }
  const sections = b + 1;
  return `${b} removable ${b === 1 ? "divider splits" : "dividers split"} the well into ${sections} sections.`;
}

const ACCESS_NOTES: Record<Component["access"], string> = {
  often: "Kept where it is easy to reach.",
  sometimes: "No preference where it goes.",
  setup: "May go under other trays.",
};

function storageNote(prev: Component, next: Component): string | null {
  if (prev.kind !== next.kind || !("storage" in prev) || !("storage" in next)) {
    return null;
  }
  if (prev.storage === next.storage) {
    return null;
  }
  switch (next.storage) {
    case "auto":
      return "The planner chooses how it sits.";
    case "flat":
      return next.kind === "tiles" ? "The tiles lie flat in stacks." : "The decks lie flat.";
    case "upright":
      return "The tiles stand on edge, like cards.";
    case "upright-long":
      return "The decks stand on their long edge.";
    case "upright-short":
      return "The decks stand on their short edge.";
    case "pockets":
      return "Each figure gets its own pocket.";
    case "bulk":
      return "The figures sit loose in a scoop tray.";
  }
}

function switchNote(was: boolean, now: boolean, what: string): string | null {
  return was === now ? null : `${what} ${now ? "added" : "removed"}.`;
}

const SLEEVE_NOTES = {
  none: "No sleeves. The tray fits the bare cards.",
  standard: "Standard sleeves. The tray leaves room for them.",
  premium: "Premium sleeves. The tray leaves room for thicker ones.",
  custom: "Your own sleeve size. The tray leaves room for it.",
} as const;

/** The sleeves of a deck, when the kind has them: which of the four the change lands on. */
function sleeveNote(prev: Component, next: Component): string | null {
  if (prev.kind !== "cards" || next.kind !== "cards") {
    return null;
  }
  const [was, now] = [sleeveKey(prev.sleeve), sleeveKey(next.sleeve)];
  // typing the numbers of a custom sleeve is not a new choice
  return was === now ? null : SLEEVE_NOTES[now];
}

function sleeveKey(sleeve: CardsComponent["sleeve"]): keyof typeof SLEEVE_NOTES {
  return typeof sleeve === "object" ? "custom" : sleeve;
}

/**
 * Every sentence `describeOptionChange` can say, with `{n}` for a number: the copy test rules them
 * once (DESIGN §7, "An option change speaks through a note").
 */
export const OPTION_NOTE_TEXTS: readonly string[] = [
  ...Object.values(ACCESS_NOTES),
  ...Object.values(SLEEVE_NOTES),
  "The planner chooses how it sits.",
  "The tiles lie flat in stacks.",
  "The decks lie flat.",
  "The tiles stand on edge, like cards.",
  "The decks stand on their long edge.",
  "The decks stand on their short edge.",
  "Each figure gets its own pocket.",
  "The figures sit loose in a scoop tray.",
  "No room is kept to grow.",
  "Leaves room to grow. The deck stands in a wider well.",
  "Leaves room to grow. The tiles stand in a wider well.",
  "Leaves room to grow.",
  "No spacer is printed.",
  "A removable spacer fills the gap.",
  "The spacer is printed as {n} thin plates.",
  "No dividers in the well.",
  "{n} removable divider splits the well into {n} sections.",
  "{n} removable dividers split the well into {n} sections.",
  "Finger cuts added.",
  "Finger cuts removed.",
  "Curved floor added.",
  "Curved floor removed.",
  "Corner holes added.",
  "Corner holes removed.",
];

/**
 * A short note about what an option change does, or null when the change is not an option (a
 * name, a count, a size). One note per change: the first that applies. The words match the
 * labels in the editor.
 */
export function describeOptionChange(prev: Component, next: Component): string | null {
  if (prev.access !== next.access) {
    return ACCESS_NOTES[next.access];
  }
  return (
    sleeveNote(prev, next) ??
    storageNote(prev, next) ??
    growthNote(prev, next) ??
    separatorNote(prev, next) ??
    dividerNote(prev, next) ??
    switchNote(fingerCutsOn(prev), fingerCutsOn(next), "Finger cuts") ??
    switchNote(curvedFloorOn(prev), curvedFloorOn(next), "Curved floor") ??
    switchNote(cornerReliefsOn(prev), cornerReliefsOn(next), "Corner holes")
  );
}
