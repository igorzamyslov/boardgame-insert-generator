import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import * as componentModule from "./component";
import { SlotFitError } from "./errors";
import { combineOptions, mostFrequentAccess, size } from "./group";
import { minOuter } from "./outer";
import { realizeTray } from "./realize";
import { at, bulk, cards, custom, minis, tiles } from "./test-helpers";
import type { TrayPartReq } from "./types";

// The real componentOptions, wrapped so one test can return options without compartments.
vi.mock("./component", async (importOriginal) => {
  const actual = await importOriginal<typeof componentModule>();
  return { ...actual, componentOptions: vi.fn(actual.componentOptions) };
});

const s = DEFAULT_SETTINGS;

describe("size", () => {
  it("leaves out a requirement without variants, so every requirement has 1–8", () => {
    vi.mocked(componentModule.componentOptions).mockReturnValueOnce({
      options: [{ id: "empty", blocks: [] }],
      notices: [],
    });
    const { requirements } = size([custom(), cards()], s);
    expect(requirements.map((r) => r.key)).toEqual(["c1"]);
  });

  it("sizes one component into one requirement keyed by its id", () => {
    const { requirements, notices } = size([cards()], s);
    expect(notices).toEqual([]);
    expect(requirements).toHaveLength(1);
    const req = at(requirements, 0);
    expect(req.key).toBe("c1");
    expect(req.componentIds).toEqual(["c1"]);
    expect(req.access).toBe("sometimes");
    expect(req.loose).toBe(false);
    expect(req.variants.map((v) => v.id)).toEqual(["upright-long|strip|split1"]);
    expect(at(at(req.variants, 0).parts, 0).trayKey).toBe("c1:p0:0");
  });

  it("puts a group into one tray, mixing kinds, with combined storage options", () => {
    const { requirements } = size(
      [cards({ groupId: "g", access: "often" }), bulk({ groupId: "g", access: "setup" })],
      s,
    );
    expect(requirements).toHaveLength(1);
    const req = at(requirements, 0);
    expect(req.key).toBe("g");
    expect(req.componentIds).toEqual(["c1", "b1"]);
    expect(req.access).toBe("often");
    expect(req.loose).toBe(true);
    expect(req.variants.map((v) => v.id)).toEqual([
      "upright-long+shallow|strip|split1",
      "upright-long+deep|strip|split1",
      "upright-long+shallow|strip|split2",
      "upright-long+shallow|rows2|split1",
      "upright-long+deep|strip|split2",
      "upright-long+deep|rows2|split1",
    ]);
    const first = at(at(req.variants, 0).parts, 0);
    expect(first.trayKey).toBe("g:p0:0");
    expect(first.compartments.map((c) => c.contents)).toEqual(["Main ×52", "Cubes ×30"]);
    expect(at(req.variants, 2).parts.map((p) => p.trayKey)).toEqual(["g:p0:0", "g:p0:1"]);
  });

  it("expands perPlayer into separate trays and one combined tray", () => {
    const { requirements } = size([bulk({ perPlayer: { players: 2 } })], s);
    const req = at(requirements, 0);
    expect(req.variants.map((v) => v.id)).toEqual([
      "shallow|strip|split1|separate",
      "deep|strip|split1|separate",
      "shallow|strip|split1|combined",
      "deep|strip|split1|combined",
      "shallow|rows2|split1|combined",
      "deep|rows2|split1|combined",
    ]);
    const separate = at(req.variants, 0);
    expect(separate.parts.map((p) => p.trayKey)).toEqual(["b1:p0:0", "b1:p1:0"]);
    expect(at(at(separate.parts, 0).compartments, 0).contents).toBe("Cubes ×30 (P1)");
    const combined = at(req.variants, 2);
    expect(combined.parts.map((p) => p.trayKey)).toEqual(["b1:pall:0"]);
    expect(at(combined.parts, 0).compartments.map((c) => c.contents)).toEqual([
      "Cubes ×30 (P1)",
      "Cubes ×30 (P2)",
    ]);
  });

  it("gives no requirement and no sizing notices to a grouped perPlayer component", () => {
    const { requirements, notices } = size(
      [cards({ groupId: "g", perPlayer: { players: 2 } }), bulk({ groupId: "g" })],
      s,
    );
    expect(notices).toEqual([]);
    expect(requirements.map((r) => r.key)).toEqual(["g"]);
    expect(at(requirements, 0).componentIds).toEqual(["b1"]);
  });

  it("leaves out an invalid component without a sizing notice and keeps the rest", () => {
    const { requirements, notices } = size([cards({ decks: [] }), bulk()], s);
    expect(notices).toEqual([]);
    expect(requirements.map((r) => r.key)).toEqual(["b1"]);
  });

  it("passes a component's notices through with its index in the components array", () => {
    const { requirements, notices } = size(
      [bulk(), cards({ id: "c2", thickness: { mode: "measured", cards: 100, stackMm: 5 } })],
      s,
    );
    expect(notices.map((n) => [n.code, n.path])).toEqual([
      ["sizing.measuredTooThin", "/components/1/thickness/stackMm"],
    ]);
    expect(requirements.map((r) => r.key)).toEqual(["b1", "c2"]);
  });

  it("leaves out a component with an invalid player count without a sizing notice", () => {
    const { requirements, notices } = size([bulk({ perPlayer: { players: 0 } }), cards()], s);
    expect(notices).toEqual([]);
    expect(requirements.map((r) => r.key)).toEqual(["c1"]);
  });

  it("keeps first-appearance order and treats an empty groupId as none", () => {
    const { requirements } = size(
      [bulk(), cards({ groupId: "" }), tiles({ groupId: "g" }), minis({ groupId: "g" })],
      s,
    );
    expect(requirements.map((r) => r.key)).toEqual(["b1", "c1", "g"]);
    expect(at(requirements, 2).loose).toBe(true);
  });

  it("returns nothing when a setting is out of range", () => {
    expect(size([cards(), bulk()], { ...s, packingFactor: 0 })).toEqual({
      requirements: [],
      notices: [],
    });
    expect(size([cards()], { ...s, wall: Number.NaN })).toEqual({ requirements: [], notices: [] });
  });

  it("returns nothing when the bottom chamfer breaks through the wall or floor", () => {
    const steep = { ...s, wall: 0.9, floor: 0.8, bottomChamfer: 3 };
    expect(size([cards(), bulk()], steep)).toEqual({ requirements: [], notices: [] });
    // The same chamfer is fine with enough material around it.
    expect(
      size([cards()], { ...s, wall: 2, floor: 3, bottomChamfer: 3 }).requirements,
    ).toHaveLength(1);
  });

  describe("finger slot fit", () => {
    const ground = { lipped: false, level: 0 };
    const realizable = (part: TrayPartReq): boolean => {
      try {
        realizeTray(part, minOuter(part, s, ground), s, ground);
        return true;
      } catch (error) {
        if (error instanceof SlotFitError) {
          return false;
        }
        throw error;
      }
    };
    const decks = (...counts: number[]) => counts.map((count, i) => ({ name: `D${i + 1}`, count }));

    it("keeps only the variants whose parts realize at minOuter, in rank order", () => {
      // A one-card deck beside a 120-card one: no upright strip in one tray leaves room for a
      // 15 mm slot by the small deck, so those variants go; flat, split and two-row ones stay.
      const { requirements, notices } = size([cards({ storage: "auto", decks: decks(1, 120) })], s);
      expect(notices).toEqual([]);
      const req = at(requirements, 0);
      expect(req.variants.map((v) => v.id)).toEqual([
        "flat|strip|split1",
        "upright-long|strip|split2",
        "upright-long|rows2|split1",
        "upright-short|strip|split2",
        "upright-short|rows2|split1",
        "flat|strip|split2",
      ]);
      expect(req.variants.every((v) => v.parts.every(realizable))).toBe(true);
    });

    it("warns and leaves the component out when no variant realizes", () => {
      const { requirements, notices } = size(
        [
          bulk(),
          cards({ id: "c2", name: "Cards", storage: "upright-long", decks: decks(1, 1, 1, 120) }),
        ],
        s,
      );
      expect(requirements.map((r) => r.key)).toEqual(["b1"]);
      expect(notices).toEqual([
        {
          level: "warning",
          code: "sizing.noFingerSlot",
          path: "/components/1",
          message:
            "Cards: no tray arrangement leaves room for a finger slot of at least 15 mm by D1 ×1, D2 ×1, D3 ×1, D4 ×120, so it is left out. Try another storage or a narrower finger pocket.",
        },
      ]);
    });
    it("names the stuck member of a group whose variants all fail", () => {
      const { requirements, notices } = size(
        [
          bulk({ groupId: "g" }),
          cards({ id: "c2", groupId: "g", storage: "upright-long", decks: decks(1, 1, 1, 120) }),
        ],
        s,
      );
      expect(requirements).toEqual([]);
      expect(notices.map((n) => [n.code, n.path])).toEqual([
        ["sizing.noFingerSlot", "/components/1"],
      ]);
      expect(at(notices, 0).message).toMatch(/so the group "g" is left out/);
    });
  });

  it("is deterministic", () => {
    const components = [cards({ storage: "auto" }), bulk(), tiles({ storage: "auto" }), custom()];
    expect(size(components, s)).toEqual(size(components, s));
  });
});

describe("mostFrequentAccess", () => {
  it("picks the most frequently accessed member", () => {
    expect(mostFrequentAccess([cards({ access: "setup" }), bulk({ access: "sometimes" })])).toBe(
      "sometimes",
    );
    expect(mostFrequentAccess([cards({ access: "setup" })])).toBe("setup");
  });
});

describe("combineOptions", () => {
  it("pairs each member's option s, reusing a member's last option when it has fewer", () => {
    const combined = combineOptions([
      [
        { id: "a", blocks: [] },
        { id: "b", blocks: [] },
        { id: "c", blocks: [] },
      ],
      [{ id: "x", blocks: [] }],
    ]);
    expect(combined.map((o) => o.id)).toEqual(["a+x", "b+x", "c+x"]);
  });
});
