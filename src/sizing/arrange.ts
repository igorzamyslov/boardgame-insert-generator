import { cutoutSides } from "./common";
import { MAX_SPLITS } from "./constants";
import type { CompartmentReq } from "./types";
import { sum } from "./units";

interface Indexed {
  c: CompartmentReq;
  i: number;
}

/** rows2: greedy by minW, largest first; row 0 holds ceil(n/2). Returns row 0 then row 1. */
export function rows2Order(compartments: readonly CompartmentReq[]): CompartmentReq[] {
  const n = compartments.length;
  const cap0 = Math.ceil(n / 2);
  const cap1 = n - cap0;
  const bySize = compartments
    .map((c, i): Indexed => ({ c, i }))
    .sort((a, b) => b.c.minW - a.c.minW || a.i - b.i);
  const row0: Indexed[] = [];
  const row1: Indexed[] = [];
  let width0 = 0;
  let width1 = 0;
  for (const item of bySize) {
    const toRow0 = row1.length >= cap1 || (width0 <= width1 && row0.length < cap0);
    if (toRow0) {
      row0.push(item);
      width0 += item.c.minW;
    } else {
      row1.push(item);
      width1 += item.c.minW;
    }
  }
  const byIndex = (a: Indexed, b: Indexed): number => a.i - b.i;
  return [...row0.sort(byIndex), ...row1.sort(byIndex)].map((x) => x.c);
}

/**
 * The row with the compartments that ask for a cutout on their left or right (cards and tiles
 * whose channel runs along the row) moved to its start, each group in its order: the first one's
 * cut leaves through the outer wall, and the ones after it can share its channel. Between bits,
 * minis or custom wells such a compartment had no free wall along the row (review 1, I2).
 */
export function cutsFirst(row: readonly CompartmentReq[]): CompartmentReq[] {
  const alongRow = (c: CompartmentReq): boolean =>
    cutoutSides(c.features).some((side) => side === "left" || side === "right");
  return [...row.filter(alongRow), ...row.filter((c) => !alongRow(c))];
}

export function blockWeight(block: readonly CompartmentReq[]): number {
  return sum(block.map((c) => c.minW * c.minD));
}

/** Contiguous split of blocks into 1–3 groups, minimising the heaviest group. */
export function splitBlocks(
  blocks: readonly CompartmentReq[][],
  parts: number,
): CompartmentReq[][][] | null {
  const n = blocks.length;
  if (parts < 1 || parts > MAX_SPLITS || n < parts) {
    return null;
  }
  const prefix: number[] = [0];
  for (const block of blocks) {
    prefix.push((prefix[prefix.length - 1] ?? 0) + blockWeight(block));
  }
  const p = (i: number): number => prefix[i] ?? 0;
  const weight = (a: number, b: number): number => p(b) - p(a);
  const cut = (cuts: readonly number[]): CompartmentReq[][][] => {
    const bounds = [0, ...cuts, n];
    return bounds.slice(1).map((end, i) => blocks.slice(bounds[i] ?? 0, end));
  };
  // Best single cut j in (lo, hi): minimises max(weight(lo, j), weight(j, hi)); ties → smaller j.
  const bestCut = (lo: number, hi: number): number => {
    const target = p(lo) + p(hi);
    let a = lo + 1;
    let b = hi - 1;
    while (a < b) {
      const mid = Math.floor((a + b) / 2);
      if (2 * p(mid) >= target) {
        b = mid;
      } else {
        a = mid + 1;
      }
    }
    const score = (j: number): number => Math.max(weight(lo, j), weight(j, hi));
    const prev = a - 1;
    return prev > lo && score(prev) <= score(a) ? prev : a;
  };
  if (parts === 1) {
    return cut([]);
  }
  if (parts === 2) {
    return cut([bestCut(0, n)]);
  }
  let best: { i: number; j: number; max: number; squares: number } | null = null;
  for (let i = 1; i <= n - 2; i++) {
    const j = bestCut(i, n);
    const ws = [weight(0, i), weight(i, j), weight(j, n)];
    const max = Math.max(...ws);
    const squares = sum(ws.map((w) => w * w));
    if (best === null || max < best.max || (max === best.max && squares < best.squares)) {
      best = { i, j, max, squares };
    }
  }
  return best === null ? null : cut([best.i, best.j]);
}
