// src/ui/components/CommonOptions.tsx
import { setClearance, setGroup, setPerPlayer } from "../../app/actions";
import type { Component } from "../../model/types";
import { CheckField, TextField } from "../fields";
import { OFFSET, PLAYERS } from "../limits";
import { NumberField } from "../NumberField";
import type { EditorProps } from "./types";

/** Validation paths of the fields CommonOptions shows (they live under More options). */
export function commonOptionPaths(index: number): string[] {
  const at = `/components/${index}`;
  return [`${at}/groupId`, `${at}/perPlayer`, `${at}/perPlayer/players`, `${at}/clearance`];
}

export function CommonOptions<C extends Component>({
  component: c,
  index,
  onChange,
}: Omit<EditorProps<C>, "advanced">) {
  const at = `/components/${index}`;
  const grouped = c.groupId !== undefined;
  return (
    <>
      <TextField
        id={`${c.id}-group`}
        label="Group (same group → same tray)"
        value={c.groupId ?? ""}
        commitOn="blur"
        normalize={(v) => v.trim()}
        path={`${at}/groupId`}
        placeholder="e.g. tokens"
        hint="Components with the same group name share one tray, each in its own compartment."
        onCommit={(v) => onChange(setGroup(c, v))}
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
          value={c.perPlayer.players}
          {...PLAYERS}
          path={`${at}/perPlayer/players`}
          onCommit={(v) => onChange(setPerPlayer(c, v))}
        />
      ) : null}
      <CheckField
        id={`${c.id}-ownClearance`}
        label="Use its own clearance"
        checked={c.clearance !== undefined}
        onChange={(on) => onChange(setClearance(c, on ? 1 : undefined))}
      />
      {c.clearance !== undefined ? (
        <NumberField
          id={`${c.id}-clearance`}
          label="Clearance (total, not scaled by Fit)"
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
