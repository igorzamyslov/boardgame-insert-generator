// src/ui/components/ComponentList.tsx
import type { Component, ComponentKind } from "../../model/types";
import { ComponentCard } from "./ComponentCard";

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

export const ADD_LABELS: Record<ComponentKind, string> = {
  cards: "Add cards",
  bulk: "Add bits",
  tiles: "Add tiles",
  minis: "Add miniatures",
  custom: "Add other item",
};

export interface ComponentListProps {
  components: readonly Component[];
  advanced: boolean;
  onAdd: (kind: ComponentKind) => void;
  onChange: (id: string, next: Component) => void;
  onRemove: (id: string) => void;
}

export function ComponentList({
  components,
  advanced,
  onAdd,
  onChange,
  onRemove,
}: ComponentListProps) {
  return (
    <div class="component-list">
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
          onRemove={() => onRemove(c.id)}
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
