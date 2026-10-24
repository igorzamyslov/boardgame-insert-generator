// src/layout/reserve.test.ts
import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import {
  reserveClash,
  reserveRect,
  reservedOf,
  snapOf,
  storedAnchors,
  validAnchors,
} from "./reserve";
import { scorePlan } from "./score";
import { cut, leaf, placeLeaves } from "./tree";
import { boxReq, item, makeInput } from "./test-utils";

const BOX = {
  innerWidth: 300,
  innerDepth: 200,
  innerHeight: 60,
  headroom: 10,
  headroomCoverage: "partial" as const,
  headroomAreas: [{ w: 120, d: 80 }],
};
const reqs = [boxReq("a", 100, 80, 20, { loose: true }), boxReq("b", 100, 80, 20, { loose: true })];
const ctxOf = (box: Partial<typeof BOX> = {}) =>
  createCtx(makeInput(reqs, { box: { ...BOX, ...box } }));

describe("anchors", () => {
  it("has the area in each corner, either way round", () => {
    const ctx = ctxOf();
    const { floorW, floorD } = ctx;
    const at = (n: number) => reserveRect(ctx, 0, n);
    expect(at(0)).toMatchObject({ x: 0, y: 0 });
    expect(at(1).x + at(1).w).toBe(floorW);
    expect(at(2).y + at(2).d).toBe(floorD);
    expect(at(3)).toMatchObject({ x: floorW - at(3).w, y: floorD - at(3).d });
    expect([at(0).w, at(0).d]).toEqual([12000, 8000]);
    expect([at(4).w, at(4).d]).toEqual([8000, 12000]);
    expect(validAnchors(ctx, 0)).toHaveLength(8);
  });

  it("drops the anchors where the area does not fit the floor", () => {
    // 250 × 190 fits as given, not turned (190 < 300 but 250 > 200)
    const ctx = ctxOf({ headroomAreas: [{ w: 250, d: 190 }] });
    expect(validAnchors(ctx, 0)).toEqual([0, 1, 2, 3]);
  });

  it("is the first anchor a tree has none for, and the tree's own otherwise", () => {
    const ctx = ctxOf();
    const t = { root: leaf([]), variants: [0, 0] };
    expect(reservedOf(ctx, t)[0]?.anchor).toBe(0);
    expect(reservedOf(ctx, { ...t, reserve: [3] })[0]?.anchor).toBe(3);
    expect(reservedOf(ctx, { ...t, reserve: [99] })[0]?.anchor).toBe(0);
  });

  it("recovers the anchors a stored plan had, from its rectangle", () => {
    const ctx = ctxOf();
    const r = reserveRect(ctx, 0, 6);
    const stored = [
      { area: 0, name: "Rulebook", x: r.x / 100, y: r.y / 100, w: r.w / 100, d: r.d / 100, z: 50 },
    ];
    expect(storedAnchors(ctx, stored)).toEqual([6]);
    expect(storedAnchors(ctx, undefined)).toEqual([0]);
  });

  it("measures how far two areas overlap", () => {
    const ctx = ctxOf({
      headroomAreas: [
        { w: 120, d: 80 },
        { w: 100, d: 60 },
      ],
    });
    const both = reservedOf(ctx, { root: leaf([]), variants: [], reserve: [0, 0] });
    expect(reserveClash(both)).toBe(6000);
    const apart = reservedOf(ctx, { root: leaf([]), variants: [], reserve: [0, 3] });
    expect(reserveClash(apart)).toBe(0);
  });
});

describe("a cut is drawn to the area's inner edge when it can reach it", () => {
  const ctx = ctxOf();
  const two = cut("x", leaf([item(0)]), leaf([item(1)]));
  const floor = { x: 0, y: 0, w: ctx.floorW, d: ctx.floorD };
  const min = () => ({ w: 10000, d: 8000 });

  it("puts the second stack's left edge on the area's right edge", () => {
    const snap = snapOf(ctx, reservedOf(ctx, { root: two, variants: [] }));
    const placed = placeLeaves(two, floor, ctx.gap, min, snap);
    expect(placed.leaves[1]?.rect.x).toBe(12000);
    // without the snap the cut sits at its share of the slack (half): not at the edge
    expect(placeLeaves(two, floor, ctx.gap, min).leaves[1]?.rect.x).not.toBe(12000);
  });

  it("leaves a cut alone that cannot reach the edge", () => {
    const tight = placeLeaves(
      two,
      floor,
      ctx.gap,
      () => ({ w: 14500, d: 8000 }),
      snapOf(ctx, reservedOf(ctx, { root: two, variants: [] })),
    );
    expect(tight.leaves[1]?.rect.x).not.toBe(12000);
  });

  it("has no line for an area that spans the floor", () => {
    const wide = ctxOf({ headroomAreas: [{ w: 299.6, d: 80 }] });
    expect(snapOf(wide, reservedOf(wide, { root: leaf([]), variants: [] })).x).toEqual([]);
  });
});

describe("what lies under the paper", () => {
  const tree = (reserve: number[]) => ({
    root: cut("x", leaf([item(0)]), leaf([item(1)])),
    variants: [0, 0],
    reserve,
  });

  it("marks the stack the area covers, and only that one", () => {
    const ctx = ctxOf();
    const plan = evaluate(ctx, tree([0]));
    const under = plan.trays.map((t) => t.under);
    expect(under).toEqual([true, false]);
    // and the other corner covers the other one
    expect(evaluate(ctx, tree([1])).trays.map((t) => t.under)).toEqual([false, true]);
  });

  it("is covered: a loose tray under the paper costs no coverage, one elsewhere does", () => {
    const ctx = ctxOf();
    const covered = scorePlan(ctx, evaluate(ctx, tree([0]))).terms.coverage;
    // one of the two loose trays is under the paper either way: the other is the one exposed
    expect(covered).toBe(1);
    // without areas both are exposed (the whole top is reserved: nothing is known to cover them)
    const plain = ctxOf({ headroomAreas: undefined });
    expect(scorePlan(plain, evaluate(plain, tree([]))).terms.coverage).toBe(2);
  });

  it("sets the plane of a stack under the paper at the low plane and the rest at the lid", () => {
    const ctx = ctxOf();
    const plan = evaluate(ctx, tree([0]));
    const [a, b] = plan.trays;
    expect((a?.z ?? 0) + (a?.h ?? 0)).toBe(ctx.lowPlane);
    expect((b?.z ?? 0) + (b?.h ?? 0)).toBe(ctx.topPlane);
    expect(ctx.topPlane - ctx.lowPlane).toBe(1000);
  });
});
