// Sizing does its layout arithmetic in integer 0.01 mm units ("u") so that
// rounding is exact and deterministic. Public results are converted back to mm.

/** Float-noise tolerance for rounding a computed value up or down to a whole number. */
export const ROUNDING_TOLERANCE = 1e-6;

export function toU(mm: number): number {
  return Math.round(mm * 100);
}

/** Smallest whole unit count ≥ mm (ROUNDING_TOLERANCE u for float noise). Used for minimums. */
export function ceilU(mm: number): number {
  return Math.ceil(mm * 100 - ROUNDING_TOLERANCE);
}

/** Largest whole unit count ≤ mm (ROUNDING_TOLERANCE u for float noise). Used for outer sizes. */
export function floorU(mm: number): number {
  return Math.floor(mm * 100 + ROUNDING_TOLERANCE);
}

export function fromU(u: number): number {
  return u / 100;
}

export function round2(mm: number): number {
  return Math.round(mm * 100) / 100;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}

/** Largest value; 0 for an empty list (all inputs are lengths ≥ 0). */
export function maxOf(values: readonly number[]): number {
  let best = 0;
  for (const v of values) {
    if (v > best) {
      best = v;
    }
  }
  return best;
}

/** Splits an integer total into n integer shares; the first (total mod n) get one more. */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) {
    return [];
  }
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Water-fills an integer total into entries capped by `caps`; returns the allocation. */
export function fillCapped(total: number, caps: readonly number[]): number[] {
  const alloc = caps.map(() => 0);
  const room = (i: number): number => (caps[i] ?? 0) - (alloc[i] ?? 0);
  const openIndices = (): number[] => caps.flatMap((_, i) => (room(i) > 0 ? [i] : []));
  let remaining = total;
  let open = openIndices();
  while (remaining > 0 && open.length > 0) {
    const share = Math.floor(remaining / open.length);
    if (share === 0) {
      for (const i of open.slice(0, remaining)) {
        alloc[i] = (alloc[i] ?? 0) + 1;
      }
      return alloc;
    }
    for (const i of open) {
      const given = Math.min(share, room(i));
      alloc[i] = (alloc[i] ?? 0) + given;
      remaining -= given;
    }
    open = openIndices();
  }
  return alloc;
}
