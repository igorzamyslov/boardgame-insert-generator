// src/ui/Advanced.tsx
import type { ComponentChildren } from "preact";

/**
 * Fields only Advanced mode shows, set apart with a dotted edge in the gutter (the note beside the
 * level switch says what the edge means), so it is clear what Simple mode would hide. Spans the
 * whole form grid it sits in.
 */
export function Advanced({ children }: { children: ComponentChildren }) {
  return (
    <div class="pf-adv" role="group" aria-label="Advanced options">
      <div class="form-grid">{children}</div>
    </div>
  );
}
