import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockWeight, cutsFirst, rows2Break, splitBlocks } from "./arrange";
import { wallCutout } from "./common";
import type { CompartmentReq } from "./types";

function req(contents: string, minW: number, minD = 1, componentId = "x"): CompartmentReq {
  return {
    componentId,
    contents,
    kind: "well",
    minW,
    minD,
    minH: 1,
    elastic: { w: false, d: false, h: false },
    features: [],
  };
}

const names = (cs: readonly CompartmentReq[]): string[] => cs.map((c) => c.contents);
const groupNames = (groups: CompartmentReq[][][] | null): string[][] | null =>
  groups === null ? null : groups.map((g) => names(g.flat()));

describe("rows2Break", () => {
  it("cuts the ordered list where the wider row is narrowest", () => {
    // 50 | 40 30 20 10 → 50 vs 100; 50 40 | 30 20 10 → 90 vs 60; 50 40 30 | 20 10 → 120 vs 30
    const list = [req("a", 50), req("b", 40), req("c", 30), req("d", 20), req("e", 10)];
    expect(rows2Break(list)).toBe(2);
  });

  it("puts one compartment in each row for two, and never leaves a row empty", () => {
    expect(rows2Break([req("small", 5), req("big", 9)])).toBe(1);
    expect(rows2Break([req("a", 1), req("b", 100), req("c", 1)])).toBeGreaterThanOrEqual(1);
    expect(rows2Break([req("a", 1), req("b", 100), req("c", 1)])).toBeLessThanOrEqual(2);
  });

  it("keeps order as two contiguous runs, with the narrowest possible wider row", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 200 }), { minLength: 2, maxLength: 9 }),
        (ws) => {
          const list = ws.map((w, i) => req(`c${i}`, w));
          const j = rows2Break(list);
          expect(j).toBeGreaterThanOrEqual(1);
          expect(j).toBeLessThanOrEqual(list.length - 1);
          const widest = (cut: number): number =>
            Math.max(
              ws.slice(0, cut).reduce((a, b) => a + b, 0),
              ws.slice(cut).reduce((a, b) => a + b, 0),
            );
          const best = Math.min(...ws.slice(1).map((_, k) => widest(k + 1)));
          expect(widest(j)).toBe(best);
        },
      ),
    );
  });
});

describe("cutsFirst", () => {
  const along = (name: string, owner: string): CompartmentReq => ({
    ...req(name, 10, 1, owner),
    features: [wallCutout("left", 0.5, false)],
  });

  it("moves the compartments that ask for a cut along the row to the start", () => {
    const row = [req("a", 5), along("b", "x"), req("c", 5), along("d", "x")];
    expect(names(cutsFirst(row))).toEqual(["b", "d", "a", "c"]);
  });

  it("stays inside a member: two members with cut-along-row wells don't swap", () => {
    const row = [req("a1", 5, 1, "a"), along("a2", "a"), req("b1", 5, 1, "b"), along("b2", "b")];
    expect(names(cutsFirst(row))).toEqual(["a2", "a1", "b2", "b1"]);
  });
});

describe("blockWeight", () => {
  it("sums footprint areas", () => {
    expect(blockWeight([req("a", 2, 3), req("b", 1, 4)])).toBe(10);
  });
});

describe("splitBlocks", () => {
  const blocks = [[req("a", 4)], [req("b", 1)], [req("c", 1)], [req("d", 1)], [req("e", 1)]];

  it("returns everything as one group for one part", () => {
    expect(groupNames(splitBlocks(blocks, 1))).toEqual([["a", "b", "c", "d", "e"]]);
  });

  it("splits into two contiguous groups minimising the heavier one", () => {
    expect(groupNames(splitBlocks(blocks, 2))).toEqual([["a"], ["b", "c", "d", "e"]]);
  });

  it("splits into three groups, then prefers the more balanced split", () => {
    expect(groupNames(splitBlocks(blocks, 3))).toEqual([["a"], ["b", "c"], ["d", "e"]]);
  });

  it("splits six equal blocks evenly", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((n) => [req(n, 1)]);
    expect(groupNames(splitBlocks(six, 2))).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
    expect(groupNames(splitBlocks(six, 3))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("prefers a cut between members when it is as good as the best cut", () => {
    // Weights 2 0 2: cutting after the first or the second block is equally good (2 | 2). The
    // member boundary is after the second.
    const tie = [[req("a", 2, 1, "m1")], [req("b", 0, 1, "m1")], [req("c", 2, 1, "m2")]];
    expect(groupNames(splitBlocks(tie, 2))).toEqual([["a", "b"], ["c"]]);
    // The best cut (3 | 4) is inside a member and the boundary (6 | 1) is worse: the best cut stays.
    const worse = [[req("a", 3, 1, "m1")], [req("b", 3, 1, "m1")], [req("c", 1, 1, "m2")]];
    expect(groupNames(splitBlocks(worse, 2))).toEqual([["a"], ["b", "c"]]);
  });

  it("takes member boundaries in three parts when they are as good", () => {
    // Weights 2 0 2 2: cutting after 1 or 2 blocks, then after 3, gives 2 | 2 | 2 either way.
    const blocks3 = [
      [req("a", 2, 1, "m1")],
      [req("b", 0, 1, "m1")],
      [req("c", 2, 1, "m2")],
      [req("d", 2, 1, "m3")],
    ];
    expect(groupNames(splitBlocks(blocks3, 3))).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("never separates the compartments of one block", () => {
    const grouped = [[req("a", 1), req("b", 1)], [req("c", 2)]];
    expect(groupNames(splitBlocks(grouped, 2))).toEqual([["a", "b"], ["c"]]);
  });

  it("returns null when there are fewer blocks than parts or parts is out of range", () => {
    expect(splitBlocks([[req("a", 1)], [req("b", 1)]], 3)).toBeNull();
    expect(splitBlocks(blocks, 4)).toBeNull();
    expect(splitBlocks(blocks, 0)).toBeNull();
  });

  it("is fast on 2000 blocks", () => {
    const many = Array.from({ length: 2000 }, (_, i) => [req(`b${i}`, 1 + (i % 7))]);
    const groups = splitBlocks(many, 3);
    expect(groups).not.toBeNull();
    expect(groups?.flat().length).toBe(2000);
  });
});
