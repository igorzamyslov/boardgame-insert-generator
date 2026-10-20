// src/kit/icons.tsx
import type { JSX } from "preact";
import type { ComponentKind } from "../model/types";

/** What an icon needs besides its drawing: the stroke and the fill the boards use for it. */
interface Drawing {
  /** The stroke width on the 24 px grid (the boards use 1.8 for kinds, 2 to 2.6 for actions). */
  stroke: number;
  /** The shapes. */
  shapes: JSX.Element;
  /** `currentColor` fill, for the three dots. */
  filled?: boolean;
  /** Round joins and caps, as most of the boards draw. */
  round?: boolean;
}

/**
 * The icons the boards draw, as inline SVG on a 24 px grid in `currentColor`. They are hidden from
 * assistive technology: the control or the text beside them names the thing (DESIGN §2).
 * The five kinds are the boards' glyphs (Main's list, Empty's tiles).
 */
const DRAWINGS = {
  check: { stroke: 2.4, round: true, shapes: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  "chevron-down": { stroke: 2.2, round: true, shapes: <path d="M6 9l6 6 6-6" /> },
  "chevron-up": { stroke: 2.2, round: true, shapes: <path d="M6 15l6-6 6 6" /> },
  "chevron-right": { stroke: 2.2, round: true, shapes: <path d="M9 5l7 7-7 7" /> },
  "chevron-left": { stroke: 2.2, round: true, shapes: <path d="M15 5l-7 7 7 7" /> },
  "arrow-down": { stroke: 2.2, round: true, shapes: <path d="M12 5v14M6 13l6 6 6-6" /> },
  plus: { stroke: 2.4, round: true, shapes: <path d="M12 5v14M5 12h14" /> },
  minus: { stroke: 2.4, round: true, shapes: <path d="M5 12h14" /> },
  close: { stroke: 2.4, round: true, shapes: <path d="M6 6l12 12M18 6L6 18" /> },
  pencil: { stroke: 2, round: true, shapes: <path d="M4 20h4L19 9l-4-4L4 16z" /> },
  search: {
    stroke: 2,
    round: true,
    shapes: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </>
    ),
  },
  undo: {
    stroke: 2,
    round: true,
    shapes: (
      <>
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
      </>
    ),
  },
  redo: {
    stroke: 2,
    round: true,
    shapes: (
      <>
        <path d="M15 14l5-5-5-5" />
        <path d="M20 9H10a6 6 0 0 0 0 12h3" />
      </>
    ),
  },
  download: {
    stroke: 2,
    round: true,
    shapes: (
      <>
        <path d="M12 4v11" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 20h14" />
      </>
    ),
  },
  send: {
    stroke: 2,
    round: true,
    shapes: (
      <>
        <path d="M12 15V4M8 8l4-4 4 4" />
        <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
      </>
    ),
  },
  more: {
    stroke: 0,
    filled: true,
    shapes: (
      <>
        <circle cx="5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="19" cy="12" r="1.8" />
      </>
    ),
  },
  pin: {
    stroke: 2,
    round: true,
    shapes: (
      <>
        <path d="M9 4h6l-1 5 3 3H7l3-3z" />
        <path d="M12 12v8" />
      </>
    ),
  },
  turn: {
    stroke: 2,
    round: true,
    shapes: (
      <>
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </>
    ),
  },
  alert: {
    stroke: 2.2,
    round: true,
    shapes: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.5" />
      </>
    ),
  },
  warn: {
    stroke: 2.2,
    round: true,
    shapes: (
      <>
        <path d="M12 8v5" />
        <path d="M12 16.5v.5" />
        <path d="M10.3 3.9L2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </>
    ),
  },
  arc: { stroke: 2.4, round: true, shapes: <path d="M12 3a9 9 0 1 0 9 9" /> },
  box: {
    stroke: 1.8,
    shapes: (
      <>
        <path d="M3 8l9-4 9 4v9l-9 4-9-4z" />
        <path d="M3 8l9 4 9-4M12 12v9" />
      </>
    ),
  },
  printer: {
    stroke: 1.8,
    shapes: (
      <>
        <rect x="4" y="13" width="16" height="7" rx="1.5" />
        <path d="M7 13V5h10v8" />
      </>
    ),
  },
  // Export's Ko-fi pill
  heart: {
    stroke: 2,
    shapes: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  },
  file: {
    stroke: 1.8,
    shapes: (
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M9 12h7M9 16h5" />
      </>
    ),
  },
  cards: {
    stroke: 1.8,
    shapes: (
      <>
        <rect x="7" y="3" width="12" height="16" rx="2" />
        <path d="M5 7v12a2 2 0 0 0 2 2h9" />
      </>
    ),
  },
  bulk: {
    stroke: 1.8,
    shapes: (
      <>
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
      </>
    ),
  },
  tiles: {
    stroke: 1.8,
    shapes: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  minis: {
    stroke: 1.8,
    shapes: (
      <>
        <circle cx="12" cy="6.5" r="3" />
        <path d="M9.5 10.5h5l1.5 7h-8z" />
        <path d="M6 20.5h12" />
      </>
    ),
  },
  custom: {
    stroke: 1.8,
    shapes: <rect x="4" y="4" width="16" height="16" rx="2.5" stroke-dasharray="3 2.5" />,
  },
  // Not a kind: a group's glyph (G1, G3): a tray with two walls
  group: {
    stroke: 1.8,
    shapes: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M9 5v14M15 5v14" />
      </>
    ),
  },
} satisfies Record<string, Drawing>;

export type IconName = keyof typeof DRAWINGS;

export interface IconProps {
  name: IconName;
  /** Width and height in px. */
  size?: number;
}

/** An inline SVG icon, hidden from assistive technology. */
export function Icon({ name, size = 18 }: IconProps) {
  const drawing: Drawing = DRAWINGS[name];
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={drawing.filled ? "currentColor" : "none"}
      stroke={drawing.filled ? "none" : "currentColor"}
      stroke-width={drawing.stroke}
      stroke-linecap={drawing.round ? "round" : undefined}
      stroke-linejoin="round"
    >
      {drawing.shapes}
    </svg>
  );
}

/** The icon of a component kind. */
export function KindGlyph({ kind, size = 18 }: { kind: ComponentKind; size?: number }) {
  return <Icon name={kind} size={size} />;
}

/** A group's glyph: a tray with two walls, in `currentColor` (a group is not a kind of item). */
export function GroupGlyph({ size = 18 }: { size?: number }) {
  return <Icon name="group" size={size} />;
}

/**
 * The drag grip (G1): six dots, 3 across two columns, in `currentColor`. A pointer convenience, so
 * it is hidden from assistive technology (the keyboard's ways are the editors' Move buttons).
 */
export function GripIcon() {
  return (
    <svg aria-hidden="true" width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
      <circle cx="3" cy="3" r="1.5" />
      <circle cx="9" cy="3" r="1.5" />
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="9" cy="8" r="1.5" />
      <circle cx="3" cy="13" r="1.5" />
      <circle cx="9" cy="13" r="1.5" />
    </svg>
  );
}
