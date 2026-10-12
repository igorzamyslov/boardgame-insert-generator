import { describe, expect, it } from "vitest";
import { createCtx, INF_U, MIN_PIECE_U, withSizeLocks } from "./context";
import { boxReq, fakeMeasure, makeInput } from "./test-utils";

describe("createCtx", () => {
  it("converts box, printer and settings to integer units", () => {
    const ctx = createCtx(makeInput([]), fakeMeasure);
    expect(ctx.floorW).toBe(30000 - 2 * 50);
    expect(ctx.floorD).toBe(20000 - 2 * 50);
    expect(ctx.topPlane).toBe(6000);
    expect(ctx.gap).toBe(20);
    expect(ctx.inset).toBe(145);
    expect(ctx.layer).toBe(20);
    expect(ctx.upperMinH).toBe(500);
    expect(ctx.bed).toEqual({ w: 24600, d: 24600, z: 25600 });
  });

  it("applies the fit multiplier to box clearance, gap and lip play", () => {
    const ctx = createCtx(makeInput([], { settings: { fit: 1.4 } }), fakeMeasure);
    expect(ctx.boxClearance).toBe(70);
    expect(ctx.gap).toBe(28);
    expect(ctx.inset).toBe(155);
  });

  it("measures parts in ceil units with slack capacities", () => {
    const input = makeInput([
      boxReq("a", 50.001, 40, 20),
      boxReq("b", 50, 40, 20, { elastic: { w: true, h: true } }),
    ]);
    const ctx = createCtx(input, fakeMeasure);
    const a = ctx.metrics({ req: 0, variant: 0, part: 0 }, false, 0);
    expect(a.w).toBe(5401);
    expect(a.d).toBe(4400);
    expect(a.h).toBe(2120);
    expect(a.capW).toBe(320);
    expect(a.elasticH).toBe(false);
    const b = ctx.metrics({ req: 1, variant: 0, part: 0 }, true, 1);
    expect(b.w).toBe(5600);
    expect(b.capW).toBe(INF_U);
    expect(b.capD).toBe(320);
    expect(b.elasticH).toBe(true);
  });

  it("indexes parts by trayKey and carries size locks", () => {
    const ctx = createCtx(makeInput([boxReq("a", 30, 30, 10)]), fakeMeasure);
    expect(ctx.refsOfKey("a:p0:0")).toEqual([{ req: 0, variant: 0, part: 0 }]);
    expect(ctx.refsOfKey("nope")).toEqual([]);
    const locked = withSizeLocks(ctx, new Map([[0, { w: 1, d: 2, h: 3, rotated: false }]]));
    expect(locked.sizeLocks.get(0)?.h).toBe(3);
    expect(locked.metrics({ req: 0, variant: 0, part: 0 }, false, 0).w).toBe(3400);
  });

  it("handles headroom at or above the inner height without throwing", () => {
    const ctx = createCtx(makeInput([], { box: { headroom: 70 } }), fakeMeasure);
    expect(ctx.topPlane).toBe(-1000);
  });

  it("rounds wall and floor up like sizing and sizes the thinnest leftover for the chamfer", () => {
    const settings = { wall: 0.5, floor: 1.234, bottomChamfer: 3 };
    const ctx = createCtx(makeInput([], { settings }), fakeMeasure);
    expect(ctx.wall).toBe(90); // MIN_WALL_MM
    expect(ctx.floor).toBe(124);
    expect(ctx.minPiece).toBe(760); // 2 × (3 + 0.8)
    expect(createCtx(makeInput([]), fakeMeasure).minPiece).toBe(MIN_PIECE_U);
  });
});
