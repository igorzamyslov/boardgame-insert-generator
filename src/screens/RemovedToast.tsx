// src/screens/RemovedToast.tsx
// The note after an item was removed (Edit's note toast, in the stage slot above the box): what
// went, and the way to bring it back.
import { ToastNote } from "../kit";

export interface RemovedToastProps {
  /** What was removed, as it is called ("(unnamed)" when it had no name). */
  name: string;
  onUndo: () => void;
  onDismiss: () => void;
}

/** What a reader is told while the toast shows (the visually hidden region of the app says it). */
export const removedWords = (name: string): string => `Removed “${name}”.`;

export function RemovedToast({ name, onUndo, onDismiss }: RemovedToastProps) {
  return (
    <div class="removed-toast">
      <ToastNote>
        {`${removedWords(name)} `}
        <button type="button" class="toast-btn" onClick={onUndo}>
          Undo removal
        </button>
        <button type="button" class="toast-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </ToastNote>
    </div>
  );
}
