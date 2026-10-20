// A turn lock fixes one tray's rotation and nothing else: it neither pins the tray's place nor
// ties it to a stack (0.7.0 rulings R2-R5).
import { describe, expect, it } from "vitest";
import type { Lock } from "../model/types";
import { createCtx, withSizeLocks } from "./context";
import { greedyTree, partitionTrees } from "./greedy";
import { completeTree, moveEnvOf, noLocks, resolveLocks, applyLocks } from "./locks";
import { changeVariant } from "./moves";
import { optimize } from "./optimize";
import { createRng } from "./prng";
import { boxReq, comp, fakeMeasure, makeInput, part, req, traySpec, variant } from "./test-utils";
import { itemsOf, leaf, type StackItem, type Tree } from "./tree";
import { warmHints, warmTree } from "./warmstart";

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
      part("c:p0:0", [comp({ minW: 60, minD: 30, minH: 10 })]),
      part("c:p0:1", [comp({ minW: 60, minD: 30, minH: 10 })]),
    ]),
  ]),
];
const ctx = createCtx(makeInput(reqs), fakeMeasure);
const A = ctx.partId({ req: 0, variant: 0, part: 0 });
const turn = (trayKey: string, rotated: boolean): Lock => ({ kind: "turn", trayKey, rotated });
const resolve = (locks: Lock[]) => resolveLocks(ctx, locks);
const rotatedOf = (t: Tree | null, req: number, part = 0): boolean | undefined =>
  t ? itemsOf(t.root).find((i) => i.req === req && i.part === part)?.rotated : undefined;

describe("resolveLocks with a turn lock", () => {
  it("fixes the rotation and nothing else", () => {
    const { resolved, conflicts } = resolve([turn("a:p0:0", true)]);
    expect(conflicts).toEqual([]);
    expect(resolved.turns).toEqual(new Map([[A, true]]));
    expect(resolved.rotationFixed.has(A)).toBe(true);
    expect(resolved.leaves).toEqual([]);
    expect(resolved.groups).toEqual([]);
    expect(resolved.lockedPaths).toEqual([]);
    expect(resolved.sizes.size).toBe(0);
    expect(resolved.kept).toEqual([turn("a:p0:0", true)]);
  });

  it("has no turns without a turn lock", () => {
    expect(noLocks(ctx).turns.size).toBe(0);
    expect(
      resolve([{ kind: "size", trayKey: "a:p0:0", w: 64, d: 44, h: 12 }]).resolved.turns.size,
    ).toBe(0);
  });

  it("fixes the variant of its requirement, as a pin or a size lock does", () => {
    // only the second variant of c has the key c:p0:1
    const { resolved } = resolve([turn("c:p0:1", true)]);
    expect(resolved.pinnedVariant).toEqual([null, null, 1]);
  });

  it("keeps the variant the lock fits when variants share its key", () => {
    // c:p0:0 is in both variants: a turn on it pins one of them, and the turn is on that variant's part
    const { resolved, conflicts } = resolve([turn("c:p0:0", true)]);
    expect(conflicts).toEqual([]);
    const v = resolved.pinnedVariant[2];
    expect(v).not.toBeNull();
    const id = ctx.partId({ req: 2, variant: v ?? 0, part: 0 });
    expect(resolved.turns.get(id)).toBe(true);
  });

  it("lets a turned tray share a stack with any other", () => {
    const stack: Lock = { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] };
    const { resolved, conflicts } = resolve([turn("a:p0:0", true), stack]);
    expect(conflicts).toEqual([]);
    expect(resolved.groups).toHaveLength(1);
    expect(resolved.groups[0]?.map((i) => [i.req, i.rotated])).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  it("agrees with a pin whose rotation is the same", () => {
    const pin: Lock = { kind: "position", trayKey: "a:p0:0", path: "0", rotated: true };
    const { resolved, conflicts } = resolve([turn("a:p0:0", true), pin]);
    expect(conflicts).toEqual([]);
    expect(resolved.turns.get(A)).toBe(true);
    expect(resolved.leaves[0]?.items[0]?.rotated).toBe(true);
  });

  it("reports a pin that disagrees on the same tray as a turn conflict, keeping the pin", () => {
    const pin: Lock = { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false };
    const { resolved, conflicts } = resolve([turn("a:p0:0", true), pin]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ trayKey: "a:p0:0", kind: "turn" });
    expect(conflicts[0]?.reason).toMatch(/pin/);
    expect(resolved.kept).toEqual([pin]);
    expect(resolved.turns.size).toBe(0);
    expect(resolved.leaves[0]?.items[0]?.rotated).toBe(false);
  });

  it("reports a size lock that disagrees on the same tray as a turn conflict", () => {
    // 64 x 44 (the tray outside) only fits as it is
    const size: Lock = { kind: "size", trayKey: "a:p0:0", w: 64, d: 44, h: 12 };
    const { resolved, conflicts } = resolve([turn("a:p0:0", true), size]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ trayKey: "a:p0:0", kind: "turn" });
    expect(conflicts[0]?.reason).toMatch(/size lock/);
    expect(resolved.kept).toEqual([size]);
    expect(resolved.turns.size).toBe(0);
  });

  it("is not a conflict that a pin or size lock sits on another tray", () => {
    const { conflicts } = resolve([
      turn("a:p0:0", true),
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
    ]);
    expect(conflicts).toEqual([]);
  });

  it("reports a turn of a tray that can't rotate", () => {
    const { conflicts } = resolve([turn("b:p0:0", true)]);
    expect(conflicts).toMatchObject([{ trayKey: "b:p0:0", kind: "turn" }]);
    // not turned is fine: it is what it is
    expect(resolve([turn("b:p0:0", false)]).conflicts).toEqual([]);
  });

  it("reports a turn of a tray that is gone", () => {
    expect(resolve([turn("zzz:p0:0", true)]).conflicts).toMatchObject([
      { trayKey: "zzz:p0:0", kind: "turn" },
    ]);
  });
});

describe("a turn lock fixes rotation wherever a tray is created", () => {
  const { resolved } = resolve([turn("a:p0:0", true)]);
  const locked = withSizeLocks(ctx, resolved.sizes);
  const env = moveEnvOf(locked, resolved);
  const at = (r: number, v = 0, p = 0, rotated = false): StackItem => ({
    req: r,
    variant: v,
    part: p,
    rotated,
  });

  it("completeTree", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const t = completeTree(
        { root: leaf([at(1), at(2)]), variants: [0, 0, 0] },
        env,
        createRng(seed),
      );
      expect(rotatedOf(t, 0)).toBe(true);
    }
  });

  it("completeTree turns it back when the lock says not rotated", () => {
    const r = resolve([turn("a:p0:0", false)]).resolved;
    const e = moveEnvOf(ctx, r);
    for (let seed = 1; seed <= 50; seed++) {
      const t = completeTree(
        { root: leaf([at(1), at(2)]), variants: [0, 0, 0] },
        e,
        createRng(seed),
      );
      expect(rotatedOf(t, 0)).toBe(false);
    }
  });

  it("the variant-change move", () => {
    // c has two variants; with no variant pinned, a turn lock on variant 1's first part is honoured
    // when the move lands on it
    const id = ctx.partId({ req: 2, variant: 1, part: 0 });
    const e = {
      ...moveEnvOf(ctx, noLocks(ctx)),
      turns: new Map([[id, true]]),
      rotationFixed: new Set([id]),
    };
    const start: Tree = { root: leaf([at(0), at(1), at(2, 0, 0)]), variants: [0, 0, 0] };
    let seen = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const t = changeVariant(start, e, createRng(seed));
      if (t?.variants[2] === 1) {
        seen++;
        expect(itemsOf(t.root).find((i) => i.req === 2 && i.part === 0)?.rotated).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("the greedy start and the partition starts", () => {
    for (const along of ["x", "y"] as const) {
      expect(rotatedOf(greedyTree(locked, resolved, along), 0)).toBe(true);
    }
    const many = resolve([turn("a:p0:0", true)]);
    const trees = partitionTrees(locked, many.resolved);
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) {
      expect(rotatedOf(t, 0)).toBe(true);
    }
  });

  it("the warm start", () => {
    // the stored plan has a standing as it is; the lock says turned
    const trays = [
      traySpec({ key: "a:p0:0", path: "0", rotated: false }),
      traySpec({ key: "b:p0:0", path: "10", rotated: false }),
      traySpec({ key: "c:p0:0", path: "11", rotated: false }),
    ];
    const hints = warmHints(ctx, trays);
    const plain = warmTree(ctx, trays, [null, null, null], hints);
    expect(rotatedOf(plain, 0)).toBe(false);
    const t = warmTree(ctx, trays, resolved.pinnedVariant, hints, resolved.turns);
    expect(rotatedOf(t, 0)).toBe(true);
  });

  it("applyLocks keeps it through a whole start", () => {
    const start: Tree = { root: leaf([at(0), at(1), at(2)]), variants: [0, 0, 0] };
    const t = applyLocks(start, resolved, env, createRng(3));
    expect(t).not.toBeNull();
    expect(rotatedOf(t, 0)).toBe(true);
  });
});

describe("a run with a turn lock", () => {
  const input = makeInput(reqs, { locks: [turn("a:p0:0", true)] });

  it("never places the tray otherwise, over 50 seeds", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = optimize(input, seed, 300);
      expect(r.lockConflicts).toEqual([]);
      const tray = r.layout?.trays.find((t) => t.key === "a:p0:0" && t.part === "tray");
      expect(tray?.rotated).toBe(true);
    }
  });

  it("holds the rotation even when no start could take the locks", () => {
    // a and b are pinned, so every leaf is locked and c has nowhere to be inserted: the start is
    // the plain greedy tree, whose c is not turned
    const three = [boxReq("a", 60, 40, 10), boxReq("b", 60, 40, 10), boxReq("c", 60, 40, 10)];
    const locks: Lock[] = [
      { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "1", rotated: false },
      turn("c:p0:0", true),
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const r = optimize(makeInput(three, { locks }), seed, 300);
      const c = r.layout?.trays.find((t) => t.key === "c:p0:0" && t.part === "tray");
      expect(c?.rotated).toBe(true);
    }
  });

  it("and a turn to not rotated holds the other way", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = optimize(makeInput(reqs, { locks: [turn("a:p0:0", false)] }), seed, 300);
      const tray = r.layout?.trays.find((t) => t.key === "a:p0:0" && t.part === "tray");
      expect(tray?.rotated).toBe(false);
    }
  });

  it("reports a disagreeing pin as a turn conflict", () => {
    const r = optimize(
      makeInput(reqs, {
        locks: [
          turn("a:p0:0", true),
          { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
        ],
      }),
      1,
      300,
    );
    expect(r.lockConflicts.map((c) => [c.trayKey, c.kind])).toEqual([["a:p0:0", "turn"]]);
  });
});
