// src/kit/CheckRow.tsx
import { useId } from "preact/hooks";

export interface CheckRowProps {
  label: string;
  /** 13 px muted, under the label; the checkbox's description. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The 44 px row (the printer list), not the 52 px one. */
  compact?: boolean;
  /**
   * Off for a reason the hint gives. The box stays focusable (`aria-disabled`, never `disabled`, so
   * a reader reaches it and hears the hint) and does nothing when it is pressed.
   */
  blocked?: boolean;
  /** The id of a message drawn under the row (an error): the box points at it as well as at the hint. */
  describedBy?: string;
  /** The box and its row are red-flagged: the message under the row says why. */
  invalid?: boolean;
  /** This value differs from its default: an 8 px dot after the label (Settings'). */
  changed?: boolean;
}

/** A label and its hint on the left, a 22 px checkbox on the right. */
export function CheckRow({
  label,
  hint,
  checked,
  onChange,
  compact = false,
  blocked = false,
  describedBy,
  invalid = false,
  changed = false,
}: CheckRowProps) {
  const labelId = useId();
  const hintId = useId();
  return (
    <label class="k-check" data-compact={compact ? "" : undefined}>
      <span class="k-check__text">
        <span class="k-check__label" id={labelId}>
          {label}
          {changed ? <span class="k-check__dot" aria-hidden="true" /> : null}
        </span>
        {hint !== undefined ? (
          <span class="k-check__hint" id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
      <input
        class="k-check__box"
        type="checkbox"
        checked={checked}
        aria-labelledby={labelId}
        aria-disabled={blocked ? "true" : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={
          [hint !== undefined ? hintId : null, describedBy ?? null]
            .filter((x) => x !== null)
            .join(" ") || undefined
        }
        onClick={(e) => {
          // A press (or Space) would flip the box on screen: put it back.
          if (blocked) {
            e.preventDefault();
          }
        }}
        onChange={(e) => {
          if (!blocked) {
            onChange(e.currentTarget.checked);
          }
        }}
      />
    </label>
  );
}
