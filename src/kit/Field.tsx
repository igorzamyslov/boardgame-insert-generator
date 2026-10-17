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
  /**
   * Words after the label that only assistive technology reads ("of piece 2"): a screen reader gets
   * "Width mm of piece 2" where the eye has "Width mm", repeated down a list.
   */
  labelExtra?: string;
  /** After the value, inside the box ("mm"). It is not part of the input's name. */
  unit?: string;
  /** The words under the box when the value is wrong; the box turns red. */
  error?: string;
  /**
   * The id of a message drawn elsewhere (Empty's card under the three fields): the box turns red
   * and the input points at it, and the field draws no message of its own. `error` wins.
   */
  invalidBy?: string;
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
  labelExtra,
  unit,
  error,
  invalidBy,
  mode = "decimal",
  compact = false,
  placeholder,
  class: extra,
}: FieldProps) {
  const made = useId();
  const id = given ?? made;
  const errorId = `${id}-error`;
  const shown = error !== undefined && error !== "";
  const invalid = shown || (invalidBy !== undefined && invalidBy !== "");
  const keyboard = mode === "text" ? {} : numberInputAttrs(mode === "integer");
  return (
    <div class={cx("k-field", extra)}>
      <label class="k-field__label" htmlFor={id}>
        {label}
        {labelExtra !== undefined ? <span class="visually-hidden">{` ${labelExtra}`}</span> : null}
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
          aria-describedby={shown ? errorId : invalid ? invalidBy : undefined}
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
      {shown ? (
        <p class="k-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
