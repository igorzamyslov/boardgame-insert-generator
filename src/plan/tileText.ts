// src/plan/tileText.ts
import { labelFontSize } from "./layers";
import type { SvgRect } from "./layers";

export interface TileText {
  /** Font size of the tray number, in SVG units. */
  numberSize: number;
  /** Centre line of the number. */
  numberY: number;
  /** Font size of the name and size lines. */
  smallSize: number;
  name: { text: string; y: number } | null;
  size: { text: string; y: number } | null;
}

const CHAR_WIDTH = 0.55;
const MARGIN = 4;

const mm = (v: number): string => String(Math.round(v * 10) / 10);

/** "W × D" in mm, without the unit (the accessible name carries it). */
export function sizeText(w: number, d: number): string {
  return `${mm(w)} × ${mm(d)}`;
}

/** "W by D millimetres" for the accessible name of a tray. */
export function sizeWords(w: number, d: number): string {
  return `${mm(w)} by ${mm(d)} millimetres`;
}

/**
 * Lay the number, the name and the size out in a tile, all in SVG units. The name is cut to what
 * fits the width; the size line, then the name, are dropped when the tile is too small. The
 * number is always kept.
 */
export function layoutTileText(r: SvgRect, name: string, size: string): TileText {
  const numberSize = labelFontSize(r);
  const smallSize = Math.max(3, Math.min(5.5, numberSize * 0.4));
  const lineH = smallSize * 1.3;
  const fit = (text: string): string | null => {
    const room = Math.floor((r.w - MARGIN) / (smallSize * CHAR_WIDTH));
    if (text.length <= room) {
      return text;
    }
    return room >= 4 ? `${text.slice(0, room - 1)}…` : null;
  };
  let nameText = name === "" ? null : fit(name);
  let sizeLine = fit(size);
  const height = (lines: number): number => numberSize + (lines > 0 ? 1 + lines * lineH : 0);
  const room = r.h - MARGIN;
  if (nameText !== null && sizeLine !== null && height(2) > room) {
    sizeLine = null;
  }
  if (nameText !== null && height(1) > room) {
    nameText = null;
  }
  if (nameText === null && sizeLine !== null && height(1) > room) {
    sizeLine = null;
  }
  const lines = (nameText === null ? 0 : 1) + (sizeLine === null ? 0 : 1);
  const top = r.y + (r.h - height(lines)) / 2;
  const first = top + numberSize + 1 + lineH / 2;
  return {
    numberSize,
    numberY: top + numberSize / 2,
    smallSize,
    name: nameText === null ? null : { text: nameText, y: first },
    size: sizeLine === null ? null : { text: sizeLine, y: first + (nameText === null ? 0 : lineH) },
  };
}
