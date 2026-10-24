// src/layout/volume.test.ts
import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";
import { toMm } from "./units";
import { volumeBudget } from "./volume";

// fakeMeasure: outer = inner + 2 × 2 mm walls in width and depth, + 1.2 mm floor in height
const outerOf = (w: number, d: number, h: number): number => (w + 4) * (d + 4) * (h + 1.2);

describe("volumeBudget", () => {
  it("sums each item's outer volume and compares it with the box under the headroom", () => {
    const input = makeInput([boxReq("A", 40, 30, 20), boxReq("B", 10, 10, 10)], {
      box: { innerWidth: 300, innerDepth: 200, innerHeight: 60, headroom: 10 },
    });
    const ctx = createCtx(input, fakeMeasure);
    const b = volumeBudget(ctx);
    expect(b.needMm3).toBeCloseTo(outerOf(40, 30, 20) + outerOf(10, 10, 10), 0);
    // the box as the layout sees it: floor minus the clearance both sides, height under the headroom
    expect(b.boxMm3).toBeCloseTo(toMm(ctx.floorW) * toMm(ctx.floorD) * toMm(ctx.topPlane), 0);
    expect(toMm(ctx.topPlane)).toBe(50);
  });

  it("takes the smallest variant of an item, with all the trays it has", () => {
    const big = variant("big", [part("X:p0:0", [comp({ minW: 80, minD: 60, minH: 20 })])]);
    const split = variant("split", [
      part("X:p0:0", [comp({ minW: 30, minD: 30, minH: 20 })]),
      part("X:p0:1", [comp({ minW: 30, minD: 30, minH: 20 })]),
    ]);
    const ctx = createCtx(makeInput([req("X", [big, split])]), fakeMeasure);
    const b = volumeBudget(ctx);
    expect(b.needMm3).toBeCloseTo(2 * outerOf(30, 30, 20), 0);
    expect(b.items).toHaveLength(1);
  });

  it("lists the items biggest first, named by their contents", () => {
    const ctx = createCtx(
      makeInput([
        boxReq("Small", 10, 10, 10),
        boxReq("Large", 90, 60, 30),
        boxReq("Mid", 40, 30, 20),
      ]),
      fakeMeasure,
    );
    const { items } = volumeBudget(ctx);
    expect(items.map((i) => i.label)).toEqual(["Large", "Mid", "Small"]);
    expect(items[0]?.mm3).toBeCloseTo(outerOf(90, 60, 30), 0);
  });

  it("calls an item by the name it is given", () => {
    const ctx = createCtx(
      makeInput([boxReq("A", 40, 30, 20), boxReq("B", 10, 10, 10)]),
      fakeMeasure,
    );
    const { items } = volumeBudget(ctx, (key) => (key === "A" ? "Faction ×7" : undefined));
    expect(items.map((i) => i.label)).toEqual(["Faction ×7", "B"]);
  });

  it("is empty for no items", () => {
    const b = volumeBudget(createCtx(makeInput([]), fakeMeasure));
    expect(b.needMm3).toBe(0);
    expect(b.items).toEqual([]);
  });
});
