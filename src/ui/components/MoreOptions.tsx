// src/ui/components/MoreOptions.tsx
import type { ComponentChildren } from "preact";
import { useContext, useRef } from "preact/hooks";
import { ValidationContext } from "../validation";

export interface MoreOptionsProps {
  /** Validation paths of the fields inside; an error at one (or below it) opens the section. */
  errorPaths?: readonly string[];
  children: ComponentChildren;
}

/** The fields most people never touch, folded under "More options". An error inside opens it. */
export function MoreOptions({ errorPaths = [], children }: MoreOptionsProps) {
  const notices = useContext(ValidationContext);
  const hasError = notices.some(
    (n) =>
      n.level === "error" &&
      n.path !== undefined &&
      errorPaths.some((p) => n.path === p || n.path?.startsWith(`${p}/`)),
  );
  // Once an error has opened it, it stays open, so it does not collapse as the user fixes the error.
  const forced = useRef(false);
  if (hasError) {
    forced.current = true;
  }
  return (
    <details class="pf-disc" open={forced.current || undefined}>
      <summary>More options</summary>
      <div class="pf-disc__body">
        <div class="form-grid">{children}</div>
      </div>
    </details>
  );
}
