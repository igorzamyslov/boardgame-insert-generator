// src/ui/components/ComponentList.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { Component, ComponentKind } from "../../model/types";
import { tintVar } from "../identity";
import { KindIcon } from "../KindIcon";
import { ComponentCard } from "./ComponentCard";

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

/** The five Add buttons: the kind's swatch (in the tint its first item would get), a name and a hint. */
export function AddKinds({
  onAdd,
  startIndex,
  label = "Add a component",
}: {
  onAdd: (kind: ComponentKind) => void;
  /** The group's accessible name (the empty state shows a second group next to the rail's). */
  label?: string;
  /** How many components exist: the swatches preview the tints the new items would take. */
  startIndex: number;
}) {
  return (
    <div class="pf-kinds" role="group" aria-label={label}>
      {KINDS.map((k, i) => (
        <button
          type="button"
          class="pf-kind"
          key={k}
          style={{ "--tint": tintVar(startIndex + i) }}
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
  advanced: boolean;
  onAdd: (kind: ComponentKind) => void;
  onChange: (id: string, next: Component) => void;
  /** Returns false when the user declined (nothing was removed). */
  onRemove: (id: string) => boolean;
  /** Per component (by index): the numbers of the trays that hold it. Absent while the plan is out of date. */
  trayNumbers?: ReadonlyMap<number, readonly number[]>;
}

export function ComponentList({
  components,
  advanced,
  onAdd,
  onChange,
  onRemove,
  trayNumbers,
}: ComponentListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const removing = useRef<{ id: string; index: number } | null>(null);
  // The card being edited: one at a time, and a new one opens as soon as it is added.
  const [openId, setOpenId] = useState<string | null>(null);
  const knownIds = useRef(new Set(components.map((c) => c.id)));
  useEffect(() => {
    const added = components.filter((c) => !knownIds.current.has(c.id));
    knownIds.current = new Set(components.map((c) => c.id));
    const last = added[added.length - 1];
    if (last && added.length === 1) {
      setOpenId(last.id);
    }
  }, [components]);

  // The Remove button that had the focus is gone with its card: hand the focus to the card that
  // took its place (or the one before it), or to the Add buttons when the list is empty. A
  // removal the user declined leaves everything where it is.
  useEffect(() => {
    const r = removing.current;
    if (r === null || components.some((c) => c.id === r.id)) {
      removing.current = null;
      return;
    }
    removing.current = null;
    const root = listRef.current;
    const target =
      components.length === 0
        ? root?.querySelector<HTMLElement>(".pf-kinds button")
        : root?.querySelectorAll<HTMLElement>(".component-card .pf-item__title")[
            Math.min(r.index, components.length - 1)
          ];
    target?.focus();
  }, [components]);

  return (
    <div class="component-list" ref={listRef}>
      {components.length === 0 ? (
        <p class="hint">
          Add what goes in the box: cards, bits (tokens, cubes, dice), tiles, miniatures or anything
          else. Each one gets a colour you will see again in the plan.
        </p>
      ) : null}
      <p class="pf-eyebrow add-label">
        {components.length === 0 ? "Add to the box" : "Add another"}
      </p>
      <AddKinds onAdd={onAdd} startIndex={components.length} />
      {components.map((c, i) => (
        <ComponentCard
          key={c.id}
          component={c}
          index={i}
          advanced={advanced}
          open={openId === c.id}
          trays={trayNumbers?.get(i)}
          sameName={components.some((o) => o.id !== c.id && o.name === c.name)}
          onToggle={(open) => setOpenId(open ? c.id : openId === c.id ? null : openId)}
          onChange={(next) => onChange(c.id, next)}
          onRemove={() => {
            removing.current = { id: c.id, index: i };
            if (!onRemove(c.id)) {
              removing.current = null;
            }
          }}
        />
      ))}
    </div>
  );
}
