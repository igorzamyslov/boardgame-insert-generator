// src/ui/KindIcon.tsx
import type { ComponentKind } from "../model/types";
import { KIND_GLYPHS } from "./kindGlyphs";

/** A swatch for a component kind: its identity tint behind the kind's glyph. */
export function KindIcon({ kind }: { kind: ComponentKind }) {
  return (
    <span class="pf-swatch" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="square"
        stroke-linejoin="miter"
      >
        {KIND_GLYPHS[kind]}
      </svg>
    </span>
  );
}
