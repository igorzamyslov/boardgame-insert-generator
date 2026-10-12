// src/ui/NumberField.tsx
import { useEffect, useState } from "preact/hooks";
import { parseNumber } from "../model/numbers";
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
  if (/^[+\-−]$/.test(trimmed) || /[.,]$/.test(trimmed)) {
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
      result = checkNumber(next.trim().replace(/[.,]$/, ""), props);
    }
    if (result.kind === "error") {
      setError(result.message);
      return;
    }
    setError(null);
    if (result.kind === "incomplete") {
      return;
    }
    if ((final || commitOn === "input") && result.value !== value) {
      onCommit(result.value);
    }
  }

  const messages = error !== null ? [error] : notices.map((n) => n.message);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint !== undefined ? hintId : "", messages.length > 0 ? errorId : ""]
    .filter((x) => x !== "")
    .join(" ");

  return (
    <div class="field">
      <label htmlFor={id}>
        {label}
        {unit !== undefined ? <span class="unit"> ({unit})</span> : null}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={messages.length > 0}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        onInput={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          evaluate(next, false);
        }}
        onBlur={() => evaluate(text, true)}
      />
      {hint !== undefined ? (
        <p class="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {messages.length > 0 ? (
        <p class="field-error" id={errorId} role="alert">
          {messages.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
