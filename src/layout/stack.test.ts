import { describe, expect, it } from "vitest";
import { createCtx, INF_U, withSizeLocks, type Ctx } from "./context";
import {
  stackAbsorb,
  stackAllowed,
  stackHeights,
  stackLevels,
  stackLockCap,
  stackMinFootprint,
} from "./stack";
import { boxReq, fakeMeasure, item, makeInput } from "./test-utils";

function ctxFor(box: { innerHeight?: number; headroom?: number } = {}): Ctx {
  return createCtx(
    makeInput(
      [
        boxReq("big", 100, 60, 20),
        boxReq("small", 50, 40, 10),
        boxReq("scoop", 50, 40, 10, { elastic: { w: true, d: true, h: true } }),
        boxReq("tall", 50, 40, 45),
        boxReq("flat", 50, 40, 2),
      ],
      { box },
    ),
    fakeMeasure,
  );
}

describe("stack feasibility", () => {
  it("applies rotation and the lipped measure per level", () => {
    const ctx = ctxFor();
    const levels = stackLevels(ctx, [item(0), item(1, true)]);
    expect(levels[0]?.lipped).toBe(true);
    expect(levels[1]?.lipped).toBe(false);
    expect(levels[0]?.minW).toBe(10600);
    expect(levels[1]?.minW).toBe(4400);
    expect(levels[1]?.minD).toBe(5400);
    expect(levels[1]?.minH).toBe(1120);
    const thin = stackLevels(ctx, [item(0), item(4)]);
    expect(thin[1]?.minH).toBe(ctx.upperMinH);
  });

  it("requires leaf ≥ req_k + 2·k·inset", () => {
    const ctx = ctxFor();
    const levels = stackLevels(ctx, [item(1), item(0)]);
    const f = stackMinFootprint(ctx, levels);
    expect(f.w).toBe(Math.max(5600, 10400 + 2 * ctx.inset));
    expect(f.d).toBe(Math.max(4600, 6400 + 2 * ctx.inset));
    expect(stackMinFootprint(ctx, [])).toEqual({ w: 1200, d: 1200 });
  });

  it("reports absorbable slack: elastic axes unlimited, else wall growth", () => {
    const ctx = ctxFor();
    const solo = stackLevels(ctx, [item(1)]);
    expect(stackAbsorb(ctx, solo, stackMinFootprint(ctx, solo))).toEqual({ w: 320, d: 320 });
    const scoop = stackLevels(ctx, [item(2)]);
    expect(stackAbsorb(ctx, scoop, stackMinFootprint(ctx, scoop))).toEqual({ w: INF_U, d: INF_U });
    expect(stackLockCap(ctx, solo)).toEqual({ w: INF_U, d: INF_U });
  });

  it("makes stack heights sum to topPlane, rounding all but the top tray", () => {
    const ctx = ctxFor();
    const h = stackHeights(ctx, stackLevels(ctx, [item(0), item(1)]));
    expect(h.overflow).toBe(0);
    expect(h.h[0]).toBe(2120);
    expect((h.h[0] ?? 0) % ctx.layer).toBe(0);
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane);
  });

  it("gives height slack to the lowest scoop tray in whole layers", () => {
    const ctx = ctxFor({ innerHeight: 60.05 });
    const h = stackHeights(ctx, stackLevels(ctx, [item(2), item(4)]));
    expect(h.h[1]).toBe(ctx.upperMinH + 5);
    expect((h.h[0] ?? 0) % ctx.layer).toBe(0);
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane);
  });

  it("reports height overflow when the stack is taller than topPlane", () => {
    const ctx = ctxFor({ innerHeight: 50 });
    const h = stackHeights(ctx, stackLevels(ctx, [item(3), item(1)]));
    expect(h.overflow).toBe(4620 + 1120 - 5000);
  });

  it("reports overflow instead of throwing when headroom ≥ inner height", () => {
    const ctx = ctxFor({ innerHeight: 40, headroom: 45 });
    const h = stackHeights(ctx, stackLevels(ctx, [item(1)]));
    expect(ctx.topPlane).toBe(-500);
    expect(h.overflow).toBe(1120 + 500);
  });

  it("keeps size-locked heights and footprints", () => {
    const base = ctxFor();
    const ctx = withSizeLocks(
      base,
      new Map([[base.partId(item(0)), { w: 12000, d: 7000, h: 3000, rotated: false }]]),
    );
    const levels = stackLevels(ctx, [item(0), item(1)]);
    expect(levels[0]?.minW).toBe(12000);
    expect(stackLockCap(ctx, levels)).toEqual({ w: 12000, d: 7000 });
    const h = stackHeights(ctx, levels);
    expect(h.h[0]).toBe(3000);
    expect(h.h[1]).toBe(ctx.topPlane - 3000);
  });
});

describe("stackAllowed", () => {
  // fakeMeasure: 119 mm plain, 121 mm lipped, on a 120 mm usable bed.
  const reqs = [boxReq("wide", 115, 40, 10), boxReq("small", 40, 30, 10)];
  const make = (lip: boolean) =>
    createCtx(
      makeInput(reqs, {
        printer: { bedX: 130, bedY: 130 },
        settings: { lip: { enabled: lip, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 } },
      }),
      fakeMeasure,
    );

  it("allows a single tray whatever its size and refuses a stack that outgrows the bed", () => {
    const ctx = make(true);
    expect(stackAllowed(ctx, [item(0)])).toBe(true);
    expect(stackAllowed(ctx, [item(0), item(1)])).toBe(false); // lipped wall: 121 mm
    expect(stackAllowed(ctx, [item(1), item(0)])).toBe(false); // inset footprint: 121.9 mm
    expect(stackAllowed(ctx, [item(1), item(1)])).toBe(true);
  });

  it("judges the footprint in either bed orientation", () => {
    // rotated: the 119 mm side runs along Y; the 120 x 120 bed is square, so still too big
    expect(stackAllowed(make(true), [item(0, true), item(1)])).toBe(false);
  });

  it("lets a part stack under a thin lip-less stack that still fits", () => {
    const off = make(false);
    // lip off: no lipped wall, only the inset of the upper tray (small, 44 mm): fits
    expect(stackAllowed(off, [item(0), item(1)])).toBe(true);
    expect(stackAllowed(off, [item(1), item(0)])).toBe(false); // 119 + 2.9 mm as an upper tray
  });
});
