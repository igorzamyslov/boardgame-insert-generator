// src/ui/NumberField.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { parseNumber } from "../model/numbers";
import { FieldMessages, describedByIds, messagesOf } from "./FieldMessages";
import { useFieldNotices } from "./validation";

export interface NumberRules {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  integer?: boolean;
}

export type NumberCheck =
  { kind: "ok"; value: number } | { kind: "incomplete" } | { kind: "error"; message: string };

export function checkNumber(text: string, rules: NumberRules): NumberCheck {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { kind: "error", message: "Enter a number." };
  }
  // Still being typed: a lone sign, or one sign-and-digits prefix ending in one separator.
  if (/^[+\-−]$/.test(trimmed) || /^[+\-−]?\d*[.,]$/.test(trimmed)) {
    return { kind: "incomplete" };
  }
  const value = parseNumber(trimmed);
  if (value === null) {
    return {
      kind: "error",
      message: "Not a number. Use digits with one decimal point or comma, e.g. 63,5.",
    };
  }
  if (rules.integer && !Number.isInteger(value)) {
    return { kind: "error", message: "Enter a whole number." };
  }
  if (rules.min !== undefined) {
    const tooSmall = rules.minExclusive ? value <= rules.min : value < rules.min;
    if (tooSmall) {
      return {
        kind: "error",
        message: rules.minExclusive
          ? `Must be more than ${rules.min}.`
          : `Must be at least ${rules.min}.`,
      };
    }
  }
  if (rules.max !== undefined && value > rules.max) {
    return { kind: "error", message: `Must be at most ${rules.max}.` };
  }
  return { kind: "ok", value };
}

/**
 * The keyboard a number field asks for: mm get the decimal keyboard, counts the plain digits, and
 * Return moves on to the next field. Shared with the kit's `Field` and `Stepper`.
 */
export function numberInputAttrs(integer: boolean): {
  inputMode: "numeric" | "decimal";
  enterKeyHint: "next";
} {
  return { inputMode: integer ? "numeric" : "decimal", enterKeyHint: "next" };
}

export function formatNumber(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

export interface NumberFieldProps extends NumberRules {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  unit?: string;
  hint?: string;
  path?: string;
  /** Extra content under the field's messages, such as "differs from the default" with a restore button. */
  footer?: ComponentChildren;
  /** "input" (default) commits every valid keystroke; "blur" only when leaving the field. */
  commitOn?: "input" | "blur";
}

export function NumberField(props: NumberFieldProps) {
  const { id, label, value, onCommit, unit, hint, path } = props;
  const commitOn = props.commitOn ?? "input";
  const [text, setText] = useState(() => formatNumber(value));
  const [error, setError] = useState<string | null>(null);
  const notices = useFieldNotices(path);

  useEffect(() => {
    setText((current) => (parseNumber(current) === value ? current : formatNumber(value)));
    setError(null);
  }, [value]);

  function evaluate(next: string, final: boolean): void {
    let result = checkNumber(next, props);
    if (result.kind === "incomplete" && final) {
      // Leaving the field: "63," means 63, but a lone sign or separator is not a number.
      result = checkNumber(next.trim().replace(/[.,]$/, ""), props);
      if (result.kind === "incomplete") {
        result = { kind: "error", message: "Enter a number." };
      }
    }
    if (result.kind === "error") {
      setError(result.message);
      return;
    }
    setError(null);
    if (result.kind === "incomplete") {
      return;
    }
    if (final) {
      // Tidy what the user left ("63," or " 63,50 "), keeping a decimal comma if they typed one.
      const tidy = formatNumber(result.value);
      setText(next.includes(",") ? tidy.replace(".", ",") : tidy);
    }
    if ((final || commitOn === "input") && result.value !== value) {
      onCommit(result.value);
    }
  }

  const { errors: noticeErrors, notes } = messagesOf(notices);
  const errors = error !== null ? [error] : noticeErrors;

  const input = (
    <input
      id={id}
      type="text"
      {...numberInputAttrs(props.integer === true)}
      autoComplete="off"
      value={text}
      aria-invalid={errors.length > 0}
      aria-describedby={describedByIds(id, hint, errors, notes)}
      onInput={(e) => {
        const next = e.currentTarget.value;
        setText(next);
        evaluate(next, false);
      }}
      onBlur={() => evaluate(text, true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          evaluate(text, true);
        }
      }}
    />
  );

  return (
    <div class="field">
      <label htmlFor={id}>
        {label}
        {unit !== undefined ? <span class="visually-hidden">{` (${unit})`}</span> : null}
      </label>
      {unit !== undefined ? (
        <span class="pf-unit">
          {input}
          <span class="pf-unit__sfx" aria-hidden="true">
            {unit}
          </span>
        </span>
      ) : (
        input
      )}
      <FieldMessages id={id} hint={hint} errors={errors} notes={notes} />
      {props.footer}
    </div>
  );
}
