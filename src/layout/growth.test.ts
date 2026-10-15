import { describe, expect, it } from "vitest";
import { createCtx, INF_U, type Ctx } from "./context";
import { evaluate, placeStack } from "./fill";
import { materialize } from "./materialize";
import { optimize } from "./optimize";
import { levelAbsorb, levelGrowth, stackHeights, stackLevels, stackMinFootprint } from "./stack";
import { boxReq, fakeMeasure, item, makeInput, fakeRealize } from "./test-utils";
import { leaf, type Tree } from "./tree";
import type { Rect } from "./units";

// Growth is the room a tray gives its own contents, and nothing else (minimal-trays spec §5): a
// gap up to what the contents may take is absorbed, and past it the tray stays that much bigger
// than it needs to be while the rest of the gap is a filler.

const ctxOf = (growth: Record<string, number> | undefined, o: { wallAbsorb?: number } = {}): Ctx =>
  createCtx(
    makeInput(
      [
        boxReq("bin", 50, 40, 10, { elastic: { w: true, d: true, h: true }, growth }),
        boxReq("rigid", 50, 40, 10),
      ],
      { settings: { wallAbsorb: o.wallAbsorb ?? 0 } },
    ),
    fakeMeasure,
  );

describe("the room a part's contents may take (PartMetrics)", () => {
  it("is unbounded when elastic with no cap, and the walls' share when it cannot grow", () => {
    const ctx = ctxOf(undefined, { wallAbsorb: 1.6 });
    const bin = ctx.metrics({ req: 0, variant: 0, part: 0 }, false, 0);
    expect(bin.capW).toBe(INF_U);
    expect(bin.growW).toBe(INF_U);
    const rigid = ctx.metrics({ req: 1, variant: 0, part: 0 }, false, 0);
    expect(rigid.growW).toBe(0);
    expect(rigid.capW).toBe(320);
  });

  it("is the cap, in units, with the walls' share on top in capW", () => {
    const ctx = ctxOf({ w: 12.5, d: 3, h: 20 }, { wallAbsorb: 1.6 });
    const bin = ctx.metrics({ req: 0, variant: 0, part: 0 }, false, 0);
    expect(bin.growW).toBe(1250);
    expect(bin.growD).toBe(300);
    expect(bin.growH).toBe(2000);
    expect(bin.capW).toBe(1250 + 320);
    expect(bin.capD).toBe(300 + 320);
  });

  it("swaps with the part's rotation", () => {
    const ctx = ctxOf({ w: 12.5, d: 3 });
    const [l] = stackLevels(ctx, [item(0, true)]);
    expect(l?.growW).toBe(300);
    expect(l?.growD).toBe(1250);
  });
});

describe("a tray in a gap wider than its contents may take", () => {
  const rect = (w: number, d: number): Rect => ({ x: 0, y: 0, w: w * 100, d: d * 100 });
  const place = (ctx: Ctx, w: number, d: number) => {
    const levels = stackLevels(ctx, [item(0)]);
    return placeStack(ctx, levels, rect(w, d));
  };
  // the bin needs 54 × 44 outside (2 × 2 mm walls)

  it("absorbs a gap up to the cap, so a few millimetres cost no filler", () => {
    const sp = place(ctxOf({ w: 12.5 }), 54 + 12.5, 44);
    expect(sp.trays[0]?.w).toBe(6650);
    expect(sp.leftovers).toEqual([]);
  });

  it("grows by the cap and puts the rest in a filler beside it", () => {
    const ctx = ctxOf({ w: 12.5 });
    const sp = place(ctx, 54 + 40, 44);
    expect(sp.trays[0]?.w).toBe(5400 + 1250);
    const [filler] = sp.leftovers;
    expect(filler?.w).toBe(9400 - 6650 - ctx.gap);
  });

  it("keeps an off tray at its minimum, whatever the gap", () => {
    const sp = place(ctxOf({ w: 0 }), 54 + 40, 44);
    expect(sp.trays[0]?.w).toBe(5400);
    expect(sp.leftovers).toHaveLength(1);
  });

  it("takes the whole gap on `max`, and takes a gap too thin for a filler on any setting", () => {
    expect(place(ctxOf(undefined), 54 + 40, 44).trays[0]?.w).toBe(9400);
    const thin = place(ctxOf({ w: 0 }), 54 + 1, 44);
    expect(thin.trays[0]?.w).toBe(5500);
    expect(thin.leftovers).toEqual([]);
  });

  it("grows each axis by its own cap", () => {
    const sp = place(ctxOf({ w: 10, d: 6 }), 54 + 40, 44 + 40);
    expect(sp.trays[0]?.w).toBe(5400 + 1000);
    expect(sp.trays[0]?.d).toBe(4400 + 600);
  });

  it("does not use the walls for what the contents may not take, once there is a filler", () => {
    // wallAbsorb would take 3.2 mm of a 3.2 mm gap, but 20 mm is past cap + walls: the tray is
    // cap-sized and the rest a filler, never a cap-sized tray with fat walls and a filler too
    const ctx = ctxOf({ w: 4 }, { wallAbsorb: 1.6 });
    const sp = place(ctx, 54 + 20, 44);
    expect(sp.trays[0]?.w).toBe(5400 + 400);
    expect(sp.leftovers).toHaveLength(1);
    // within cap + walls, all of it is absorbed
    expect(place(ctx, 54 + 7, 44).leftovers).toEqual([]);
  });
});

describe("room a stack asks of a tray", () => {
  const ctx = createCtx(
    makeInput([
      boxReq("under", 50, 40, 10, { elastic: { w: true, d: true }, growth: { w: 5, d: 5 } }),
      boxReq("over", 80, 40, 10),
      boxReq("rigid", 50, 40, 10),
    ]),
    fakeMeasure,
  );

  it("is not counted against the bin's cap: the cap counts from the tray's size", () => {
    const levels = stackLevels(ctx, [item(0), item(1)]);
    const foot = stackMinFootprint(ctx, levels);
    // the bin is its own 5 mm cap plus whatever the stack asks, so it can take this much more
    expect(foot.w).toBeGreaterThan(levels[0]?.minW ?? 0);
    expect(levelAbsorb(levels[0] as never, foot).w).toBe(levels[0]?.capW);
    expect(levelGrowth(levels[0] as never).w).toBe(500);
  });

  it("is thicker walls, off the wall growth, for a tray whose contents cannot grow", () => {
    const levels = stackLevels(ctx, [item(2), item(1)]);
    const foot = stackMinFootprint(ctx, levels);
    expect(levelAbsorb(levels[0] as never, foot)).toEqual({ w: 0, d: 0 });
  });

  it("carries the stack's footprint to the tray as stackMin, and the plan reports what was asked", () => {
    const tree: Tree = {
      root: leaf([
        { req: 0, variant: 0, part: 0, rotated: false },
        { req: 1, variant: 0, part: 0, rotated: false },
      ]),
      variants: [0, 0],
    };
    const plan = evaluate(ctx, tree);
    const lower = plan.trays.find((t) => t.level === 0);
    expect(lower?.needW).toBeGreaterThan(lower?.minW ?? 0);
    const seen: unknown[] = [];
    materialize(ctx, plan, (p, outer, settings, opts) => {
      seen.push(opts.stackMin);
      return fakeRealize(p, outer, settings, opts);
    });
    // tray-local mm; the bottom tray is asked to be as wide as the one it carries plus two insets
    expect(seen[0]).toEqual({ w: (lower?.needW ?? 0) / 100, d: (lower?.needD ?? 0) / 100 });
  });
});

describe("height growth", () => {
  it("gives height slack to a deeper-growing tray only up to its cap, the rest to the top tray", () => {
    const ctx = createCtx(
      makeInput(
        [
          boxReq("bin", 50, 40, 10, { elastic: { h: true }, growth: { h: 8 } }),
          boxReq("top", 50, 40, 10),
        ],
        { box: { innerHeight: 60 } },
      ),
      fakeMeasure,
    );
    const h = stackHeights(ctx, stackLevels(ctx, [item(0), item(1)]));
    const min = ctx.metrics({ req: 0, variant: 0, part: 0 }, true, 0).h;
    // the bin got 8 mm (rounded to a layer), not everything
    expect((h.h[0] ?? 0) - min).toBeLessThanOrEqual(800);
    expect((h.h[0] ?? 0) - min).toBeGreaterThan(0);
    expect(h.h.reduce((s, v) => s + v, 0)).toBe(ctx.topPlane);
  });

  it("takes all of it when unbounded, as bins used to", () => {
    const ctx = createCtx(
      makeInput([boxReq("bin", 50, 40, 10, { elastic: { h: true } }), boxReq("top", 50, 40, 10)], {
        box: { innerHeight: 60 },
      }),
      fakeMeasure,
    );
    const h = stackHeights(ctx, stackLevels(ctx, [item(0), item(1)]));
    const top = ctx.metrics({ req: 1, variant: 0, part: 0 }, false, 1).h;
    expect(h.h[1]).toBe(Math.max(top, ctx.upperMinH));
  });
});

describe("in a roomy box", () => {
  // One bin and plenty of floor: bounded growth leaves a filler, unbounded does not
  const run = (growth: Record<string, number> | undefined) => {
    const input = makeInput(
      [boxReq("bin", 50, 40, 10, { elastic: { w: true, d: true }, growth })],
      {
        box: { innerWidth: 120, innerDepth: 80, innerHeight: 30 },
      },
    );
    return optimize(input, 1, 5000);
  };

  it("leaves a filler beside a bounded bin, and none beside an unbounded one", () => {
    const bounded = run({ w: 10, d: 10 });
    const free = run(undefined);
    expect(bounded.layout).not.toBeNull();
    expect(free.layout?.trays.filter((t) => t.part === "leftover")).toEqual([]);
    expect(bounded.layout?.trays.some((t) => t.part === "leftover")).toBe(true);
    // the bin took its 10 mm on whichever axis the gap was on, not the whole box
    const bin = bounded.layout?.trays.find((t) => t.part === "tray");
    expect(Math.max(bin?.w ?? 0, bin?.d ?? 0)).toBeLessThan(110);
  });
});
