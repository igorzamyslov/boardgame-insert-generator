import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { createCtx, INF_U, printedHeight, withSizeLocks } from "./context";
import { boxReq, comp, fakeMeasure, makeInput, part, req, variant } from "./test-utils";

describe("createCtx", () => {
  it("converts box, printer and settings to integer units", () => {
    const ctx = createCtx(makeInput([]), fakeMeasure);
    expect(ctx.floorW).toBe(30000 - 2 * 50);
    expect(ctx.floorD).toBe(20000 - 2 * 50);
    expect(ctx.topPlane).toBe(6000);
    expect(ctx.gap).toBe(20);
    expect(ctx).not.toHaveProperty("inset"); // a stack is flush: the groove takes the lip's place
    expect(ctx.upperWall).toBe(256); // 2.55 mm, the groove's wall, rounded up
    expect(ctx.layer).toBe(20);
    expect(ctx.upperMinH).toBe(500);
    expect(ctx.lipHeight).toBe(200);
    expect(ctx.bed).toEqual({ w: 24600, d: 24600, z: 25600 });
  });

  // With the lip on a tray above level 0 has a groove along its outer edge for the lip below, and
  // so a thicker wall; with the lip off it has neither, and is as the tray under it.
  it("gives upper levels the groove's wall with the lip on, and the plain wall with it off", () => {
    const off = makeInput([], { settings: { lip: { ...DEFAULT_SETTINGS.lip, enabled: false } } });
    const ctx = createCtx(off, fakeMeasure);
    expect(ctx.upperWall).toBe(ctx.wall);
    expect(ctx.minFillerUpper).toBe(Math.max(ctx.wall, 2 * Math.round(100 * (0.5 + 0.8))));
    expect(createCtx(makeInput([]), fakeMeasure).upperWall).toBeGreaterThan(ctx.wall);
  });

  it("applies the fit multiplier to box clearance, gap and lip play", () => {
    const ctx = createCtx(makeInput([], { settings: { fit: 1.4 } }), fakeMeasure);
    expect(ctx.boxClearance).toBe(70);
    expect(ctx.gap).toBe(28);
    // the groove is a little wider with more lip play, and so is its wall
    expect(ctx.upperWall).toBeGreaterThan(256);
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
    expect(a.capW).toBe(0); // wallAbsorb defaults to 0: walls never take slack
    const grown = createCtx(
      makeInput([boxReq("a", 50.001, 40, 20)], { settings: { wallAbsorb: 1.6 } }),
      fakeMeasure,
    );
    expect(grown.metrics({ req: 0, variant: 0, part: 0 }, false, 0).capW).toBe(320);
    expect(a.elasticH).toBe(false);
    const b = ctx.metrics({ req: 1, variant: 0, part: 0 }, true, 1);
    expect(b.w).toBe(5600);
    expect(b.capW).toBe(INF_U);
    expect(b.capD).toBe(0);
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
    expect(ctx.minFiller).toBe(760); // 2 × (3 + 0.8)
    // Default: the 0.4 mm bottom chamfer needs 2 × (0.4 + 0.8) = 2.4 mm, more than one 1.6 mm wall.
    expect(createCtx(makeInput([]), fakeMeasure).minFiller).toBe(240);
  });

  it("adds the lip's height to a lipped tray's printed height only", () => {
    const ctx = createCtx(makeInput([]), fakeMeasure);
    expect(printedHeight(ctx, 3000, true)).toBe(3200);
    expect(printedHeight(ctx, 3000, false)).toBe(3000);
  });

  it("rejects more variants or parts than partId can index (256 each)", () => {
    const c = comp({ minW: 30, minD: 30, minH: 10 });
    const variants = (n: number) =>
      Array.from({ length: n }, (_, i) => variant(`v${i}`, [part(`k:p${i}:0`, [c])]));
    expect(() => createCtx(makeInput([req("k", variants(256))]), fakeMeasure)).not.toThrow();
    expect(() => createCtx(makeInput([req("k", variants(257))]), fakeMeasure)).toThrow(RangeError);
    const parts = (n: number) =>
      variant(
        "v",
        Array.from({ length: n }, (_, i) => part(`k:p0:${i}`, [c])),
      );
    expect(() => createCtx(makeInput([req("k", [parts(256)])]), fakeMeasure)).not.toThrow();
    expect(() => createCtx(makeInput([req("k", [parts(257)])]), fakeMeasure)).toThrow(RangeError);
  });
});

describe("whole trays (groups spec §6.3)", () => {
  const a = comp({ minW: 90, minD: 80, minH: 20, contents: "a" });
  const b = comp({ minW: 90, minD: 80, minH: 20, contents: "b" });
  // One requirement: the whole of it in one tray (184 × 84 × 21.2 with fakeMeasure, no lip: it stands alone), or in two.
  const item = (rotatable = true) =>
    req("w", [
      variant("whole", [part("w:p0:0", [a, b], rotatable)]),
      variant("halves", [part("w:p0:0", [a], rotatable), part("w:p0:1", [b], rotatable)]),
    ]);

  it("knows a requirement fits whole when its one-tray variant fits the box and the bed", () => {
    expect(createCtx(makeInput([item()]), fakeMeasure).wholeFits).toEqual([true]);
  });

  it("does not, when the one tray is too wide for the box floor either way round", () => {
    const narrow = makeInput([item()], { box: { innerWidth: 150, innerDepth: 150 } });
    expect(createCtx(narrow, fakeMeasure).wholeFits).toEqual([false]);
  });

  it("turns the tray in the box only when it may be turned", () => {
    const deep = { box: { innerWidth: 100, innerDepth: 200 } };
    expect(createCtx(makeInput([item()], deep), fakeMeasure).wholeFits).toEqual([true]);
    expect(createCtx(makeInput([item(false)], deep), fakeMeasure).wholeFits).toEqual([false]);
  });

  it("does not, when the one tray is taller than the space in the box", () => {
    const low = makeInput([item()], { box: { innerHeight: 20 } });
    expect(createCtx(low, fakeMeasure).wholeFits).toEqual([false]);
  });

  it("does not, when the one tray is too big for the print bed in either orientation", () => {
    // 180 mm of usable bed: the 184 mm tray is over it however it lies
    const small = makeInput([item()], { printer: { bedX: 190, bedY: 190 } });
    expect(createCtx(small, fakeMeasure).wholeFits).toEqual([false]);
    // turned on the bed: 96 × 196 mm of usable bed takes it lying the other way
    const long = makeInput([item()], { printer: { bedX: 206, bedY: 106 } });
    expect(createCtx(long, fakeMeasure).wholeFits).toEqual([true]);
  });

  it("does not, without a one-tray variant", () => {
    const halves = req("w", [
      variant("halves", [part("w:p0:0", [a]), part("w:p0:1", [b])]),
    ]);
    expect(createCtx(makeInput([halves]), fakeMeasure).wholeFits).toEqual([false]);
  });

  it("counts the trays of a variant beyond one per copy", () => {
    const ctx = createCtx(makeInput([item()]), fakeMeasure);
    expect(ctx.extraParts(0, 0)).toBe(0);
    expect(ctx.extraParts(0, 1)).toBe(1);
    // one tray per player is one tray per copy; a combined split is not
    const kit = req("k", [
      variant("separate", [part("k:p0:0", [a]), part("k:p1:0", [b])]),
      variant("combined", [part("k:pall:0", [a]), part("k:pall:1", [b])]),
    ]);
    const kits = createCtx(makeInput([kit]), fakeMeasure);
    expect(kits.extraParts(0, 0)).toBe(0);
    expect(kits.extraParts(0, 1)).toBe(1);
    expect(kits.wholeFits).toEqual([true]);
    const copy = (variant: number, p: number) => kits.copyOf({ req: 0, variant, part: p });
    expect([copy(0, 0), copy(0, 1), copy(1, 0), copy(1, 1)]).toEqual([0, 1, 0, 0]);
  });
});
