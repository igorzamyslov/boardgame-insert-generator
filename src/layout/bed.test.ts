import { describe, expect, it } from "vitest";
import { bedExcess, fitsBed, splitForBed, type Bed } from "./bed";

const bed: Bed = { w: 24600, d: 20000, z: 25000 };

describe("bed fit", () => {
  it("accepts either XY rotation", () => {
    expect(fitsBed(bed, 24600, 20000, 1000)).toBe(true);
    expect(fitsBed(bed, 20000, 24600, 1000)).toBe(true);
    expect(fitsBed(bed, 24601, 20000, 1000)).toBe(false);
    expect(fitsBed(bed, 1000, 1000, 25001)).toBe(false);
  });

  it("reports the smallest excess over both orientations", () => {
    expect(bedExcess(bed, 24700, 20000, 0)).toBe(100);
    expect(bedExcess(bed, 30000, 30000, 26000)).toBe(5400 + 10000 + 1000);
  });

  it("splits an oversized leftover into bed-sized pieces with gaps", () => {
    const pieces = splitForBed(bed, { x: 0, y: 0, w: 50000, d: 10000 }, 20);
    expect(pieces.length).toBe(3);
    for (const p of pieces) {
      expect(fitsBed(bed, p.w, p.d, 0)).toBe(true);
    }
    const total = pieces.reduce((s, p) => s + p.w, 0) + (pieces.length - 1) * 20;
    expect(total).toBe(50000);
    expect(pieces[1]?.x).toBe((pieces[0]?.w ?? 0) + 20);
  });

  it("returns the rect unchanged when it fits", () => {
    const r = { x: 5, y: 6, w: 100, d: 100 };
    expect(splitForBed(bed, r, 20)).toEqual([r]);
  });
});
