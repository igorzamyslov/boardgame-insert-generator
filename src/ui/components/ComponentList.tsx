// src/ui/components/ComponentList.tsx
import { useEffect, useRef } from "preact/hooks";
import type { Component, ComponentKind } from "../../model/types";
import { ComponentCard } from "./ComponentCard";

export const ADD_LABELS: Record<ComponentKind, string> = {
  cards: "Add cards",
  bulk: "Add bits",
  tiles: "Add tiles",
  minis: "Add miniatures",
  custom: "Add other item",
};

const KINDS = Object.keys(ADD_LABELS) as ComponentKind[];

export interface ComponentListProps {
  components: readonly Component[];
  advanced: boolean;
  onAdd: (kind: ComponentKind) => void;
  onChange: (id: string, next: Component) => void;
  /** Returns false when the user declined (nothing was removed). */
  onRemove: (id: string) => boolean;
}

export function ComponentList({
  components,
  advanced,
  onAdd,
  onChange,
  onRemove,
}: ComponentListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const removing = useRef<{ id: string; index: number } | null>(null);

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
        ? root?.querySelector<HTMLElement>(".add-buttons button")
        : root?.querySelectorAll<HTMLElement>(".component-card h3")[
            Math.min(r.index, components.length - 1)
          ];
    target?.focus();
  }, [components]);

  return (
    <div class="component-list" ref={listRef}>
      {components.length === 0 ? (
        <p class="hint">
          Add what goes in the box: cards, bits (tokens, cubes, dice), tiles, miniatures or anything
          else.
        </p>
      ) : null}
      {components.map((c, i) => (
        <ComponentCard
          key={c.id}
          component={c}
          index={i}
          advanced={advanced}
          onChange={(next) => onChange(c.id, next)}
          onRemove={() => {
            removing.current = { id: c.id, index: i };
            if (!onRemove(c.id)) {
              removing.current = null;
            }
          }}
        />
      ))}
      <div class="add-buttons" role="group" aria-label="Add a component">
        {KINDS.map((k) => (
          <button type="button" key={k} onClick={() => onAdd(k)}>
            {ADD_LABELS[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
