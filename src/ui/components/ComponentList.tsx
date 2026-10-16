// src/ui/components/ComponentList.tsx
import { useContext } from "preact/hooks";
import { requirementKey } from "../../app/actions";
import type { Component, ComponentKind, Lock, TraySpec } from "../../model/types";
import { levelsOf } from "../../plan/layers";
import {
  componentIndexOfTray,
  componentSummary,
  kindIndexOf,
  layerLabel,
  shadeVars,
} from "../identity";
import { KindIcon } from "../KindIcon";
import { ValidationContext } from "../validation";

export const ADD_LABELS: Record<ComponentKind, string> = {
  cards: "Add cards",
  bulk: "Add bits",
  tiles: "Add tiles",
  minis: "Add miniatures",
  custom: "Add other item",
};

const KINDS = Object.keys(ADD_LABELS) as ComponentKind[];

/** What each kind is for, under its name on the Add button. */
const KIND_NAMES: Record<ComponentKind, string> = {
  cards: "Cards",
  bulk: "Bits",
  tiles: "Tiles",
  minis: "Miniatures",
  custom: "Other",
};

const KIND_HINTS: Record<ComponentKind, string> = {
  cards: "decks",
  bulk: "cubes, tokens",
  tiles: "flat pieces",
  minis: "figures",
  custom: "any size",
};

/** The five Add buttons: the kind's swatch (in the shade its next item would get), a name and a hint. */
export function AddKinds({
  onAdd,
  counts = {},
  label = "Add a component",
}: {
  onAdd: (kind: ComponentKind) => void;
  /** The group's accessible name (the empty state shows a second group next to the rail's). */
  label?: string;
  /** How many components of each kind exist: the swatches preview the shades the new ones would take. */
  counts?: Partial<Record<ComponentKind, number>>;
}) {
  return (
    <div class="pf-kinds" role="group" aria-label={label}>
      {KINDS.map((k) => (
        <button
          type="button"
          class="pf-kind"
          key={k}
          style={shadeVars(k, counts[k] ?? 0)}
          aria-label={ADD_LABELS[k]}
          onClick={() => onAdd(k)}
        >
          <KindIcon kind={k} />
          <span>
            {KIND_NAMES[k]}
            <small>{KIND_HINTS[k]}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

export interface ComponentListProps {
  components: readonly Component[];
  /** The plan's trays; absent while the plan is out of date (no layer is named then). */
  trays?: readonly TraySpec[];
  locks?: readonly Lock[];
  onAdd: (kind: ComponentKind) => void;
  /** A row was chosen: open its editor. */
  onOpen: (id: string) => void;
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

/** The layers a component's trays stand on, named: "Layer 2", or "Layers 1 and 2". */
function layersOf(
  index: number,
  components: readonly Component[],
  trays: readonly TraySpec[],
  levels: readonly number[],
): string {
  if (levels.length < 2) {
    return "";
  }
  const at = new Set(
    trays
      .filter((t) => t.part === "tray" && componentIndexOfTray(t, components) === index)
      .map((t) => levels.indexOf(t.level))
      .filter((l) => l !== -1),
  );
  const own = [...at].sort((a, b) => a - b);
  const [only] = own;
  if (own.length === 0 || only === undefined) {
    return "";
  }
  if (own.length === 1) {
    return layerLabel(only, levels.length);
  }
  return `Layers ${own.map((l) => l + 1).join(", ")}`;
}

/**
 * What's inside: the five Add buttons, then a row per component with its kind's shade, name,
 * a line about what is in it, its layer, and a chip for each rule its trays are under (each
 * with an × to lift it). A row opens the component's editor.
 */
export function ComponentList({
  components,
  trays,
  locks = [],
  onAdd,
  onOpen,
  onUnpin,
  onUnlockSize,
}: ComponentListProps) {
  const notices = useContext(ValidationContext);
  const levels = trays ? levelsOf([...trays]) : [];
  const counts: Partial<Record<ComponentKind, number>> = {};
  for (const c of components) {
    counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  }
  return (
    <div class="component-list">
      {components.length === 0 ? (
        <p class="hint">
          Add what goes in the box: cards, bits (tokens, cubes, dice), tiles, miniatures or anything
          else. Each one gets a colour you will see again in the plan.
        </p>
      ) : null}
      <p class="pf-eyebrow add-label">
        {components.length === 0 ? "Add to the box" : "Add another"}
      </p>
      <AddKinds onAdd={onAdd} counts={counts} />
      {components.length > 0 ? (
        <ul class="pf-rows" aria-label="What's inside">
          {components.map((c, i) => {
            const name = c.name === "" ? "(unnamed)" : c.name;
            const sameName = components.some((o) => o.id !== c.id && o.name === c.name);
            const who = sameName ? `${name} (item ${i + 1})` : name;
            const layer = trays ? layersOf(i, components, trays, levels) : "";
            const chips = chipsOf(c, locks);
            const at = `/components/${i}`;
            // An error inside the editor is not in sight from here: the row says so.
            const problem = notices.some(
              (n) =>
                n.level === "error" && (n.path === at || (n.path?.startsWith(`${at}/`) ?? false)),
            );
            return (
              <li
                class="pf-row"
                key={c.id}
                aria-label={who}
                data-row-id={c.id}
                style={shadeVars(c.kind, kindIndexOf(components, i))}
              >
                <button type="button" class="pf-row__open" onClick={() => onOpen(c.id)}>
                  <KindIcon kind={c.kind} />
                  <span class="pf-row__text">
                    <span class="pf-item__title">{name}</span>
                    <span class="visually-hidden">, </span>
                    <span class="pf-item__meta" data-problem={problem ? "true" : undefined}>
                      {problem ? "Needs attention" : componentSummary(c)}
                    </span>
                  </span>
                  {layer === "" ? null : (
                    <>
                      <span class="visually-hidden">, </span>
                      <span class="pf-row__layer">{layer}</span>
                    </>
                  )}
                </button>
                {chips.length === 0 ? null : (
                  <ul class="pf-chips" aria-label={`Rules for ${who}`}>
                    {chips.map((chip) => (
                      <li class="pf-chip" key={chip.label}>
                        <span>{chip.label}</span>
                        <button
                          type="button"
                          class="pf-chip__x"
                          aria-label={
                            chip.kind === "pin" ? `Unpin ${who}` : `Remove the size lock on ${who}`
                          }
                          onClick={() =>
                            chip.kind === "pin"
                              ? onUnpin?.(chip.trayKeys)
                              : onUnlockSize?.(chip.trayKeys)
                          }
                        >
                          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
