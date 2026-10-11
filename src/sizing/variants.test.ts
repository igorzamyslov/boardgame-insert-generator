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

  it("never returns more than 8 variants", () => {
    const options = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((id) => opt(id, 3));
    expect(buildVariants({ key: "k", options, players: 4 })).toHaveLength(8);
  });
});
