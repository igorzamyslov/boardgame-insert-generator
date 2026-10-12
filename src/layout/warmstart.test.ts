import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
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
  traySpec,
  variant,
} from "./test-utils";
import { cut, leaf, SHARE_MAX, type Tree } from "./tree";
import { inferVariant, warmHints, warmTree } from "./warmstart";

const reqs = [
  boxReq("a", 100, 60, 20),
  boxReq("b", 50, 40, 10),
  boxReq("c", 60, 40, 15),
  req("d", [
    variant("one", [
      part("d:p0:0", [
        comp({ minW: 30, minD: 30, minH: 10 }),
        comp({ minW: 30, minD: 30, minH: 10 }),
      ]),
    ]),
    variant("two", [
      part("d:p0:0", [comp({ minW: 30, minD: 30, minH: 10 })]),
      part("d:p0:1", [comp({ minW: 30, minD: 30, minH: 10 })]),
    ]),
  ]),
];
const ctx = createCtx(makeInput(reqs), fakeMeasure);
const at = (r: number, v = 0, p = 0, rotated = false) => ({ req: r, variant: v, part: p, rotated });

const tree: Tree = {
  root: cut(
    "x",
    leaf([at(0), at(1, 0, 0, true)]),
    cut(
      "y",
      leaf([at(2)]),
      cut("x", leaf([at(3, 1, 0)]), leaf([at(3, 1, 1)]), SHARE_MAX / 3),
      123_456,
    ),
    700_000,
  ),
  variants: [0, 0, 0, 1],
};

describe("warm start", () => {
  const trays = materialize(ctx, evaluate(ctx, tree), fakeRealize);

  it("infers variants, rotations and cut axes from a stored layout", () => {
    const h = warmHints(ctx, trays);
    expect(h.variantOf(3)).toBe(1);
    expect(h.rotatedOf("b:p0:0")).toBe(true);
    expect(h.axisOf("")).toBe("x");
    expect(h.axisOf("1")).toBe("y");
    expect(h.prev.get("a:p0:0")).toEqual({ x: 0, y: 0, level: 0 });
  });

  it("counts a tray's level over the trays below it that still exist", () => {
    // a:p0:0 and b:p0:0 share a stack (levels 0, 1); a requirement removed from the input
    // leaves no gap below its stack-mates
    const h = warmHints(ctx, trays);
    expect(h.levelOf("a:p0:0")).toBe(0);
    expect(h.levelOf("b:p0:0")).toBe(1);
    expect(h.levelOf("nope")).toBeUndefined();
    const smaller = createCtx(makeInput(reqs.slice(1)), fakeMeasure);
    expect(warmHints(smaller, trays).levelOf("b:p0:0")).toBe(0);
  });

  it("rebuilds a tree that reproduces the stored placement exactly", () => {
    const rebuilt = warmTree(
      ctx,
      trays,
      reqs.map(() => null),
      warmHints(ctx, trays),
    );
    expect(rebuilt).not.toBeNull();
    if (rebuilt) {
      expect(rebuilt.variants).toEqual([0, 0, 0, 1]);
      expect(materialize(ctx, evaluate(ctx, rebuilt), fakeRealize)).toEqual(trays);
    }
  });

  it("rejects corrupt paths", () => {
    const bad = trays.map((t, i) => (i === 0 ? { ...t, path: "0x" } : t));
    expect(
      warmTree(
        ctx,
        bad,
        reqs.map(() => null),
        warmHints(ctx, bad),
      ),
    ).toBeNull();
    const prefix = trays.map((t, i) => (i === 0 ? { ...t, path: "" } : t));
    expect(
      warmTree(
        ctx,
        prefix,
        reqs.map(() => null),
        warmHints(ctx, prefix),
      ),
    ).toBeNull();
  });

  it("drops trays of unknown keys and leaves their leaf empty", () => {
    const renamed = trays.map((t) => (t.key === "c:p0:0" ? { ...t, key: "gone:p0:0" } : t));
    const rebuilt = warmTree(
      ctx,
      renamed,
      reqs.map(() => null),
      warmHints(ctx, renamed),
    );
    expect(
      rebuilt && rebuilt.root.kind === "cut" && rebuilt.root.b.kind === "cut" && rebuilt.root.b.a,
    ).toEqual(leaf([]));
  });

  it("tells apart variants that share trayKeys by their compartment minimums", () => {
    const shared = [
      req("s", [
        variant("upright", [part("s:p0:0", [comp({ minW: 30, minD: 90, minH: 65 })])]),
        variant("flat", [part("s:p0:0", [comp({ minW: 65, minD: 90, minH: 30 })])]),
      ]),
    ];
    const sctx = createCtx(makeInput(shared), fakeMeasure);
    const tray = (w: number, h: number): TraySpec =>
      traySpec({
        key: "s:p0:0",
        path: "",
        w: w + 4,
        d: 94,
        h,
        wall: 2,
        compartments: [
          { x: 2, y: 2, w, d: 90, floorZ: 1.2, kind: "well", contents: "s", features: [] },
        ],
      });
    expect(inferVariant(sctx, 0, [tray(66, 32)])).toBe(1); // only "flat" holds
    expect(inferVariant(sctx, 0, [tray(31, 67)])).toBe(0); // only "upright" holds
    expect(inferVariant(sctx, 0, [tray(66, 67)])).toBe(0); // both hold: the first
    expect(warmHints(sctx, [tray(66, 32)]).variantOf(0)).toBe(1);
  });
});
