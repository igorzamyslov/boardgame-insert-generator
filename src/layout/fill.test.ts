import { describe, expect, it } from "vitest";
import { createCtx, withSizeLocks, type Ctx } from "./context";
import { evaluate, overflowTotal, placeStack } from "./fill";
import { stackLevels } from "./stack";
import { boxReq, fakeMeasure, item, makeInput } from "./test-utils";
import { cut, leaf } from "./tree";
import type { TrayRequirement } from "../sizing/types";

function ctxOf(reqs: TrayRequirement[], o: Parameters<typeof makeInput>[1] = {}): Ctx {
  return createCtx(makeInput(reqs, o), fakeMeasure);
}

describe("fill", () => {
  // fakeMeasure: a 100 × 60 box part is 10400 × 6400 units; the tray gap is 20; with the default
  // 0.4 mm bottom chamfer the thinnest filler is 240 (2 × (0.4 + 0.8) mm).
  it("makes any slack that can be a part a filler, and the tray keeps its minimum size", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)]);
    expect(ctx.minFiller).toBe(240);
    for (const extra of [270, 1000, 1500]) {
      const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), {
        x: 0,
        y: 0,
        w: 10400 + extra,
        d: 6400,
      });
      expect(sp.trays[0]?.w).toBe(10400);
      expect(sp.leftovers).toEqual([{ x: 10420, y: 0, w: extra - 20, d: 6400 }]);
    }
  });

  it("absorbs a gap too narrow to be a part, even with wallGrowth 0", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)]);
    for (const extra of [100, 250, 259]) {
      const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), {
        x: 0,
        y: 0,
        w: 10400 + extra,
        d: 6400,
      });
      expect(sp.leftovers).toEqual([]);
      expect(sp.trays[0]?.w).toBe(10400 + extra);
    }
  });

  it("absorbs up to wallGrowth per wall, and prints a filler for more", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)], { settings: { wallGrowth: 1.6 } });
    // Two walls take 2 × 1.6 mm = 320 units.
    const fits = placeStack(ctx, stackLevels(ctx, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + 320,
      d: 6400,
    });
    expect(fits.leftovers).toEqual([]);
    expect(fits.trays[0]?.w).toBe(10720);
    // One unit more than the walls may take: a filler, and the walls stay as set.
    const over = placeStack(ctx, stackLevels(ctx, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + 321,
      d: 6400,
    });
    expect(over.trays[0]?.w).toBe(10400);
    expect(over.leftovers).toEqual([{ x: 10420, y: 0, w: 301, d: 6400 }]);
  });

  it("gives all slack to an elastic tray", () => {
    const ctx = ctxOf([boxReq("s", 50, 40, 10, { elastic: { w: true, d: true, h: true } })]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 20000, d: 9000 });
    expect(sp.leftovers).toEqual([]);
    expect(sp.trays[0]?.w).toBe(20000);
  });

  it("insets upper levels by k·inset per side and stacks z", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20), boxReq("b", 50, 40, 10)]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 100,
      y: 200,
      w: 10600,
      d: 6600,
    });
    const [lo, up] = sp.trays;
    expect(up?.x).toBe(100 + ctx.inset);
    expect(up?.y).toBe(200 + ctx.inset);
    expect(up?.w).toBe((lo?.w ?? 0) - 2 * ctx.inset);
    expect(up?.z).toBe(lo?.h);
    expect((lo?.h ?? 0) + (up?.h ?? 0)).toBe(ctx.topPlane);
    expect(lo?.lipped).toBe(true);
    expect(up?.lipped).toBe(false);
  });

  it("caps an elastic bottom tray to the bed and leaves at least minFiller as leftover", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20, { elastic: { w: true } })], {
      printer: { bedX: 120, bedY: 120 },
    });
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11500, d: 6400 });
    expect(sp.trays[0]?.w).toBe(11000);
    expect(sp.leftovers[0]?.w).toBe(11500 - 11000 - 20);
    const sp2 = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11050, d: 6400 });
    expect(sp2.trays[0]?.w).toBe(11050 - 20 - ctx.minFiller);
    expect(sp2.leftovers[0]?.w).toBe(ctx.minFiller);
  });

  it("never forces a leftover thinner than its own bottom chamfer allows", () => {
    // bottomChamfer 3: planTray needs min(w, d) ≥ 2 × (3 + 0.8) = 7.6 mm (ctx.minFiller).
    const ctx = ctxOf([boxReq("a", 100, 60, 20, { elastic: { w: true } })], {
      printer: { bedX: 120, bedY: 120 },
      settings: { bottomChamfer: 3, wall: 3, floor: 3 },
    });
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11500, d: 6400 });
    expect(sp.trays[0]?.w).toBe(11500 - 20 - 760);
    expect(sp.leftovers[0]?.w).toBe(760);
  });

  it("forces a leftover beside a size-locked tray", () => {
    const base = ctxOf([boxReq("a", 100, 60, 20)]);
    const ctx = withSizeLocks(base, new Map([[0, { w: 10500, d: 6400, h: 6000, rotated: false }]]));
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), { x: 0, y: 0, w: 11000, d: 6400 });
    expect(sp.trays[0]?.w).toBe(10500);
    expect(sp.leftovers[0]?.w).toBe(480);
    expect(sp.overflowLock).toBe(0);
  });

  it("evaluates a tree: exact tiling, leftovers numbered after stacks, no overflow", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20), boxReq("b", 100, 60, 20)]);
    const plan = evaluate(ctx, {
      root: cut("x", leaf([item(0)]), leaf([item(1)])),
      variants: [0, 0],
    });
    expect(overflowTotal(plan.overflow)).toBe(0);
    expect(plan.trays.map((t) => t.stack)).toEqual([0, 1]);
    expect(plan.leftovers.every((l) => l.stack >= 2)).toBe(true);
    expect(plan.leftovers.every((l) => l.h === ctx.topPlane)).toBe(true);
    expect(plan.crossX).toBeGreaterThanOrEqual(2);
  });

  it("reports x overflow and shortfall when trays don't fit side by side", () => {
    const ctx = ctxOf([boxReq("a", 200, 60, 20), boxReq("b", 200, 60, 20)]);
    const plan = evaluate(ctx, {
      root: cut("x", leaf([item(0)]), leaf([item(1)])),
      variants: [0, 0],
    });
    expect(plan.overflow.x).toBe(2 * 20400 + 20 - ctx.floorW);
    expect(plan.shortfall.x).toBe(plan.overflow.x);
  });

  it("splits leftovers larger than the bed", () => {
    const ctx = ctxOf([], { box: { innerWidth: 600, innerDepth: 200 } });
    const plan = evaluate(ctx, { root: leaf([]), variants: [] });
    expect(plan.leftovers.length).toBe(3);
    expect(plan.overflow.bed).toBe(0);
  });

  it("marks narrow leftovers solid", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)], { box: { innerWidth: 125, innerDepth: 65 } });
    const plan = evaluate(ctx, { root: leaf([item(0)]), variants: [0] });
    expect(plan.leftovers.length).toBe(1);
    expect(plan.leftovers[0]?.solid).toBe(true);
  });
});
