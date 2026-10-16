import { describe, expect, it } from "vitest";
import { MIN_CUT_MM, POST_MM } from "../model/settings";
import {
  AUTO_GROWTH_CEILING,
  AUTO_GROWTH_FRACTION,
  MIN_REACH_OVERLAP,
  PLATED_RETENTION,
} from "./constants";
import {
  UNBOUNDED_U,
  growthCapU,
  growthMm,
  partGrowthCapU,
  reachGrowthMm,
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

/** How far a cut `cut` wide, centred on a well `stack + room` wide, overlaps a stack standing at its end. */
const overlapAtEnd = (stack: number, room: number, cut: number): number => {
  const well = stack + room;
  const width = Math.min(cut, well - 2 * POST_MM);
  return Math.max(0, Math.min(stack, (well + width) / 2) - (well - width) / 2);
};

describe("reachGrowthMm (reachability)", () => {
  it("asks a fingertip's width of the stack under the cut: a fingertip is the narrowest cut", () => {
    expect(MIN_REACH_OVERLAP).toBe(MIN_CUT_MM);
  });

  it("is the cut's width plus the stack less twice the overlap", () => {
    // a 25 mm cut, a 20 mm stack: 25 + 20 - 2 × 10
    expect(reachGrowthMm(20, 25)).toBe(25);
    expect(reachGrowthMm(40, 25)).toBe(45);
    expect(reachGrowthMm(20, 14)).toBe(14);
    expect(reachGrowthMm(20, 10)).toBe(10);
  });

  it("leaves the stack MIN_REACH_OVERLAP under the cut at either end, and no more room than that", () => {
    for (const [stack, cut] of [
      [20, 25],
      [20, 14],
      [30, 12],
      [45, 25],
      [100, 20],
    ] as const) {
      const room = reachGrowthMm(stack, cut);
      expect(overlapAtEnd(stack, room, cut), `${stack}/${cut}`).toBeGreaterThanOrEqual(
        MIN_REACH_OVERLAP - 1e-9,
      );
      expect(overlapAtEnd(stack, room + 1, cut), `${stack}/${cut} +1`).toBeLessThan(
        MIN_REACH_OVERLAP,
      );
    }
  });

  it("asks a thin stack only for what a cut can give it, and is never negative", () => {
    // a 6 mm stack can overlap a cut by at most 6 - 3 (the post): its room is what keeps the cut whole
    expect(reachGrowthMm(6, 14)).toBe(14 - 6 + 2 * POST_MM);
    expect(reachGrowthMm(0, 0)).toBe(0);
    expect(reachGrowthMm(15, 0)).toBe(0);
    for (const stack of [0, 1, 3, 8, 13, 50]) {
      for (const cut of [0, 5, 10, 25]) {
        expect(reachGrowthMm(stack, cut), `${stack}/${cut}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("does not bind at the default cut: 25 mm is wider than two fingertips", () => {
    for (const stack of [5, 10, 23.5, 60, 200]) {
      expect(reachGrowthMm(stack, 25)).toBeGreaterThanOrEqual(stack);
    }
  });
});

describe("stackGrowthMm (reachability)", () => {
  it("takes the tighter of retention and reachability when nothing fills the room", () => {
    // retention allows 20; a 14 mm cut allows 14 + 20 - 20 = 14
    expect(stackGrowthMm("max", 20, false, 0, 14)).toBe(14);
    expect(stackGrowthMm(30, 20, false, 0, 14)).toBe(14);
    expect(stackGrowthMm("auto", 20, false, 0, 14)).toBe(14);
    // a number below both stands
    expect(stackGrowthMm(5, 20, false, 0, 14)).toBe(5);
    // retention is tighter: a 25 mm cut allows 25
    expect(stackGrowthMm("max", 20, false, 0, 25)).toBe(20);
    expect(stackGrowthMm("max", 20, false, 0, 100)).toBe(20);
  });

  it("is retention alone with no cut", () => {
    expect(stackGrowthMm("max", 20, false, 0, undefined)).toBe(20);
    expect(stackGrowthMm("max", 20, false)).toBe(20);
  });

  it("does not apply to plates (the stack is pinned) or to dividers", () => {
    expect(stackGrowthMm("max", 20, true, 0, 14)).toBe(20 * PLATED_RETENTION);
    expect(stackGrowthMm("max", 20, false, 2, 14)).toBe(20 * 3);
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
