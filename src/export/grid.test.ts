import { describe, expect, it } from "vitest";
import { gridLayout } from "./grid";

describe("gridLayout", () => {
  it("places parts left to right with a gap", () => {
    expect(
      gridLayout(
        [
          { w: 50, d: 30 },
          { w: 60, d: 40 },
        ],
        { x: 250, y: 210 },
        5,
      ),
    ).toEqual([
      [0, 0, 0],
      [55, 0, 0],
    ]);
  });

  it("wraps to a new row below the deepest part of the row", () => {
    const sizes = [
      { w: 100, d: 30 },
      { w: 100, d: 50 },
      { w: 100, d: 20 },
    ];
    expect(gridLayout(sizes, { x: 220, y: 220 }, 10)).toEqual([
      [0, 0, 0],
      [110, 0, 0],
      [0, 60, 0],
    ]);
  });

  it("gives a part wider than the bed its own row instead of failing", () => {
    const sizes = [
      { w: 50, d: 10 },
      { w: 300, d: 10 },
      { w: 50, d: 10 },
    ];
    expect(gridLayout(sizes, { x: 250, y: 250 }, 5)).toEqual([
      [0, 0, 0],
      [0, 15, 0],
      [0, 30, 0],
    ]);
  });

  it("returns nothing for no parts", () => {
    expect(gridLayout([], { x: 100, y: 100 }, 5)).toEqual([]);
  });

  it("lays out many parts without overlap, within the bed width, at z = 0", () => {
    const sizes = Array.from({ length: 300 }, (_, i) => ({
      w: 20 + (i % 7) * 9,
      d: 15 + (i % 5) * 11,
    }));
    const bed = { x: 256, y: 256 };
    const gap = 4;
    const origins = gridLayout(sizes, bed, gap);
    expect(origins).toHaveLength(300);
    for (const [i, o] of origins.entries()) {
      const s = sizes[i] ?? { w: 0, d: 0 };
      expect(o[2]).toBe(0);
      expect(o[0] + s.w).toBeLessThanOrEqual(bed.x);
      for (let j = 0; j < i; j += 1) {
        const p = origins[j] ?? [0, 0, 0];
        const t = sizes[j] ?? { w: 0, d: 0 };
        const apartX = o[0] >= p[0] + t.w + gap || p[0] >= o[0] + s.w + gap;
        const apartY = o[1] >= p[1] + t.d + gap || p[1] >= o[1] + s.d + gap;
        expect(apartX || apartY).toBe(true);
      }
    }
  });
});
