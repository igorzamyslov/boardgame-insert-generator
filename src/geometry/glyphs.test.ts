import { describe, expect, it } from "vitest";
import {
  GLYPH_COLS,
  GLYPH_GAP,
  GLYPH_ROWS,
  glyphRects,
  isEngravable,
  textRects,
  textWidth,
} from "./glyphs";

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const DIGITS = [..."0123456789"];

describe("the block font", () => {
  it("draws every letter within the 3x5 grid", () => {
    for (const ch of [...LETTERS, ...DIGITS, "-"]) {
      const rects = glyphRects(ch);
      expect(rects.length, ch).toBeGreaterThan(0);
      for (const r of rects) {
        expect(r.x0, ch).toBeGreaterThanOrEqual(0);
        expect(r.z0, ch).toBeGreaterThanOrEqual(0);
        expect(r.x1, ch).toBeLessThanOrEqual(GLYPH_COLS);
        expect(r.z1, ch).toBeLessThanOrEqual(GLYPH_ROWS);
        expect(r.x1 - r.x0, ch).toBeGreaterThanOrEqual(1);
        expect(r.z1 - r.z0, ch).toBeGreaterThanOrEqual(1);
        // strokes lie on whole cells
        expect([r.x0, r.x1, r.z0, r.z1].every(Number.isInteger), ch).toBe(true);
      }
    }
  });

  it("tells the letters and digits apart", () => {
    const shapes = [...LETTERS, ...DIGITS].map((ch) => JSON.stringify(glyphRects(ch)));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("draws a space as no stroke, narrower than a letter", () => {
    expect(glyphRects(" ")).toEqual([]);
    expect(textWidth(" ")).toBeLessThan(textWidth("A"));
  });

  it("leaves a stroke between separate strokes and no bare edge between joined ones", () => {
    for (const ch of [...LETTERS, ...DIGITS, "-"]) {
      const rects = glyphRects(ch);
      for (const a of rects) {
        for (const b of rects) {
          if (a === b) {
            continue;
          }
          const gapX = Math.max(a.x0 - b.x1, b.x0 - a.x1);
          const gapZ = Math.max(a.z0 - b.z1, b.z0 - a.z1);
          // overlapping or touching: one stroke joined to another; else a whole stroke apart
          expect(gapX <= 0 && gapZ <= 0 ? 0 : Math.max(gapX, gapZ), ch).not.toBeLessThan(
            gapX <= 0 && gapZ <= 0 ? 0 : 1,
          );
        }
      }
      // where two strokes meet along an edge, a third crosses that edge over its whole length, so
      // no sliver of wall is left standing between them
      for (const a of rects) {
        for (const b of rects) {
          if (a === b) {
            continue;
          }
          const edges: { across: "x" | "z"; at: number; lo: number; hi: number }[] = [];
          const zLo = Math.max(a.z0, b.z0);
          const zHi = Math.min(a.z1, b.z1);
          const xLo = Math.max(a.x0, b.x0);
          const xHi = Math.min(a.x1, b.x1);
          if ((a.x1 === b.x0 || b.x1 === a.x0) && zHi > zLo) {
            edges.push({ across: "x", at: a.x1 === b.x0 ? a.x1 : b.x1, lo: zLo, hi: zHi });
          }
          if ((a.z1 === b.z0 || b.z1 === a.z0) && xHi > xLo) {
            edges.push({ across: "z", at: a.z1 === b.z0 ? a.z1 : b.z1, lo: xLo, hi: xHi });
          }
          for (const e of edges) {
            for (let c = e.lo + 0.5; c < e.hi; c += 1) {
              const crossed = rects.some((r) =>
                e.across === "x"
                  ? r.x0 < e.at && r.x1 > e.at && r.z0 < c && r.z1 > c
                  : r.z0 < e.at && r.z1 > e.at && r.x0 < c && r.x1 > c,
              );
              expect(crossed, `${ch}: a bare edge between two strokes`).toBe(true);
            }
          }
        }
      }
    }
  });

  it("lays characters side by side", () => {
    expect(textWidth("A")).toBe(3);
    expect(textWidth("AB")).toBe(3 + GLYPH_GAP + 3);
    expect(textWidth("A B")).toBe(3 + GLYPH_GAP + 1 + GLYPH_GAP + 3);
    expect(textWidth("")).toBe(0);
    expect(Math.max(...textRects("AB").map((r) => r.x1))).toBe(textWidth("AB"));
    expect(Math.min(...textRects("A B").map((r) => r.x0))).toBe(0);
  });

  it("folds case and refuses what it cannot draw", () => {
    expect(textRects("dice")).toEqual(textRects("DICE"));
    expect(isEngravable("Wooden meeples 12-B")).toBe(true);
    expect(isEngravable("Dice!")).toBe(false);
    expect(isEngravable("Карты")).toBe(false);
    expect(() => textRects("Dice!")).toThrow(RangeError);
    expect(() => textWidth("é")).toThrow(RangeError);
  });
});
