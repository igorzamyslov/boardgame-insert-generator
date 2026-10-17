// src/ui/components/CommonOptions.tsx
import { setClearance, setGroup, setPerPlayer } from "../../app/actions";
import { CheckRow } from "../../kit";
import type { SegmentedOption } from "../../kit";
import type { Access, Component } from "../../model/types";
import { OFFSET, PLAYERS } from "../limits";
import { Choice, ExactRow, NumField, TextBox } from "./controls";
import type { EditorProps } from "./types";

const ACCESS_OPTIONS: SegmentedOption<Access>[] = [
  { value: "often", label: "Often" },
  { value: "sometimes", label: "Sometimes" },
  { value: "setup", label: "Only at setup" },
];

/**
 * Validation paths of the fields under More options that every kind has: the groups, the shape
 * chips and the rows. An error at a path, or below it, opens the section.
 */
export function commonOptionPaths(index: number): string[] {
  const at = `/components/${index}`;
  return [
    `${at}/groupId`,
    `${at}/perPlayer`,
    `${at}/perPlayer/players`,
    `${at}/clearance`,
    `${at}/curvedFloor`,
    `${at}/separators`,
    `${at}/dividers`,
    `${at}/growth`,
  ];
}

/** Edit's "How often you reach for it": Often, Sometimes, Only at setup. */
export function AccessChoice<C extends Component>({ component: c, onChange }: EditorProps<C>) {
  return (
    <Choice
      label="How often you reach for it"
      options={ACCESS_OPTIONS}
      value={c.access}
      onChange={(access) => onChange({ ...c, access })}
    />
  );
}

/**
 * The exact values every kind has, each a row that opens in place: whether the counts are per
 * player, the group that shares a tray, and the component's own extra room.
 */
export function CommonRows<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  const at = `/components/${index}`;
  const grouped = c.groupId !== undefined;
  return (
    <>
      <ExactRow title="Per player" errorPaths={[`${at}/perPlayer`]}>
        <CheckRow
          label="Counts are per player"
          hint={grouped ? "Not available for grouped items." : undefined}
          checked={c.perPlayer !== undefined}
          blocked={grouped}
          onChange={(on) => onChange(setPerPlayer(c, on ? 4 : undefined))}
        />
        {c.perPlayer !== undefined ? (
          <NumField
            id={`${c.id}-players`}
            label="Players"
            value={c.perPlayer.players}
            {...PLAYERS}
            path={`${at}/perPlayer/players`}
            onCommit={(v) => onChange(setPerPlayer(c, v))}
          />
        ) : null}
      </ExactRow>
      <ExactRow title="Group" meta={c.groupId} errorPaths={[`${at}/groupId`]}>
        <TextBox
          id={`${c.id}-group`}
          label="Group"
          value={c.groupId ?? ""}
          commitOn="blur"
          normalize={(v) => v.trim()}
          path={`${at}/groupId`}
          placeholder="e.g. tokens"
          onCommit={(v) => onChange(setGroup(c, v))}
        />
      </ExactRow>
      <ExactRow title="Extra room" errorPaths={[`${at}/clearance`]}>
        <CheckRow
          label="Use its own extra room"
          checked={c.clearance !== undefined}
          onChange={(on) => onChange(setClearance(c, on ? 1 : undefined))}
        />
        {c.clearance !== undefined ? (
          <NumField
            id={`${c.id}-clearance`}
            label="Extra room mm"
            value={c.clearance}
            {...OFFSET}
            path={`${at}/clearance`}
            onCommit={(v) => onChange(setClearance(c, v))}
          />
        ) : null}
      </ExactRow>
    </>
  );
}
