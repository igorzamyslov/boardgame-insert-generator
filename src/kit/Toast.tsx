// src/kit/Toast.tsx
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { Icon } from "./icons";

/** How long a note stays, ms. */
export const TOAST_MS = 4000;

/**
 * Calls `onDone` when a note's time is up. A new text, or a new `nonce`, starts the clock again;
 * `null` (no note) runs no clock.
 */
export function useNoteClock(
  message: string | null,
  nonce: number | undefined,
  onDone: () => void,
  ms: number = TOAST_MS,
): void {
  useEffect(() => {
    if (message === null) {
      return undefined;
    }
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [message, nonce, ms, onDone]);
}

/** A note's look: Edit's ink pill with an icon, and nothing that speaks. */
export function ToastNote({
  children,
  icon,
}: {
  children: ComponentChildren;
  icon?: ComponentChildren;
}) {
  return (
    <p class="k-toast">
      {icon ?? <Icon name="check" />}
      <span>{children}</span>
    </p>
  );
}

export interface ToastProps {
  /** The note to show; null shows nothing. */
  message: string | null;
  /** Changes with each note, so the same text twice in a row still shows for its full time. */
  nonce?: number;
  /** Called when the note's time is up: the owner clears `message`. */
  onDone: () => void;
  ms?: number;
  /** An icon of the caller's, instead of the check. */
  icon?: ComponentChildren;
  /** The old toast: fixed at the foot of the page. For the screens not rebuilt yet. */
  legacy?: boolean;
}

/**
 * A short note that goes by itself. The status region is always mounted, so a screen reader
 * hears the text when it arrives; the note never takes the focus. The owner places the region
 * (Edit's stage slot); the legacy look is fixed at the foot of the page.
 */
export function Toast({ message, nonce, onDone, ms = TOAST_MS, icon, legacy = false }: ToastProps) {
  useNoteClock(message, nonce, onDone, ms);
  if (legacy) {
    return (
      <div class="pf-toasts" role="status">
        {message === null ? null : <p class="pf-toast pf-toast--note">{message}</p>}
      </div>
    );
  }
  return (
    <div class="k-toast-region" role="status">
      {message === null ? null : <ToastNote icon={icon}>{message}</ToastNote>}
    </div>
  );
}
