// src/geometry/glyphs.ts
// The font of engraved tray names (spec §6.1 "Part names"): outlines of Overpass Bold (SIL OFL 1.1),
// a subset (name-font-data.ts) of capitals, digits, hyphen and space. Pure geometry, no kernel:
// the planners measure a name here, and the geometry layer cuts its polygons as a CrossSection
// (engrave.ts). Text is set in capitals only; its size is its capital height.

import { FONT_CAP_HEIGHT, FONT_GLYPHS, FONT_KERNING } from "./name-font-data";

/** A point, mm. */
export type Point = [number, number];

/**
 * The capital heights a name may have, mm, largest first. The planners take the largest that fits,
 * so a name is as large as the room allows; the smallest is the least that reads (the owner printed
 * all four, 2026-10-24).
 */
export const CAP_SIZES_MM = [8, 6, 5, 4] as const;
/** The largest and the smallest of them. */
export const CAP_MAX_MM = 8;
export const CAP_MIN_MM = 4;
/** A capital height at least this large is a good size; the smallest sizes are only a last resort. */
export const CAP_GOOD_MM = 6;
/**
 * The smallest size a name is worth printing at in full: a name that fits a face at this size or
 * larger is taken as it is, and one that fits only at the smallest size gives way to a shorter
 * version of itself that fits at this one (`planNamed`).
 */
export const CAP_WORTH_MM = 5;

/** A text laid out at one size: closed polygons in mm, x along the line, y up, from its ink's lower left. */
export interface TextLayout {
  polygons: Point[][];
  /** The width and height of the ink, mm (an accent or a descender makes it taller than the cap). */
  width: number;
  height: number;
}

interface Glyph {
  adv: number;
  contours: [number, number][][];
}

const parsed = new Map<string, Glyph>();

function glyphOf(ch: string): Glyph {
  const cached = parsed.get(ch);
  if (cached !== undefined) {
    return cached;
  }
  const raw = FONT_GLYPHS[ch];
  if (raw === undefined) {
    throw new RangeError(`"${ch}" has no glyph`);
  }
  const glyph: Glyph = {
    adv: raw.adv,
    contours:
      raw.c === ""
        ? []
        : raw.c.split("|").map((contour) =>
            contour.split(" ").map((pair) => {
              const [x, y] = pair.split(",");
              return [Number(x), Number(y)] as [number, number];
            }),
          ),
  };
  parsed.set(ch, glyph);
  return glyph;
}

/** Whether the font has a glyph for every character of the text (case is folded: capitals only). */
export function isEngravable(text: string): boolean {
  return [...text.toUpperCase()].every((ch) => FONT_GLYPHS[ch] !== undefined);
}

const layouts = new Map<string, TextLayout | null>();

/**
 * A text set at capital height `cap`, mm: advances and the font's kerning pairs, as the font sets
 * it. Null when it has no ink (empty, or only spaces). Throws a RangeError for a character the
 * font lacks (check with `isEngravable`). The result is cached and must not be changed.
 */
export function layoutText(text: string, cap: number): TextLayout | null {
  const key = `${cap}:${text}`;
  const cached = layouts.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const scale = cap / FONT_CAP_HEIGHT;
  const chars = [...text.toUpperCase()];
  const placed: Point[][] = [];
  let pen = 0;
  chars.forEach((ch, i) => {
    const glyph = glyphOf(ch);
    for (const contour of glyph.contours) {
      placed.push(contour.map(([x, y]): Point => [(pen + x) * scale, y * scale]));
    }
    const next = chars[i + 1];
    pen += glyph.adv + (next === undefined ? 0 : (FONT_KERNING[ch + next] ?? 0));
  });
  let result: TextLayout | null = null;
  if (placed.length > 0) {
    const xs = placed.flatMap((c) => c.map((p) => p[0]));
    const ys = placed.flatMap((c) => c.map((p) => p[1]));
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    result = {
      polygons: placed.map((c) => c.map(([x, y]): Point => [x - x0, y - y0])),
      width: Math.max(...xs) - x0,
      height: Math.max(...ys) - y0,
    };
  }
  layouts.set(key, result);
  return result;
}
