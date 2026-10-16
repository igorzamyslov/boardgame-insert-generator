// src/ui/Toast.tsx
import { useEffect } from "preact/hooks";

/** How long a note stays, ms. */
export const TOAST_MS = 4000;

export interface ToastProps {
  /** The note to show; null shows nothing. A new text starts the clock again. */
  message: string | null;
  /** Called when the note's time is up (or it is dismissed): the owner clears `message`. */
  onDone: () => void;
  ms?: number;
}

/**
 * A short note that goes by itself. The status region is always there, so a screen reader hears
 * the text when it arrives; the note never takes the focus and never covers the controls.
 */
export function Toast({ message, onDone, ms = TOAST_MS }: ToastProps) {
  useEffect(() => {
    if (message === null) {
      return undefined;
    }
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [message, ms, onDone]);
  return (
    <div class="pf-toasts" role="status">
      {message === null ? null : <p class="pf-toast pf-toast--note">{message}</p>}
    </div>
  );
}
