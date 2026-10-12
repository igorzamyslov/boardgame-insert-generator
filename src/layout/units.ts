/**
 * Lengths inside the layout engine are integer hundredths of a millimetre ("units").
 * Rounding rules:
 * - toUCeil for minimum sizes (a tray is never smaller than required),
 * - toUFloor for available space (the box is never assumed larger than measured),
 * - toU (nearest) for settings and stored positions.
 * All arithmetic on units stays integer; products stay below 2^53.
 */
export type U = number;

export const U_PER_MM = 100;
const EPS = 1e-6;

function noNegZero(n: number): number {
  return n === 0 ? 0 : n;
}

export function toU(mm: number): U {
  return noNegZero(Math.round(mm * U_PER_MM));
}

export function toUCeil(mm: number): U {
  return noNegZero(Math.ceil(mm * U_PER_MM - EPS));
}

export function toUFloor(mm: number): U {
  return noNegZero(Math.floor(mm * U_PER_MM + EPS));
}

export function toMm(u: U): number {
  return noNegZero(u / U_PER_MM);
}

/** Round an mm value to the nearest 0.01 mm (used for rotated compartment coordinates). */
export function roundMm(mm: number): number {
  return toMm(toU(mm));
}

/** Smallest multiple of step that is ≥ u. A step ≤ 0 returns u unchanged. */
export function roundUpTo(u: U, step: U): U {
  if (step <= 0) {
    return u;
  }
  const r = ((u % step) + step) % step;
  return r === 0 ? u : u + step - r;
}

/** Largest multiple of step that is ≤ u. A step ≤ 0 returns u unchanged. */
export function roundDownTo(u: U, step: U): U {
  if (step <= 0) {
    return u;
  }
  const r = ((u % step) + step) % step;
  return u - r;
}

/** floor(a·b / c) for non-negative integers with a·b < 2^53. */
export function mulDiv(a: number, b: number, c: number): number {
  return Math.floor((a * b) / c);
}

/** Volume in whole mm³ (rounded down) of a box given in units; 0 for degenerate boxes. */
export function volMm3(w: U, d: U, h: U): number {
  if (w <= 0 || d <= 0 || h <= 0) {
    return 0;
  }
  return Math.floor((w * d * h) / 1_000_000);
}

/** A footprint extent in units: w along X, d along Y. */
export interface Ext {
  w: U;
  d: U;
}

/** An axis-aligned floor rectangle in units (min corner + extent). */
export interface Rect extends Ext {
  x: U;
  y: U;
}
