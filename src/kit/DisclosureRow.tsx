// src/kit/DisclosureRow.tsx
import type { ButtonHTMLAttributes } from "preact";
import { useId } from "preact/hooks";
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
  /** The value inside differs from its default: an 8 px dot in the changed colour after the title. */
  dot?: boolean;
  /** Set when the row opens a panel: `aria-expanded`, and the chevron turns. */
  open?: boolean;
  /** The id of the panel the row opens. */
  controls?: string;
  /**
   * Present: the row opens nothing, for the reason given. It stays on screen and focusable
   * (`aria-disabled`, never `disabled`), the reason is its hint line, and a press does nothing.
   */
  blockedReason?: string;
}

/** A 48 px row that opens a group of settings (Settings' "Room around things"). */
export function DisclosureRow({
  title,
  meta,
  changed,
  hint,
  plain: plainLook = false,
  dot = false,
  open,
  controls,
  blockedReason,
  type = "button",
  onClick,
  ...rest
}: DisclosureRowProps) {
  const reasonId = useId();
  const blocked = blockedReason !== undefined;
  const hasChanged = changed !== undefined && changed > 0;
  const plain = blocked || hint !== undefined || plainLook;
  return (
    <button
      {...rest}
      type={type}
      class="k-drow"
      data-plain={plain ? "" : undefined}
      aria-expanded={blocked ? undefined : open}
      aria-controls={blocked ? undefined : controls}
      aria-disabled={blocked ? "true" : undefined}
      aria-describedby={blocked ? reasonId : undefined}
      onClick={
        blocked
          ? (e) => {
              e.preventDefault();
            }
          : onClick
      }
    >
      <span class="k-drow__text">
        <span class="k-drow__title">
          {title}
          {dot ? <span class="k-drow__dot" role="img" aria-label="Changed" /> : null}
        </span>
        {plain ? (
          <span class="k-drow__hint" id={blocked ? reasonId : undefined}>
            {blocked ? blockedReason : hint}
          </span>
        ) : null}
      </span>
      <span class="k-drow__meta" data-changed={hasChanged ? "" : undefined}>
        <span class="k-drow__metatext" title={meta}>
          {hasChanged ? `${changed} changed` : meta}
        </span>
        {blocked ? null : (
          <span class="k-drow__chevron" data-open={open ? "" : undefined} aria-hidden="true">
            <Icon name="chevron-right" size={plain ? 16 : 14} />
          </span>
        )}
      </span>
    </button>
  );
}
