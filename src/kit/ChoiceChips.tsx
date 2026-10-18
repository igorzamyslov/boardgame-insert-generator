// src/kit/ChoiceChips.tsx

export interface Chip<T extends string> {
  value: T;
  label: string;
  /** This chip's value differs from its default: an 8 px dot in the changed colour after the label, and ", changed" for a reader. */
  changed?: boolean;
}

export interface ChoiceChipsProps<T extends string> {
  /** The group's name ("Card size"). */
  label: string;
  options: readonly Chip<T>[];
  /** The chosen chip, or every chosen chip when several can be on (Edit's tray shape). */
  value: T | readonly T[];
  /** The chip that was pressed; the owner decides what that does to `value`. */
  onChange: (value: T) => void;
  /** The id of a message drawn under the chips (an error): the group points at it. */
  describedBy?: string;
}

/** Pressed pills: the chosen one is ink with white words. */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  describedBy,
}: ChoiceChipsProps<T>) {
  const on = (v: T): boolean => (typeof value === "string" ? value === v : value.includes(v));
  return (
    <div class="k-chips" role="group" aria-label={label} aria-describedby={describedBy}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          class="k-chip"
          aria-pressed={on(o.value)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.changed === true ? (
            <>
              <span class="visually-hidden">, changed</span>
              <span class="k-chip__dot" aria-hidden="true" />
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}
