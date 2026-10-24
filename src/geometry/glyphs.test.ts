import { describe, expect, it } from "vitest";
import { CAP_SIZES_MM, isEngravable, layoutText } from "./glyphs";
import { FONT_GLYPHS } from "./name-font-data";

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const DIGITS = [..."0123456789"];

describe("the name font (Overpass Bold, subset)", () => {
  it("has A-Z, 0-9, hyphen and space, and folds case", () => {
    for (const ch of [...LETTERS, ...DIGITS, "-", " "]) {
      expect(FONT_GLYPHS[ch], ch).toBeDefined();
    }
    expect(isEngravable("Cards 12-B")).toBe(true);
    expect(isEngravable("cards")).toBe(true);
    expect(isEngravable("Dice!")).toBe(false);
    expect(isEngravable("Ä")).toBe(false);
    expect(layoutText("Cards", 8)).toEqual(layoutText("CARDS", 8));
  });

  it("sets every letter and digit one capital high, as sharp outlines with no stray points", () => {
    for (const ch of [...LETTERS, ...DIGITS, "-"]) {
      const l = layoutText(ch, 8);
      expect(l, ch).not.toBeNull();
      expect(l?.polygons.length, ch).toBeGreaterThan(0);
      for (const poly of l?.polygons ?? []) {
        expect(poly.length, ch).toBeGreaterThanOrEqual(3);
        for (const [x, y] of poly) {
          expect(Number.isFinite(x) && Number.isFinite(y), ch).toBe(true);
        }
      }
    }
    // a capital is 8 mm tall, a round one overshoots by a few percent, the Q's tail hangs a little
    for (const ch of LETTERS) {
      const h = layoutText(ch, 8)?.height ?? 0;
      expect(h, ch).toBeGreaterThanOrEqual(7.9);
      expect(h, ch).toBeLessThan(9.5);
    }
  });

  it("starts the ink at the origin and measures it", () => {
    for (const text of ["T", "Cards", "Wooden Mee"]) {
      const l = layoutText(text, 6);
      const xs = (l?.polygons ?? []).flatMap((c) => c.map((p) => p[0]));
      const ys = (l?.polygons ?? []).flatMap((c) => c.map((p) => p[1]));
      expect(Math.min(...xs)).toBeCloseTo(0, 9);
      expect(Math.min(...ys)).toBeCloseTo(0, 9);
      expect(Math.max(...xs)).toBeCloseTo(l?.width ?? NaN, 9);
      expect(Math.max(...ys)).toBeCloseTo(l?.height ?? NaN, 9);
    }
  });

  it("scales with the size: 6 mm is three quarters of 8 mm", () => {
    const a = layoutText("Cards", 8);
    const b = layoutText("Cards", 6);
    expect((b?.width ?? 0) / (a?.width ?? 1)).toBeCloseTo(0.75, 6);
    expect((b?.height ?? 0) / (a?.height ?? 1)).toBeCloseTo(0.75, 6);
  });

  it("leaves a letter's counter as a contour of its own (O, A, B, 8, 0)", () => {
    for (const [ch, n] of [
      ["O", 2],
      ["A", 2],
      ["B", 3],
      ["8", 3],
      ["0", 2],
      ["I", 1],
      ["L", 1],
    ] as const) {
      expect(layoutText(ch, 8)?.polygons.length, ch).toBe(n);
    }
  });

  it("kerns pairs: AV sets closer than A and V apart", () => {
    const av = layoutText("AV", 8)?.width ?? 0;
    const a = layoutText("A", 8)?.width ?? 0;
    const v = layoutText("V", 8)?.width ?? 0;
    expect(av).toBeLessThan(a + v);
  });

  it("sets a space with no ink and a space between words", () => {
    expect(layoutText("", 8)).toBeNull();
    expect(layoutText("   ", 8)).toBeNull();
    const joined = layoutText("AB", 8)?.width ?? 0;
    const spaced = layoutText("A B", 8)?.width ?? 0;
    expect(spaced).toBeGreaterThan(joined + 1);
  });

  it("keeps the thinnest stem at 4 mm under the thinnest feature: the owner's printed size", () => {
    // the I is one stem: 0.74 mm at 4 mm, which the owner accepted after printing it; 0.9 at 5 mm
    expect(layoutText("I", 4)?.width).toBeGreaterThan(0.6);
    expect(layoutText("I", 4)?.width).toBeLessThan(0.8);
    expect(layoutText("I", 5)?.width).toBeGreaterThanOrEqual(0.8);
  });

  it("offers 8, 6, 5 and 4 mm, largest first", () => {
    expect([...CAP_SIZES_MM]).toEqual([8, 6, 5, 4]);
  });

  it("throws for a character it lacks", () => {
    expect(() => layoutText("A!", 8)).toThrow(RangeError);
  });
});
