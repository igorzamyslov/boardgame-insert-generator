import type { Ext, Rect, U } from "./units";

/** Usable print volume in units: (bedX − 2·bedMargin) × (bedY − 2·bedMargin) × bedZ. */
export interface Bed {
  readonly w: U;
  readonly d: U;
  readonly z: U;
}

/** The two XY orientations a part can be printed in. */
export function bedOrientations(bed: Bed): [Ext, Ext] {
  return [
    { w: bed.w, d: bed.d },
    { w: bed.d, d: bed.w },
  ];
}

/** How far a part exceeds the bed in its best orientation (0 when it fits). */
export function bedExcess(bed: Bed, w: U, d: U, h: U): U {
  const [a, b] = bedOrientations(bed);
  const ea = Math.max(0, w - a.w) + Math.max(0, d - a.d);
  const eb = Math.max(0, w - b.w) + Math.max(0, d - b.d);
  return Math.min(ea, eb) + Math.max(0, h - bed.z);
}

export function fitsBed(bed: Bed, w: U, d: U, h: U): boolean {
  return bedExcess(bed, w, d, h) === 0;
}

function splitExtent(total: U, n: number, gap: U): U[] {
  const avail = total - (n - 1) * gap;
  const base = Math.floor(avail / n);
  const extra = avail - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Splits a rectangle with further guillotine cuts (trayGap between pieces) until every
 * piece fits the bed in XY. Uses the orientation needing fewer pieces (ties: as-is).
 * Returns [rect] unchanged when it already fits or when the bed is degenerate.
 */
export function splitForBed(bed: Bed, rect: Rect, gap: U): Rect[] {
  if (bedExcess(bed, rect.w, rect.d, 0) === 0 || bed.w <= 0 || bed.d <= 0) {
    return [rect];
  }
  let best: { nx: number; ny: number } | null = null;
  for (const o of bedOrientations(bed)) {
    const nx = Math.max(1, Math.ceil((rect.w + gap) / (o.w + gap)));
    const ny = Math.max(1, Math.ceil((rect.d + gap) / (o.d + gap)));
    if (best === null || nx * ny < best.nx * best.ny) {
      best = { nx, ny };
    }
  }
  if (best === null) {
    return [rect];
  }
  const ws = splitExtent(rect.w, best.nx, gap);
  const ds = splitExtent(rect.d, best.ny, gap);
  const out: Rect[] = [];
  let x = rect.x;
  for (const w of ws) {
    let y = rect.y;
    for (const d of ds) {
      out.push({ x, y, w, d });
      y += d + gap;
    }
    x += w + gap;
  }
  return out;
}
