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
}

/** A label and its hint on the left, a 22 px checkbox on the right. */
export function CheckRow({ label, hint, checked, onChange, compact = false }: CheckRowProps) {
  const labelId = useId();
  const hintId = useId();
  return (
    <label class="k-check" data-compact={compact ? "" : undefined}>
      <span class="k-check__text">
        <span class="k-check__label" id={labelId}>
          {label}
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
        aria-describedby={hint !== undefined ? hintId : undefined}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  );
}
