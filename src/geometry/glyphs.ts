// The block font of engraved tray names (spec §6.1 "Part names"). There is no font file here: each
// character is a 3 by 5 bitmap, and each lit cell is one stroke wide, so every stroke is `u` wide
// and every gap between strokes is `u` too. The geometry layer cuts each rectangle as a recess
// (engrave.ts). Letters are drawn as capitals only; a diagonal is a step of cells, so M, N, V, W,
// X, K, S and Z read as the block letters of a small display, and 0 and O differ only by their
// corners.

/** A rectangle in stroke units: x along the line of text, z up, from the text's lower left. */
export interface GlyphRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A character is this many strokes wide and tall; strokes and the gaps between them are one each. */
export const GLYPH_COLS = 3;
export const GLYPH_ROWS = 5;
/** The space between two characters of a text, in strokes. */
export const GLYPH_GAP = 1.5;
/** A space is this wide, in strokes (the gaps on both sides come on top of it). */
const SPACE_WIDTH = 1;

// Each glyph is five rows of three cells, top row first; "#" is a stroke.
const BITMAPS: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": ["..#", "..#", "..#", "..#", "..#"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["###", "#.#", "###", "#..", "#.."],
  Q: ["###", "#.#", "#.#", "###", "..#"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", ".#.", ".#."],
  W: ["#.#", "#.#", "###", "###", "#.#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "-": ["...", "...", "###", "...", "..."],
  " ": [".", ".", ".", ".", "."],
};

/** Whether the font has a glyph for every character of the text (case is folded: capitals only). */
export function isEngravable(text: string): boolean {
  return [...text.toUpperCase()].every((ch) => BITMAPS[ch] !== undefined);
}

function bitmapOf(ch: string): readonly string[] {
  const bitmap = BITMAPS[ch.toUpperCase()];
  if (bitmap === undefined) {
    throw new RangeError(`"${ch}" has no glyph`);
  }
  return bitmap;
}

/**
 * The strokes of one character, from its lower left corner: every maximal horizontal run of lit
 * cells, and every maximal vertical run of two or more (a cell that is only part of one of those
 * has no stroke of its own). Two lit cells that share an edge always lie
 * in one run, so no two strokes meet along a bare face (the cutter of such a pair would leave a
 * sliver of wall standing between them); strokes overlap where runs cross.
 */
export function glyphRects(ch: string): GlyphRect[] {
  const bitmap = bitmapOf(ch);
  const rects: GlyphRect[] = [];
  const lit = (col: number, row: number): boolean => bitmap[row]?.[col] === "#";
  // `row` counts down from the top; z counts up from the bottom.
  const zOf = (row: number): number => GLYPH_ROWS - 1 - row;
  for (let row = 0; row < GLYPH_ROWS; row += 1) {
    for (let col = 0; col < GLYPH_COLS; col += 1) {
      if (!lit(col, row) || lit(col - 1, row)) {
        continue;
      }
      let end = col;
      while (lit(end + 1, row)) {
        end += 1;
      }
      // A lone cell that a vertical run of two or more covers is that run's.
      if (end === col && (lit(col, row - 1) || lit(col, row + 1))) {
        continue;
      }
      rects.push({ x0: col, x1: end + 1, z0: zOf(row), z1: zOf(row) + 1 });
    }
  }
  for (let col = 0; col < GLYPH_COLS; col += 1) {
    for (let row = 0; row < GLYPH_ROWS; row += 1) {
      if (!lit(col, row) || lit(col, row - 1)) {
        continue;
      }
      let end = row;
      while (lit(col, end + 1)) {
        end += 1;
      }
      if (end > row) {
        rects.push({ x0: col, x1: col + 1, z0: zOf(end), z1: zOf(row) + 1 });
      }
    }
  }
  return rects;
}

function widthOf(ch: string): number {
  bitmapOf(ch);
  return ch === " " ? SPACE_WIDTH : GLYPH_COLS;
}

/**
 * Width in strokes of a text; 0 for the empty text. Throws a RangeError for a character the font
 * lacks (check with `isEngravable`).
 */
export function textWidth(text: string): number {
  const chars = [...text];
  if (chars.length === 0) {
    return 0;
  }
  return chars.reduce((sum, ch) => sum + widthOf(ch), 0) + (chars.length - 1) * GLYPH_GAP;
}

/**
 * The strokes of a text, in strokes from the lower left corner of its first character. Throws a
 * RangeError for a character the font lacks (check with `isEngravable`).
 */
export function textRects(text: string): GlyphRect[] {
  let at = 0;
  const out: GlyphRect[] = [];
  for (const ch of text) {
    for (const r of glyphRects(ch)) {
      out.push({ ...r, x0: r.x0 + at, x1: r.x1 + at });
    }
    at += widthOf(ch) + GLYPH_GAP;
  }
  return out;
}
