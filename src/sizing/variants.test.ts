import { describe, expect, it } from "vitest";
import type { StorageOption } from "./common";
import { DEFAULT_SETTINGS } from "../model/settings";
import { rowsOf } from "./outer";
import { minOuter } from "./realize";
import { at } from "./test-helpers";
import type { CompartmentReq } from "./types";
import { buildVariants } from "./variants";

function req(contents: string, minW: number, componentId = "x"): CompartmentReq {
  return {
    componentId,
    contents,
    kind: "well",
    minW,
    minD: 10,
    minH: 10,
    elastic: { w: false, d: false, h: false },
    features: [],
  };
}

function opt(id: string, blocks: number): StorageOption {
  return { id, blocks: Array.from({ length: blocks }, (_, i) => [req(`${id}${i}`, 10)]) };
}

describe("buildVariants", () => {
  it("ranks by (mode + arrangement + split, storage, mode, arrangement, split) and keeps all", () => {
    const variants = buildVariants({
      key: "k",
      options: [opt("A", 4), opt("B", 4), opt("C", 4)],
      copies: 1,
    });
    expect(variants.map((v) => v.id)).toEqual([
      "A|strip|split1",
      "B|strip|split1",
      "C|strip|split1",
      "A|strip|split2",
      "A|rows2|split1",
      "B|strip|split2",
      "B|rows2|split1",
      "C|strip|split2",
      "C|rows2|split1",
      "A|strip|split3",
      "A|rows2|split2",
      "B|strip|split3",
      "B|rows2|split2",
      "C|strip|split3",
      "C|rows2|split2",
    ]);
    const split2 = at(variants, 3);
    expect(split2.parts.map((p) => p.trayKey)).toEqual(["k:p0:0", "k:p0:1"]);
    expect(split2.parts.map((p) => p.compartments.map((c) => c.contents))).toEqual([
      ["A0", "A1"],
      ["A2", "A3"],
    ]);
    const rows2 = at(variants, 4);
    expect(at(rows2.parts, 0).arrangement).toBe("rows2");
    // One member's blocks: the pre-0.7.0 greedy by width (A0, A2 / A1, A3), no row break.
    expect(at(rows2.parts, 0).compartments.map((c) => c.contents)).toEqual([
      "A0",
      "A2",
      "A1",
      "A3",
    ]);
    expect(at(rows2.parts, 0).rowBreak).toBeUndefined();
    for (const v of variants) {
      for (const part of v.parts) {
        expect(part.rotatable).toBe(true);
      }
    }
  });

  it("skips rows2 with one compartment and splits with too few blocks", () => {
    expect(buildVariants({ key: "k", options: [opt("A", 1)], copies: 1 }).map((v) => v.id)).toEqual(
      ["A|strip|split1"],
    );
  });

  it("drops later duplicates (tray keys ignored)", () => {
    const same: StorageOption = { id: "B", blocks: opt("A", 1).blocks };
    expect(
      buildVariants({ key: "k", options: [opt("A", 1), same], copies: 1 }).map((v) => v.id),
    ).toEqual(["A|strip|split1"]);
  });

  it("gives C copies of the same arrangement, keyed p0…pC-1, with parts numbered from 0 in each", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], copies: 4 });
    expect(variants.map((v) => v.id)).toEqual([
      "A|strip|split1",
      "A|strip|split2",
      "A|rows2|split1",
    ]);
    const whole = at(variants, 0);
    expect(whole.parts.map((p) => p.trayKey)).toEqual(["k:p0:0", "k:p1:0", "k:p2:0", "k:p3:0"]);
    for (const part of whole.parts) {
      expect(part.compartments.map((c) => c.contents)).toEqual(["A0", "A1"]);
    }
    const split = at(variants, 1);
    expect(split.parts.map((p) => p.trayKey)).toEqual([
      "k:p0:0",
      "k:p0:1",
      "k:p1:0",
      "k:p1:1",
      "k:p2:0",
      "k:p2:1",
      "k:p3:0",
      "k:p3:1",
    ]);
  });

  it("splits every copy the same way: each copy has the same number of parts", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 6)], copies: 3 });
    for (const v of variants) {
      const perCopy = [0, 1, 2].map((c) => v.parts.filter((p) => p.trayKey.startsWith(`k:p${c}:`)));
      expect(new Set(perCopy.map((parts) => parts.length)).size).toBe(1);
      expect(
        perCopy.map((parts) => parts.map((p) => p.compartments.map((c) => c.contents))),
      ).toEqual([0, 1, 2].map(() => perCopy[0]?.map((p) => p.compartments.map((c) => c.contents))));
      perCopy.forEach((parts) =>
        expect(parts.map((p) => p.trayKey.split(":")[2])).toEqual(parts.map((_, i) => String(i))),
      );
    }
    expect(variants.some((v) => v.id.endsWith("split3"))).toBe(true);
  });

  it("has no combined variants and puts no player suffix on a compartment", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], copies: 3 });
    for (const v of variants) {
      expect(v.id).not.toContain("combined");
      expect(v.id).not.toContain("separate");
      for (const part of v.parts) {
        expect(part.trayKey).not.toContain("pall");
        expect(part.compartments.every((c) => /^A\d$/.test(c.contents))).toBe(true);
      }
    }
  });

  it("keys a single copy p0", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], copies: 1 });
    expect(at(variants, 0).parts.map((p) => p.trayKey)).toEqual(["k:p0:0"]);
  });

  it("cuts rows2 of several members into a front and a back run that keep the order, and records the break", () => {
    const blocks = [
      [req("a", 50, "x")],
      [req("b", 40, "x")],
      [req("c", 30, "y")],
      [req("d", 20, "y")],
      [req("e", 10, "y")],
    ];
    const variants = buildVariants({ key: "k", options: [{ id: "A", blocks }], copies: 1 });
    const part = at(
      at(
        variants.filter((v) => v.id === "A|rows2|split1"),
        0,
      ).parts,
      0,
    );
    expect(part.compartments.map((c) => c.contents)).toEqual(["a", "b", "c", "d", "e"]);
    expect(part.rowBreak).toBe(2);
    expect(rowsOf(part.arrangement, part.compartments, part.rowBreak).map((r) => r.length)).toEqual(
      [2, 3],
    );
  });

  it("sizes a rows2 part by its own break, not the half", () => {
    const blocks = [[req("a", 50, "x")], [req("b", 10, "y")], [req("c", 10, "y")]];
    const variants = buildVariants({ key: "k", options: [{ id: "A", blocks }], copies: 1 });
    const part = at(
      at(
        variants.filter((v) => v.id === "A|rows2|split1"),
        0,
      ).parts,
      0,
    );
    expect(part.rowBreak).toBe(1);
    const own = minOuter(part, DEFAULT_SETTINGS, { lipped: false, level: 0 });
    const halved = minOuter({ ...part, rowBreak: undefined }, DEFAULT_SETTINGS, {
      lipped: false,
      level: 0,
    });
    expect(own.w).toBeLessThan(halved.w);
  });

  it("lays one member's blocks out as before 0.7.0: rows2 balanced by width, cuts along a row first, no row break", () => {
    const blocks = [[req("a", 50)], [req("b", 40)], [req("c", 30)], [req("d", 20)], [req("e", 10)]];
    const variants = buildVariants({ key: "k", options: [{ id: "A", blocks }], copies: 1 });
    const part = at(
      at(
        variants.filter((v) => v.id === "A|rows2|split1"),
        0,
      ).parts,
      0,
    );
    // row 0: a, d, e (80); row 1: b, c (70)
    expect(part.compartments.map((c) => c.contents)).toEqual(["a", "d", "e", "b", "c"]);
    expect(part.rowBreak).toBeUndefined();
  });

  it("returns at most 8 variants per storage option, best first", () => {
    const options = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((id) => opt(id, 3));
    const ids = buildVariants({ key: "k", options, copies: 4 }).map((v) => v.id);
    expect(ids.length).toBeLessThanOrEqual(8 * options.length);
    expect(ids.slice(0, 9)).toEqual([
      "A|strip|split1",
      "B|strip|split1",
      "C|strip|split1",
      "D|strip|split1",
      "E|strip|split1",
      "F|strip|split1",
      "G|strip|split1",
      "H|strip|split1",
      "I|strip|split1",
    ]);
  });

  it("drops duplicates from the list", () => {
    const options = [opt("A", 3), { id: "Adup", blocks: opt("A", 3).blocks }, opt("B", 3)].concat(
      ["C", "D", "E"].map((id) => opt(id, 3)),
    );
    const ids = buildVariants({ key: "k", options, copies: 1 }).map((v) => v.id);
    expect(ids).toEqual([
      "A|strip|split1",
      "B|strip|split1",
      "C|strip|split1",
      "D|strip|split1",
      "E|strip|split1",
      "A|strip|split2",
      "A|rows2|split1",
      "B|strip|split2",
      "B|rows2|split1",
      "C|strip|split2",
      "C|rows2|split1",
      "D|strip|split2",
      "D|rows2|split1",
      "E|strip|split2",
      "E|rows2|split1",
      "A|strip|split3",
      "B|strip|split3",
      "C|strip|split3",
      "D|strip|split3",
      "E|strip|split3",
    ]);
    expect(ids.some((id) => id.startsWith("Adup"))).toBe(false);
  });

  it("ranks by storage option within each split step", () => {
    const ids = buildVariants({ key: "k", options: [opt("A", 2), opt("B", 2)], copies: 2 }).map(
      (v) => v.id,
    );
    expect(ids).toEqual([
      "A|strip|split1",
      "B|strip|split1",
      "A|strip|split2",
      "A|rows2|split1",
      "B|strip|split2",
      "B|rows2|split1",
    ]);
  });

  it("makes every part rotatable with copies", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], copies: 3 });
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      for (const part of v.parts) {
        expect(part.rotatable).toBe(true);
      }
    }
  });

  it("offers splits into three trays and skips rows2 parts with one compartment", () => {
    expect(buildVariants({ key: "k", options: [opt("A", 3)], copies: 1 }).map((v) => v.id)).toEqual(
      ["A|strip|split1", "A|strip|split2", "A|rows2|split1", "A|strip|split3"],
    );
  });

  it("splits only on block boundaries", () => {
    const blocks = [
      [req("a0", 10), req("a1", 10)],
      [req("b0", 10)],
      [req("c0", 10), req("c1", 10), req("c2", 10)],
    ];
    const variants = buildVariants({ key: "k", options: [{ id: "A", blocks }], copies: 1 });
    const contents = (id: string): string[][] =>
      (variants.find((v) => v.id === id)?.parts ?? []).map((p) =>
        p.compartments.map((c) => c.contents),
      );
    expect(contents("A|strip|split2")).toEqual([
      ["a0", "a1", "b0"],
      ["c0", "c1", "c2"],
    ]);
    expect(contents("A|strip|split3")).toEqual([["a0", "a1"], ["b0"], ["c0", "c1", "c2"]]);
  });

  it("returns no variants without options or blocks", () => {
    expect(buildVariants({ key: "k", options: [], copies: 1 })).toEqual([]);
    expect(buildVariants({ key: "k", options: [{ id: "A", blocks: [] }], copies: 1 })).toEqual([]);
    expect(buildVariants({ key: "k", options: [{ id: "A", blocks: [] }], copies: 2 })).toEqual([]);
  });

  it("keeps every variant each storage option has alone (auto is a superset)", () => {
    // Auto used to keep only the best 8 of all options together, so a three-deck flat split
    // (rank 2) lost its place to upright ones and auto found no fit where flat did.
    for (const copies of [1, 3]) {
      const options = [opt("A", 3), opt("B", 3), opt("C", 3)];
      const all = buildVariants({ key: "k", options, copies }).map((v) => v.id);
      for (const option of options) {
        const alone = buildVariants({ key: "k", options: [option], copies }).map((v) => v.id);
        expect(all).toEqual(expect.arrayContaining(alone));
      }
    }
  });

  it("is deterministic", () => {
    const input = { key: "k", options: [opt("A", 3), opt("B", 2)], copies: 3 };
    expect(buildVariants(input)).toEqual(buildVariants(input));
  });
});
