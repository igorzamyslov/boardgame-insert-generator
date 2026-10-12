// src/ui/components/ComponentCard.tsx
import { KIND_NAMES } from "../../model/defaults";
import type { Access, Component } from "../../model/types";
import { SelectField, TextField } from "../fields";
import type { SelectOption } from "../fields";
import { BulkEditor } from "./BulkEditor";
import { CardsEditor } from "./CardsEditor";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { TilesEditor } from "./TilesEditor";

const ACCESS_OPTIONS: SelectOption<Access>[] = [
  { value: "often", label: "Often" },
  { value: "sometimes", label: "Sometimes" },
  { value: "setup", label: "Only at setup" },
];

export interface ComponentCardProps {
  component: Component;
  index: number;
  advanced: boolean;
  onChange: (next: Component) => void;
  onRemove: () => void;
}

function KindEditor({
  component: c,
  index,
  advanced,
  onChange,
}: Omit<ComponentCardProps, "onRemove">) {
  switch (c.kind) {
    case "cards":
      return <CardsEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "bulk":
      return <BulkEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "tiles":
      return <TilesEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "minis":
      return <MinisEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
    case "custom":
      return <CustomEditor component={c} index={index} advanced={advanced} onChange={onChange} />;
  }
}

export function ComponentCard({
  component: c,
  index,
  advanced,
  onChange,
  onRemove,
}: ComponentCardProps) {
  const headingId = `${c.id}-heading`;
  const title = `${KIND_NAMES[c.kind]}: ${c.name === "" ? "(unnamed)" : c.name}`;
  return (
    <section class="component-card" aria-labelledby={headingId}>
      <div class="component-card-header">
        <h3 id={headingId}>{title}</h3>
        <button
          type="button"
          class="row-remove"
          aria-label={`Remove component ${index + 1} (${title})`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
      <div class="form-grid">
        <TextField
          id={`${c.id}-name`}
          label="Name"
          value={c.name}
          onCommit={(name) => onChange({ ...c, name })}
        />
        <SelectField
          id={`${c.id}-access`}
          label="Needed during play"
          value={c.access}
          options={ACCESS_OPTIONS}
          hint="Often-used parts are kept out from under other trays."
          onChange={(access) => onChange({ ...c, access })}
        />
        <KindEditor component={c} index={index} advanced={advanced} onChange={onChange} />
      </div>
    </section>
  );
}
