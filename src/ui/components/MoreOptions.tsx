// src/ui/components/MoreOptions.tsx
import type { ComponentChildren } from "preact";
import { useContext, useRef } from "preact/hooks";
import { ValidationContext } from "../validation";

export interface MoreOptionsProps {
  open: boolean;
  /** Validation paths of the fields inside; an error at one opens the section. */
  errorPaths?: readonly string[];
  children: ComponentChildren;
}

export function MoreOptions({ open, errorPaths = [], children }: MoreOptionsProps) {
  const notices = useContext(ValidationContext);
  const hasError = notices.some(
    (n) => n.level === "error" && n.path && errorPaths.includes(n.path),
  );
  // Once an error has opened it, it stays open, so it does not collapse as the user fixes the error.
  const forced = useRef(false);
  if (hasError) {
    forced.current = true;
  }
  return (
    <details class="more-options" open={open || forced.current}>
      <summary>More options</summary>
      <div class="form-grid">{children}</div>
    </details>
  );
}
