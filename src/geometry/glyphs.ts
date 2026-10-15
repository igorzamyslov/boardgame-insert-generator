// Digit outlines for engraved part numbers (spec §6.1 "Part numbers"). There is no font here: each
// digit is a seven-segment figure, a union of axis-aligned rectangles on a grid of three columns
// by five rows of one stroke each, so every stroke is `u` wide and every gap between strokes is
// `u` too. The geometry layer cuts each rectangle as a recess (engrave.ts); only digits exist, as
// part numbers are whole numbers.

/** A rectangle in stroke units: x along the line of text, z up, from the digit's lower left. */
export interface GlyphRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A digit is this many strokes wide and tall; strokes and the gaps between them are one each. */
export const DIGIT_COLS = 3;
export const DIGIT_ROWS = 5;
/** The space between two digits of a number, in strokes. */
export const DIGIT_GAP = 1.5;

// The seven segments as [x0, z0, x1, z1] in strokes.
const SEGMENTS = {
  a: [0, 4, 3, 5], // top
  b: [2, 2, 3, 5], // upper right
  c: [2, 0, 3, 3], // lower right
  d: [0, 0, 3, 1], // bottom
  e: [0, 0, 1, 3], // lower left
  f: [0, 2, 1, 5], // upper left
  g: [0, 2, 3, 3], // middle
} as const;

type Segment = keyof typeof SEGMENTS;

const DIGITS: readonly (readonly Segment[])[] = [
  ["a", "b", "c", "d", "e", "f"], // 0
  ["b", "c"], // 1
  ["a", "b", "g", "e", "d"], // 2
  ["a", "b", "g", "c", "d"], // 3
  ["f", "g", "b", "c"], // 4
  ["a", "f", "g", "c", "d"], // 5
  ["a", "f", "g", "e", "d", "c"], // 6
  ["a", "b", "c"], // 7
  ["a", "b", "c", "d", "e", "f", "g"], // 8
  ["a", "b", "c", "d", "f", "g"], // 9
];

/** The strokes of one digit (0 to 9), in strokes from its lower left corner. */
export function digitRects(digit: number): GlyphRect[] {
  const segments = DIGITS[digit];
  if (!Number.isInteger(digit) || segments === undefined) {
    throw new RangeError(`${digit} is not a digit`);
  }
  return segments.map((s) => {
    const [x0, z0, x1, z1] = SEGMENTS[s];
    return { x0, z0, x1, z1 };
  });
}

/** Width in strokes of the text of a whole number n >= 0. */
export function numberWidth(n: number): number {
  const count = digitsOf(n).length;
  return count * DIGIT_COLS + (count - 1) * DIGIT_GAP;
}

function digitsOf(n: number): number[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`${n} is not a whole number`);
  }
  return [...String(n)].map(Number);
}

/**
 * The strokes of a whole number n >= 0 in strokes, from the lower left corner of its first digit;
 * a rectangle never overlaps another except where two strokes of one digit meet.
 */
export function numberRects(n: number): GlyphRect[] {
  return digitsOf(n).flatMap((digit, i) => {
    const shift = i * (DIGIT_COLS + DIGIT_GAP);
    return digitRects(digit).map((r) => ({ ...r, x0: r.x0 + shift, x1: r.x1 + shift }));
  });
}
