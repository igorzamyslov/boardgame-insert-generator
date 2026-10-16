// src/plan/tileText.ts
import type { SvgRect } from "./layers";

/** The name pill of a tile, and the size line under it, all in SVG units. */
export interface TileText {
  /** Font size of the name and the size line. */
  fontSize: number;
  /** Font size of the size line. */
  sizeFontSize: number;
  /** The pill behind the name, centred on the tile; null when the name does not fit. */
  pill: { x: number; y: number; w: number; h: number } | null;
  /** The name as shown (cut with an ellipsis when it does not fit) and its centre line. */
  name: { text: string; y: number } | null;
  /** The size under the pill, dropped when the tile is too small for it. */
  size: { text: string; y: number } | null;
}

/** Average character width as a share of the font size: wide enough for capitals and the fallback font. */
const CHAR_WIDTH = 0.6;
const MARGIN = 2;
const MIN_FONT = 3.5;
const MAX_FONT = 7;
/** Room inside the pill, each side of the text, as a share of the font size. */
const PAD_X = 0.7;
const PILL_HEIGHT = 1.7;

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

const mm = (v: number): string => String(Math.round(v * 10) / 10);

/** "W × D" in mm, without the unit (the details carry it). */
export function sizeText(w: number, d: number): string {
  return `${mm(w)} × ${mm(d)}`;
}

/**
 * Lay the name pill and the size out in a tile. The name is cut with an ellipsis to what fits
 * the width, and left out (with its pill) when not even four characters fit; the size line is
 * dropped first when the tile is too short for both. The full name stays in the tile's accessible
 * name and its title, so nothing is lost when it is cut here.
 */
export function layoutTileText(r: SvgRect, name: string, size: string): TileText {
  const fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, Math.min(r.w, r.h) * 0.12));
  const sizeFont = fontSize * 0.85;
  const pillH = fontSize * PILL_HEIGHT;
  const room = Math.floor((r.w - 2 * MARGIN - 2 * PAD_X * fontSize) / (fontSize * CHAR_WIDTH));
  let shown: string | null = null;
  const chars = graphemes(name);
  if (name !== "") {
    if (chars.length <= room) {
      shown = name;
    } else if (room >= 4) {
      shown = `${chars
        .slice(0, room - 1)
        .join("")
        .trimEnd()}…`;
    }
  }
  const sizeRoom = Math.floor((r.w - 2 * MARGIN) / (sizeFont * CHAR_WIDTH));
  let sizeLine: string | null = size.length <= sizeRoom ? size : null;
  const sizeH = sizeFont * 1.3;
  const height = (pill: boolean, line: boolean): number =>
    (pill ? pillH : 0) + (pill && line ? 2 : 0) + (line ? sizeH : 0);
  const space = r.h - 2 * MARGIN;
  if (shown !== null && sizeLine !== null && height(true, true) > space) {
    sizeLine = null;
  }
  if (shown !== null && height(true, false) > space) {
    shown = null;
  }
  if (shown === null && sizeLine !== null && height(false, true) > space) {
    sizeLine = null;
  }
  const total = height(shown !== null, sizeLine !== null);
  const top = r.y + (r.h - total) / 2;
  const pill =
    shown === null
      ? null
      : (() => {
          const w = Math.min(
            r.w - 2 * MARGIN,
            graphemes(shown).length * fontSize * CHAR_WIDTH + 2 * PAD_X * fontSize,
          );
          return { x: r.x + (r.w - w) / 2, y: top, w, h: pillH };
        })();
  const sizeY = top + (pill ? pillH + 2 : 0) + sizeH / 2;
  return {
    fontSize,
    sizeFontSize: sizeFont,
    pill,
    name: shown === null ? null : { text: shown, y: top + pillH / 2 },
    size: sizeLine === null ? null : { text: sizeLine, y: sizeY },
  };
}
