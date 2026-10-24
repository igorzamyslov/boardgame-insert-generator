// src/ui/components/moreSummary.ts
import {
  cornerReliefsOn,
  curvedFloorOffered,
  curvedFloorOn,
  defaultTogglesOf,
  dividersOf,
  dividersOffered,
  fingerCutsOn,
  flatDecksOffered,
  separatorsOf,
  COMPONENT_DEFAULTS,
} from "../../model/defaults";
import { FLOAT_EPSILON, effective } from "../../model/settings";
import { roomKindOf, roomOf, roomWords } from "../../model/room";
import type { Component, Settings } from "../../model/types";
import { mm } from "../identity";

/**
 * One option under More options, as a person sees it: a choice, a chip or a row. A row that shows
 * the changed dot (and its "Back to" link) is in `changedOptions`; the count in the summary is that
 * set's size, so the two never disagree.
 */
export type OptionId =
  | "room"
  | "access"
  | "storage"
  | "flatDecks"
  | "fingerCuts"
  | "curvedFloor"
  | "cornerReliefs"
  | "dividers"
  | "separators"
  | "thickness"
  | "copies"
  | "clearance"
  | "packing";

/** Whether the deck or stack of tiles has room for more (not None), which is what offers spacer plates and dividers. */
export function wellMayGrow(c: Component): boolean {
  return (c.kind === "cards" || c.kind === "tiles") && roomOf(c).mode !== "none";
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
  return wellMayGrow(c) ? undefined : `Spacer plates need ${roomWords(c.kind)}.`;
}

/** Why a deck or stack of tiles has no dividers right now, in a line, or undefined when it may. */
export function dividersBlock(c: Component): string | undefined {
  if (!isWellKind(c) || dividersOffered(c)) {
    return undefined;
  }
  if (
    c.kind === "cards" &&
    c.storage === "flat" &&
    c.flatDecks === "dividers" &&
    flatDecksOffered(c)
  ) {
    return "For flat decks, see Between decks.";
  }
  return `Dividers need ${roomWords(c.kind)}.`;
}

/**
 * Why Between decks can't be chosen right now, in a line, or undefined when it may (or when the
 * item has one deck, and the row is not drawn). Decks share one well only when they lie flat; under
 * Auto the choice stands and applies if Auto picks flat.
 */
export function flatDecksBlock(c: Component): string | undefined {
  return c.kind === "cards" && flatDecksOffered(c) && c.storage.startsWith("upright")
    ? "Only flat decks can share one well."
    : undefined;
}

/**
 * The extra room the insert gives this component when it has none of its own (Settings: the card
 * or piece clearance, times Fit). A component's own number replaces it as it is, not scaled by Fit.
 */
export function insertClearance(c: Component, settings: Settings): number {
  const e = effective(settings);
  return c.kind === "cards" ? e.cardClearance : e.pieceClearance;
}

/**
 * Whether the item has a pile of loose pieces whose packing it can set: bulk always, minis only
 * while the figures are stored loose in a tray (the row stays, blocked, for the other).
 */
export function packingOffered(c: Component): c is Component & { kind: "bulk" | "minis" } {
  return c.kind === "bulk" || (c.kind === "minis" && c.storage === "bulk");
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
  if (roomOf(c).mode !== "none") {
    out.add("room");
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
  if (
    packingOffered(c) &&
    c.packing !== undefined &&
    Math.abs(c.packing - settings.packingFactor) > FLOAT_EPSILON
  ) {
    out.add("packing");
  }
  if (c.kind === "cards") {
    if (c.storage !== COMPONENT_DEFAULTS.cards.storage) {
      out.add("storage");
    }
    // a blocked row has no dot, and a choice that is the default is no news
    if (flatDecksOffered(c) && c.flatDecks === "dividers" && flatDecksBlock(c) === undefined) {
      out.add("flatDecks");
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

/** The four rows of the editor's tray settings, in the order they are drawn. */
export type SettingsGroupId = "reach" | "shape" | "room" | "copies";

/** What each row is called on screen. */
export const SETTINGS_GROUP_TITLES: Readonly<Record<SettingsGroupId, string>> = {
  reach: "Reach",
  shape: "Shape",
  room: "Room",
  copies: "Copies and group",
};

const GROUP_OF: Readonly<Record<OptionId, SettingsGroupId>> = {
  access: "reach",
  storage: "shape",
  flatDecks: "shape",
  fingerCuts: "shape",
  curvedFloor: "shape",
  cornerReliefs: "shape",
  dividers: "shape",
  separators: "shape",
  room: "room",
  thickness: "room",
  clearance: "room",
  packing: "room",
  copies: "copies",
};

/** How many options of one row differ from their default: the rows inside it that show the dot. */
export function changedIn(
  id: SettingsGroupId,
  c: Component,
  settings: Settings,
  grouped = false,
): number {
  return [...changedOptions(c, settings, grouped)].filter((o) => GROUP_OF[o] === id).length;
}

const ACCESS_WORDS: Readonly<Record<Component["access"], string>> = {
  often: "Often",
  sometimes: "Sometimes",
  setup: "Only at setup",
};

/**
 * What a row holds now, in a few words, under its title ("Finger cuts, corner holes"). `group` is
 * the group the item is in: its Copies are the group's.
 */
export function groupSummary(
  id: SettingsGroupId,
  c: Component,
  settings: Settings,
  group?: { name: string; copies: number },
): string {
  switch (id) {
    case "reach":
      return ACCESS_WORDS[c.access];
    case "shape": {
      const parts: string[] = [];
      if (fingerCutsOn(c)) {
        parts.push("finger cuts");
      }
      if (curvedFloorShown(c)) {
        parts.push("curved floor");
      }
      if (cornerReliefsOn(c)) {
        parts.push("corner holes");
      }
      if (wellMayGrow(c) && dividersOf(c) > 0) {
        parts.push(`${dividersOf(c)} ${dividersOf(c) === 1 ? "divider" : "dividers"}`);
      }
      if (c.kind === "cards") {
        parts.push(
          c.storage === "flat"
            ? "lies flat"
            : c.storage === "auto"
              ? "stands either way"
              : "stands upright",
        );
      }
      const text = parts.length > 0 ? parts.join(", ") : "plain tray";
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    case "room": {
      const parts: string[] = [];
      const room = roomOf(c);
      const kind = roomKindOf(c);
      if (kind !== null && room.mode === "max") {
        parts.push(`${roomWords(kind).toLowerCase()}, as much as fits`);
      } else if (kind !== null && room.mode === "some") {
        parts.push(
          kind === "pieces" ? `${room.amount}% more pieces` : `${room.amount} more ${kind}`,
        );
      }
      parts.push(`${mm(c.clearance ?? insertClearance(c, settings))} mm around`);
      const text = parts.join(" · ");
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    case "copies": {
      const n = group?.copies ?? c.copies ?? 1;
      const copies = `${n} ${n === 1 ? "copy" : "copies"}`;
      return group === undefined ? `${copies} · no group` : `${copies} · in ${group.name}`;
    }
  }
}
