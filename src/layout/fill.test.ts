import { describe, expect, it } from "vitest";
import { createCtx, withSizeLocks, type Ctx } from "./context";
import { evaluate, overflowTotal, placeStack } from "./fill";
import { stackLevels } from "./stack";
import { CHANNEL_DEPTH } from "../sizing/constants";
import { boxReq, comp, fakeMeasure, item, makeInput, part, req, variant } from "./test-utils";
import { cut, leaf } from "./tree";
import type { TrayRequirement } from "../sizing/types";

function ctxOf(reqs: TrayRequirement[], o: Parameters<typeof makeInput>[1] = {}): Ctx {
  return createCtx(makeInput(reqs, o), fakeMeasure);
}

describe("fill: a stack level holds a tray plus fillers", () => {
  // fakeMeasure: a 100 × 60 part is 10600 × 6600 units lipped (it carries a tray), a 50 × 40 part
  // 5400 × 4400 unlipped, a 52 × 42 part 5800 × 4800 lipped. Inset 145, gap 20, and the thinnest
  // filler beside an upper tray is 260 (the upper chamfer is 0.5 mm: 2 × (0.5 + 0.8) mm).
  const wide = boxReq("wide", 100, 60, 20);
  const small = boxReq("small", 50, 40, 10);
  const mid = boxReq("mid", 52, 42, 20);

  it("keeps an upper tray at its own size and puts the rest of its level into fillers", () => {
    const ctx = ctxOf([wide, small]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    const [bottom, upper] = sp.trays;
    expect(bottom?.w).toBe(10600);
    expect(upper?.w).toBe(5400);
    expect(upper?.d).toBe(4400);
    expect(sp.leftovers).toEqual([]);
    // along X beside the upper tray, then below it along Y, both inside the lower tray's lip ring
    const region = {
      x: ctx.inset,
      y: ctx.inset,
      w: 10600 - 2 * ctx.inset,
      d: 6600 - 2 * ctx.inset,
    };
    expect(sp.fillers).toEqual([
      {
        level: 1,
        rect: {
          x: region.x + 5400 + ctx.gap,
          y: region.y,
          w: region.w - 5400 - ctx.gap,
          d: region.d,
        },
        z: bottom?.h,
        h: upper?.h,
      },
      {
        level: 1,
        rect: { x: region.x, y: region.y + 4400 + ctx.gap, w: 5400, d: region.d - 4400 - ctx.gap },
        z: bottom?.h,
        h: upper?.h,
      },
    ]);
  });

  it("gives every identical tray the same size whatever it is stacked on", () => {
    const ctx = ctxOf([wide, small, small]);
    const alone = placeStack(ctx, stackLevels(ctx, [item(1)]), { x: 0, y: 0, w: 5400, d: 4400 });
    const onWide = placeStack(ctx, stackLevels(ctx, [item(0), item(2)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    expect(onWide.trays[1]?.w).toBe(alone.trays[0]?.w);
    expect(onWide.trays[1]?.d).toBe(alone.trays[0]?.d);
  });

  it("absorbs a level's slack too narrow to be a part, as the bottom tray does", () => {
    const ctx = ctxOf([mid, small]);
    // the upper level's room is 5510 wide, 110 more than the tray: under minFillerUpper + gap
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 0,
      y: 0,
      w: 5800,
      d: 4800,
    });
    expect(sp.trays[1]?.w).toBe(5800 - 2 * ctx.inset);
    expect(sp.trays[1]?.d).toBe(4800 - 2 * ctx.inset);
    expect(sp.fillers).toEqual([]);
  });

  it("makes a filler no thinner than the upper chamfer needs", () => {
    const ctx = ctxOf([mid, small]);
    expect(ctx.minFillerUpper).toBe(260);
    // a leaf 170 wider than the bottom tray's minimum is absorbed by it: the upper level then has
    // room for a filler exactly minFillerUpper wide
    const exact = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 0,
      y: 0,
      w: 5800 + 170,
      d: 4800,
    });
    expect(exact.trays[0]?.w).toBe(5970);
    expect(exact.trays[1]?.w).toBe(5400);
    expect(exact.fillers.map((f) => f.rect.w)).toEqual([ctx.minFillerUpper]);
    // one unit less, and there is nowhere for it to go but the tray
    const less = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 0,
      y: 0,
      w: 5800 + 169,
      d: 4800,
    });
    expect(less.fillers).toEqual([]);
    expect(less.trays[1]?.w).toBe(5800 + 169 - 2 * ctx.inset);
  });

  it("lets an elastic upper tray grow into its level instead of printing a filler", () => {
    const bin = boxReq("bin", 50, 40, 10, { elastic: { w: true, d: true, h: true } });
    const ctx = ctxOf([wide, bin]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    expect(sp.fillers).toEqual([]);
    expect(sp.trays[1]?.w).toBe(10600 - 2 * ctx.inset);
    expect(sp.trays[1]?.d).toBe(6600 - 2 * ctx.inset);
  });

  it("emits in-level fillers from evaluate, in their stack and level, off the bottom crossing", () => {
    const ctx = ctxOf([wide, small], { box: { innerWidth: 107, innerDepth: 67 } });
    const plan = evaluate(ctx, { root: leaf([item(0), item(1)]), variants: [0, 0] });
    expect(overflowTotal(plan.overflow)).toBe(0);
    const inLevel = plan.leftovers.filter((l) => l.level === 1);
    expect(inLevel.length).toBeGreaterThan(0);
    expect(plan.leftovers.length).toBe(inLevel.length);
    for (const l of inLevel) {
      expect(l.stack).toBe(plan.trays[0]?.stack);
      expect(l.z).toBe(plan.trays[1]?.z);
      expect(l.h).toBe(plan.trays[1]?.h);
      expect(l.path).toBe("");
    }
    // heights still add up to the top plane: fillers add none
    expect(plan.trays.reduce((s, t) => s + t.h, 0)).toBe(ctx.topPlane);
    // a filler in a level is not a bottom-layer part
    expect(plan.crossX).toBe(1);
    expect(plan.crossY).toBe(1);
  });

  it("stands each level's filler from its own floor to the top of the stack", () => {
    const tiny = boxReq("tiny", 30, 20, 10);
    const ctx = ctxOf([wide, mid, tiny]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1), item(2)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    const [t0, t1, t2] = sp.trays;
    // each tray stands inside the one below it, in its corner
    expect(t1?.x).toBe(ctx.inset);
    expect(t2?.x).toBe(2 * ctx.inset);
    const levels = new Set(sp.fillers.map((f) => f.level));
    expect([...levels].sort()).toEqual([1, 2]);
    const top = (t0?.h ?? 0) + (t1?.h ?? 0) + (t2?.h ?? 0);
    expect(top).toBe(ctx.topPlane);
    for (const f of sp.fillers) {
      const own = f.level === 1 ? t1 : t2;
      expect(f.z).toBe(own?.z);
      expect(f.z + f.h).toBe(top);
    }
    // a level's fillers sit inside the tray below it, so they never overlap another level's
    const l1 = sp.fillers.filter((f) => f.level === 1);
    const l2 = sp.fillers.filter((f) => f.level === 2);
    const t1End = (t1?.x ?? 0) + (t1?.w ?? 0);
    expect(l1.every((f) => f.rect.x >= t1End || f.rect.y >= (t1?.y ?? 0) + (t1?.d ?? 0))).toBe(
      true,
    );
    expect(l2.every((f) => f.rect.x + f.rect.w <= t1End)).toBe(true);
  });

  it("holds a size-locked upper tray to its lock, with the rest of its level as fillers", () => {
    const base = ctxOf([wide, small]);
    const ctx = withSizeLocks(
      base,
      new Map([[base.partId(item(1)), { w: 5400, d: 4400, h: 1500, rotated: false }]]),
    );
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    expect(sp.trays[1]?.w).toBe(5400);
    expect(sp.trays[1]?.d).toBe(4400);
    expect(sp.overflowLock).toBe(0);
    expect(sp.fillers.length).toBeGreaterThan(0);
  });
});

describe("fill: which end of its level an upper tray stands at (spec §6.4)", () => {
  // A 100 × 60 tray under a 50 × 40 one that has a finger cut on one wall: the filler beside the
  // small tray goes to the end its cut does not face.
  const wide = boxReq("wide", 100, 60, 20);
  const cutOn = (...sides: ("front" | "back" | "left" | "right")[]): TrayRequirement =>
    req("small", [
      variant("v", [
        part(
          "small:p0:0",
          [
            {
              ...comp({ minW: 50, minD: 40, minH: 10 }),
              features: sides.map((side) => ({
                type: "wallCutout" as const,
                side,
                depthFraction: CHANNEL_DEPTH,
                floorNotch: false,
              })),
            },
          ],
          false,
        ),
      ]),
    ]);
  const upper = (small: TrayRequirement) => {
    const ctx = ctxOf([wide, small]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    const ring = { x: ctx.inset, y: ctx.inset, w: 10600 - 2 * ctx.inset, d: 6600 - 2 * ctx.inset };
    return { ctx, sp, ring, tray: sp.trays[1] };
  };

  it("keeps the corner when the cut faces the wall beside the tray, as before", () => {
    const { sp, ring, tray } = upper(cutOn("left"));
    expect(tray?.x).toBe(ring.x);
    expect(tray?.y).toBe(ring.y);
    expect(sp.fillers.some((f) => f.rect.x >= ring.x + (tray?.w ?? 0))).toBe(true);
  });

  it("stands at the far end of X when its cut is on the right, filler on the left", () => {
    const { ctx, sp, ring, tray } = upper(cutOn("right"));
    expect(tray).toBeDefined();
    expect((tray?.x ?? 0) + (tray?.w ?? 0)).toBe(ring.x + ring.w);
    expect(tray?.y).toBe(ring.y);
    const left = sp.fillers.find((f) => f.rect.x === ring.x && f.rect.d === ring.d);
    expect(left?.rect.w).toBe((tray?.x ?? 0) - ctx.gap - ring.x);
    // nothing stands beyond the right wall
    expect(sp.fillers.every((f) => f.rect.x < (tray?.x ?? 0) + (tray?.w ?? 0))).toBe(true);
  });

  it("stands at the far end of Y when its cut is at the back, filler in front", () => {
    const { sp, ring, tray } = upper(cutOn("back"));
    expect((tray?.y ?? 0) + (tray?.d ?? 0)).toBe(ring.y + ring.d);
    expect(tray?.x).toBe(ring.x);
    expect(sp.fillers.every((f) => f.rect.y < (tray?.y ?? 0) + (tray?.d ?? 0))).toBe(true);
  });

  it("stays in the corner when both walls of the axis have a cut: no end is clear", () => {
    const { ring, tray } = upper(cutOn("left", "right"));
    expect(tray?.x).toBe(ring.x);
  });

  it("follows a part turned 90°: a cut on its front is on the right of the box", () => {
    const ctx = ctxOf([wide, cutOn("front")]);
    expect(ctx.cutSides(item(1), false)).toEqual({
      front: true,
      back: false,
      left: false,
      right: false,
    });
    expect(ctx.cutSides(item(1), true)).toEqual({
      front: false,
      back: false,
      left: false,
      right: true,
    });
  });

  it("counts the cuts of the trays above: they stand inside, against the same filler", () => {
    // the middle tray has no cut, the one on it has one on the right: the middle tray's filler goes
    // to the left too, or it would stand against the top tray's right wall
    const ctx = ctxOf([wide, boxReq("mid", 70, 50, 14), cutOn("right")]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1), item(2)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    const [, mid, top] = sp.trays;
    expect(mid).toBeDefined();
    expect((mid?.x ?? 0) + (mid?.w ?? 0)).toBe(10600 - ctx.inset);
    expect(top).toBeDefined();
  });

  it("puts the next level in the ring of the tray at the far end", () => {
    const ctx = ctxOf([wide, cutOn("right"), boxReq("tiny", 30, 20, 8)]);
    const sp = placeStack(ctx, stackLevels(ctx, [item(0), item(1), item(2)]), {
      x: 0,
      y: 0,
      w: 10600,
      d: 6600,
    });
    const [, mid, top] = sp.trays;
    expect(mid && top && top.x - mid.x).toBe(ctx.inset);
    expect(mid && top && top.x + top.w <= mid.x + mid.w - ctx.inset).toBe(true);
  });
});

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

  it("absorbs a gap too narrow to be a part, even with wallAbsorb 0", () => {
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

  it("with oneWall, absorbs up to ONE_WALL_MAX_MM per axis instead of a filler, and not a unit more", () => {
    const req = boxReq("a", 100, 60, 20);
    const room = 2000; // 20 mm, ONE_WALL_MAX_MM
    const on = ctxOf([req], { settings: { oneWall: true } });
    const fits = placeStack(on, stackLevels(on, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + room,
      d: 6400,
    });
    expect(fits.leftovers).toEqual([]);
    expect(fits.trays[0]?.w).toBe(10400 + room);
    // Past the ceiling the gap stays a filler, and the tray stays as small as it needs to be.
    const over = placeStack(on, stackLevels(on, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + room + 1,
      d: 6400,
    });
    expect(over.trays[0]?.w).toBe(10400);
    expect(over.leftovers).toHaveLength(1);
    // A 60 mm gap never becomes a 60 mm wall.
    const huge = placeStack(on, stackLevels(on, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + 6000,
      d: 6400,
    });
    expect(huge.trays[0]?.w).toBe(10400);
    // Off (the default), the same 20 mm is a filler.
    const off = ctxOf([req]);
    const printed = placeStack(off, stackLevels(off, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + room,
      d: 6400,
    });
    expect(printed.trays[0]?.w).toBe(10400);
    expect(printed.leftovers).toHaveLength(1);
  });

  it("with oneWall, replaces wallAbsorb rather than adding to it", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)], { settings: { oneWall: true, wallAbsorb: 3 } });
    const sp = placeStack(ctx, stackLevels(ctx, [item(0)]), {
      x: 0,
      y: 0,
      w: 10400 + 2000 + 600, // the ceiling plus what two 3 mm walls would have added
      d: 6400,
    });
    expect(sp.leftovers).toHaveLength(1);
  });

  it("absorbs up to wallAbsorb per wall, and prints a filler for more", () => {
    const ctx = ctxOf([boxReq("a", 100, 60, 20)], { settings: { wallAbsorb: 1.6 } });
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
    // the upper tray is its own minimum, inside the lower tray's inset footprint
    expect(up?.w).toBe(5400);
    expect(up?.d).toBe(4400);
    expect((up?.w ?? 0) + 2 * ctx.inset).toBeLessThanOrEqual(lo?.w ?? 0);
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
