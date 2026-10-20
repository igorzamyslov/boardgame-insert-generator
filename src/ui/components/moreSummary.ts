// src/ui/components/moreSummary.ts
import {
  cornerReliefsOn,
  curvedFloorOffered,
  curvedFloorOn,
  defaultGrowth,
  defaultTogglesOf,
  dividersOf,
  dividersOffered,
  fingerCutsOn,
  growthAxesOf,
  growthOf,
  separatorsOf,
  COMPONENT_DEFAULTS,
} from "../../model/defaults";
import { effective } from "../../model/settings";
import type { Component, GrowthAxis, Settings } from "../../model/types";

/**
 * One option under More options, as a person sees it: a choice, a chip or a row. A row that shows
 * the changed dot (and its "Back to" link) is in `changedOptions`; the count in the summary is that
 * set's size, so the two never disagree.
 */
export type OptionId =
  | `growth-${GrowthAxis}`
  | "access"
  | "storage"
  | "fingerCuts"
  | "curvedFloor"
  | "cornerReliefs"
  | "dividers"
  | "separators"
  | "thickness"
  | "copies"
  | "clearance";

/** Whether the deck or stack of tiles may grow along its stack, which is what offers spacer plates and dividers. */
export function wellMayGrow(c: Component): boolean {
  return (
    (c.kind === "cards" || c.kind === "tiles") &&
    growthOf(c, "stack", c.storage === "flat") !== "off"
  );
}

/** A stack of cards or tiles: the kinds whose well may have spacer plates and dividers. */
export function isWellKind(c: Component): c is Component & { kind: "cards" | "tiles" } {
  return c.kind === "cards" || c.kind === "tiles";
}

/**
 * Why a deck or stack of tiles has no spacer plates right now, in a line, or undefined when it
 * may. The row stays on screen, blocked, and says it (DESIGN, Flow: a control does not vanish).
 */
export function spacersBlock(c: Component): string | undefined {
  if (!isWellKind(c)) {
    return undefined;
  }
  if (dividersOf(c) > 0) {
    return "Dividers take the place of spacer plates.";
  }
  return wellMayGrow(c) ? undefined : "Spacer plates need room for expansions.";
}

/** Why a deck or stack of tiles has no dividers right now, in a line, or undefined when it may. */
export function dividersBlock(c: Component): string | undefined {
  if (!isWellKind(c) || dividersOffered(c)) {
    return undefined;
  }
  if (c.storage === "flat") {
    return c.kind === "cards" ? "Flat decks have no dividers." : "Flat stacks have no dividers.";
  }
  return "Dividers need room for expansions.";
}

/**
 * The extra room the insert gives this component when it has none of its own (Settings: the card
 * or piece clearance, times Fit). A component's own number replaces it as it is, not scaled by Fit.
 */
export function insertClearance(c: Component, settings: Settings): number {
  const e = effective(settings);
  return c.kind === "cards" ? e.cardClearance : e.pieceClearance;
}

/** The chip value of the curved floor: a file may set one where the kind has none (it still shows). */
export function curvedFloorShown(c: Component): boolean {
  return c.curvedFloor === true || curvedFloorOn(c);
}

/**
 * The options under More options whose value differs from its default, and so show the changed dot.
 * Only a row that is on screen counts (a divider count on a deck that lies flat has no row), and a
 * value equal to its default does not, however the file wrote it. An item in a group has no row for
 * its access or its Copies (they are the group's), so neither counts.
 */
export function changedOptions(c: Component, settings: Settings, grouped = false): Set<OptionId> {
  const out = new Set<OptionId>();
  const lying = (c.kind === "cards" || c.kind === "tiles") && c.storage === "flat";
  for (const axis of growthAxesOf(c)) {
    if (growthOf(c, axis, lying) !== defaultGrowth(c, axis, lying)) {
      out.add(`growth-${axis}`);
    }
  }
  if (!grouped && c.access !== COMPONENT_DEFAULTS.access) {
    out.add("access");
  }
  const toggles = defaultTogglesOf(c);
  if (fingerCutsOn(c) !== toggles.fingerCuts) {
    out.add("fingerCuts");
  }
  if (curvedFloorOffered(c) && curvedFloorShown(c) !== toggles.curvedFloor) {
    out.add("curvedFloor");
  }
  if (cornerReliefsOn(c) !== toggles.cornerReliefs) {
    out.add("cornerReliefs");
  }
  if (wellMayGrow(c)) {
    if (dividersOf(c) !== 0) {
      out.add("dividers");
    } else if (separatorsOf(c) !== 0) {
      // with dividers the well has no spacer plates (and no row for them)
      out.add("separators");
    }
  }
  if (!grouped && c.copies !== undefined) {
    out.add("copies");
  }
  if (c.clearance !== undefined && c.clearance !== insertClearance(c, settings)) {
    out.add("clearance");
  }
  if (c.kind === "cards") {
    if (c.storage !== COMPONENT_DEFAULTS.cards.storage) {
      out.add("storage");
    }
    if (c.thickness.mode === "measured" || (c.thickness.scale ?? 1) !== 1) {
      out.add("thickness");
    }
  }
  return out;
}

/** How many of the options under More options differ from their default: the rows with a dot. */
export function optionsChanged(c: Component, settings: Settings, grouped = false): number {
  return changedOptions(c, settings, grouped).size;
}

/**
 * What is inside More options, in a few words (Edit's "Finger cuts on, stands upright · 2 changed"):
 * the finger cuts, how a stack of cards stands or whether a bin has a curved floor, whether it
 * leaves room to grow, and how many options differ from their default.
 */
export function moreSummary(c: Component, settings: Settings, grouped = false): string {
  const parts = [`Finger cuts ${fingerCutsOn(c) ? "on" : "off"}`];
  if (c.kind === "cards") {
    parts.push(
      c.storage === "flat"
        ? "lies flat"
        : c.storage === "auto"
          ? "stands either way"
          : "stands upright",
    );
  } else if (c.kind !== "tiles") {
    parts.push(`curved floor ${curvedFloorOn(c) ? "on" : "off"}`);
  }
  // only a choice made says so: a deck leaves room to grow unless told not to, so the default is no news
  const chosen = c.growth?.stack;
  if ((c.kind === "cards" || c.kind === "tiles") && chosen !== undefined && chosen !== "off") {
    parts.push("room to grow");
  }
  const changed = optionsChanged(c, settings, grouped);
  return `${parts.join(", ")}${changed > 0 ? ` · ${changed} changed` : ""}`;
}
