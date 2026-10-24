// src/ui/components/RoomOptions.tsx
import type { SegmentedOption } from "../../kit";
import { MAX_ROOM, STARTING_ROOM, roomKindOf, roomOf, roomWords, withRoom } from "../../model/room";
import type { RoomKind } from "../../model/room";
import type { Component } from "../../model/types";
import { Choice, NumField } from "./controls";
import { useItemGroup } from "./GroupRow";
import type { EditorProps } from "./types";

type Mode = "none" | "some" | "max";

const MODES: SegmentedOption<Mode>[] = [
  { value: "none", label: "None" },
  { value: "some", label: "Some" },
  { value: "max", label: "As much as fits" },
];

/** What "Some" counts, as the number's unit: cards, tiles, or a percent more pieces. */
const UNIT: Readonly<Record<RoomKind, string>> = { cards: "cards", tiles: "tiles", pieces: "%" };

/**
 * The one line under the choice, in the contents' terms, or undefined for None. "As much as fits"
 * takes what the layout leaves over; for a member of a group (`groupName`, as the person sees it)
 * it takes the room the group's tray already has and never makes the tray bigger.
 */
export function roomLine(c: Component, groupName?: string): string | undefined {
  const kind = roomKindOf(c);
  const room = roomOf(c);
  if (kind === null || room.mode === "none") {
    return undefined;
  }
  if (room.mode === "max") {
    return groupName === undefined
      ? "Takes the room left over once the layout is chosen."
      : `Fills the room left in ${groupName}'s tray. The tray doesn't get bigger.`;
  }
  return kind === "pieces"
    ? `The tray is planned with room for ${room.amount}% more pieces.`
    : `The tray is planned with room for ${room.amount} more ${kind}.`;
}

/**
 * "Room for more cards" (tiles, pieces): how much more of its own contents the item's tray is
 * planned for. None is the default, a tray never grows on its own. Minis and custom items have no
 * row (`roomKindOf` is null): there is no count to grow.
 */
export function RoomOptions<C extends Component>({
  component: c,
  index,
  onChange,
}: Pick<EditorProps<C>, "component" | "index" | "onChange">) {
  const group = useItemGroup();
  const kind = roomKindOf(c);
  if (kind === null) {
    return null;
  }
  const label = roomWords(kind);
  const room = roomOf(c);
  const line = roomLine(c, group?.name);
  return (
    <div class="ed-stack">
      <Choice
        label={label}
        options={MODES}
        value={room.mode}
        onChange={(mode) =>
          onChange(
            withRoom(c, mode === "none" ? undefined : mode === "max" ? "max" : STARTING_ROOM[kind]),
          )
        }
        // The default is named here, only while the choice differs from it.
        revert={
          room.mode === "none"
            ? undefined
            : { to: "None", onBack: () => onChange(withRoom(c, undefined)) }
        }
      />
      {room.mode === "some" ? (
        <NumField
          id={`${c.id}-room-amount`}
          label={`${label}, amount`}
          hideLabel
          value={room.amount}
          unit={UNIT[kind]}
          integer
          min={1}
          max={MAX_ROOM[kind]}
          path={`/components/${index}/room`}
          onCommit={(v) => onChange(withRoom(c, v))}
        />
      ) : null}
      {line !== undefined ? <span class="ed-line">{line}</span> : null}
    </div>
  );
}
