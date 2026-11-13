// src/kit/ListRow.tsx
import type { ButtonHTMLAttributes, CSSProperties, ComponentChildren } from "preact";
import type { ComponentKind } from "../model/types";
import { cx } from "./cx";
import { FitText } from "./FitText";
import { Icon } from "./icons";
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
   * Its component's trays are being pointed at (on the plan, or on this very row): it takes the
   * selected look without being pressed, as Main's row does while its tray is hovered.
   */
  lit?: boolean;
  /**
   * The phone sheet's row (MobileWorkspace): a 14 px swatch in the kind's line and fill, or a
   * dashed square without a kind, the name, and the meta on the right. Pressing it selects, like
   * the rail's row; the box's own row (no kind) is a link, so it says nothing of being selected.
   */
  compact?: boolean;
  /**
   * This component's own shade of its kind, as custom properties (`shadeVars` in ui/identity.ts):
   * the tile, the selected fill and the selected line take it.
   */
  shade?: Record<string, string>;
  /** Beside the row, outside its button: a rule chip. */
  after?: ComponentChildren;
  /** Present: a pencil beside the row (outside its button) that edits it; pressing the row only selects. */
  onEdit?: () => void;
  /** The pencil's name for assistive technology ("Edit Market deck"). */
  editLabel?: string;
}

/** The pencil beside a row: it opens what the row stands for, where pressing the row only selects. */
export function RowEditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" class="k-row__edit" aria-label={label} title={label} onClick={onClick}>
      <Icon name="pencil" size={16} />
    </button>
  );
}

/** One line of "What's inside": the kind's tile, the name and a line under it. */
export function ListRow({
  kind,
  name,
  meta,
  selected = false,
  lit = false,
  compact = false,
  shade,
  after,
  onEdit,
  editLabel,
  class: extra,
  type = "button",
  ...rest
}: ListRowProps) {
  return (
    <div class="k-rowwrap" data-kind={kind} style={shade as CSSProperties | undefined}>
      <button
        aria-label={meta === undefined ? name : `${name}, ${meta}`}
        {...rest}
        type={type}
        class={cx("k-row", compact && "k-row--compact", extra as string | undefined)}
        aria-pressed={kind === undefined ? undefined : selected}
        data-lit={lit && !compact ? "true" : undefined}
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
            <FitText class="k-row__name" title={name}>
              {name}
            </FitText>
            {meta !== undefined ? (
              <span class="k-row__meta ellipsis" title={meta}>
                {meta}
              </span>
            ) : null}
          </>
        ) : (
          <span class="k-row__text">
            <FitText class="k-row__name" title={name}>
              {name}
            </FitText>
            {meta !== undefined ? (
              <span class="k-row__meta ellipsis" title={meta}>
                {meta}
              </span>
            ) : null}
          </span>
        )}
      </button>
      {onEdit !== undefined ? (
        <RowEditButton label={editLabel ?? `Edit ${name}`} onClick={onEdit} />
      ) : null}
      {after}
    </div>
  );
}
