// src/ui/components/CommonOptions.tsx
import { setClearance, setGroup, setPerPlayer } from "../../app/actions";
import type { ComponentChildren } from "preact";
import type { Access, Component } from "../../model/types";
import { CheckField, SelectField, TextField } from "../fields";
import type { SelectOption } from "../fields";
import { OFFSET, PLAYERS } from "../limits";
import { NumberField } from "../NumberField";
import type { EditorProps } from "./types";

const ACCESS_OPTIONS: SelectOption<Access>[] = [
  { value: "often", label: "Often" },
  { value: "sometimes", label: "Sometimes" },
  { value: "setup", label: "Only at setup" },
];

/** Validation paths of the fields CommonOptions shows (they live under More options). */
export function commonOptionPaths(index: number): string[] {
  const at = `/components/${index}`;
  return [
    `${at}/groupId`,
    `${at}/perPlayer`,
    `${at}/perPlayer/players`,
    `${at}/clearance`,
    `${at}/curvedFloor`,
  ];
}

export interface CommonOptionsProps<C extends Component> extends Omit<EditorProps<C>, "advanced"> {
  /** The editor's own advanced fields about the contents, listed first. */
  pieces?: ComponentChildren;
  /** The editor's own advanced fields about the tray, listed after how it is used in play. */
  tray?: ComponentChildren;
}

/**
 * The advanced fields every kind has, after the editor's own (`pieces`, then `tray`): how the
 * component is used in play, then how its tray is made. One flat list: the dotted edge of the
 * advanced block is the only marking.
 */
export function CommonOptions<C extends Component>({
  component: c,
  index,
  onChange,
  pieces,
  tray,
}: CommonOptionsProps<C>) {
  const at = `/components/${index}`;
  const grouped = c.groupId !== undefined;
  return (
    <>
      {pieces}
      <SelectField
        id={`${c.id}-access`}
        label="Needed during play"
        value={c.access}
        options={ACCESS_OPTIONS}
        hint="Often: kept out from under other trays. Setup only: buried under them. Sometimes: no preference. These are preferences, not rules, so a tight box can override them."
        onChange={(access) => onChange({ ...c, access })}
      />
      <CheckField
        id={`${c.id}-perPlayer`}
        label="Counts are per player"
        checked={c.perPlayer !== undefined}
        disabled={grouped}
        path={`${at}/perPlayer`}
        hint={
          grouped
            ? "Not available for grouped components."
            : "Each player's set gets its own tray or compartment."
        }
        onChange={(on) => onChange(setPerPlayer(c, on ? 4 : undefined))}
      />
      {c.perPlayer !== undefined ? (
        <NumberField
          id={`${c.id}-players`}
          label="Players"
          hint="The counts above are for one player; this many sets are made."
          value={c.perPlayer.players}
          {...PLAYERS}
          path={`${at}/perPlayer/players`}
          onCommit={(v) => onChange(setPerPlayer(c, v))}
        />
      ) : null}
      {tray}
      <TextField
        id={`${c.id}-group`}
        label="Group"
        value={c.groupId ?? ""}
        commitOn="blur"
        normalize={(v) => v.trim()}
        path={`${at}/groupId`}
        placeholder="e.g. tokens"
        hint="Components with the same group name share one tray, each in its own compartment."
        onCommit={(v) => onChange(setGroup(c, v))}
      />
      <CheckField
        id={`${c.id}-ownClearance`}
        label="Use its own extra room"
        hint="Replaces the global clearance for this component only."
        checked={c.clearance !== undefined}
        onChange={(on) => onChange(setClearance(c, on ? 1 : undefined))}
      />
      {c.clearance !== undefined ? (
        <NumberField
          id={`${c.id}-clearance`}
          label="Extra room"
          hint="Total room around each piece, not scaled by Fit."
          unit="mm"
          value={c.clearance}
          {...OFFSET}
          path={`${at}/clearance`}
          onCommit={(v) => onChange(setClearance(c, v))}
        />
      ) : null}
    </>
  );
}
