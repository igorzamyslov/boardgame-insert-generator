// Places parts left to right in rows on the bed (min corners, z = 0),
// `gap` apart; a part that doesn't fit the rest of the row starts a new row.
// Rows continue past bed.y if needed (the slicer then needs more plates).
export function gridLayout(
  sizes: { w: number; d: number }[],
  bed: { x: number; y: number },
  gap: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  let x = 0;
  let y = 0;
  let rowDepth = 0;
  for (const { w, d } of sizes) {
    if (x > 0 && x + w > bed.x) {
      x = 0;
      y += rowDepth + gap;
      rowDepth = 0;
    }
    out.push([x, y, 0]);
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
  }
  return out;
}
