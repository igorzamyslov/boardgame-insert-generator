import { describe, expect, it } from "vitest";
import { blockWeight, rows2Order, splitBlocks } from "./arrange";
import type { CompartmentReq } from "./types";

function req(contents: string, minW: number, minD = 1): CompartmentReq {
  return {
    componentId: "x",
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

describe("rows2Order", () => {
  it("fills rows greedily, largest first, first half in row 0", () => {
    const out = rows2Order([req("a", 50), req("b", 40), req("c", 30), req("d", 20), req("e", 10)]);
    // row 0: a, d, e (80); row 1: b, c (70)
    expect(names(out)).toEqual(["a", "d", "e", "b", "c"]);
  });

  it("keeps original order inside a row and breaks size ties by index", () => {
    const out = rows2Order([req("a", 10), req("b", 10), req("c", 10), req("d", 10)]);
    expect(names(out)).toEqual(["a", "c", "b", "d"]);
  });

  it("puts the larger of two compartments in row 0", () => {
    expect(names(rows2Order([req("small", 5), req("big", 9)]))).toEqual(["big", "small"]);
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
