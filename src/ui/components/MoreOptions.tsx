// src/ui/components/MoreOptions.tsx
import type { ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { Disclosure } from "../../kit";
import type { Component } from "../../model/types";
import { SettingsContext } from "../validation";
import { useOpenOnError } from "./controls";
import { useItemGroup } from "./GroupRow";
import { moreSummary } from "./moreSummary";

export interface MoreOptionsProps {
  /**
   * The component whose options these are. The line next to "More options" says what is inside in
   * a few words (Edit's "Finger cuts on, stands upright") and how many options differ from their
   * default: as many as the rows inside that show the changed dot.
   */
  component: Component;
  /** Validation paths of the fields inside; an error at one (or below it) opens the section. */
  errorPaths?: readonly string[];
  children: ComponentChildren;
}

/**
 * The options most people never touch, folded under "More options" and opening in place. An error
 * inside opens it, and it stays open once an error brought it up.
 */
export function MoreOptions({ component, errorPaths = [], children }: MoreOptionsProps) {
  const settings = useContext(SettingsContext);
  const grouped = useItemGroup() !== undefined;
  const [open, setOpen] = useOpenOnError(errorPaths);
  return (
    <Disclosure
      title="More options"
      summary={moreSummary(component, settings, grouped)}
      open={open}
      onOpenChange={setOpen}
    >
      {children}
    </Disclosure>
  );
}
