// src/ui/components/ComponentCard.tsx
import type { Component } from "../../model/types";
import { TextField } from "../fields";
import { componentSummary, tintVar } from "../identity";
import { KindIcon } from "../KindIcon";
import { BulkEditor } from "./BulkEditor";
import { CardsEditor } from "./CardsEditor";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { TilesEditor } from "./TilesEditor";

export interface ComponentCardProps {
  component: Component;
  index: number;
  advanced: boolean;
  /** Unfolded: the editor shows. Folded, the card is one line: the name and what is in it. */
  open: boolean;
  onToggle: (open: boolean) => void;
  onChange: (next: Component) => void;
  onRemove: () => void;
  /** The numbers of the trays that hold this component; none while the plan is out of date. */
  trays?: readonly number[];
  /** Another component has the same name: the Remove button says which one by its position. */
  sameName?: boolean;
}

function KindEditor({
  component: c,
  index,
  advanced,
  onChange,
}: Omit<ComponentCardProps, "onRemove" | "open" | "onToggle" | "trays" | "sameName">) {
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

/** " · tray 3" or " · trays 1, 4": which trays the component makes, so the list and the plan match. */
function trayText(trays: readonly number[]): string {
  if (trays.length === 0) {
    return "";
  }
  return ` · ${trays.length === 1 ? "tray" : "trays"} ${trays.join(", ")}`;
}

export function ComponentCard({
  component: c,
  index,
  advanced,
  open,
  onToggle,
  onChange,
  onRemove,
  trays = [],
  sameName = false,
}: ComponentCardProps) {
  const headingId = `${c.id}-heading`;
  const name = c.name === "" ? "(unnamed)" : c.name;
  return (
    <details
      class="pf-item component-card"
      style={{ "--tint": tintVar(index) }}
      open={open}
      aria-labelledby={headingId}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now !== open) {
          onToggle(now);
        }
      }}
    >
      <summary>
        <KindIcon kind={c.kind} />
        <span>
          <span class="pf-item__title" id={headingId} tabIndex={-1}>
            {name}
          </span>
          <span class="visually-hidden">, </span>
          <span class="pf-item__meta">
            {componentSummary(c)}
            {trayText(trays)}
          </span>
        </span>
      </summary>
      <div class="pf-item__body">
        <div class="form-grid">
          <TextField
            id={`${c.id}-name`}
            label="Name"
            value={c.name}
            onCommit={(name) => onChange({ ...c, name })}
          />
          <KindEditor component={c} index={index} advanced={advanced} onChange={onChange} />
        </div>
        <div class="component-card-foot">
          <span />
          <button
            type="button"
            class="row-remove"
            aria-label={sameName ? `Remove ${name} (item ${index + 1})` : `Remove ${name}`}
            onClick={onRemove}
          >
            {`Remove ${name}`}
          </button>
        </div>
      </div>
    </details>
  );
}
