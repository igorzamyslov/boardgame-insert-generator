import { describe, expect, it } from "vitest";
import type { StorageOption } from "./common";
import { at } from "./test-helpers";
import type { CompartmentReq } from "./types";
import { buildVariants } from "./variants";

function req(contents: string, minW: number): CompartmentReq {
  return {
    componentId: "x",
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
  it("ranks by (mode + arrangement + split, storage, mode, arrangement, split) and keeps 8", () => {
    const variants = buildVariants({
      key: "k",
      options: [opt("A", 4), opt("B", 4), opt("C", 4)],
      players: null,
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
    ]);
    const split2 = at(variants, 3);
    expect(split2.parts.map((p) => p.trayKey)).toEqual(["k:p0:0", "k:p0:1"]);
    expect(split2.parts.map((p) => p.compartments.map((c) => c.contents))).toEqual([
      ["A0", "A1"],
      ["A2", "A3"],
    ]);
    const rows2 = at(variants, 4);
    expect(at(rows2.parts, 0).arrangement).toBe("rows2");
    expect(at(rows2.parts, 0).compartments.map((c) => c.contents)).toEqual([
      "A0",
      "A2",
      "A1",
      "A3",
    ]);
    for (const v of variants) {
      for (const part of v.parts) {
        expect(part.rotatable).toBe(true);
      }
    }
  });

  it("skips rows2 with one compartment and splits with too few blocks", () => {
    expect(
      buildVariants({ key: "k", options: [opt("A", 1)], players: null }).map((v) => v.id),
    ).toEqual(["A|strip|split1"]);
  });

  it("drops later duplicates (tray keys ignored)", () => {
    const same: StorageOption = { id: "B", blocks: opt("A", 1).blocks };
    expect(
      buildVariants({ key: "k", options: [opt("A", 1), same], players: null }).map((v) => v.id),
    ).toEqual(["A|strip|split1"]);
  });

  it("offers separate trays per player first, then one combined tray", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], players: 3 });
    // Combined split3 is absent: with 6 equal blocks it cuts exactly at the player boundaries, so
    // it duplicates the separate variant (tray keys are ignored) and the earlier one is kept.
    expect(variants.map((v) => v.id)).toEqual([
      "A|strip|split1|separate",
      "A|rows2|split1|separate",
      "A|strip|split1|combined",
      "A|strip|split2|combined",
      "A|rows2|split1|combined",
      "A|rows2|split2|combined",
    ]);
    const separate = at(variants, 0);
    expect(separate.parts.map((p) => p.trayKey)).toEqual(["k:p0:0", "k:p1:0", "k:p2:0"]);
    expect(at(separate.parts, 1).compartments.map((c) => c.contents)).toEqual([
      "A0 (P2)",
      "A1 (P2)",
    ]);
    const combined = at(variants, 2);
    expect(combined.parts.map((p) => p.trayKey)).toEqual(["k:pall:0"]);
    expect(at(combined.parts, 0).compartments).toHaveLength(6);
  });

  it("offers only separate variants for a single player", () => {
    expect(
      buildVariants({ key: "k", options: [opt("A", 2)], players: 1 }).map((v) => v.id),
    ).toEqual(["A|strip|split1|separate", "A|rows2|split1|separate"]);
  });

  it("never returns more than 8 variants and keeps the best 8", () => {
    const options = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((id) => opt(id, 3));
    expect(buildVariants({ key: "k", options, players: 4 }).map((v) => v.id)).toEqual([
      "A|strip|split1|separate",
      "B|strip|split1|separate",
      "C|strip|split1|separate",
      "D|strip|split1|separate",
      "E|strip|split1|separate",
      "F|strip|split1|separate",
      "G|strip|split1|separate",
      "H|strip|split1|separate",
    ]);
  });

  it("does not let duplicates use up the 8 slots", () => {
    const options = [opt("A", 3), { id: "Adup", blocks: opt("A", 3).blocks }, opt("B", 3)].concat(
      ["C", "D", "E"].map((id) => opt(id, 3)),
    );
    const ids = buildVariants({ key: "k", options, players: null }).map((v) => v.id);
    expect(ids).toEqual([
      "A|strip|split1",
      "B|strip|split1",
      "C|strip|split1",
      "D|strip|split1",
      "E|strip|split1",
      "A|strip|split2",
      "A|rows2|split1",
      "B|strip|split2",
    ]);
  });

  it("drops combined variants that equal a separate one, whatever their tray keys", () => {
    const ids = buildVariants({ key: "k", options: [opt("A", 2)], players: 2 }).map((v) => v.id);
    expect(ids).toEqual([
      "A|strip|split1|separate",
      "A|rows2|split1|separate",
      "A|strip|split1|combined",
      "A|rows2|split1|combined",
      "A|strip|split3|combined",
    ]);
    expect(ids).not.toContain("A|strip|split2|combined");
    expect(ids).not.toContain("A|rows2|split2|combined");
  });

  it("ranks by storage option before player mode", () => {
    const ids = buildVariants({
      key: "k",
      options: [opt("A", 2), opt("B", 2)],
      players: 2,
    }).map((v) => v.id);
    expect(ids).toEqual([
      "A|strip|split1|separate",
      "B|strip|split1|separate",
      "A|rows2|split1|separate",
      "A|strip|split1|combined",
      "B|rows2|split1|separate",
      "B|strip|split1|combined",
      "A|rows2|split1|combined",
      "B|rows2|split1|combined",
    ]);
    expect(ids.indexOf("A|strip|split1|combined")).toBeLessThan(
      ids.indexOf("B|rows2|split1|separate"),
    );
  });

  it("keys the trays of a combined split by part", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], players: 3 });
    const split2 = variants.find((v) => v.id === "A|strip|split2|combined");
    expect(split2?.parts.map((p) => p.trayKey)).toEqual(["k:pall:0", "k:pall:1"]);
  });

  it("orders combined contents by player and suffixes every compartment, leaving the input alone", () => {
    const options = [opt("A", 2)];
    const snapshot = structuredClone(options);
    const variants = buildVariants({ key: "k", options, players: 2 });
    const combined = variants.find((v) => v.id === "A|strip|split1|combined");
    expect(at(combined?.parts ?? [], 0).compartments.map((c) => c.contents)).toEqual([
      "A0 (P1)",
      "A1 (P1)",
      "A0 (P2)",
      "A1 (P2)",
    ]);
    expect(options).toEqual(snapshot);
  });

  it("keys and suffixes a single player's tray", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], players: 1 });
    const separate = at(variants, 0);
    expect(separate.parts.map((p) => p.trayKey)).toEqual(["k:p0:0"]);
    expect(at(separate.parts, 0).compartments.map((c) => c.contents)).toEqual([
      "A0 (P1)",
      "A1 (P1)",
    ]);
  });

  it("makes every part rotatable in per-player variants", () => {
    const variants = buildVariants({ key: "k", options: [opt("A", 2)], players: 3 });
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      for (const part of v.parts) {
        expect(part.rotatable).toBe(true);
      }
    }
  });

  it("offers splits into three trays and skips rows2 parts with one compartment", () => {
    expect(
      buildVariants({ key: "k", options: [opt("A", 3)], players: null }).map((v) => v.id),
    ).toEqual(["A|strip|split1", "A|strip|split2", "A|rows2|split1", "A|strip|split3"]);
  });

  it("splits only on block boundaries", () => {
    const blocks = [
      [req("a0", 10), req("a1", 10)],
      [req("b0", 10)],
      [req("c0", 10), req("c1", 10), req("c2", 10)],
    ];
    const variants = buildVariants({ key: "k", options: [{ id: "A", blocks }], players: null });
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

  it("returns no variants without options, blocks or players", () => {
    expect(buildVariants({ key: "k", options: [], players: null })).toEqual([]);
    expect(buildVariants({ key: "k", options: [{ id: "A", blocks: [] }], players: null })).toEqual(
      [],
    );
    expect(buildVariants({ key: "k", options: [{ id: "A", blocks: [] }], players: 2 })).toEqual([]);
    expect(buildVariants({ key: "k", options: [opt("A", 2)], players: 0 })).toEqual([]);
  });

  it("is deterministic", () => {
    const input = { key: "k", options: [opt("A", 3), opt("B", 2)], players: 3 };
    expect(buildVariants(input)).toEqual(buildVariants(input));
  });
});
