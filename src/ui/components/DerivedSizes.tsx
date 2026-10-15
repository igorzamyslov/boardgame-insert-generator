// src/ui/components/DerivedSizes.tsx
import { useContext } from "preact/hooks";
import type { Component } from "../../model/types";
import { derivedSizes } from "../derived";
import { SettingsContext } from "../validation";
import type { EditorProps } from "./types";

/**
 * What the presets above add up to, so a user can hold a ruler to a real deck instead of printing
 * a tray to find out. Each line is one deck, item or figure; none for a kind with nothing derived
 * (custom) or a component with an error to fix first.
 */
export function DerivedSizes({
  component: c,
  index,
}: Pick<EditorProps<Component>, "component" | "index">) {
  const settings = useContext(SettingsContext);
  const lines = derivedSizes(c, settings, index);
  if (lines.length === 0) {
    return null;
  }
  return (
    <div
      class="derived-sizes"
      id={`${c.id}-derived`}
      role="group"
      aria-label="Sizes worked out from these settings"
    >
      <p class="hint">Worked out from these settings, with clearance in the wells:</p>
      {lines.map((line) => (
        <p class="hint" key={line}>
          {line}
        </p>
      ))}
    </div>
  );
}
