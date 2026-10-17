// src/ui/components/MoreOptions.tsx
import type { ComponentChildren } from "preact";
import { Disclosure } from "../../kit";
import { useOpenOnError } from "./controls";

export interface MoreOptionsProps {
  /** What is inside, in a few words (Edit's "Finger cuts on, stands upright"). */
  summary?: string;
  /** Validation paths of the fields inside; an error at one (or below it) opens the section. */
  errorPaths?: readonly string[];
  children: ComponentChildren;
}

/**
 * The options most people never touch, folded under "More options" and opening in place. An error
 * inside opens it, and it stays open once an error brought it up.
 */
export function MoreOptions({ summary, errorPaths = [], children }: MoreOptionsProps) {
  const [open, setOpen] = useOpenOnError(errorPaths);
  return (
    <Disclosure title="More options" summary={summary} open={open} onOpenChange={setOpen}>
      {children}
    </Disclosure>
  );
}
