// src/ui/components/ComponentList.tsx
import type { ComponentChildren } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";
import { requirementKey } from "../../app/actions";
import { ListRow, RuleChip } from "../../kit";
import type { Component, Lock, TraySpec } from "../../model/types";
import { levelsOf } from "../../plan/layers";
import { hoveredComponent } from "../../screens/hover";
import {
  componentIndexOfTray,
  componentSummary,
  kindIndexOf,
  layerWords,
  shadeVars,
} from "../identity";
import { ValidationContext } from "../validation";

export interface ComponentListProps {
  components: readonly Component[];
  /** The plan's trays; absent while the plan is out of date (no layer is named then). */
  trays?: readonly TraySpec[];
  locks?: readonly Lock[];
  /** The phone sheet's rows (MobileWorkspace): a swatch, the name and what it holds on the right. */
  compact?: boolean;
  /** A row before the components' own, in the same list (the sheet's "The box"). */
  first?: ComponentChildren;
  /** The component the selected tray belongs to: its row is pressed. */
  selectedId?: string | null;
  /** The components whose tray does not fit (a fit problem's culprit): their rows are warn-lit and say so. */
  culprits?: ReadonlySet<string>;
  /** A row was chosen: open its editor. */
  onOpen: (id: string) => void;
  /** The pointer or the focus is on a row (its component's id), or left it (null). */
  onHover?: (id: string | null) => void;
  /** The pins of these trays, and of the stacks they are in, come off. */
  onUnpin?: (trayKeys: string[]) => void;
  /** The size locks of these trays come off. */
  onUnlockSize?: (trayKeys: string[]) => void;
}

interface Chip {
  label: string;
  kind: "pin" | "size";
  trayKeys: string[];
}

/** One chip per rule a component's trays are under: pins (turned or not) and size locks. */
function chipsOf(c: Component, locks: readonly Lock[]): Chip[] {
  const prefix = `${requirementKey(c)}:`;
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
  for (const l of mine) {
    if (l.kind === "size") {
      add("Size locked", "size", l.trayKey);
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
 * The layer of a component's first tray, named as Main does ("bottom layer", "layer 2"); nothing while there is no
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
    (t) => t.part === "tray" && componentIndexOfTray(t, components) === index,
  );
  const at = first === undefined ? -1 : levels.indexOf(first.level);
  return at === -1 ? "" : layerWords(at, levels.length);
}

/**
 * The rail's list: a row per component (its kind's tile, its name and a line under it: what it
 * holds and its layer), and a chip beside it for each rule its trays are under, each with an × to
 * lift it. A row opens the component's editor; pointer and focus light the component's trays.
 */
export function ComponentList({
  components,
  trays,
  locks = [],
  compact = false,
  first,
  selectedId = null,
  culprits,
  onOpen,
  onHover,
  onUnpin,
  onUnlockSize,
}: ComponentListProps) {
  const notices = useContext(ValidationContext);
  // The component being pointed at, on the plan or here: its row takes the selected look (Main).
  const lit = hoveredComponent.value;
  const listRef = useRef<HTMLUListElement>(null);
  // The × that was pressed goes with its chip: the focus moves to the next chip of the row, or to
  // the row itself, once the list has re-rendered without it.
  const pressed = useRef<{ button: HTMLElement; rowId: string; index: number } | null>(null);
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
    const row = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])].find(
      (r) => r.dataset.rowId === p.rowId,
    );
    const chips = row?.closest("li")?.querySelectorAll<HTMLElement>(".k-rulechip");
    (chips?.[p.index] ?? row)?.focus();
  });
  // The list going away (an editor opens in its place) takes the row the pointer was on with it,
  // and no mouseleave or blur comes: nothing is lit any more.
  const hover = useRef(onHover);
  hover.current = onHover;
  useEffect(
    () => () => {
      hover.current?.(null);
    },
    [],
  );
  if (components.length === 0 && first === undefined) {
    return null;
  }
  return (
    <ul
      class={compact ? "rail-list rail-list--sheet" : "rail-list"}
      aria-label="What's inside"
      ref={listRef}
    >
      {first}
      {components.map((c, i) => {
        const name = c.name === "" ? "(unnamed)" : c.name;
        const sameName = components.some((o) => o.id !== c.id && o.name === c.name);
        const who = sameName ? `${name} (item ${i + 1})` : name;
        const layer = layerOfComponent(i, components, trays);
        const chips = chipsOf(c, locks);
        const at = `/components/${i}`;
        // An error inside the editor is not in sight from here: the row says so.
        const problem = notices.some(
          (n) => n.level === "error" && (n.path === at || (n.path?.startsWith(`${at}/`) ?? false)),
        );
        const summary = componentSummary(c);
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
          <li class="rail-item" key={c.id} aria-label={who}>
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
              selected={selectedId === c.id}
              lit={lit === c.id}
              shade={shadeVars(c.kind, kindIndexOf(components, i))}
              data-row-id={c.id}
              data-problem={problem ? "true" : undefined}
              onClick={() => onOpen(c.id)}
              onMouseEnter={enter}
              onMouseLeave={leave}
              onFocus={enter}
              onBlur={leave}
              after={
                chips.length === 0 ? undefined : (
                  <ul class="rail-chips" aria-label={`Rules for ${who}`}>
                    {chips.map((chip, chipIndex) => (
                      <li key={chip.label}>
                        <RuleChip
                          aria-label={
                            chip.kind === "pin"
                              ? `Unpin ${who}${inStack(chip.trayKeys, locks) ? " and its stack" : ""}`
                              : `Unlock size of ${who}`
                          }
                          onClick={(e) => {
                            pressed.current = {
                              button: e.currentTarget,
                              rowId: c.id,
                              index: chipIndex,
                            };
                            if (chip.kind === "pin") {
                              onUnpin?.(chip.trayKeys);
                            } else {
                              onUnlockSize?.(chip.trayKeys);
                            }
                          }}
                        >
                          {chip.label}
                        </RuleChip>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
