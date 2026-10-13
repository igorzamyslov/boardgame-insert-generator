// src/ui/components/MoreOptions.tsx
import type { ComponentChildren } from "preact";
import { useContext, useRef } from "preact/hooks";
import { Advanced } from "../Advanced";
import { ValidationContext } from "../validation";

export interface MoreOptionsProps {
  /** Advanced mode: shown. Otherwise only an error in one of the fields shows them. */
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
  if (!open && !forced.current) {
    return null;
  }
  return <Advanced>{children}</Advanced>;
}
