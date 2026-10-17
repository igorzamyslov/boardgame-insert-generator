// src/ui/components/RowRemove.tsx
import { Icon, IconButton } from "../../kit";

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
 * The little × at the end of a card's top row (EditKinds): removes that deck, item or figure. On
 * the last one it is aria-disabled, not `disabled`: it stays in the Tab order and its reason is
 * read with it (DESIGN §2, "Keep a blocked action focusable").
 */
export function RowRemove({ label, onlyOne, reason, onRemove }: RowRemoveProps) {
  return (
    <IconButton
      label={label}
      variant="plain"
      class="ed-x"
      icon={<Icon name="close" size={16} />}
      blockedReason={onlyOne ? reason : undefined}
      onClick={onRemove}
    />
  );
}
