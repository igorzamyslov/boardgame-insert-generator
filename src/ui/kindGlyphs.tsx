// src/ui/kindGlyphs.tsx
import type { JSX } from "preact";
import type { ComponentKind } from "../model/types";

/**
 * The kind glyphs, drawn on a 24px grid for 1.5px strokes in currentColor, square caps, no fills.
 * Shared by the list swatches (KindIcon) and the plan tiles.
 */
export const KIND_GLYPHS: Record<ComponentKind, JSX.Element> = {
  cards: (
    <>
      <rect x="5" y="8" width="11" height="13" />
      <path d="M8 8V3h11v13h-3" />
    </>
  ),
  bulk: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </>
  ),
  tiles: (
    <>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </>
  ),
  minis: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M9.5 21l1.5-9h2l1.5 9zM7 21h10" />
    </>
  ),
  custom: <rect x="4" y="4" width="16" height="16" stroke-dasharray="3 3" />,
};
