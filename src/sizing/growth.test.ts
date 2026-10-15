import { describe, expect, it } from "vitest";
import { AUTO_GROWTH_CEILING, AUTO_GROWTH_FRACTION, PLATED_RETENTION } from "./constants";
import {
  UNBOUNDED_U,
  growthCapU,
  growthMm,
  partGrowthCapU,
  rowDepthCapU,
  rowWidthCapU,
  stackGrowthMm,
} from "./growth";
import { compartment } from "./common";
import type { CompartmentReq } from "./types";

describe("growthMm", () => {
  it("is nothing for off, the number for a number, and no limit for max", () => {
    expect(growthMm("off", 40)).toBe(0);
    expect(growthMm(12.5, 40)).toBe(12.5);
    expect(growthMm(0, 40)).toBe(0);
    expect(growthMm("max", 40)).toBe(Number.POSITIVE_INFINITY);
  });

  it("is the lesser of the content and the ceiling for auto", () => {
    expect(AUTO_GROWTH_FRACTION).toBe(1);
    expect(AUTO_GROWTH_CEILING).toBe(50);
    expect(growthMm("auto", 10)).toBe(10);
    expect(growthMm("auto", 50)).toBe(50);
    expect(growthMm("auto", 80)).toBe(50);
    // a whole 0.01 mm, rounded down: a cap is a maximum
    expect(growthMm("auto", 0.333)).toBe(0.33);
  });
});

describe("stackGrowthMm (retention)", () => {
  it("is auto below the retention limit, so auto needs no plates", () => {
    expect(stackGrowthMm("auto", 20, false)).toBe(20);
    expect(stackGrowthMm("auto", 100, false)).toBe(50);
  });

  it("holds a number or max to the stack's thickness without plates", () => {
    expect(stackGrowthMm(30, 20, false)).toBe(20);
    expect(stackGrowthMm("max", 20, false)).toBe(20);
    expect(stackGrowthMm(15, 20, false)).toBe(15);
  });

  it("lets plates take it six stacks, no further", () => {
    expect(stackGrowthMm("max", 20, true)).toBe(20 * PLATED_RETENTION);
    expect(stackGrowthMm(50, 20, true)).toBe(50);
    expect(stackGrowthMm(500, 20, true)).toBe(20 * PLATED_RETENTION);
  });
});

const c = (grow: Parameters<typeof compartment>[0]["grow"], minW = 30, minD = 30): CompartmentReq =>
  compartment({
    componentId: "c",
    contents: "c",
    kind: "well",
    w: minW,
    d: minD,
    h: 10,
    grow,
    features: [],
  });

describe("what a part can take", () => {
  it("adds the caps of a row's loose compartments along its width, no limit if one has none", () => {
    expect(rowWidthCapU([c({ w: 5 }), c({ w: 7 })])).toBe(1200);
    expect(rowWidthCapU([c({ w: 5 }), c({ w: Infinity })])).toBe(UNBOUNDED_U);
    expect(rowWidthCapU([c({ w: 5 }), c(undefined)])).toBe(500);
    expect(rowWidthCapU([c(undefined)])).toBe(0);
  });

  it("takes the least any row can take along the width", () => {
    expect(partGrowthCapU([[c({ w: 5 })], [c({ w: 8 })]], "w")).toBe(500);
    expect(partGrowthCapU([[c({ w: 5 })], [c(undefined)]], "w")).toBe(0);
  });

  it("counts how much narrower a row is than the widest against its cap", () => {
    // row 2 is 10 mm narrower, so it has 10 mm of slack the tray's width does not ask of it
    expect(partGrowthCapU([[c({ w: 5 }, 40)], [c({ w: 15 }, 30)]], "w")).toBe(500);
    expect(partGrowthCapU([[c({ w: 5 }, 40)], [c({ w: 8 }, 30)]], "w")).toBe(0);
  });

  it("adds rows' caps along the depth, each as far as its least tolerant compartment allows", () => {
    expect(rowDepthCapU([c({ d: 6 }), c({ d: 4 })])).toBe(400);
    expect(rowDepthCapU([c(undefined)])).toBe(0);
    expect(partGrowthCapU([[c({ d: 6 })], [c({ d: 4 })]], "d")).toBe(1000);
    expect(partGrowthCapU([[c({ d: 6 })], [c(undefined)]], "d")).toBe(600);
    expect(partGrowthCapU([[c({ d: Infinity })], [c({ d: 4 })]], "d")).toBe(UNBOUNDED_U);
  });

  it("reads a compartment's cap on one axis, a spacer counting as growing along its width", () => {
    expect(growthCapU(c({ w: 5 }), "w")).toBe(500);
    expect(growthCapU(c({ w: 5 }), "d")).toBe(0);
    expect(growthCapU({ ...c(undefined), spacerAxis: "w" }, "w")).toBe(UNBOUNDED_U);
  });
});
