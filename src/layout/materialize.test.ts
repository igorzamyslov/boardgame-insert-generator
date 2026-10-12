import { describe, expect, it } from "vitest";
import { createCtx } from "./context";
import { evaluate } from "./fill";
import { materialize } from "./materialize";
import { boxReq, fakeMeasure, fakeRealize, makeInput } from "./test-utils";
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
});
