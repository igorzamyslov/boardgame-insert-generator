import { describe, expect, it } from "vitest";
import { item } from "./test-utils";
import {
  cut,
  cuts,
  itemsOf,
  leaf,
  leaves,
  nodeAt,
  placeLeaves,
  removeLeafAt,
  replaceAt,
  SHARE_MAX,
  splitLeafAt,
} from "./tree";

describe("guillotine tree", () => {
  const t = cut("x", leaf([item(0)]), cut("y", leaf([item(1)]), leaf([item(2), item(3)])));

  it("enumerates leaves and cuts with 0/1 paths", () => {
    expect(leaves(t).map((l) => l.path)).toEqual(["0", "10", "11"]);
    expect(cuts(t).map((c) => c.path)).toEqual(["", "1"]);
    expect(itemsOf(t).map((i) => i.req)).toEqual([0, 1, 2, 3]);
    expect(nodeAt(t, "11")?.kind).toBe("leaf");
    expect(nodeAt(t, "01")).toBeUndefined();
  });

  it("replaces nodes persistently, sharing untouched subtrees", () => {
    const t2 = replaceAt(t, "10", leaf([item(9)]));
    expect(itemsOf(t2).map((i) => i.req)).toEqual([0, 9, 2, 3]);
    expect(itemsOf(t).map((i) => i.req)).toEqual([0, 1, 2, 3]);
    expect(t2.kind === "cut" && t.kind === "cut" && t2.a === t.a).toBe(true);
    expect(() => replaceAt(t, "00", leaf([]))).toThrow(RangeError);
  });

  it("removes a leaf by promoting its sibling and splits leaves", () => {
    const r = removeLeafAt(t, "10");
    expect(r && leaves(r).map((l) => l.path)).toEqual(["0", "1"]);
    expect(removeLeafAt(leaf([]), "")).toBeNull();
    const s = splitLeafAt(t, "0", "y", leaf([item(7)]), true);
    expect(leaves(s).map((l) => `${l.path}:${l.leaf.stack[0]?.req ?? "-"}`)).toEqual([
      "00:7",
      "01:0",
      "10:1",
      "11:2",
    ]);
  });

  it("tiles the rectangle exactly: child extents + gap = parent extent", () => {
    const fixed = { w: 1000, d: 800 };
    const p = placeLeaves(t, { x: 0, y: 0, w: 5000, d: 3000 }, 20, () => fixed);
    expect(p.min).toEqual({ w: 2020, d: 1620 });
    const [a, b, c] = p.leaves.map((l) => l.rect);
    expect(a).toEqual({
      x: 0,
      y: 0,
      w: 1000 + Math.floor((2980 * (SHARE_MAX / 2)) / SHARE_MAX),
      d: 3000,
    });
    expect((a?.w ?? 0) + 20 + (b?.w ?? 0)).toBe(5000);
    expect(b?.x).toBe((a?.w ?? 0) + 20);
    expect((b?.d ?? 0) + 20 + (c?.d ?? 0)).toBe(3000);
    expect(c?.y).toBe((b?.d ?? 0) + 20);
  });

  it("gives all slack to child a at share = SHARE_MAX and none at 0", () => {
    const fixed = { w: 1000, d: 800 };
    const full = placeLeaves(
      cut("x", leaf([]), leaf([]), SHARE_MAX),
      { x: 0, y: 0, w: 3000, d: 800 },
      20,
      () => fixed,
    );
    expect(full.leaves.map((l) => l.rect.w)).toEqual([1980, 1000]);
    const none = placeLeaves(
      cut("x", leaf([]), leaf([]), 0),
      { x: 0, y: 0, w: 3000, d: 800 },
      20,
      () => fixed,
    );
    expect(none.leaves.map((l) => l.rect.w)).toEqual([1000, 1980]);
  });

  it("falls back to minimums when the rectangle is too small", () => {
    const p = placeLeaves(
      cut("x", leaf([]), leaf([])),
      { x: 0, y: 0, w: 1500, d: 500 },
      20,
      () => ({ w: 1000, d: 800 }),
    );
    expect(p.min.w).toBe(2020);
    expect(p.leaves.map((l) => l.rect.w)).toEqual([1000, 1000]);
    expect(p.leaves.map((l) => l.rect.d)).toEqual([800, 800]);
  });
});
