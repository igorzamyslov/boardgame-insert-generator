import { describe, expect, it } from "vitest";
import type { Lock, StoredLayout } from "../model/types";
import { createCtx, withSizeLocks } from "./context";
import { applyLocks, completeTree, moveEnvOf, noLocks, resolveLocks, swapLocks } from "./locks";
import { optimize } from "./optimize";
import { createRng } from "./prng";
import { boxReq, comp, fakeMeasure, makeInput, part, req, traySpec, variant } from "./test-utils";
import { cut, itemsOf, leaf, leaves, nodeAt, type StackItem, type Tree } from "./tree";

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
  it("reports a lock whose trayKey no longer exists as a conflict", () => {
    const r = resolve([{ kind: "position", trayKey: "c:p0:2", path: "0", rotated: false }]);
    expect(r.resolved.kept).toEqual([]);
    // the key means nothing to a user, and the tray is gone, so the name says that instead
    expect(r.conflicts).toEqual([
      {
        trayKey: "c:p0:2",
        name: "a tray that no longer exists",
        reason: "the component it was on was removed or changed",
      },
    ]);
  });

  it("names the component a conflicting lock was on, not its tray key", () => {
    const named = [
      req("cowsarwz", [
        variant("only", [
          part(
            "cowsarwz:p0:0",
            [comp({ minW: 60, minD: 40, minH: 10, contents: "Deck ×50" })],
            false,
          ),
        ]),
      ]),
      req("other", [
        variant("only", [
          part("other:p0:0", [comp({ minW: 50, minD: 40, minH: 10, contents: "Tokens ×20" })]),
        ]),
      ]),
    ];
    const locks: Lock[] = [
      { kind: "position", trayKey: "cowsarwz:p0:0", path: "01", rotated: true },
      { kind: "position", trayKey: "cowsarwz:p0:0", path: "0", rotated: false },
      { kind: "position", trayKey: "other:p0:0", path: "00", rotated: false },
      { kind: "stack", trayKeys: ["cowsarwz:p0:0", "gone:p0:0"] },
    ];
    const ctx = createCtx(makeInput(named, { locks }), fakeMeasure);
    const { conflicts } = resolveLocks(ctx, locks);
    expect(conflicts).toContainEqual({
      trayKey: "cowsarwz:p0:0",
      name: "Deck ×50",
      reason: "this tray can't be rotated",
    });
    expect(conflicts).toContainEqual({
      trayKey: "other:p0:0",
      name: "Tokens ×20",
      reason: 'it conflicts with the position lock on "Deck ×50"',
    });
    // a stack lock is named by its trays; the key to unpin is its first tray
    expect(conflicts).toContainEqual({
      trayKey: "cowsarwz:p0:0",
      name: "Deck ×50, a tray that no longer exists",
      reason: "the component it was on was removed or changed",
    });
    for (const c of conflicts) {
      expect(c.name).not.toMatch(/:p0:/);
      expect(c.reason).not.toMatch(/:p0:/);
    }
  });

  it("pins the variant that contains the locked tray (a tray split into parts after an edit)", () => {
    const r = resolve([{ kind: "position", trayKey: "c:p0:1", path: "1", rotated: false }]);
    expect(r.resolved.pinnedVariant).toEqual([null, null, 1]);
    expect(r.resolved.leaves).toEqual([
      { path: "1", items: [{ req: 2, variant: 1, part: 1, rotated: false }] },
    ]);
    expect(r.conflicts).toEqual([]);
  });

  it("does not let a conflicting lock pin the variant of its component", () => {
    // The path is invalid, so the lock is in conflict; it must not keep forcing variant 1.
    const dropped = resolve([{ kind: "position", trayKey: "c:p0:1", path: "2", rotated: false }]);
    expect(dropped.resolved.kept).toEqual([]);
    expect(dropped.conflicts).toHaveLength(1);
    expect(dropped.resolved.pinnedVariant).toEqual([null, null, null]);
    // A kept lock on the same component still pins it.
    const mixed = resolve([
      { kind: "position", trayKey: "c:p0:1", path: "1", rotated: false },
      { kind: "position", trayKey: "c:p0:1", path: "2", rotated: false },
    ]);
    expect(mixed.resolved.kept).toHaveLength(1);
    expect(mixed.resolved.pinnedVariant).toEqual([null, null, 1]);
  });

  it("reports position locks with invalid, conflicting or impossible values", () => {
    const r = resolve([
      { kind: "position", trayKey: "a:p0:0", path: "01", rotated: false },
      { kind: "position", trayKey: "c:p0:0", path: "0", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "1", rotated: true },
      { kind: "position", trayKey: "b:p0:0", path: "2", rotated: false },
    ]);
    expect(r.resolved.kept.map((l) => (l.kind === "position" ? l.trayKey : ""))).toEqual([
      "a:p0:0",
    ]);
    expect(r.conflicts.map((c) => c.trayKey).sort()).toEqual(["b:p0:0", "b:p0:0", "c:p0:0"]);
    expect(r.resolved.lockedPaths).toEqual(["01"]);
  });

  it("keeps a valid size lock (detecting rotation) and reports ones that no longer fit", () => {
    const r = resolve([
      { kind: "size", trayKey: "a:p0:0", w: 44, d: 64, h: 30 },
      { kind: "size", trayKey: "b:p0:0", w: 10, d: 10, h: 10 },
      { kind: "size", trayKey: "c:p0:0", w: 400, d: 50, h: 20 },
    ]);
    expect([...r.resolved.sizes.values()]).toEqual([{ w: 4400, d: 6400, h: 3000, rotated: true }]);
    expect(r.conflicts.map((c) => c.reason)).toEqual([
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
    expect(r.conflicts).toHaveLength(1);
    const tall = resolve([{ kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] }], { innerHeight: 15 });
    expect(tall.resolved.groups).toEqual([]);
    expect(tall.conflicts[0]?.reason).toContain("taller");
  });
});

describe("resolveLocks order independence", () => {
  const two = [
    req("d", [
      variant("one", [part("d:p0:0", [comp({ minW: 40, minD: 40, minH: 10 })])]),
      variant("two", [part("d:p0:1", [comp({ minW: 40, minD: 40, minH: 10 })])]),
    ]),
  ];
  const tooBig: Lock = { kind: "size", trayKey: "d:p0:1", w: 400, d: 50, h: 20 };
  const placed: Lock = { kind: "position", trayKey: "d:p0:0", path: "0", rotated: false };

  it("does not report a lock as conflicting because of a lock that is itself in conflict", () => {
    for (const locks of [
      [tooBig, placed],
      [placed, tooBig],
    ]) {
      const ctx = createCtx(makeInput(two, { locks }), fakeMeasure);
      const r = resolveLocks(ctx, locks);
      expect(r.resolved.kept).toEqual([placed]);
      expect(r.resolved.pinnedVariant).toEqual([0]);
      expect(r.conflicts).toHaveLength(1);
      // which reason depends on the order, the name and key do not
      expect(r.conflicts[0]).toEqual(
        expect.objectContaining({ trayKey: "d:p0:1", name: "40x40x10" }),
      );
    }
  });
});

describe("completeTree", () => {
  const ctx = createCtx(makeInput(reqs), fakeMeasure);
  const env = moveEnvOf(ctx, noLocks(ctx));
  const at = (r: number, v = 0, p = 0): StackItem => ({
    req: r,
    variant: v,
    part: p,
    rotated: false,
  });
  const keysOf = (t: Tree | null): string[] =>
    t
      ? itemsOf(t.root)
          .map((i) => `${i.req}.${i.variant}.${i.part}`)
          .sort()
      : [];

  it("keeps every valid item exactly once in a leaf that also holds a duplicate", () => {
    const t = completeTree(
      { root: leaf([at(0), at(1), at(0)]), variants: [0, 0, 0] },
      env,
      createRng(1),
    );
    expect(keysOf(t)).toEqual(["0.0.0", "1.0.0", "2.0.0"]);
  });

  it("keeps every valid item exactly once in a leaf that also holds a wrong-variant item", () => {
    const t = completeTree(
      { root: leaf([at(0), at(2, 1, 0), at(1)]), variants: [0, 0, 0] },
      env,
      createRng(2),
    );
    expect(keysOf(t)).toEqual(["0.0.0", "1.0.0", "2.0.0"]);
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

describe("position locks on stacked trays", () => {
  const pos = (trayKey: string, path: string): Lock => ({
    kind: "position",
    trayKey,
    path,
    rotated: false,
  });
  const ctxOf = (locks: Lock[]) => createCtx(makeInput(reqs, { locks }), fakeMeasure);
  const level = (key: string): number | undefined => ({ "a:p0:0": 0, "b:p0:0": 1 })[key];

  it("stacks trays locked to the same path by their level in the layout being re-run, not by lock order", () => {
    const locks = [pos("b:p0:0", "0"), pos("a:p0:0", "0")];
    const keys = (hints: Parameters<typeof resolveLocks>[2]) =>
      resolveLocks(ctxOf(locks), locks, hints).resolved.leaves[0]?.items.map(
        (i) => reqs[i.req]?.key,
      );
    expect(keys({ levelOf: level })).toEqual(["a", "b"]);
    // no layout to go by: input order
    expect(keys({})).toEqual(["b", "a"]);
  });

  it("keeps the order a stack lock gives, whatever the levels were", () => {
    const locks: Lock[] = [
      pos("a:p0:0", "0"),
      pos("b:p0:0", "0"),
      { kind: "stack", trayKeys: ["b:p0:0", "a:p0:0"] },
    ];
    const r = resolveLocks(ctxOf(locks), locks, { levelOf: level });
    expect(r.conflicts).toEqual([]);
    expect(r.resolved.leaves[0]?.items.map((i) => reqs[i.req]?.key)).toEqual(["b", "a"]);
  });

  it("reports a position lock on a tray that sits on top of others in the layout as a conflict", () => {
    const lone = [pos("b:p0:0", "0")];
    const r = resolveLocks(ctxOf(lone), lone, { levelOf: level });
    expect(r.resolved.kept).toEqual([]);
    expect(r.resolved.leaves).toEqual([]);
    expect(r.conflicts).toEqual([expect.objectContaining({ trayKey: "b:p0:0", name: "b" })]);
    expect(r.conflicts[0]?.reason).toContain("on top of other trays");
    // locked together with the tray under it, or as a stack, it stays
    const both = [pos("a:p0:0", "0"), pos("b:p0:0", "0")];
    expect(resolveLocks(ctxOf(both), both, { levelOf: level }).conflicts).toEqual([]);
    const stack: Lock[] = [pos("b:p0:0", "0"), { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] }];
    expect(resolveLocks(ctxOf(stack), stack, { levelOf: level }).conflicts).toEqual([]);
    // the bottom tray alone is fine too
    const bottom = [pos("a:p0:0", "0")];
    expect(resolveLocks(ctxOf(bottom), bottom, { levelOf: level }).conflicts).toEqual([]);
  });

  it("allows the root path when the layout being re-run is one single stack", () => {
    const locks = [pos("a:p0:0", ""), pos("b:p0:0", "")];
    const without = resolveLocks(ctxOf(locks), locks, { levelOf: level });
    expect(without.conflicts).toHaveLength(2);
    const r = resolveLocks(ctxOf(locks), locks, { levelOf: level, singleLeaf: true });
    expect(r.conflicts).toEqual([]);
    expect(r.resolved.leaves.map((l) => l.path)).toEqual([""]);
    expect(r.resolved.leaves[0]?.items.map((i) => reqs[i.req]?.key)).toEqual(["a", "b"]);
  });

  describe("through optimize", () => {
    // d stacks (50 mm tall), a (20) / b / c share the other column; the box is 90 mm tall.
    const a = boxReq("a", 120, 80, 20);
    const b = boxReq("b", 60, 80, 20);
    const c = boxReq("c", 60, 80, 20);
    const d = boxReq("d", 120, 80, 50);
    const input = makeInput([a, b, c, d], {
      box: { innerWidth: 270, innerDepth: 100, innerHeight: 90 },
    });
    // The tests below need a stack of three trays to take apart. The search is free to stack a
    // and d, and b and c, instead (two stacks of two), so the base layout asks for a / b / c.
    const base = optimize(
      { ...input, locks: [{ kind: "stack", trayKeys: ["a:p0:0", "b:p0:0", "c:p0:0"] }] },
      1,
      5000,
    );
    const layout = base.layout as StoredLayout;
    const trays = layout.trays.filter((t) => t.part === "tray");
    const upper = trays.find((t) => t.level > 0) as StoredLayout["trays"][number];
    const lower = trays.find(
      (t) => t.path === upper.path && t.level === upper.level - 1,
    ) as StoredLayout["trays"][number];
    const lockOf = (t: StoredLayout["trays"][number]): Lock => ({
      kind: "position",
      trayKey: t.key,
      path: t.path,
      rotated: t.rotated,
    });
    const at = (r: ReturnType<typeof optimize>, key: string) =>
      r.layout?.trays.find((t) => t.key === key && t.part === "tray");

    it("keeps the stack's order when the upper tray is locked before the lower one", () => {
      const r = optimize({ ...input, locks: [lockOf(upper), lockOf(lower)] }, 1, 5000, {
        warmStart: layout,
      });
      expect(r.lockConflicts).toEqual([]);
      expect(at(r, lower.key)?.path).toBe(at(r, upper.key)?.path);
      expect(at(r, lower.key)?.level).toBeLessThan(at(r, upper.key)?.level ?? -1);
    });

    // The stack of the base layout, bottom first, and the input once one of its trays is gone.
    const stackOfBase = trays
      .filter((t) => t.path === upper.path)
      .sort((x, y) => x.level - y.level);
    const without = (key: string) =>
      makeInput(
        [a, b, c, d].filter((q) => !key.startsWith(`${q.key}:`)),
        { box: { innerWidth: 270, innerDepth: 100, innerHeight: 90 } },
      );

    it("keeps the locks on the rest of a stack whose bottom tray was deleted", () => {
      const [bottom, ...rest] = stackOfBase;
      expect(rest.length).toBeGreaterThanOrEqual(2);
      const locks = rest.map(lockOf);
      const r = optimize({ ...without(bottom?.key ?? ""), locks }, 1, 5000, {
        warmStart: layout,
      });
      expect(r.lockConflicts).toEqual([]);
      const kept = rest.map((t) => at(r, t.key));
      expect(new Set(kept.map((t) => t?.path)).size).toBe(1);
      expect(kept.map((t) => t?.level)).toEqual(rest.map((_, i) => i));
    });

    it("keeps the order of the rest when a middle tray was deleted", () => {
      const [bottom, middle, ...top] = stackOfBase;
      expect(top.length).toBeGreaterThanOrEqual(1);
      const rest = [bottom, ...top] as StoredLayout["trays"];
      const r = optimize(
        { ...without(middle?.key ?? ""), locks: [...rest].reverse().map((t) => lockOf(t)) },
        1,
        5000,
        { warmStart: layout },
      );
      expect(r.lockConflicts).toEqual([]);
      expect(rest.map((t) => at(r, t.key)?.level)).toEqual(rest.map((_, i) => i));
    });

    it("reports a lock on an upper tray alone that can't be kept, instead of moving it silently", () => {
      const r = optimize({ ...input, locks: [lockOf(upper)] }, 1, 5000, { warmStart: layout });
      expect(r.lockConflicts).toHaveLength(1);
      // names what the tray holds, and the key is the one to unpin
      expect(r.lockConflicts[0]?.name).toBe(upper.compartments[0]?.contents);
      expect(r.lockConflicts[0]?.trayKey).toBe(upper.key);
    });
  });

  it("keeps position locks on a layout that is one single stack", () => {
    const input = makeInput([boxReq("a", 80, 80, 20), boxReq("b", 80, 80, 20)], {
      box: { innerWidth: 100, innerDepth: 100, innerHeight: 60 },
    });
    const first = optimize(input, 1, 3000);
    const layout = first.layout as StoredLayout;
    const trays = layout.trays.filter((t) => t.part === "tray");
    expect(trays.map((t) => t.path)).toEqual(["", ""]);
    const locks: Lock[] = trays.map((t) => ({
      kind: "position",
      trayKey: t.key,
      path: t.path,
      rotated: t.rotated,
    }));
    const r = optimize({ ...input, locks }, 1, 3000, { warmStart: layout });
    expect(r.lockConflicts).toEqual([]);
    expect(r.layout?.trays.map((t) => [t.key, t.level])).toEqual(
      layout.trays.map((t) => [t.key, t.level]),
    );
  });
});
