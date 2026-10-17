// src/screens/StageSlot.tsx
// The 52 px slot above the plan's box (Main): "Tap a tray for details." while nothing is
// selected, the tray bar while one is (Task 8), a toast (Task 10).
import type { ComponentChildren } from "preact";
import { toChildArray } from "preact";
import { cx } from "../kit/cx";

export interface StageSlotProps {
  /** What the slot holds. Nothing: it asks for a tap. */
  children?: ComponentChildren;
  /** A live region, always mounted, ahead of the rest, so what it says is heard when it arrives. */
  live?: ComponentChildren;
  /** Something else is being said (a note in the live region): leave the ask out. */
  quiet?: boolean;
  /** Nothing to show and no room to give it (a phone's plan has no slot): hidden from the eye, not from a reader. */
  idle?: boolean;
}

/** The slot's height is `--stage-slot` (stage.css); it grows when what it holds is taller. */
export function StageSlot({ children, live, quiet = false, idle = false }: StageSlotProps) {
  const held = toChildArray(children).some((c) => c !== "");
  return (
    <div class={cx("stage-slot", idle && "visually-hidden")} data-held={held ? "true" : undefined}>
      {live}
      {held ? (
        children
      ) : quiet ? null : (
        <span class="stage-slot__hint">Tap a tray for details.</span>
      )}
    </div>
  );
}
