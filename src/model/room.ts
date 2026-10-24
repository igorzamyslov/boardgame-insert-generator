// src/model/room.ts
import type { Component } from "./types";

/**
 * "Room for more": how much more of its own contents an item's tray is given (owner, 2026-10-23,
 * DESIGN.md decision log). Absent: none, the default, a tray is its walls plus its wells and is
 * bigger only because a well is. A number: some, counted in the contents' terms (`RoomKind`: more
 * cards, more tiles, or a percent more pieces), part of the size the layout plans on. "max": as
 * much as fits, the leftover room the layout has given to the item's well after the plan is made.
 */
export type Room = "max" | number;

/** What the room is counted in: the choice's name in the editor, and the unit of "some". */
export type RoomKind = "cards" | "tiles" | "pieces";

export type RoomChoice = { mode: "none" } | { mode: "some"; amount: number } | { mode: "max" };

/** The kind of room the item offers, null for an item with no room row (minis, custom items). */
export function roomKindOf(c: Component): RoomKind | null {
  switch (c.kind) {
    case "cards":
      return "cards";
    case "tiles":
      return "tiles";
    case "bulk":
      return "pieces";
    case "minis":
    case "custom":
      return null;
    default: {
      const unreachable: never = c;
      return unreachable;
    }
  }
}

/** The row's label: "Room for more cards". */
export function roomWords(kind: RoomKind): string {
  return `Room for more ${kind}`;
}

/** What "some" starts at when picked: 20 cards, 10 tiles, 25 percent. */
export const STARTING_ROOM: Readonly<Record<RoomKind, number>> = {
  cards: 20,
  tiles: 10,
  pieces: 25,
};

/** The most "some" may be, in each kind's unit (validate.ts reports past it). */
export const MAX_ROOM: Readonly<Record<RoomKind, number>> = {
  cards: 1000,
  tiles: 1000,
  pieces: 500,
};

/** The room the item is given: none unless set, and none for an item that offers none. */
export function roomOf(c: Component): RoomChoice {
  if (roomKindOf(c) === null || c.room === undefined) {
    return { mode: "none" };
  }
  if (c.room === "max") {
    return { mode: "max" };
  }
  return c.room > 0 ? { mode: "some", amount: c.room } : { mode: "none" };
}

/** The item with its room set, or cleared (undefined: none, stored as nothing). */
export function withRoom<C extends Component>(c: C, room: Room | undefined): C {
  const others = Object.fromEntries(Object.entries(c).filter(([key]) => key !== "room"));
  return (room === undefined ? others : { ...others, room }) as C;
}
