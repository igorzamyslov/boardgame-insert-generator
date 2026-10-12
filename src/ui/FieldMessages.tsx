import type { Notice } from "../model/types";

/** The ids a field's input lists in `aria-describedby`, in reading order. */
export function describedByIds(
  id: string,
  hint: string | undefined,
  errors: readonly unknown[],
  notes: readonly unknown[],
): string | undefined {
  const ids = [
    hint !== undefined ? `${id}-hint` : null,
    errors.length > 0 ? `${id}-error` : null,
    notes.length > 0 ? `${id}-notes` : null,
  ].filter((x): x is string => x !== null);
  return ids.length === 0 ? undefined : ids.join(" ");
}

export interface FieldMessagesProps {
  id: string;
  hint?: string;
  /** Messages that make the field invalid (shown as an alert). */
  errors: readonly string[];
  /** Warnings and info at the field's path, shown as plain notes. */
  notes: readonly string[];
}

export function FieldMessages({ id, hint, errors, notes }: FieldMessagesProps) {
  return (
    <>
      {hint !== undefined ? (
        <p class="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <p class="field-error" id={`${id}-error`} role="alert">
          {errors.join(" ")}
        </p>
      ) : null}
      {notes.length > 0 ? (
        <p class="hint field-notes" id={`${id}-notes`}>
          {notes.join(" ")}
        </p>
      ) : null}
    </>
  );
}

/**
 * Splits a field's notices by how they are shown: errors flag the field (aria-invalid and an
 * alert), warnings and info are plain notes next to it.
 */
export function messagesOf(notices: readonly Notice[]): { errors: string[]; notes: string[] } {
  return {
    errors: notices.filter((n) => n.level === "error").map((n) => n.message),
    notes: notices.filter((n) => n.level !== "error").map((n) => n.message),
  };
}
