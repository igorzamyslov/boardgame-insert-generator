// src/ui/components/MoreOptions.tsx
import type { ComponentChildren } from "preact";

export interface MoreOptionsProps {
  open: boolean;
  children: ComponentChildren;
}

export function MoreOptions({ open, children }: MoreOptionsProps) {
  return (
    <details class="more-options" open={open}>
      <summary>More options</summary>
      <div class="form-grid">{children}</div>
    </details>
  );
}
