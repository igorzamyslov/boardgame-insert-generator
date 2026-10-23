// src/screens/StageSlot.tsx
// The 52 px slot above the plan's box (Main): the tray bar while a tray is selected (Task 8), a toast
// (Task 10). Empty otherwise: the hint "Tap a tray for details." is the plan's caption now (board 1).
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

/** The slot's height is `--stage-slot` (stage.css); it grows when what it holds is taller. */
export function StageSlot({ children, live, idle = false }: StageSlotProps) {
  const held = toChildArray(children).some((c) => c !== "");
  return (
    <div class={cx("stage-slot", idle && "visually-hidden")} data-held={held ? "true" : undefined}>
      {live}
      {held ? children : null}
    </div>
  );
}
