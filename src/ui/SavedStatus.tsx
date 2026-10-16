// src/ui/SavedStatus.tsx
import type { SaveState } from "../app/state";
import { Icon } from "../kit";

const TEXT: Record<SaveState, string> = {
  saved: "Saved in this browser",
  saving: "Saving…",
  paused: "Saving paused",
  failed: "Couldn't save",
  unavailable: "Not saved: this browser blocks storage",
};

/** Only these are worth interrupting for; routine saving and saved are not announced. */
const ANNOUNCED: readonly SaveState[] = ["paused", "failed", "unavailable"];

/** Main draws a check before "Saved in this browser" and before "Saving paused"; the rest keep a dot. */
const CHECKED: readonly SaveState[] = ["saved", "paused"];

/**
 * Where the open insert is kept, in words: 13 px, the colour of the state and a check or a dot
 * before it (styled in `screens/header.css`). The colour only repeats what the text says.
 */
export function SavedStatus({ state }: { state: SaveState }) {
  const announced = ANNOUNCED.includes(state);
  return (
    <span class="saved-status" data-state={state}>
      <span class="saved-mark" aria-hidden="true">
        {CHECKED.includes(state) ? <Icon name="check" size={14} /> : <span class="saved-dot" />}
      </span>
      {/* what is on screen; a reader gets it from the live region below when it is worth saying */}
      <span aria-hidden={announced ? "true" : undefined}>{TEXT[state]}</span>
      {/* always mounted, empty for routine saving: the words arrive in a region that was there */}
      <span class="visually-hidden" role="status">
        {announced ? TEXT[state] : ""}
      </span>
    </span>
  );
}
