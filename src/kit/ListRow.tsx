// src/kit/ListRow.tsx
import type { ButtonHTMLAttributes, CSSProperties, ComponentChildren } from "preact";
import type { ComponentKind } from "../model/types";
import { cx } from "./cx";
import { IconTile } from "./IconTile";

export interface ListRowProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "name"
> {
  /** The component's kind; none for the box's own row, which only a compact row can be. */
  kind?: ComponentKind;
  name: string;
  /** 13 px muted, under the name ("80 cards, sleeved · Layer 1 (bottom)"); compact: 14 px, on the right. */
  meta?: string;
  selected?: boolean;
  /**
   * The phone sheet's row (MobileWorkspace): a 14 px swatch in the kind's line and fill, or a
   * dashed square without a kind, the name, and the meta on the right. A link into an editor, so
   * it says nothing of being selected.
   */
  compact?: boolean;
  /**
   * This component's own shade of its kind, as custom properties (`shadeVars` in ui/identity.ts):
   * the tile, the selected fill and the selected line take it.
   */
  shade?: Record<string, string>;
  /** Beside the row, outside its button: a rule chip. */
  after?: ComponentChildren;
}

/** One line of "What's inside": the kind's tile, the name and a line under it. */
export function ListRow({
  kind,
  name,
  meta,
  selected = false,
  compact = false,
  shade,
  after,
  class: extra,
  type = "button",
  ...rest
}: ListRowProps) {
  return (
    <div class="k-rowwrap" data-kind={kind} style={shade as CSSProperties | undefined}>
      <button
        {...rest}
        type={type}
        class={cx("k-row", compact && "k-row--compact", extra as string | undefined)}
        aria-pressed={compact ? undefined : selected}
      >
        {compact ? (
          <span
            class={cx("k-row__swatch", kind === undefined && "k-row__swatch--box")}
            aria-hidden="true"
          />
        ) : kind !== undefined ? (
          <IconTile size={36} kind={kind} />
        ) : null}
        {compact ? (
          <>
            <span class="k-row__name ellipsis" title={name}>
              {name}
            </span>
            {meta !== undefined ? (
              <>
                <span class="visually-hidden">, </span>
                <span class="k-row__meta ellipsis" title={meta}>
                  {meta}
                </span>
              </>
            ) : null}
          </>
        ) : (
          <span class="k-row__text">
            <span class="k-row__name ellipsis" title={name}>
              {name}
            </span>
            {meta !== undefined ? (
              <>
                <span class="visually-hidden">, </span>
                <span class="k-row__meta ellipsis" title={meta}>
                  {meta}
                </span>
              </>
            ) : null}
          </span>
        )}
      </button>
      {after}
    </div>
  );
}
