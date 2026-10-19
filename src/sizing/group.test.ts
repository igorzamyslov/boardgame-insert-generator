import { describe, expect, it, vi } from "vitest";
import { togglesOf } from "../model/defaults";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM, MIN_WALL_MM } from "../model/settings";
import { compartment, wallCutout } from "./common";
import * as componentModule from "./component";
import { CutFitError } from "./errors";
import { combineOptions, mostFrequentAccess, size } from "./group";
import { minOuter } from "./realize";
import { realizeTray } from "./realize";
import { at, bulk, cards, custom, minis, tiles } from "./test-helpers";
import type { TrayPartReq } from "./types";

// The real componentOptions, wrapped so one test can return options without compartments.
vi.mock("./component", async (importOriginal) => {
  const actual = await importOriginal<typeof componentModule>();
  return { ...actual, componentOptions: vi.fn(actual.componentOptions) };
});

const s = DEFAULT_SETTINGS;

const figures = (...sizes: [string, number, number, number][]) =>
  sizes.map(([name, w, d, h]) => ({ name, w, d, h, count: 1 }));

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
    expect(first.compartments.map((c) => c.contents)).toEqual([
      "Cards — Main ×52",
      "Bits — Cubes ×30",
    ]);
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
    expect(at(at(separate.parts, 0).compartments, 0).contents).toBe("Bits — Cubes ×30 (P1)");
    const combined = at(req.variants, 2);
    expect(combined.parts.map((p) => p.trayKey)).toEqual(["b1:pall:0"]);
    expect(at(combined.parts, 0).compartments.map((c) => c.contents)).toEqual([
      "Bits — Cubes ×30 (P1)",
      "Bits — Cubes ×30 (P2)",
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
    // The same chamfer is fine with enough material around it (and a lip ledge that bears it).
    const lip = { ...s.lip, ledge: 4 };
    expect(
      size([cards()], { ...s, wall: 2, floor: 3, bottomChamfer: 3, lip }).requirements,
    ).toHaveLength(1);
  });

  describe("finger cut fit", () => {
    // Every card, tile, minis and custom compartment gets a wall cutout of at least 10 mm with
    // 3 mm posts, or its variant is dropped (roadmap §4.7). Pinned to 22 mm cuts.
    const s = {
      ...DEFAULT_SETTINGS,
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, width: 22 },
    };
    const options = [
      { lipped: false, level: 0 },
      { lipped: true, level: 0 },
      { lipped: false, level: 1 },
      { lipped: true, level: 1 },
    ];
    const realizable = (part: TrayPartReq): boolean =>
      options.every((opts) => {
        try {
          realizeTray(part, minOuter(part, s, opts), s, opts);
          return true;
        } catch (error) {
          if (error instanceof CutFitError) {
            return false;
          }
          throw error;
        }
      });

    it("keeps the variants whose every pocket gets a cut, in rank order", () => {
      // A 25 mm figure and a 4 × 30 mm one: too narrow for a cut through its front or back, the
      // second pocket is cut through its free side wall at the end of the row.
      const m = minis({ figures: figures(["A", 25, 25, 20], ["B", 4, 30, 10]) });
      const { requirements, notices } = size([m], s);
      expect(notices).toEqual([]);
      const req = at(requirements, 0);
      expect(req.variants.map((v) => v.id)).toEqual([
        "standing|strip|split1",
        "standing|strip|split2",
        "standing|rows2|split1",
      ]);
      expect(req.variants.every((v) => v.parts.every(realizable))).toBe(true);
    });

    it("warns and leaves out a deck that no variant gives a cut: cards have no bulk fallback", () => {
      const deck = cards({ id: "c2", shortSide: 8, longSide: 8, storage: "flat" });
      const { requirements, notices } = size([bulk(), deck], s);
      expect(requirements.map((r) => r.key)).toEqual(["b1"]);
      expect(notices).toEqual([
        {
          level: "warning",
          code: "sizing.noFingerSlot",
          path: "/components/1",
          message:
            "Cards: no tray arrangement leaves room for a finger cutout of at least 10 mm by Cards — Main ×52 with 3 mm of wall beside it, so it is left out. Try another storage.",
        },
      ]);
    });

    it("tells a bulk component left without its finger cuts to turn them off, not to store it another way", () => {
      // Bulk has no other storage (review 3, M4). Its bins are elastic, so a stand-in that can't
      // grow shows the case: an 8 mm well asking for a cut.
      const bits = bulk({ fingerCuts: true });
      vi.mocked(componentModule.componentOptions).mockReturnValueOnce({
        options: [
          {
            id: "tiny",
            blocks: [
              [
                compartment({
                  componentId: bits.id,
                  contents: "Cubes ×30",
                  kind: "well",
                  w: 8,
                  d: 8,
                  h: 10,
                  features: [wallCutout("front", 0.5, false)],
                }),
              ],
            ],
          },
        ],
        notices: [],
      });
      const { requirements, notices } = size([bits], s);
      expect(requirements).toEqual([]);
      expect(notices.map((n) => [n.level, n.message])).toEqual([
        [
          "warning",
          "Bits: no tray arrangement leaves room for a finger cutout of at least 10 mm by Cubes ×30 with 3 mm of wall beside it, so it is left out. Turn its finger cuts off.",
        ],
      ]);
    });

    it("names the stuck member of a group whose variants all fail, even with its pockets in a bin", () => {
      const deck = cards({ id: "c2", groupId: "g", shortSide: 8, longSide: 8, storage: "flat" });
      const m = minis({ id: "m2", groupId: "g", figures: figures(["A", 3, 3, 1], ["B", 3, 4, 1]) });
      const { requirements, notices } = size([bulk({ groupId: "g" }), m, deck], s);
      expect(requirements).toEqual([]);
      expect(notices.map((n) => [n.level, n.code, n.path])).toEqual([
        ["warning", "sizing.noFingerSlot", "/components/2"],
      ]);
      expect(at(notices, 0).message).toMatch(
        /by Cards — Main ×52 with 3 mm of wall beside it, so the group "g"/,
      );
    });

    it("keeps every variant of five one-card decks: their channels run along the card length", () => {
      // Five one-card decks once had no upright arrangement with room for a finger slot; a channel
      // only needs a 10 mm cut with 3 mm posts along the 92.5 mm wells.
      const decks = [1, 1, 1, 1, 1].map((count, i) => ({ name: `D${i + 1}`, count }));
      const { requirements, notices } = size([cards({ storage: "auto", decks })], s);
      expect(notices).toEqual([]);
      expect(at(requirements, 0).variants.map((v) => v.id)).toEqual([
        "upright-long|strip|split1",
        "upright-short|strip|split1",
        "flat|strip|split1",
        "upright-long|strip|split2",
        "upright-long|rows2|split1",
        "upright-short|strip|split2",
        "upright-short|rows2|split1",
        "flat|strip|split2",
        "flat|rows2|split1",
        "upright-long|strip|split3",
        "upright-long|rows2|split2",
        "upright-short|strip|split3",
        "upright-short|rows2|split2",
        "flat|strip|split3",
        "flat|rows2|split2",
      ]);
    });
  });

  describe("bulk fallback", () => {
    // A tiles, minis (pockets) or custom component that no variant gives a finger cut is stored
    // loose in scoop bins instead, like minis bulk storage, with an info notice (spec §7.1).
    const fallbackNotice = (index: number, name: string, contents: string) => ({
      level: "info",
      code: "sizing.noFingerSlot",
      path: `/components/${index}`,
      message: `${name}: no tray arrangement leaves room for a finger cutout of at least 10 mm by ${contents} with 3 mm of wall beside it, so it is stored loose in a tray with a curved floor instead.`,
    });
    // The thinnest wall, floor and divider with a tight fit: a 15 mm tile's well is under 16 mm.
    const thinAndTight = {
      ...DEFAULT_SETTINGS,
      wall: MIN_WALL_MM,
      floor: MIN_FEATURE_MM,
      divider: MIN_FEATURE_MM,
      fit: 0.7,
    };
    const binIds = ["bulk-shallow|strip|split1", "bulk-deep|strip|split1"];
    const first = (req: { variants: { parts: TrayPartReq[] }[] }) =>
      at(at(at(req.variants, 0).parts, 0).compartments, 0);
    const features = (c: { features: { type: string; side?: string }[] }) =>
      c.features.map((f) => (f.side ? `${f.type} ${f.side}` : f.type));

    it("puts 15 mm square tiles laid flat into a bin when tight fit and thin walls leave no cut", () => {
      const squares = tiles({
        shape: { type: "rect", w: 15, d: 15 },
        thickness: 2,
        count: 40,
        storage: "flat",
      });
      const { requirements, notices } = size([squares], thinAndTight);
      const req = at(requirements, 0);
      expect(req.variants.map((v) => v.id)).toEqual(binIds);
      expect(req.loose).toBe(true);
      expect(first(req).contents).toBe("Hexes ×40");
      expect([first(req).kind, features(first(req))]).toEqual(["scoop", ["scoop"]]);
      expect(notices).toEqual([fallbackNotice(0, "Hexes", "Hexes ×40")]);
    });

    it("puts 8 mm custom pieces into a bin", () => {
      const pieces = custom({ w: 8, d: 8, h: 8, count: 3 });
      const { requirements, notices } = size([pieces], s);
      const req = at(requirements, 0);
      // Three small pieces: the deep bin is the shallow one, so only one variant is left.
      expect(req.variants.map((v) => v.id)).toEqual(["bulk-shallow|strip|split1"]);
      expect(first(req).contents).toBe("Dial ×3");
      expect(features(first(req))).toEqual(["scoop"]);
      expect(notices.map((n) => [n.level, n.code])).toEqual([["info", "sizing.noFingerSlot"]]);
    });

    it("bins a component the same whether its toggles are absent or set to their defaults", () => {
      // Review 3, I1: explicit defaults (as the UI writes them) once gave a cut, relief-cornered well.
      const pieces = custom({ w: 8, d: 8, h: 8, count: 6 });
      const set = { ...pieces, ...togglesOf(pieces) };
      expect(size([set], s)).toEqual(size([pieces], s));
      expect(features(first(at(size([set], s).requirements, 0)))).toEqual(["scoop"]);
    });

    it("keeps a toggle a component set away from its kind's default in its bin", () => {
      // Corner reliefs are off for minis, so turning them on carries over to the bin.
      const tiny = figures(["F0", 3, 10, 1], ["F1", 5, 3, 1]);
      const reliefs = at(size([minis({ figures: tiny, cornerReliefs: true })], s).requirements, 0);
      expect(features(first(reliefs))).toEqual(["scoop", "cornerRelief"]);
      expect(size([minis({ figures: tiny, cornerReliefs: true })], s).notices[0]?.message).toMatch(
        /so it is stored loose in a tray with a curved floor and corner reliefs instead\.$/,
      );
    });

    it("stores tiny minis pockets exactly as minis bulk storage would", () => {
      const tiny = figures(["F0", 3, 10, 1], ["F1", 5, 3, 1]);
      const { requirements, notices } = size([bulk(), minis({ id: "m2", figures: tiny })], s);
      const piled = size([minis({ id: "m2", figures: tiny, storage: "bulk" })], s);
      expect(requirements.map((r) => r.key)).toEqual(["b1", "m2"]);
      expect(at(requirements, 1)).toEqual(at(piled.requirements, 0));
      expect(notices).toEqual([fallbackNotice(1, "Minis", "Minis — F0, Minis — F1")]);
    });

    it("puts only the stuck members of a group into a bin", () => {
      const tiny = figures(["A", 3, 3, 1], ["B", 3, 4, 1]);
      const m = minis({ id: "m2", groupId: "g", figures: tiny });
      const { requirements, notices } = size([cards({ groupId: "g" }), m], s);
      const req = at(requirements, 0);
      expect(req.variants.map((v) => v.id)).toEqual([
        "upright-long+bulk-shallow|strip|split1",
        "upright-long+bulk-shallow|strip|split2",
        "upright-long+bulk-shallow|rows2|split1",
        "upright-long+bulk-shallow|strip|split3",
      ]);
      expect(req.loose).toBe(true);
      expect(notices.map((n) => [n.level, n.path])).toEqual([["info", "/components/1"]]);
    });

    it("adds no bin when a variant keeps every cut", () => {
      const squares = tiles({
        shape: { type: "rect", w: 15, d: 15 },
        thickness: 2,
        count: 40,
        storage: "auto",
      });
      const { requirements, notices } = size([squares], thinAndTight);
      expect(notices).toEqual([]);
      const ids = at(requirements, 0).variants.map((v) => v.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.some((id) => id.includes("bulk"))).toBe(false);
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
