// src/ui/components/GroupCard.tsx
import type { ComponentChildren } from "preact";
import { useId, useState } from "preact/hooks";
import { FitText, GripIcon, GroupGlyph, IconTile, ListRow, RowEditButton } from "../../kit";
import { DEFAULT_GROUP_NAME } from "../../model/groups";
import type { ComponentKind, Group, TraySpec } from "../../model/types";

/** One member of a group as its row shows it: the kind's tile, the name and what it holds. */
export interface GroupMemberView {
  id: string;
  kind: ComponentKind;
  name: string;
  /** The name that tells two items of one name apart ("Cards (item 3)"): the row's label. */
  who: string;
  /** What it holds ("12 cards"), or "Needs attention". No layer words: the header has them. */
  meta: string;
  /** Its own shade of its kind, as custom properties (`shadeVars`). */
  shade: Record<string, string>;
  /** The item's editor has an error inside. */
  problem: boolean;
}

export interface GroupCardProps {
  group: Group;
  /** The group's own hue, as custom properties (`shadeVars("group", …)`): its tile and its swatch. */
  shade?: Record<string, string>;
  /** The group's items, in the group's own order. */
  members: readonly GroupMemberView[];
  /** The group's trays in the plan, every copy; absent while there is no current plan. */
  trays?: readonly TraySpec[];
  /** The layer of its first tray, in the rail's words ("bottom layer"); none for one layer. */
  layer?: string;
  /** A tray of the group is the one the plan could not fit: the line says so. */
  misfit?: boolean;
  /** A tray of the group is selected. */
  pressed: boolean;
  /** The group's trays are lit (pointed at in the plan, or on this card): the header takes the pressed look. */
  lit?: boolean;
  /** The phone sheet's list: members are the compact rows. */
  compact?: boolean;
  /** Beside the header, outside its button: the rule chips. */
  chips?: ComponentChildren;
  /** The header was pressed: the group's trays are selected, nothing opens. */
  onSelect?: () => void;
  /** A member's row was pressed: its tray is selected, nothing opens. Absent: the row opens its editor. */
  onSelectItem?: (id: string) => void;
  /** The pencil on the header (or a double press on it): the group's editor. */
  onEdit?: () => void;
  /** The pencil on a member (or a double press on its row): the item's editor. */
  onEditItem: (id: string) => void;
  /** A key on a member's row (Alt+arrows move it). */
  onItemKeyDown?: (id: string, e: KeyboardEvent) => void;
  /** The pointer or the focus is on the header or a member (every member's id: all the group's trays light), or left it (null). */
  onLight?: (ids: readonly string[] | null) => void;
  /** A member's grip: its `onPointerDown`, for the drag that moves it (`useRailDrag`). */
  onGrip?: (itemId: string) => (e: PointerEvent) => void;
}

/** "1 item", "3 items". */
const items = (n: number): string => `${n} ${n === 1 ? "item" : "items"}`;
/** "1 tray", "4 trays". */
const trays = (n: number): string => `${n} ${n === 1 ? "tray" : "trays"}`;

export interface GroupLineInput {
  /** How many items the group holds. */
  items: number;
  /** How many trays it is in the plan; absent without a current plan. */
  trays?: number;
  layer?: string;
  misfit?: boolean;
}

/**
 * The header's line (G1, G3): "3 items · 4 trays", with the layer after them as an item's row has
 * it; "Empty" for no items; "Doesn't fit" in their place when a tray of the group does not.
 */
export function groupLine({ items: n, trays: t, layer, misfit }: GroupLineInput): string {
  if (n === 0) {
    return "Empty";
  }
  if (misfit === true) {
    return "Doesn't fit";
  }
  const parts = [items(n)];
  if (t !== undefined && t > 0) {
    parts.push(trays(t));
  }
  if (layer !== undefined && layer !== "") {
    parts.push(layer);
  }
  return parts.join(" · ");
}

/** The card's name, for the frame and the header: "Player kit, 4 copies", "Group, empty". */
export function groupLabel(group: Group, itemCount: number): string {
  const name = group.name === "" ? DEFAULT_GROUP_NAME : group.name;
  if (itemCount === 0) {
    return `${name}, empty`;
  }
  const copies = group.copies ?? 1;
  return `${name}, ${copies} ${copies === 1 ? "copy" : "copies"}`;
}

/**
 * A group in the rail (G1, G3): a frame holding a header (a neutral tile with the group glyph, the
 * name, "×4" when there are copies, one line under them) and, at full size, its members, each with
 * a grip. An empty group has a dashed drop area in place of members. The header opens the group's
 * editor and is pressed while one of its trays is selected; the grips are drawn for the pointer and
 * are not tab stops.
 */
export function GroupCard({
  group,
  shade,
  members,
  trays: groupTrays,
  layer,
  misfit = false,
  pressed,
  lit = false,
  compact = false,
  chips,
  onSelect,
  onSelectItem,
  onEdit,
  onEditItem,
  onItemKeyDown,
  onLight,
  onGrip,
}: GroupCardProps) {
  const lineId = useId();
  // The row the pointer or the focus is on takes the lit look; the card's header is lit for the group.
  const [on, setOn] = useState<string | null>(null);
  const label = groupLabel(group, members.length);
  const name = group.name === "" ? DEFAULT_GROUP_NAME : group.name;
  const copies = group.copies ?? 1;
  // The sheet's header has room for one short line on the right: how many items, no trays or layer.
  const line = compact
    ? groupLine({ items: members.length, misfit })
    : groupLine({ items: members.length, trays: groupTrays?.length, layer, misfit });
  const ids = members.map((m) => m.id);
  const enter = (id: string | null) => (): void => {
    setOn(id);
    onLight?.(ids);
  };
  const leave = (): void => {
    setOn(null);
    onLight?.(null);
  };
  const title = (
    <span class="gc-head__title">
      <FitText class="k-row__name" title={name}>
        {name}
      </FitText>
      {copies > 1 ? <span class="gc-head__copies">{`×${copies}`}</span> : null}
    </span>
  );
  // The members' list has no name of its own: the frame and the header already say it, and a screen
  // reader would hear the card's label once more for each of them.
  return (
    <div
      class={compact ? "gc gc--compact" : "gc"}
      role="group"
      aria-label={label}
      data-region="group-card"
      data-group-id={group.id}
    >
      <div class="k-rowwrap">
        <button
          type="button"
          class={[
            "k-row gc-head",
            compact ? "k-row--compact gc-head--compact" : "",
            chips === undefined ? "" : "rail-row--wrap",
          ]
            .filter((x) => x !== "")
            .join(" ")}
          aria-label={label}
          aria-describedby={lineId}
          aria-pressed={compact ? undefined : pressed}
          data-lit={lit && !compact ? "true" : undefined}
          data-misfit={misfit ? "true" : undefined}
          data-group-head={group.id}
          style={shade}
          onClick={() => (onSelect ?? onEdit)?.()}
          onDblClick={() => onEdit?.()}
          onMouseEnter={enter(null)}
          onMouseLeave={leave}
          onFocus={enter(null)}
          onBlur={leave}
        >
          {compact ? (
            <span class="k-row__swatch k-row__swatch--group" aria-hidden="true" />
          ) : (
            <IconTile size={36} tone="group">
              <GroupGlyph size={17} />
            </IconTile>
          )}
          {compact ? (
            <>
              {title}
              <span class="k-row__meta ellipsis" id={lineId} title={line}>
                {line}
              </span>
            </>
          ) : (
            <span class="k-row__text">
              {title}
              <span class="k-row__meta ellipsis" id={lineId} title={line}>
                {line}
              </span>
            </span>
          )}
        </button>
        {onEdit === undefined ? null : (
          <RowEditButton label={`Edit ${name}`} onClick={() => onEdit()} />
        )}
        {chips}
      </div>
      {members.length === 0 ? (
        <p class="gc-empty">
          {compact
            ? "Use Move to group… in an item."
            : "Drag items here, or use Move to group… in an item."}
        </p>
      ) : (
        <ul class="gc-members">
          {members.map((m) => (
            <li class="gc-member" key={m.id} aria-label={m.who} data-member-id={m.id}>
              {compact ? null : (
                <span
                  class="gc-grip"
                  aria-hidden="true"
                  data-grip={m.id}
                  onPointerDown={onGrip?.(m.id)}
                >
                  <GripIcon />
                </span>
              )}
              <ListRow
                kind={m.kind}
                name={m.name}
                meta={m.meta}
                compact={compact}
                lit={on === m.id}
                shade={m.shade}
                data-row-id={m.id}
                data-problem={m.problem ? "true" : undefined}
                onClick={() => (onSelectItem ?? onEditItem)(m.id)}
                onDblClick={() => onEditItem(m.id)}
                onEdit={() => onEditItem(m.id)}
                editLabel={`Edit ${m.who}`}
                onKeyDown={(e: KeyboardEvent) => onItemKeyDown?.(m.id, e)}
                onMouseEnter={enter(m.id)}
                onMouseLeave={leave}
                onFocus={enter(m.id)}
                onBlur={leave}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
