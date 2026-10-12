import { describe, expect, it } from "vitest";
import {
  mulDiv,
  roundDownTo,
  roundMm,
  roundUpTo,
  toMm,
  toU,
  toUCeil,
  toUFloor,
  volMm3,
} from "./units";

describe("units", () => {
  it("converts mm to integer hundredths with the documented rounding", () => {
    expect(toU(63.5)).toBe(6350);
    expect(toU(0.29)).toBe(29);
    expect(toU(1.005)).toBe(100);
    expect(toUCeil(0.29)).toBe(29);
    expect(toUCeil(66.401)).toBe(6641);
    expect(toUCeil(66.4)).toBe(6640);
    expect(toUFloor(0.29)).toBe(29);
    expect(toUFloor(289.999)).toBe(28999);
  });

  it("never produces negative zero", () => {
    expect(Object.is(toU(-0.001), 0)).toBe(true);
    expect(Object.is(toMm(-0), 0)).toBe(true);
    expect(Object.is(toUCeil(-0.001), 0)).toBe(true);
  });

  it("converts back to mm with 0.01 precision", () => {
    expect(toMm(6350)).toBe(63.5);
    expect(toMm(1)).toBe(0.01);
    expect(roundMm(66.4 - 1.6 - 30.2)).toBe(34.6);
  });

  it("rounds to step multiples, including negatives", () => {
    expect(roundUpTo(601, 20)).toBe(620);
    expect(roundUpTo(600, 20)).toBe(600);
    expect(roundDownTo(619, 20)).toBe(600);
    expect(roundDownTo(-1, 20)).toBe(-20);
    expect(roundUpTo(-1, 20)).toBe(0);
    expect(roundUpTo(7, 0)).toBe(7);
  });

  it("does integer mulDiv and mm³ volumes", () => {
    expect(mulDiv(100_000, 1 << 20, 1 << 20)).toBe(100_000);
    expect(mulDiv(7, 3, 2)).toBe(10);
    expect(volMm3(10_000, 10_000, 10_000)).toBe(1_000_000);
    expect(volMm3(0, 10, 10)).toBe(0);
  });
});
