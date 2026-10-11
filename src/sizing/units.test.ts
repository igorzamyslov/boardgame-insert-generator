import { describe, expect, it } from "vitest";
import { ceilU, fillCapped, floorU, fromU, maxOf, round2, splitEven, sum, toU } from "./units";

describe("units", () => {
  it("converts mm to whole 0.01 mm units and back", () => {
    expect(toU(63.5)).toBe(6350);
    expect(toU(1.6)).toBe(160);
    expect(toU(119.18)).toBe(11918);
    expect(fromU(2350)).toBe(23.5);
  });

  it("rounds minimums up, ignoring float noise", () => {
    expect(ceilU(23.4952)).toBe(2350);
    expect(ceilU(64.5)).toBe(6450);
    expect(ceilU(0.001)).toBe(1);
    expect(floorU(26.696)).toBe(2669);
    expect(floorU(26.7)).toBe(2670);
    expect(floorU(0.57)).toBe(57);
    expect(ceilU(0.42 * 100)).toBe(4200);
  });

  it("rounds to 0.01 mm", () => {
    expect(round2(13.599999999999994)).toBe(13.6);
    expect(round2(56.7 - 43.35)).toBe(13.35);
  });

  it("sums and takes the maximum (0 for an empty list)", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
    expect(maxOf([4, 9, 2])).toBe(9);
    expect(maxOf([])).toBe(0);
  });

  it("splits evenly with the remainder going to the first entries", () => {
    expect(splitEven(7, 3)).toEqual([3, 2, 2]);
    expect(splitEven(0, 2)).toEqual([0, 0]);
    expect(splitEven(5, 0)).toEqual([]);
  });

  it("fills up to per-entry caps, evenly", () => {
    expect(fillCapped(10, [3, 0, 3])).toEqual([3, 0, 3]);
    expect(fillCapped(5, [3, 0, 3])).toEqual([3, 0, 2]);
    expect(fillCapped(4, [1, 10])).toEqual([1, 3]);
    expect(fillCapped(0, [5, 5])).toEqual([0, 0]);
  });
});
