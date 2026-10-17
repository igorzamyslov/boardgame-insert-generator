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
  /**
   * 13 px muted, under the title: what the row is for (Edit's "Card thickness"). The row then has
   * Edit's look, a plain 52 px row with no box, and its chevron stands alone on the right.
   */
  hint?: string;
  /** The same plain look with no hint: a row among Edit's rows. */
  plain?: boolean;
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
  hint,
  plain: plainLook = false,
  open,
  controls,
  type = "button",
  ...rest
}: DisclosureRowProps) {
  const hasChanged = changed !== undefined && changed > 0;
  const plain = hint !== undefined || plainLook;
  return (
    <button
      {...rest}
      type={type}
      class="k-drow"
      data-plain={plain ? "" : undefined}
      aria-expanded={open}
      aria-controls={controls}
    >
      <span class="k-drow__text">
        <span class="k-drow__title">{title}</span>
        {plain ? <span class="k-drow__hint">{hint}</span> : null}
      </span>
      <span class="k-drow__meta" data-changed={hasChanged ? "" : undefined}>
        {hasChanged ? `${changed} changed` : meta}
        <span class="k-drow__chevron" data-open={open ? "" : undefined} aria-hidden="true">
          <Icon name="chevron-right" size={plain ? 16 : 14} />
        </span>
      </span>
    </button>
  );
}
