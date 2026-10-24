// src/ui/components/ComponentList.tsx
import type { ComponentChildren } from "preact";
import { useContext, useEffect, useMemo, useRef } from "preact/hooks";
import { standingOn } from "../../app/actions";
import { trayNames } from "../../instructions/naming";
import { numberParts } from "../../instructions/numbering";
import { GripIcon, ListRow, RuleChip } from "../../kit";
import { groupById, railEntries } from "../../model/groups";
import type { Component, Group, Lock, TraySpec } from "../../model/types";
import { levelsOf } from "../../plan/layers";
import { hoveredComponent, hoveredMembers } from "../../screens/hover";
import {
  componentIndexesOfTray,
  componentSummary,
  groupOfTray,
  kindIndexOf,
  layerWords,
  groupShadeIndexOf,
  shadeVars,
  sharingTrayWith,
} from "../identity";
import { ValidationContext } from "../validation";
import { GroupCard, type GroupMemberView } from "./GroupCard";
import { useRailDrag, type DropTarget } from "./useRailDrag";

export interface ComponentListProps {
  components: readonly Component[];
  /** The plan's trays; absent while the plan is out of date (no layer is named then). */
  trays?: readonly TraySpec[];
  locks?: readonly Lock[];
  /** The project's groups: a grouped item's trays are keyed by its group. */
  groups?: readonly Group[];
  /** The phone sheet's rows (MobileWorkspace): a swatch, the name and what it holds on the right. */
  compact?: boolean;
  /** A row before the components' own, in the same list (the sheet's "The box"). */
  first?: ComponentChildren;
  /** The components the selected tray belongs to (a group's tray has several): their rows are pressed. */
  selectedIds?: readonly string[];
  /** The components whose tray does not fit (a fit problem's culprit): their rows are warn-lit and say so. */
  culprits?: ReadonlySet<string>;
  /** The order the list shows its items in (`Project.listOrder`); absent: the components' own. */
  listOrder?: readonly string[];
  /**
   * A row was pressed: its tray is selected (plan and 3D light it), nothing opens. Absent: a press
   * opens the editor, as `onOpen` does.
   */
  onSelect?: (id: string) => void;
  /** The pencil on a row, a double press on it, or a press where nothing can be selected: open its editor. */
  onOpen: (id: string) => void;
  /** The pointer or the focus is on a row (its component's id), or left it (null). */
  onHover?: (id: string | null) => void;
  /** The pointer or the focus is on a group's card (every member's id: all its trays light), or left it (null). */
  onLight?: (ids: readonly string[] | null) => void;
  /** A group's header was chosen: its editor. */
  onEditGroup?: (groupId: string) => void;
  /** The pins of these trays, and of the stacks they are in, come off. */
  onUnpin?: (trayKeys: string[]) => void;
  /** The turn locks of these trays come off: they may turn as the plan likes. */
  onFreeTurn?: (trayKeys: string[]) => void;
  /** The size locks of these trays come off. */
  onUnlockSize?: (trayKeys: string[]) => void;
  /** The trays come off what they stand on (an "On …" chip's ×). */
  onTakeOff?: (trayKeys: string[]) => void;
  /**
   * An item was dragged by its grip (desktop and tablet, never the phone's sheet) into a group, out
   * of one, or to another place in its group's order; a drop that changes nothing is not reported.
   */
  onDrop?: (itemId: string, target: DropTarget) => void;
}

interface Chip {
  label: string;
  kind: "pin" | "turn" | "size" | "on";
  /** An "On …" chip: the tray it stands on. */
  base?: string;
  trayKeys: string[];
}

/**
 * One chip per rule the trays of an owner (an ungrouped item, or a group) are under: pins (turned
 * or not), turns, size locks and put-ons. A turn under a pin of the same tray is the pin's (it says "Pinned,
 * turned" when the pin holds the turn), so it has no chip of its own; and "On <tray>" for a tray put
 * on another. The owner's id is the stem of its trays' keys.
 */
function chipsOf(
  ownerId: string,
  locks: readonly Lock[],
  baseName: (trayKey: string) => string,
): Chip[] {
  const prefix = `${ownerId}:`;
  const mine = locks.filter((l) => l.kind !== "stack" && l.trayKey.startsWith(prefix));
  const chips: Chip[] = [];
  const add = (label: string, kind: Chip["kind"], trayKey: string): void => {
    const known = chips.find((x) => x.label === label);
    if (known) {
      known.trayKeys.push(trayKey);
    } else {
      chips.push({ label, kind, trayKeys: [trayKey] });
    }
  };
  for (const l of mine) {
    if (l.kind === "position") {
      add(l.rotated ? "Pinned, turned" : "Pinned", "pin", l.trayKey);
    }
  }
  const pinned = new Set(mine.flatMap((l) => (l.kind === "position" ? [l.trayKey] : [])));
  for (const l of mine) {
    if (l.kind === "turn" && !pinned.has(l.trayKey)) {
      add("Turned", "turn", l.trayKey);
    }
  }
  for (const l of mine) {
    if (l.kind === "size") {
      add("Size locked", "size", l.trayKey);
    }
  }
  // A tray that stands on another by a stack lock without a pin: "On <that tray>" (not a pin).
  for (const [trayKey, below] of standingOn(locks)) {
    if (trayKey.startsWith(prefix)) {
      const base = baseName(below);
      add(`On ${base}`, "on", trayKey);
      const chip = chips.find((x) => x.label === `On ${base}`);
      if (chip) {
        chip.base = base;
      }
    }
  }
  return chips;
}

/** Whether any of these trays is in a pinned stack of several trays: unpinning it lifts them all. */
function inStack(trayKeys: readonly string[], locks: readonly Lock[]): boolean {
  return locks.some(
    (l) =>
      l.kind === "stack" && l.trayKeys.length > 1 && l.trayKeys.some((k) => trayKeys.includes(k)),
  );
}

/**
 * The layer of a component's first tray (a tray it shares with the rest of its group is its own),
 * named as Main does ("bottom layer", "layer 2"); nothing while there is no
 * current plan or it has a single layer.
 */
export function layerOfComponent(
  index: number,
  components: readonly Component[],
  trays: readonly TraySpec[] | undefined,
): string {
  if (trays === undefined) {
    return "";
  }
  const levels = levelsOf([...trays]);
  if (levels.length < 2) {
    return "";
  }
  const first = trays.find(
    (t) => t.part === "tray" && componentIndexesOfTray(t, components).includes(index),
  );
  const at = first === undefined ? -1 : levels.indexOf(first.level);
  return at === -1 ? "" : layerWords(at, levels.length);
}

/** The id of the pressed chip's owner: an item's row, or a group's header. */
interface Pressed {
  button: HTMLElement;
  /** `data-row-id` of an item's row, or `data-group-head` of a group's header. */
  attribute: "data-row-id" | "data-group-head";
  ownerId: string;
  index: number;
}

/** The layer words of a group's first tray ("bottom layer"); nothing without a plan or with one layer. */
function layerOfGroup(
  groupTrays: readonly TraySpec[],
  trays: readonly TraySpec[] | undefined,
): string {
  const first = groupTrays[0];
  if (trays === undefined || first === undefined) {
    return "";
  }
  const levels = levelsOf([...trays]);
  const at = levels.indexOf(first.level);
  return levels.length < 2 || at === -1 ? "" : layerWords(at, levels.length);
}

/**
 * The rail's list: a row per component (its kind's tile, its name and a line under it: what it
 * holds and its layer), and a chip beside it for each rule its trays are under, each with an × to
 * lift it. A group is one card where its first member stands (`railEntries`), its members inside
 * it. A row opens the component's editor; pointer and focus light the component's trays.
 */
export function ComponentList({
  components,
  trays,
  locks = [],
  groups = [],
  listOrder,
  compact = false,
  first,
  selectedIds = [],
  culprits,
  onSelect,
  onOpen,
  onHover,
  onLight,
  onEditGroup,
  onUnpin,
  onFreeTurn,
  onUnlockSize,
  onTakeOff,
  onDrop,
}: ComponentListProps) {
  const notices = useContext(ValidationContext);
  // The component being pointed at, on the plan or here: its row takes the selected look (Main),
  // and so do the rows of the items that share a tray with it (a group lights as one). A group's
  // card, pointed at, names every member: they all light.
  const pointed = hoveredComponent.value;
  const pointedGroup = hoveredMembers.value;
  const lit =
    pointed === null && pointedGroup === null
      ? null
      : new Set([
          ...(pointed === null
            ? []
            : sharingTrayWith(pointed, trays === undefined ? [] : trays, components)),
          ...(pointedGroup ?? []),
        ]);
  const listRef = useRef<HTMLUListElement>(null);
  // The item a keyboard move took: its row takes the focus back once the list has re-rendered.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const id = refocus.current;
    if (id === null) {
      return;
    }
    refocus.current = null;
    [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])]
      .find((r) => r.dataset.rowId === id)
      ?.focus();
  });
  // A tablet has no hover: an ungrouped row's grip is shown there all the time (rail.css).
  const noHover = useRef(
    typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches,
  );
  const drag = useRailDrag({
    listRef,
    groups,
    disabled: compact || onDrop === undefined,
    onDrop: (id, target) => onDrop?.(id, target),
  });
  // The × that was pressed goes with its chip: the focus moves to the next chip of the row, or to
  // the row itself, once the list has re-rendered without it.
  const pressed = useRef<Pressed | null>(null);
  useEffect(() => {
    const p = pressed.current;
    if (p === null) {
      return;
    }
    // The render after the click either took the chip away or left it: either way the click is
    // done with, so a later change cannot pull the focus back to a row.
    pressed.current = null;
    if (p.button.isConnected) {
      return;
    }
    if (document.activeElement !== null && document.activeElement !== document.body) {
      return;
    }
    const row = [
      ...(listRef.current?.querySelectorAll<HTMLElement>(`[${p.attribute}]`) ?? []),
    ].find((r) => r.getAttribute(p.attribute) === p.ownerId);
    const chips = row?.closest("li")?.querySelectorAll<HTMLElement>(".k-rulechip");
    (chips?.[p.index] ?? row)?.focus();
  });
  // The list going away (an editor opens in its place) takes the row the pointer was on with it,
  // and no mouseleave or blur comes: nothing is lit any more.
  const hover = useRef(onHover);
  hover.current = onHover;
  const light = useRef(onLight);
  light.current = onLight;
  useEffect(
    () => () => {
      hover.current?.(null);
      light.current?.(null);
    },
    [],
  );
  // What a chip calls the tray under a tray: its name in the plan, or its item's while there is none.
  const names = useMemo(
    () => (trays === undefined ? undefined : trayNames(numberParts(trays), components, groups)),
    [trays, components, groups],
  );
  const baseName = (trayKey: string): string =>
    names?.get(trayKey)?.full ??
    components.find((c) => trayKey.startsWith(`${c.id}:`))?.name ??
    "another tray";
  const entries = railEntries({ components, groups, listOrder });
  if (entries.length === 0 && first === undefined) {
    return null;
  }
  const press = onSelect ?? onOpen;

  /**
   * Alt+↑ / Alt+↓ on an item's row moves it one place: among the list's entries (an item in the
   * list), or in its group's order (a member). The drop is the drag's own: one undo step, said aloud.
   */
  const moveKey = (id: string, e: KeyboardEvent): void => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || onDrop === undefined) {
      return;
    }
    e.preventDefault();
    const way = e.key === "ArrowUp" ? -1 : 1;
    const own = groups.find((g) => g.memberIds.includes(id));
    if (own !== undefined) {
      const at = own.memberIds.indexOf(id);
      const to = at + way;
      if (to >= 0 && to < own.memberIds.length) {
        refocus.current = id;
        onDrop(id, { groupId: own.id, index: to });
      }
      return;
    }
    const at = entries.findIndex((x) => x.kind === "item" && x.id === id);
    const to = at + way;
    if (at !== -1 && to >= 0 && to < entries.length) {
      refocus.current = id;
      onDrop(id, { out: true, index: to });
    }
  };

  /** The chips beside an owner's row or header: one per rule, each with an × that lifts it. */
  const chipsFor = (
    ownerId: string,
    who: string,
    attribute: Pressed["attribute"],
    chips: readonly Chip[],
  ): ComponentChildren =>
    chips.length === 0 ? undefined : (
      <ul class="rail-chips" aria-label={`Rules for ${who}`}>
        {chips.map((chip, chipIndex) => (
          <li key={chip.label}>
            <RuleChip
              aria-label={
                chip.kind === "pin"
                  ? `Unpin ${who}${inStack(chip.trayKeys, locks) ? " and its stack" : ""}`
                  : chip.kind === "turn"
                    ? `Let ${who} turn`
                    : chip.kind === "on"
                      ? `Take ${who} off ${chip.base ?? "the tray under it"}`
                      : `Unlock size of ${who}`
              }
              onClick={(e) => {
                pressed.current = {
                  button: e.currentTarget,
                  attribute,
                  ownerId,
                  index: chipIndex,
                };
                if (chip.kind === "pin") {
                  onUnpin?.(chip.trayKeys);
                } else if (chip.kind === "turn") {
                  onFreeTurn?.(chip.trayKeys);
                } else if (chip.kind === "on") {
                  onTakeOff?.(chip.trayKeys);
                } else {
                  onUnlockSize?.(chip.trayKeys);
                }
              }}
            >
              {chip.kind === "on" ? (
                <span class="rail-chip__text" title={chip.label}>
                  {chip.label}
                </span>
              ) : (
                chip.label
              )}
            </RuleChip>
          </li>
        ))}
      </ul>
    );

  /** What an item's row says, and how: its name, its line, and the marks an error or a misfit give it. */
  const viewOf = (c: Component, i: number) => {
    const name = c.name === "" ? "(unnamed)" : c.name;
    const sameName = components.some((o) => o.id !== c.id && o.name === c.name);
    const who = sameName ? `${name} (item ${i + 1})` : name;
    const at = `/components/${i}`;
    // An error inside the editor is not in sight from here: the row says so.
    const problem = notices.some(
      (n) => n.level === "error" && (n.path === at || (n.path?.startsWith(`${at}/`) ?? false)),
    );
    return { name, who, problem, summary: componentSummary(c) };
  };

  return (
    <ul
      class={compact ? "rail-list rail-list--sheet" : "rail-list"}
      aria-label="What's inside"
      data-no-hover={noHover.current ? "true" : undefined}
      ref={listRef}
    >
      {first}
      {entries.map((entry) => {
        if (entry.kind === "group") {
          const group = groupById({ groups }, entry.id);
          if (group === undefined) {
            return null;
          }
          const members = group.memberIds.flatMap((id) => {
            const i = components.findIndex((c) => c.id === id);
            const c = components[i];
            return c === undefined ? [] : [{ c, i }];
          });
          const views: GroupMemberView[] = members.map(({ c, i }) => {
            const v = viewOf(c, i);
            return {
              id: c.id,
              kind: c.kind,
              name: v.name,
              who: v.who,
              meta: v.problem ? "Needs attention" : v.summary,
              shade: shadeVars(c.kind, kindIndexOf(components, i)),
              problem: v.problem,
            };
          });
          const groupTrays = (trays ?? []).filter(
            (t) => t.part === "tray" && groupOfTray(t, { components, groups })?.id === group.id,
          );
          const name = group.name === "" ? "Group" : group.name;
          return (
            <li class="rail-item" key={group.id} data-entry={group.id}>
              <GroupCard
                group={group}
                shade={shadeVars("group", groupShadeIndexOf(groups, group.id))}
                members={views}
                trays={trays === undefined ? undefined : groupTrays}
                layer={layerOfGroup(groupTrays, trays)}
                misfit={members.some(({ c }) => culprits?.has(c.id) === true)}
                pressed={members.some(({ c }) => selectedIds.includes(c.id))}
                lit={members.some(({ c }) => lit?.has(c.id) === true)}
                compact={compact}
                chips={chipsFor(
                  group.id,
                  name,
                  "data-group-head",
                  chipsOf(group.id, locks, baseName),
                )}
                onSelect={() => {
                  const first = members[0];
                  if (first === undefined) {
                    onEditGroup?.(group.id);
                  } else {
                    press(first.c.id);
                  }
                }}
                onSelectItem={press}
                onEdit={() => onEditGroup?.(group.id)}
                onEditItem={onOpen}
                onItemKeyDown={moveKey}
                onLight={onLight}
                onGrip={compact ? undefined : drag.gripDown}
              />
            </li>
          );
        }
        const i = components.findIndex((c) => c.id === entry.id);
        const c = components[i];
        if (c === undefined) {
          return null;
        }
        const { name, who, problem, summary } = viewOf(c, i);
        const layer = layerOfComponent(i, components, trays);
        const chips = chipsOf(c.id, locks, baseName);
        // an error in the editor is the nearer problem: it is told first
        const culprit = !problem && culprits?.has(c.id) === true;
        // The sheet's row has no room for the layer: the box shows it.
        const meta = problem
          ? "Needs attention"
          : culprit
            ? "Doesn't fit"
            : layer === "" || compact
              ? summary
              : `${summary} · ${layer}`;
        const enter = (): void => onHover?.(c.id);
        const leave = (): void => onHover?.(null);
        return (
          <li class="rail-item" key={c.id} aria-label={who} data-entry={c.id}>
            {compact ? null : (
              <span
                class="gc-grip gc-grip--loose"
                aria-hidden="true"
                data-grip={c.id}
                onPointerDown={drag.gripDown(c.id)}
              >
                <GripIcon />
              </span>
            )}
            <ListRow
              kind={c.kind}
              name={name}
              meta={meta}
              compact={compact}
              class={
                [chips.length > 0 ? "rail-row--wrap" : "", culprit ? "is-culprit" : ""]
                  .filter((x) => x !== "")
                  .join(" ") || undefined
              }
              selected={selectedIds.includes(c.id)}
              lit={lit?.has(c.id) === true}
              shade={shadeVars(c.kind, kindIndexOf(components, i))}
              data-row-id={c.id}
              data-problem={problem ? "true" : undefined}
              onClick={() => press(c.id)}
              onDblClick={() => onOpen(c.id)}
              onEdit={() => onOpen(c.id)}
              editLabel={`Edit ${who}`}
              onKeyDown={(e: KeyboardEvent) => moveKey(c.id, e)}
              onMouseEnter={enter}
              onMouseLeave={leave}
              onFocus={enter}
              onBlur={leave}
              after={chipsFor(c.id, who, "data-row-id", chips)}
            />
          </li>
        );
      })}
    </ul>
  );
}
