import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { materialize } from "./materialize";
import {
  boxReq,
  comp,
  fakeMeasure,
  fakeRealize,
  makeInput,
  part,
  req,
  variant,
} from "./test-utils";
import type { Realize } from "./materialize";
import { cut, leaf, type Tree } from "./tree";
import { toU } from "./units";

describe("materialize", () => {
  const reqs = [boxReq("a", 100, 60, 20), boxReq("b", 50, 40, 10)];
  const ctx = createCtx(makeInput(reqs), fakeMeasure);

  it("emits trays in mm with spacers translated and leftovers keyed leftover:n", () => {
    const tree: Tree = {
      root: cut(
        "x",
        leaf([{ req: 0, variant: 0, part: 0, rotated: false }]),
        leaf([{ req: 1, variant: 0, part: 0, rotated: false }]),
      ),
      variants: [0, 0],
    };
    const plan = evaluate(ctx, tree);
    const specs = materialize(ctx, plan, fakeRealize);
    const a = specs.find((t) => t.key === "a:p0:0");
    const spacer = specs.find((t) => t.key === "a:p0:0:spacer");
    expect(a).toMatchObject({ part: "tray", path: "0", level: 0, x: 0, y: 0, z: 0, lip: false });
    expect(spacer).toMatchObject({ part: "spacer", path: "", solid: true, x: 1.6, y: 1.6 });
    expect(specs.filter((t) => t.part === "leftover").map((t) => t.key)).toEqual(
      plan.leftovers.map((_, i) => `leftover:${i}`),
    );
    for (const t of specs) {
      for (const v of [t.x, t.y, t.z, t.w, t.d, t.h]) {
        expect(toU(v) / 100).toBe(v);
      }
    }
  });

  it("keeps a spacer's own features and translates only its position", () => {
    const tree: Tree = {
      root: leaf([{ req: 0, variant: 0, part: 0, rotated: false }]),
      variants: [0, 0],
    };
    const specs = materialize(ctx, evaluate(ctx, tree), fakeRealize);
    const spacer = specs.find((t) => t.key === "a:p0:0:spacer");
    expect(spacer?.features).toEqual([
      { type: "spacerNotch", axis: "y", at: 2.5, width: 10, depth: 3 },
    ]);
  });

  it("realizes a rotated tray inside its rotated footprint", () => {
    const tree: Tree = {
      root: leaf([{ req: 0, variant: 0, part: 0, rotated: true }]),
      variants: [0, 0],
    };
    const specs = materialize(ctx, evaluate(ctx, tree), fakeRealize);
    const a = specs.find((t) => t.key === "a:p0:0");
    expect(a?.rotated).toBe(true);
    for (const c of a?.compartments ?? []) {
      expect(c.x + c.w).toBeLessThanOrEqual((a?.w ?? 0) + 1e-9);
      expect(c.y + c.d).toBeLessThanOrEqual((a?.d ?? 0) + 1e-9);
    }
  });

  it("emits a filler within a stack level in its stack and level, standing on its level's floor", () => {
    const stackCtx = createCtx(
      makeInput(reqs, { box: { innerWidth: 107, innerDepth: 67 } }),
      fakeMeasure,
    );
    const tree: Tree = {
      root: leaf([
        { req: 0, variant: 0, part: 0, rotated: false },
        { req: 1, variant: 0, part: 0, rotated: false },
      ]),
      variants: [0, 0],
    };
    const plan = evaluate(stackCtx, tree);
    const specs = materialize(stackCtx, plan, fakeRealize);
    const lower = specs.find((t) => t.key === "a:p0:0");
    const upper = specs.find((t) => t.key === "b:p0:0");
    const fillers = specs.filter((t) => t.part === "leftover");
    expect(fillers.length).toBeGreaterThan(0);
    for (const f of fillers) {
      expect(f).toMatchObject({ path: "", stack: lower?.stack, level: 1, z: upper?.z });
      expect(toU(f.z + f.h)).toBe(stackCtx.topPlane);
    }
    expect(fillers.map((t) => t.key)).toEqual(plan.leftovers.map((_, i) => `leftover:${i}`));
    // the upper tray is at its own size, not stretched over the lower tray
    expect(upper?.w).toBe(54);
    expect(upper?.w).toBeLessThan((lower?.w ?? 0) - 2 * (lower?.wall ?? 0));
  });
});

describe("materialize: alike trays (owner, 2026-10-23)", () => {
  const cell = comp({ minW: 50, minD: 40, minH: 10, contents: "c" });
  const set = req("c", [
    variant("v", [part("c:p0:0", [cell]), part("c:p1:0", [cell]), part("c:p2:0", [cell])]),
  ]);
  const ctx = createCtx(makeInput([set]), fakeMeasure);
  const copy = (i: number) => ({ req: 0, variant: 0, part: i, rotated: false });

  it("realizes every tray of a set the same way, as a tray in the middle of a stack, wherever it stands", () => {
    const calls: { key: string; w: number; opts: Parameters<Realize>[3] }[] = [];
    const record: Realize = (part, outer, settings, opts) => {
      calls.push({ key: part.trayKey, w: outer.w, opts });
      return fakeRealize(part, outer, settings, opts);
    };
    const plan = evaluate(ctx, {
      root: cut("x", leaf([copy(0), copy(1)]), leaf([copy(2)])),
      variants: [0],
    });
    const specs = materialize(ctx, plan, record).filter((t) => t.part === "tray");
    // they are lipped, the top one too, and stored at the stack level they stand at
    expect(specs.map((t) => [t.key, t.level, t.lip])).toEqual([
      ["c:p0:0", 0, true],
      ["c:p1:0", 1, true],
      ["c:p2:0", 0, true],
    ]);
    expect(new Set(specs.map((t) => `${t.w}x${t.d}`)).size).toBe(1);
    // realized as lipped trays above level 0, with the same room and the same padding
    expect(calls.map((c) => [c.opts.lipped, c.opts.level])).toEqual([
      [true, 1],
      [true, 1],
      [true, 1],
    ]);
    // each stack pads its own copies alike (a lone copy has the whole stack's surplus to itself), and
    // the riser splitRisers makes takes the padding off every one of them
    expect(calls[0]?.opts.padding).toBe(calls[1]?.opts.padding);
    expect(calls[0]?.opts.padding).toBeGreaterThan(0);
    expect(new Set(calls.map((c) => c.w)).size).toBe(1);
  });

  it("gives the top copy no lip when its stack cannot afford the rim, and realizes it as the others", () => {
    const tight = createCtx(makeInput([set], { box: { innerHeight: 26 } }), fakeMeasure);
    const calls: Parameters<Realize>[3][] = [];
    const record: Realize = (part, outer, settings, opts) => {
      calls.push(opts);
      return fakeRealize(part, outer, settings, opts);
    };
    const plan = evaluate(tight, { root: leaf([copy(0), copy(1)]), variants: [0] });
    const specs = materialize(tight, plan, record).filter((t) => t.part === "tray");
    expect(specs.map((t) => [t.level, t.lip])).toEqual([
      [0, true],
      [1, false],
    ]);
    // the same walls and wells: the rim is a ring on the wall, not a thicker one
    expect(calls.map((o) => [o.lipped, o.level])).toEqual([
      [true, 1],
      [true, 1],
    ]);
    expect(new Set(specs.map((t) => JSON.stringify([t.w, t.d, t.h, t.compartments]))).size).toBe(1);
  });

  it("realizes a lone copy of a set that is nowhere in a stack as any plain tray", () => {
    const calls: Parameters<Realize>[3][] = [];
    const record: Realize = (part, outer, settings, opts) => {
      calls.push(opts);
      return fakeRealize(part, outer, settings, opts);
    };
    const plan = evaluate(ctx, {
      root: cut("x", leaf([copy(0)]), leaf([copy(1)])),
      variants: [0],
    });
    const specs = materialize(ctx, plan, record).filter((t) => t.part === "tray");
    expect(specs.map((t) => t.lip)).toEqual([false, false]);
    expect(calls.map((o) => [o.lipped, o.level])).toEqual([
      [false, 0],
      [false, 0],
    ]);
  });
});
