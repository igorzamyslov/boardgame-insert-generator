// src/screens/ItemChips.tsx
// The phone's list sheet, folded (board 9 of the 2026-10-23 review): one row of chips, one per item
// or group, in the list's order and each in its own shade. Tapping a chip selects that tray on the
// plan (the dock shows it); the sheet opens to the full list by a swipe up or its grip.
import type { CSSProperties } from "preact";
import type { Component, Group, TraySpec } from "../model/types";
import { groupById, railEntries } from "../model/groups";
import { componentIdsOfTray, groupShadeIndexOf, kindIndexOf, shadeOf } from "../ui/identity";

export interface ItemChipsProps {
  components: readonly Component[];
  groups?: readonly Group[];
  /** The ids (items, groups) of what the selected tray holds: those chips are pressed. */
  selectedIds: readonly string[];
  /** A chip was tapped: the id of its item or group. */
  onPick: (id: string) => void;
}

/** One chip: the item's or group's name in its shade, pressed while its tray is the selected one. */
export function ItemChips(p: ItemChipsProps) {
  const entries = railEntries({ components: p.components, groups: p.groups });
  return (
    <ul class="item-chips" aria-label="Items">
      {entries.flatMap((entry) => {
        let id = entry.id;
        let name: string;
        let shade;
        let pressed;
        if (entry.kind === "group") {
          const group = groupById({ groups: p.groups }, entry.id);
          if (group === undefined) {
            return [];
          }
          name = group.name === "" ? "Group" : group.name;
          shade = shadeOf("group", groupShadeIndexOf(p.groups, group.id));
          pressed = group.memberIds.some((m) => p.selectedIds.includes(m));
        } else {
          const i = p.components.findIndex((c) => c.id === entry.id);
          const c = p.components[i];
          if (c === undefined) {
            return [];
          }
          id = c.id;
          name = c.name === "" ? "(unnamed)" : c.name;
          shade = shadeOf(c.kind, kindIndexOf(p.components, i));
          pressed = p.selectedIds.includes(c.id);
        }
        const style = {
          "--chip-fill": shade.fill,
          "--chip-line": shade.line,
          "--chip-ink": shade.ink,
        } as CSSProperties;
        return [
          <li key={`${entry.kind}|${entry.id}`}>
            <button
              type="button"
              class="item-chip"
              style={style}
              aria-pressed={pressed}
              title={name}
              onClick={() => p.onPick(id)}
            >
              <span class="ellipsis">{name}</span>
            </button>
          </li>,
        ];
      })}
    </ul>
  );
}

/** The tray a chip stands for: the first printed tray of its item or group, if the plan has one. */
export function trayOfChip(
  id: string,
  trays: readonly TraySpec[],
  components: readonly Component[],
  groups?: readonly Group[],
): TraySpec | undefined {
  const group = groupById({ groups }, id);
  const ids = group === undefined ? [id] : [id, ...group.memberIds];
  return trays.find(
    (t) => t.part === "tray" && componentIdsOfTray(t, components).some((x) => ids.includes(x)),
  );
}
