// src/screens/RemovedToast.tsx
// The note after an item was removed (Edit's note toast, in the stage slot above the box): what
// went, and the way to bring it back.
import { ToastNote } from "../kit";

export interface RemovedToastProps {
  /** What was removed, as it is called ("(unnamed)" when it had no name). */
  name?: string;
  /** What to say instead of the item's words: a group's removal and what it took off the plan. */
  words?: string;
  /** The Undo button's words: "Undo removal", or "Undo move" for a drop in the rail. */
  undoLabel?: string;
  onUndo: () => void;
  onDismiss: () => void;
}

/** What a reader is told while the toast shows (the visually hidden region of the app says it). */
export const removedWords = (name: string): string => `Removed “${name}”.`;

/** Notes as sentences: "1 pin removed" becomes "1 pin removed." (a note that ends a sentence already stays as it is). */
export const notesAsSentences = (notes: readonly string[]): string[] =>
  notes.map((note) => (note.endsWith(".") ? note : `${note}.`));

/**
 * What a group's removal says (spec §7.4, §8): the group's own note, then what its trays' rules
 * lost, each as a sentence: "Player kit removed. Its items are back in the list. 1 pin removed."
 */
export const groupRemovedWords = (notes: readonly string[]): string =>
  notesAsSentences(notes).join(" ");

/** The words of the Undo button after a removal (the default), and after a drop in the rail. */
export const UNDO_REMOVAL = "Undo removal";
export const UNDO_MOVE = "Undo move";

export function RemovedToast({
  name = "",
  words,
  undoLabel = UNDO_REMOVAL,
  onUndo,
  onDismiss,
}: RemovedToastProps) {
  return (
    <div class="removed-toast">
      <ToastNote>
        {`${words ?? removedWords(name)} `}
        <button type="button" class="toast-btn" onClick={onUndo}>
          {undoLabel}
        </button>
        <button type="button" class="toast-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </ToastNote>
    </div>
  );
}
