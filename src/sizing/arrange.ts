import { cutoutSides } from "./common";
import { MAX_SPLITS, MAX_WEIGHTED_SPLITS } from "./constants";
import type { CompartmentReq } from "./types";
import { ceilU, maxOf, sum } from "./units";

interface Indexed {
  c: CompartmentReq;
  i: number;
}

/** True when every compartment belongs to one member (an item's own blocks), false for a group's mix. */
export function isOneMember(compartments: readonly CompartmentReq[]): boolean {
  return compartments.every((c) => c.componentId === compartments[0]?.componentId);
}

/**
 * rows2 for the compartments of ONE member (an ungrouped item, or a part of a group holding one
 * member's blocks), as before 0.7.0: greedy by minW, largest first; row 0 holds ceil(n/2).
 * Returns row 0 then row 1. A part of several members keeps member order instead (`rows2Break`).
 * Columns of one member walk this order too.
 */
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
 * rows2 of a part that holds several members (a group's): where the ordered compartments are cut
 * into a front run and a back run (groups spec §6.5): how many stand in the front row, 1..n-1.
 * The cut is the one that makes the wider row (by the compartments' minimum widths) narrowest;
 * ties go to the smaller front row. The order itself is never changed. Needs at least two
 * compartments.
 */
export function rows2Break(compartments: readonly CompartmentReq[]): number {
  const n = compartments.length;
  const total = sum(compartments.map((c) => c.minW));
  let front = 0;
  let best = 1;
  let bestWidest = Number.POSITIVE_INFINITY;
  for (let j = 1; j < n; j++) {
    front += compartments[j - 1]?.minW ?? 0;
    const widest = Math.max(front, total - front);
    if (widest < bestWidest) {
      best = j;
      bestWidest = widest;
    }
  }
  return best;
}

/**
 * columns: where the ordered compartments start a new column (group-tray-fill spec §3 (b)), as the
 * indices of each column's first compartment after the first column, ascending. The limit is the
 * deepest compartment's minD: each compartment stacks front to back in the current column, a
 * `divider` (mm) after the one before it, while the column stays within the limit, else it starts
 * the next column to the right. Greedy and in order, as rows2Break is: the order given (member
 * order, or one member's rows2Order) is kept, nothing is moved. Compared in whole 0.01 mm units, as the layout is built.
 */
export function columnBreaks(compartments: readonly CompartmentReq[], divider: number): number[] {
  const limit = maxOf(compartments.map((c) => ceilU(c.minD)));
  const gap = ceilU(divider);
  const breaks: number[] = [];
  let depth = 0;
  compartments.forEach((c, i) => {
    const d = ceilU(c.minD);
    if (i > 0 && depth + gap + d <= limit) {
      depth += gap + d;
      return;
    }
    if (i > 0) {
      breaks.push(i);
    }
    depth = d;
  });
  return breaks;
}

/**
 * Each member's compartments with the ones that ask for a cutout on their left or right (cards and
 * tiles whose channel runs along the row) moved to the member's start, each group in its order: the
 * first one's cut leaves through the outer wall, and the ones after it can share its channel.
 * Between bits, minis or custom wells such a compartment had no free wall along the row (review 1,
 * I2). A member is a run of compartments with one `componentId`: member order is a promise (groups
 * spec §6.5), so a compartment never moves past another member's.
 */
export function cutsFirst(row: readonly CompartmentReq[]): CompartmentReq[] {
  const alongRow = (c: CompartmentReq): boolean =>
    cutoutSides(c.features).some((side) => side === "left" || side === "right");
  const out: CompartmentReq[] = [];
  let start = 0;
  while (start < row.length) {
    let end = start + 1;
    while (end < row.length && row[end]?.componentId === row[start]?.componentId) {
      end++;
    }
    const run = row.slice(start, end);
    out.push(...run.filter(alongRow), ...run.filter((c) => !alongRow(c)));
    start = end;
  }
  return out;
}

export function blockWeight(block: readonly CompartmentReq[]): number {
  return sum(block.map((c) => c.minW * c.minD));
}

/**
 * Contiguous split of blocks into 1–3 groups, minimising the heaviest group. A cut between members
 * (blocks of different `componentId`s) is taken instead of the best cut when it is as good (groups
 * spec §6.5): a split tray then keeps whole members together where the weights allow.
 */
export function splitBlocks(
  blocks: readonly CompartmentReq[][],
  parts: number,
): CompartmentReq[][][] | null {
  const n = blocks.length;
  if (parts < 1 || parts > MAX_WEIGHTED_SPLITS || n < parts) {
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
  // The cuts between members, in order.
  const boundaries: number[] = [];
  for (let j = 1; j < n; j++) {
    if (blocks[j - 1]?.[0]?.componentId !== blocks[j]?.[0]?.componentId) {
      boundaries.push(j);
    }
  }
  const isBoundary = (j: number): boolean => boundaries.includes(j);
  // bestCut, unless a cut between members is as good.
  const pick = (lo: number, hi: number): number => {
    const best = bestCut(lo, hi);
    const score = (j: number): number => Math.max(weight(lo, j), weight(j, hi));
    let chosen = best;
    for (const j of boundaries) {
      if (j > lo && j < hi && score(j) <= score(best) && (!isBoundary(chosen) || j < chosen)) {
        chosen = j;
      }
    }
    return chosen;
  };
  if (parts === 1) {
    return cut([]);
  }
  if (parts === 2) {
    return cut([pick(0, n)]);
  }
  let best: { i: number; j: number; max: number; squares: number; seams: number } | null = null;
  for (let i = 1; i <= n - 2; i++) {
    const j = pick(i, n);
    const ws = [weight(0, i), weight(i, j), weight(j, n)];
    const max = Math.max(...ws);
    const squares = sum(ws.map((w) => w * w));
    const seams = (isBoundary(i) ? 1 : 0) + (isBoundary(j) ? 1 : 0);
    const better =
      best === null ||
      max < best.max ||
      (max === best.max &&
        (squares < best.squares || (squares === best.squares && seams > best.seams)));
    if (better) {
      best = { i, j, max, squares, seams };
    }
  }
  return best === null ? null : cut([best.i, best.j]);
}

/**
 * The split of `blocks` into `parts` trays that is offered, or null when none is (owner,
 * 2026-10-23: "when an item is split it feels awkward when the split is 2:1:1 from 4 trays"). A
 * split is even: the same number of entries in every tray, so four entries go 2 + 2 or 1 + 1 + 1 + 1
 * and never 2 + 1 + 1. A part count that does not divide the entries is not offered when another
 * one up to MAX_SPLITS does; an item with no even split at all (five or seven entries) keeps the
 * weighted split `splitBlocks` finds, since an uneven split is all it can have. Contiguous, in
 * order, and never between the compartments of one block.
 */
export function offeredSplit(
  blocks: readonly CompartmentReq[][],
  parts: number,
): CompartmentReq[][][] | null {
  const n = blocks.length;
  if (parts < 1 || parts > MAX_SPLITS || n < parts) {
    return null;
  }
  if (parts === 1) {
    return [[...blocks]];
  }
  if (n % parts === 0) {
    const each = n / parts;
    return Array.from({ length: parts }, (_, i) => blocks.slice(i * each, (i + 1) * each));
  }
  for (let other = 2; other <= Math.min(MAX_SPLITS, n); other++) {
    if (n % other === 0) {
      return null;
    }
  }
  return splitBlocks(blocks, parts);
}
