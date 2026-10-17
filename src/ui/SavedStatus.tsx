// src/ui/SavedStatus.tsx
import type { SaveState } from "../app/state";
import { Icon } from "../kit";

const TEXT: Record<SaveState, string> = {
  saved: "",
  saving: "",
  paused: "Saving paused",
  failed: "Couldn't save",
  unavailable: "Not saved: this browser blocks storage",
};

/**
 * Only a problem is shown, and only a problem is announced (owner decision, DESIGN §7): while
 * saving works the header says nothing, not "Saved in this browser" and not a passing "Saved".
 */
const PROBLEMS: readonly SaveState[] = ["paused", "failed", "unavailable"];

/** Main draws a check before "Saving paused"; the failures keep a dot. */
const CHECKED: readonly SaveState[] = ["paused"];

/**
 * What is wrong with keeping the open insert, in words: 13 px, the colour of the state and a check
 * or a dot before it (styled in `screens/header.css`). Nothing is drawn while saving works; the
 * live region is always mounted, so the words arrive in a region that was already there.
 */
export function SavedStatus({ state }: { state: SaveState }) {
  const problem = PROBLEMS.includes(state);
  return (
    <span class="saved-status" data-state={state} data-quiet={problem ? undefined : "true"}>
      {problem ? (
        <>
          <span class="saved-mark" aria-hidden="true">
            {CHECKED.includes(state) ? <Icon name="check" size={14} /> : <span class="saved-dot" />}
          </span>
          {/* what is on screen; a reader gets it from the live region below */}
          <span aria-hidden="true">{TEXT[state]}</span>
        </>
      ) : null}
      <span class="visually-hidden" role="status">
        {problem ? TEXT[state] : ""}
      </span>
    </span>
  );
}
