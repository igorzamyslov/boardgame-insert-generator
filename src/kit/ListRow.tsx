// src/kit/ListRow.tsx
import type { ButtonHTMLAttributes, CSSProperties, ComponentChildren } from "preact";
import type { ComponentKind } from "../model/types";
import { cx } from "./cx";
import { IconTile } from "./IconTile";

export interface ListRowProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "name"
> {
  kind: ComponentKind;
  name: string;
  /** 13 px muted, under the name ("80 cards, sleeved · bottom layer"). */
  meta?: string;
  selected?: boolean;
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
        class={cx("k-row", extra as string | undefined)}
        aria-pressed={selected}
      >
        <IconTile size={36} kind={kind} />
        <span class="k-row__text">
          <span class="k-row__name ellipsis" title={name}>
            {name}
          </span>
          {meta !== undefined ? <span class="k-row__meta ellipsis">{meta}</span> : null}
        </span>
      </button>
      {after}
    </div>
  );
}
