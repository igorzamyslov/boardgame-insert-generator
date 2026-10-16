// src/ui/components/RowRemove.tsx
import { useId } from "preact/hooks";

export interface RowRemoveProps {
  /** The button's name: "Remove deck Main". */
  label: string;
  /** The last row can't go: the button stays, off, and says why. */
  onlyOne: boolean;
  /** Why the last row stays, as a sentence: "There has to be at least one deck." */
  reason: string;
  onRemove: () => void;
}

/**
 * A row's Remove button. On the last row it is aria-disabled, not `disabled`: it stays in the Tab
 * order and its reason is read with it (DESIGN §2, "Keep a blocked action focusable").
 */
export function RowRemove({ label, onlyOne, reason, onRemove }: RowRemoveProps) {
  const reasonId = useId();
  return (
    <>
      <button
        type="button"
        class="row-remove"
        aria-label={label}
        aria-disabled={onlyOne ? "true" : undefined}
        aria-describedby={onlyOne ? reasonId : undefined}
        onClick={() => {
          if (!onlyOne) {
            onRemove();
          }
        }}
      >
        Remove
      </button>
      {onlyOne ? (
        <span class="visually-hidden" id={reasonId}>
          {reason}
        </span>
      ) : null}
    </>
  );
}
