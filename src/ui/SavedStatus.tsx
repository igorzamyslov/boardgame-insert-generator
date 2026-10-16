// src/ui/SavedStatus.tsx
import type { SaveState } from "../app/state";

const TEXT: Record<SaveState, string> = {
  saved: "Saved in this browser",
  saving: "Saving…",
  paused: "Saving paused",
  failed: "Couldn't save",
  unavailable: "Not saved: this browser blocks storage",
};

/** Only these are worth interrupting for; routine saving and saved are not announced. */
const ANNOUNCED: readonly SaveState[] = ["paused", "failed", "unavailable"];

/** Where the open insert is kept, in words: the colour of the dot only repeats what the text says. */
export function SavedStatus({ state }: { state: SaveState }) {
  return (
    <span
      class="saved-status"
      role={ANNOUNCED.includes(state) ? "status" : undefined}
      data-state={state}
    >
      <span class="saved-dot" aria-hidden="true" />
      {TEXT[state]}
    </span>
  );
}
