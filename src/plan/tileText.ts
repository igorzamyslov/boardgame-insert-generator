// src/plan/tileText.ts
// The name pill of a plan tile, cut to the room its tile leaves (Main's pill: one line, 13 px 600).

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

/** Average character width as a share of the font size (Figtree 600 mixed case is about 0.5): the pill's own CSS catches a wide name. */
const CHAR_WIDTH = 0.5;
/** The pill's own vertical padding (2 px each side) and a line's height at `normal`. */
const PILL_PAD_Y = 4;
const LINE_HEIGHT = 1.25;
/** The shortest cut worth showing: four characters. */
const MIN_CHARS = 4;

/** The characters a person sees: an emoji or an accented letter is one, never cut in two. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      (g) => g.segment,
    );
  }
  return Array.from(text);
}

/**
 * The name as its pill shows it, for a tile `tile.w` by `tile.h` px: whole when it fits, cut with
 * an ellipsis to what the width allows, and null (no pill) when not even four characters fit or the
 * tile is too short for a line. jsdom has no layout, so this is an estimate; the pill's own CSS
 * (`overflow: hidden; text-overflow: ellipsis`) catches what the estimate lets through. The whole
 * name stays in the tile's accessible name and title.
 */
export function pillName(
  name: string,
  tile: { w: number; h: number },
  pill: PillType,
  withIcon = false,
): string | null {
  if (name === "" || tile.h - 2 * pill.inset < pill.font * LINE_HEIGHT + PILL_PAD_Y) {
    return null;
  }
  const icon = withIcon ? pill.icon + pill.gap : 0;
  const room = Math.floor(
    (tile.w - 2 * pill.inset - 2 * pill.padX - icon) / (pill.font * CHAR_WIDTH),
  );
  const chars = graphemes(name);
  if (chars.length <= room) {
    return name;
  }
  if (room < MIN_CHARS) {
    return null;
  }
  return `${chars
    .slice(0, room - 1)
    .join("")
    .trimEnd()}…`;
}
