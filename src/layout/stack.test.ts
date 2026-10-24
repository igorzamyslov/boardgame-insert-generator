import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { createCtx, INF_U, withSizeLocks, type Ctx } from "./context";
import {
  levelAbsorb,
  levelLockCap,
  levelMinFootprints,
  stackAllowed,
  stackHeights,
  stackLevels,
  stackMinFootprint,
  type Level,
} from "./stack";
import { boxReq, comp, fakeMeasure, item, makeInput, part, req, variant } from "./test-utils";

function ctxFor(box: { innerHeight?: number; headroom?: number } = {}, wallAbsorb = 0): Ctx {
  return createCtx(
    makeInput(
      [
        boxReq("big", 100, 60, 20),
        boxReq("small", 50, 40, 10),
        boxReq("scoop", 50, 40, 10, { elastic: { w: true, d: true, h: true } }),
        boxReq("tall", 50, 40, 45),
        boxReq("flat", 50, 40, 2),
      ],
      { box, settings: { wallAbsorb } },
    ),
    fakeMeasure,
  );
}

/** Level `k` of a stack the test built. */
function lvl(levels: readonly Level[], k: number): Level {
  const l = levels[k];
  if (!l) {
    throw new Error(`no level ${k}`);
  }
  return l;
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

  it("requires leaf ≥ req_k: every level stands flush in the one below, so a stack does not narrow", () => {
    const ctx = ctxFor();
    const levels = stackLevels(ctx, [item(1), item(0)]);
    const f = stackMinFootprint(ctx, levels);
    expect(f.w).toBe(Math.max(5600, 10400));
    expect(f.d).toBe(Math.max(4600, 6400));
    expect(stackMinFootprint(ctx, [])).toEqual({ w: ctx.minFiller, d: ctx.minFiller });
  });

  it("gives each level the smallest tray that holds itself and the trays above it", () => {
    const ctx = ctxFor();
    const levels = stackLevels(ctx, [item(1), item(0)]);
    const [lower, upper] = levelMinFootprints(levels);
    // the upper tray needs only its own size; the lower one its own, or the upper's (flush)
    expect(upper).toEqual({ w: lvl(levels, 1).minW, d: lvl(levels, 1).minD });
    expect(lower).toEqual({
      w: Math.max(lvl(levels, 0).minW, lvl(levels, 1).minW),
      d: Math.max(lvl(levels, 0).minD, lvl(levels, 1).minD),
    });
    expect(lower).toEqual(stackMinFootprint(ctx, levels));
    expect(levelMinFootprints([])).toEqual([]);
  });

  it("reports absorbable slack: elastic axes unlimited, else the wall growth the user allows", () => {
    const ctx = ctxFor({}, 1.6);
    const solo = stackLevels(ctx, [item(1)]);
    expect(levelAbsorb(lvl(solo, 0), stackMinFootprint(ctx, solo))).toEqual({ w: 320, d: 320 });
    // The default allows no growth: nothing but an elastic axis absorbs slack.
    const none = ctxFor();
    const soloNone = stackLevels(none, [item(1)]);
    expect(levelAbsorb(lvl(soloNone, 0), stackMinFootprint(none, soloNone))).toEqual({
      w: 0,
      d: 0,
    });
    const scoop = stackLevels(ctx, [item(2)]);
    expect(levelAbsorb(lvl(scoop, 0), stackMinFootprint(ctx, scoop))).toEqual({
      w: INF_U,
      d: INF_U,
    });
    expect(levelLockCap(lvl(solo, 0))).toEqual({ w: INF_U, d: INF_U });
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
    const ctx = ctxFor({ innerHeight: 60.1 });
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
    expect(levelLockCap(lvl(levels, 0))).toEqual({ w: 12000, d: 7000 });
    expect(levelLockCap(lvl(levels, 1))).toEqual({ w: INF_U, d: INF_U });
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
        settings: {
          lip: {
            joint: lip ? ("rim" as const) : ("off" as const),
            height: 2,
            thickness: 1.2,
            ledge: 1.7,
            play: 0.25,
            stepHeight: 1.5,
          },
        },
      }),
      fakeMeasure,
    );

  it("allows a single tray whatever its size and refuses a stack whose lipped wall outgrows the bed", () => {
    const ctx = make(true);
    expect(stackAllowed(ctx, [item(0)])).toBe(true);
    expect(stackAllowed(ctx, [item(0), item(1)])).toBe(false); // lipped wall: 121 mm
    // flush: the upper tray is its own 119 mm, with no inset to add (it was 121.9 mm inset)
    expect(stackAllowed(ctx, [item(1), item(0)])).toBe(true);
    expect(stackAllowed(ctx, [item(1), item(1)])).toBe(true);
  });

  it("judges the footprint in either bed orientation", () => {
    // rotated: the 119 mm side runs along Y; the 120 x 120 bed is square, so still too big
    expect(stackAllowed(make(true), [item(0, true), item(1)])).toBe(false);
  });

  it("lets a part stack under a thin lip-less stack that still fits", () => {
    const off = make(false);
    // Lip off: no lipped wall, and an upper tray is exactly its own footprint, so the 119 mm part
    // fits either way up on the 120 mm bed.
    expect(stackAllowed(off, [item(0), item(1)])).toBe(true);
    expect(stackAllowed(off, [item(1), item(0)])).toBe(true);
  });
});

describe("alike trays in a stack (owner, 2026-10-23)", () => {
  // Three copies of one 50 × 40 × 10 tray, and a 100 × 60 × 20 one of another kind. fakeMeasure: a
  // copy is 54 × 44 × 11.2 mm plain and 56 × 46 mm with a lip; the lip is 2 mm and the layer 0.2.
  const cell = comp({ minW: 50, minD: 40, minH: 10, contents: "c" });
  const copies = req("c", [
    variant("v", [part("c:p0:0", [cell]), part("c:p1:0", [cell]), part("c:p2:0", [cell])]),
  ]);
  const other = boxReq("o", 100, 60, 20);
  const ctxAt = (innerHeight = 60, settings: Parameters<typeof makeInput>[1] = {}): Ctx =>
    createCtx(makeInput([copies, other], { box: { innerHeight }, ...settings }), fakeMeasure);
  const copy = (i: number) => ({ req: 0, variant: 0, part: i, rotated: false });
  const o = item(1);

  it("builds every copy of a stacked set with the lip and the groove's wall, top and bottom alike", () => {
    const ctx = ctxAt();
    const levels = stackLevels(ctx, [copy(0), copy(1), copy(2)]);
    expect(levels.map((l) => l.lipped)).toEqual([true, true, true]);
    expect(levels.map((l) => l.alike)).toEqual([0, 0, 0]);
    expect(levels.map((l) => [l.minW, l.minD, l.minH])).toEqual([
      [5600, 4600, 1120],
      [5600, 4600, 1120],
      [5600, 4600, 1120],
    ]);
  });

  it("builds a copy beside a tray of another kind the same way", () => {
    const ctx = ctxAt();
    const [bottom, top] = stackLevels(ctx, [copy(0), o]);
    expect(bottom?.lipped).toBe(true);
    expect(bottom?.minW).toBe(5600);
    expect(top?.alike).toBe(-1);
    expect(top?.lipped).toBe(false);
    const [low, high] = stackLevels(ctx, [o, copy(0)]);
    expect(low?.lipped).toBe(true);
    // the copy on top has the lip too: it could be anywhere in the stack
    expect(high?.lipped).toBe(true);
    expect(high?.minW).toBe(5600);
  });

  it("builds a lone copy as one in a stack when its set stands in a stack elsewhere", () => {
    const ctx = ctxAt();
    const set = ctx.alikeOf(copy(0));
    expect(stackLevels(ctx, [copy(0)])[0]?.minW).toBe(5400);
    const lone = stackLevels(ctx, [copy(0)], new Set([set]))[0];
    expect(lone?.lipped).toBe(true);
    expect(lone?.minW).toBe(5600);
    expect(lone?.alike).toBe(set);
    // a tray of no set is not affected
    expect(stackLevels(ctx, [o], new Set([set]))[0]?.lipped).toBe(false);
  });

  it("gives every copy of a stack the same height, the surplus shared out in whole layers", () => {
    const ctx = ctxAt();
    const h = stackHeights(ctx, stackLevels(ctx, [copy(0), copy(1), copy(2)]));
    expect(h.overflow).toBe(0);
    // 5800 of the 6000 are the stack's: the top copy's lip stands 200 above it. 5800 − 3 × 1120 is
    // 122 layers: 40 to each copy, and the 2 left over are air above the stack.
    expect(h.h).toEqual([1920, 1920, 1920]);
    expect(h.h.reduce((a, v) => a + v, 0) + ctx.lipHeight).toBeLessThanOrEqual(ctx.topPlane);
  });

  it("gives the remainder to a tray of another kind, never to one copy", () => {
    const ctx = ctxAt(60);
    const h = stackHeights(ctx, stackLevels(ctx, [copy(0), copy(1), o]));
    expect(h.h[0]).toBe(h.h[1]);
    expect(h.h.reduce((a, v) => a + v, 0)).toBe(ctx.topPlane);
    const first = stackHeights(ctx, stackLevels(ctx, [o, copy(0), copy(1)]));
    expect(first.h[1]).toBe(first.h[2]);
  });

  describe("the joints are best-effort: the top copy's rim and the riser under the bottom one", () => {
    // two copies, 2 × 11.2 mm; the top copy's rim is 2 mm and the riser asks 3 mm of surplus
    const heights = (innerHeight: number) => {
      const ctx = ctxAt(innerHeight);
      return stackHeights(ctx, stackLevels(ctx, [copy(0), copy(1)]));
    };

    it("keeps both when the stack can afford them", () => {
      const h = heights(60);
      expect(h).toMatchObject({ overflow: 0, rim: true, riser: true });
    });

    it("drops the top copy's rim first, when the riser is what the surplus is for", () => {
      // 26 mm: with the rim 1.6 mm is left for the riser, without it 3.6
      const h = heights(26);
      expect(h).toMatchObject({ overflow: 0, rim: false, riser: true });
      expect(h.h.reduce((a, v) => a + v, 0)).toBeLessThanOrEqual(2600);
      expect(h.h[0]).toBe(h.h[1]);
    });

    it("then the riser and the groove under the bottom copy, keeping the rim if the stack has room for it", () => {
      // 24.6 mm: 2.2 mm of surplus without the rim, short of the riser's 3; with the rim 0.2 mm
      const h = heights(24.6);
      expect(h).toMatchObject({ overflow: 0, rim: true, riser: false });
    });

    it("drops both when only the trays themselves fit", () => {
      const h = heights(22.8);
      expect(h).toMatchObject({ overflow: 0, rim: false, riser: false });
      expect(h.h).toEqual([1120, 1120]);
    });

    it("is out of height only when the trays themselves do not fit", () => {
      expect(heights(22).overflow).toBe(2240 - 2200);
    });

    it("always has the step's rim: the socket stands in the tray, not above it", () => {
      const step = { lip: { ...DEFAULT_SETTINGS.lip, joint: "step" as const } };
      const ctx = ctxAt(26, { settings: step });
      const h = stackHeights(ctx, stackLevels(ctx, [copy(0), copy(1)]));
      expect(h.rim).toBe(true);
    });
  });

  it("pads nothing without fillToTop, and asks no riser", () => {
    const ctx = ctxAt(26, { settings: { fillToTop: false } });
    const h = stackHeights(ctx, stackLevels(ctx, [copy(0), copy(1)]));
    expect(h.h).toEqual([1120, 1120]);
    expect(h.overflow).toBe(0);
  });

  it("is the old stack for trays with no copies", () => {
    const ctx = ctxAt();
    const h = stackHeights(ctx, stackLevels(ctx, [o, item(1)]));
    expect(h.h.reduce((a, v) => a + v, 0)).toBe(ctx.topPlane);
  });
});
