// src/screens/StageSlot.tsx
// The slot over the plan's box: what is said for a moment (a swap's prompt, a refusal, a toast of
// Task 10). It holds no room: the notes float over the top of the box (stage.css), and the selected
// tray's dock has its own place at the foot of the column (board 4).
import type { ComponentChildren } from "preact";
import { toChildArray } from "preact";
import { cx } from "../kit/cx";

export interface StageSlotProps {
  /** What the slot holds. Nothing: the slot is held for it, empty. */
  children?: ComponentChildren;
  /** A live region, always mounted, ahead of the rest, so what it says is heard when it arrives. */
  live?: ComponentChildren;
  /** Nothing to show and no room to give it (a phone's plan has no slot): hidden from the eye, not from a reader. */
  idle?: boolean;
}

/** The slot has no height (stage.css): what it holds floats over the box. */
export function StageSlot({ children, live, idle = false }: StageSlotProps) {
  const held = toChildArray(children).some((c) => c !== "");
  return (
    <div class={cx("stage-slot", idle && "visually-hidden")} data-held={held ? "true" : undefined}>
      {live}
      {held ? children : null}
    </div>
  );
}
