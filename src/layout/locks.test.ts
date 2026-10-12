import { describe, expect, it } from "vitest";
import type { Lock, StoredLayout } from "../model/types";
import { createCtx, withSizeLocks } from "./context";
import { applyLocks, moveEnvOf, noLocks, resolveLocks, swapLocks } from "./locks";
import { createRng } from "./prng";
import { boxReq, comp, fakeMeasure, makeInput, part, req, traySpec, variant } from "./test-utils";
import { cut, itemsOf, leaf, leaves, nodeAt, type Tree } from "./tree";

const reqs = [
  boxReq("a", 60, 40, 10),
  boxReq("b", 50, 40, 10, { rotatable: false }),
  req("c", [
    variant("one", [
      part("c:p0:0", [
        comp({ minW: 40, minD: 40, minH: 10 }),
        comp({ minW: 40, minD: 40, minH: 10 }),
      ]),
    ]),
    variant("two", [
      part("c:p0:0", [comp({ minW: 40, minD: 40, minH: 10 })]),
      part("c:p0:1", [comp({ minW: 40, minD: 40, minH: 10 })]),
    ]),
  ]),
];

function resolve(locks: Lock[], box = {}) {
  const ctx = createCtx(makeInput(reqs, { box, locks }), fakeMeasure);
  return { ctx, ...resolveLocks(ctx, locks) };
}

describe("resolveLocks", () => {
  it("drops a lock whose trayKey no longer exists, with a notice", () => {
    const r = resolve([{ kind: "position", trayKey: "c:p0:2", path: "0", rotated: false }]);
    expect(r.resolved.kept).toEqual([]);
    expect(r.notices).toEqual([
      expect.objectContaining({ level: "warning", code: "lock.dropped", path: "/locks/0" }),
    ]);
    expect(r.notices[0]?.message).toContain("c:p0:2");
  });

  it("pins the variant that contains the locked tray (a tray split into parts after an edit)", () => {
    const r = resolve([{ kind: "position", trayKey: "c:p0:1", path: "1", rotated: false }]);
    expect(r.resolved.pinnedVariant).toEqual([null, null, 1]);
    expect(r.resolved.leaves).toEqual([
      { path: "1", items: [{ req: 2, variant: 1, part: 1, rotated: false }] },
    ]);
    expect(r.notices).toEqual([]);
  });

  it("does not let a dropped lock pin the variant of its component", () => {
    // The path is invalid, so the lock is dropped; it must not keep forcing variant 1.
    const dropped = resolve([{ kind: "position", trayKey: "c:p0:1", path: "2", rotated: false }]);
    expect(dropped.resolved.kept).toEqual([]);
    expect(dropped.notices).toHaveLength(1);
    expect(dropped.resolved.pinnedVariant).toEqual([null, null, null]);
    // A kept lock on the same component still pins it.
    const mixed = resolve([
      { kind: "position", trayKey: "c:p0:1", path: "1", rotated: false },
      { kind: "position", trayKey: "c:p0:1", path: "2", rotated: false },
    ]);
    expect(mixed.resolved.kept).toHaveLength(1);
    expect(mixed.resolved.pinnedVariant).toEqual([null, null, 1]);
  });

  it("drops position locks with invalid, conflicting or impossible values", () => {
    const r = resolve([
      { kind: "position", trayKey: "a:p0:0", path: "01", rotated: false },
      { kind: "position", trayKey: "c:p0:0", path: "0", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "1", rotated: true },
      { kind: "position", trayKey: "b:p0:0", path: "2", rotated: false },
    ]);
    expect(r.resolved.kept.map((l) => (l.kind === "position" ? l.trayKey : ""))).toEqual([
      "a:p0:0",
    ]);
    expect(r.notices.map((n) => n.code)).toEqual(["lock.dropped", "lock.dropped", "lock.dropped"]);
    // path names the dropped lock's index in the input, for the UI to remove exactly it
    expect(r.notices.map((n) => n.path).sort()).toEqual(["/locks/1", "/locks/2", "/locks/3"]);
    expect(r.resolved.lockedPaths).toEqual(["01"]);
  });

  it("keeps a valid size lock (detecting rotation) and drops ones that no longer fit", () => {
    const r = resolve([
      { kind: "size", trayKey: "a:p0:0", w: 44, d: 64, h: 30 },
      { kind: "size", trayKey: "b:p0:0", w: 10, d: 10, h: 10 },
      { kind: "size", trayKey: "c:p0:0", w: 400, d: 50, h: 20 },
    ]);
    expect([...r.resolved.sizes.values()]).toEqual([{ w: 4400, d: 6400, h: 3000, rotated: true }]);
    expect(r.notices.map((n) => n.message)).toEqual([
      expect.stringContaining("contents no longer fit"),
      expect.stringContaining("no longer fits in the box"),
    ]);
  });

  it("validates stack locks and freezes their order", () => {
    const r = resolve([
      { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] },
      { kind: "stack", trayKeys: ["b:p0:0", "c:p0:0"] },
    ]);
    expect(r.resolved.groups).toEqual([
      [
        { req: 0, variant: 0, part: 0, rotated: false },
        { req: 1, variant: 0, part: 0, rotated: false },
      ],
    ]);
    expect(r.notices).toHaveLength(1);
    const tall = resolve([{ kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] }], { innerHeight: 15 });
    expect(tall.resolved.groups).toEqual([]);
    expect(tall.notices[0]?.message).toContain("taller");
  });
});

describe("applyLocks", () => {
  const ctx = createCtx(makeInput(reqs), fakeMeasure);
  const start: Tree = {
    root: cut(
      "x",
      leaf([{ req: 0, variant: 0, part: 0, rotated: false }]),
      cut(
        "y",
        leaf([{ req: 1, variant: 0, part: 0, rotated: false }]),
        leaf([{ req: 2, variant: 0, part: 0, rotated: false }]),
      ),
    ),
    variants: [0, 0, 0],
  };

  it("puts locked trays at their exact path, frozen, and completes the tree", () => {
    const { resolved } = resolveLocks(ctx, [
      { kind: "position", trayKey: "a:p0:0", path: "110", rotated: true },
      { kind: "position", trayKey: "c:p0:1", path: "0", rotated: false },
    ]);
    const locked = withSizeLocks(ctx, resolved.sizes);
    const env = moveEnvOf(locked, resolved);
    const t = applyLocks(start, resolved, env, createRng(1), (p) => (p === "11" ? "y" : undefined));
    expect(t).not.toBeNull();
    if (!t) {
      return;
    }
    expect(nodeAt(t.root, "110")).toEqual(
      leaf([{ req: 0, variant: 0, part: 0, rotated: true }], true),
    );
    expect(nodeAt(t.root, "0")).toEqual(
      leaf([{ req: 2, variant: 1, part: 1, rotated: false }], true),
    );
    const n11 = nodeAt(t.root, "11");
    expect(n11?.kind === "cut" && n11.axis).toBe("y");
    expect(t.variants).toEqual([0, 0, 1]);
    const keys = itemsOf(t.root)
      .map((i) => `${i.req}.${i.variant}.${i.part}`)
      .sort();
    expect(keys).toEqual(["0.0.0", "1.0.0", "2.1.0", "2.1.1"]);
  });

  it("is a no-op shape-wise without locks", () => {
    const env = moveEnvOf(ctx, noLocks(ctx));
    const t = applyLocks(start, noLocks(ctx), env, createRng(2));
    expect(t && leaves(t.root).length).toBe(3);
  });
});

describe("swapLocks", () => {
  const layout: StoredLayout = {
    createdWith: "t",
    geometryVersion: "0.1.0",
    inputsHash: "h",
    seed: 1,
    iterations: 1,
    capped: false,
    trays: [
      traySpec({ key: "a", path: "0", level: 0 }),
      traySpec({ key: "x", path: "0", level: 1 }),
      traySpec({ key: "b", path: "1", level: 0 }),
    ],
  };

  it("swaps whole leaves and locks both", () => {
    const out = swapLocks(
      [{ kind: "position", trayKey: "a", path: "0", rotated: false }],
      "a",
      "b",
      layout,
    );
    expect(out).toEqual([
      { kind: "position", trayKey: "a", path: "1", rotated: false },
      { kind: "position", trayKey: "x", path: "1", rotated: false },
      { kind: "stack", trayKeys: ["a", "x"] },
      { kind: "position", trayKey: "b", path: "0", rotated: false },
    ]);
  });

  it("swaps levels within one stack via a stack lock", () => {
    expect(swapLocks([], "a", "x", layout)).toEqual([{ kind: "stack", trayKeys: ["x", "a"] }]);
  });

  it("ignores unknown keys", () => {
    expect(swapLocks([], "a", "zzz", layout)).toEqual([]);
  });
});
