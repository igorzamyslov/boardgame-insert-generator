// src/ui/SavedStatus.tsx
import type { SaveState } from "../app/state";

const TEXT: Record<SaveState, string> = {
  saved: "Saved in this browser",
  saving: "Saving…",
  paused: "Saving paused",
  failed: "Couldn't save",
  unavailable: "Not saved: this browser blocks storage",
};

/** Where the open insert is kept, in words: the colour of the dot only repeats what the text says. */
export function SavedStatus({ state }: { state: SaveState }) {
  return (
    <span class="saved-status" role="status" data-state={state}>
      <span class="saved-dot" aria-hidden="true" />
      {TEXT[state]}
    </span>
  );
}
