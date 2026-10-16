// src/kit/DisclosureRow.tsx
import type { ButtonHTMLAttributes } from "preact";
import { Icon } from "./icons";

export interface DisclosureRowProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title" | "disabled"
> {
  title: string;
  /** What is inside, on the right (13 px muted): "4 values". */
  meta?: string;
  /** How many values are changed: shown instead of `meta`, in the changed ink. */
  changed?: number;
  /** Set when the row opens a panel: `aria-expanded`, and the chevron turns. */
  open?: boolean;
  /** The id of the panel the row opens. */
  controls?: string;
}

/** A 48 px row that opens a group of settings (Settings' "Room around things"). */
export function DisclosureRow({
  title,
  meta,
  changed,
  open,
  controls,
  type = "button",
  ...rest
}: DisclosureRowProps) {
  const hasChanged = changed !== undefined && changed > 0;
  return (
    <button {...rest} type={type} class="k-drow" aria-expanded={open} aria-controls={controls}>
      <span class="k-drow__title">{title}</span>
      <span class="k-drow__meta" data-changed={hasChanged ? "" : undefined}>
        {hasChanged ? `${changed} changed` : meta}
        <span class="k-drow__chevron" data-open={open ? "" : undefined} aria-hidden="true">
          <Icon name="chevron-right" size={14} />
        </span>
      </span>
    </button>
  );
}
