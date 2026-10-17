// src/plan/tileText.ts
// The name pill of a plan tile (Main's pill: one line, 13 px 600): whether its tile has room for one.

/** The pill's type, in CSS px, as Main (desktop) and MobileWorkspace (phone) draw it. */
export interface PillType {
  /** Font size. */
  font: number;
  /** Padding left and right of the text. */
  padX: number;
  /** The kind icon, shown while the tile is hovered, focused or selected, and the gap after it. */
  icon: number;
  gap: number;
  /** What the tile takes from the pill's room, each side: its 2 px line and its padding (a phone's has none). */
  inset: number;
}

export const DESKTOP_PILL: PillType = { font: 13, padX: 9, icon: 13, gap: 5, inset: 10 };
export const PHONE_PILL: PillType = { font: 12, padX: 7, icon: 12, gap: 4, inset: 2 };

/** Average character width as a share of the font size (Figtree 600 mixed case is about 0.5). */
const CHAR_WIDTH = 0.5;
/** The pill's own vertical padding (2 px each side) and a line's height at `normal`. */
const PILL_PAD_Y = 4;
const LINE_HEIGHT = 1.25;
/** The shortest cut worth showing: four characters. */
const MIN_CHARS = 4;

/**
 * Whether a tile `tile.w` by `tile.h` px has room for a name pill at all: a line's height, and
 * four characters' width (the cut itself is the pill's CSS, `overflow: hidden; text-overflow:
 * ellipsis`, which measures what jsdom cannot). Without room the tile has no pill; its name stays
 * in its accessible name and title.
 */
export function hasPillRoom(
  name: string,
  tile: { w: number; h: number },
  pill: PillType,
  withIcon = false,
): boolean {
  if (name === "" || tile.h - 2 * pill.inset < pill.font * LINE_HEIGHT + PILL_PAD_Y) {
    return false;
  }
  const icon = withIcon ? pill.icon + pill.gap : 0;
  const room = (tile.w - 2 * pill.inset - 2 * pill.padX - icon) / (pill.font * CHAR_WIDTH);
  return room >= Math.min(MIN_CHARS, graphemeCount(name));
}

function graphemeCount(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text))
      .length;
  }
  return Array.from(text).length;
}
