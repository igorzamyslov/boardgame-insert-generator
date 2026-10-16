// src/kit/Field.tsx
import { useId } from "preact/hooks";
import { numberInputAttrs } from "../ui/NumberField";
import { cx } from "./cx";

export interface FieldProps {
  /** The input's id; a made-up one when omitted. */
  id?: string;
  /** Above the box, 13 px muted. */
  label: string;
  value: string;
  onInput: (text: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  /** After the value, inside the box ("mm"). It is not part of the input's name. */
  unit?: string;
  /** The words under the box when the value is wrong; the box turns red. */
  error?: string;
  /** `decimal` (mm), `integer` (a count) or `text`: the keyboard the phone shows. */
  mode?: "decimal" | "integer" | "text";
  /** The 44 px box (counts, exact numbers) instead of the 48 px one. */
  compact?: boolean;
  placeholder?: string;
  class?: string;
}

/** A labelled text box: the board's Width, Length and Height. */
export function Field({
  id: given,
  label,
  value,
  onInput,
  onBlur,
  onKeyDown,
  unit,
  error,
  mode = "decimal",
  compact = false,
  placeholder,
  class: extra,
}: FieldProps) {
  const made = useId();
  const id = given ?? made;
  const errorId = `${id}-error`;
  const invalid = error !== undefined && error !== "";
  const keyboard = mode === "text" ? {} : numberInputAttrs(mode === "integer");
  return (
    <div class={cx("k-field", extra)}>
      <label class="k-field__label" htmlFor={id}>
        {label}
        {unit !== undefined ? <span class="visually-hidden">{` (${unit})`}</span> : null}
      </label>
      <span
        class="k-field__box field-box"
        data-compact={compact ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
      >
        <input
          id={id}
          class="k-field__input"
          type="text"
          autoComplete="off"
          {...keyboard}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errorId : undefined}
          onInput={(e) => onInput(e.currentTarget.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {unit !== undefined ? (
          <span class="k-field__unit" aria-hidden="true">
            {unit}
          </span>
        ) : null}
      </span>
      {invalid ? (
        <p class="k-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
