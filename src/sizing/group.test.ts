import { describe, expect, it, vi } from "vitest";
import { togglesOf } from "../model/defaults";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM, MIN_WALL_MM } from "../model/settings";
import { compartment, wallCutout } from "./common";
import * as componentModule from "./component";
import { CutFitError } from "./errors";
import { combineOptions, size } from "./group";
import { minOuter } from "./realize";
import { realizeTray } from "./realize";
import { at, bulk, cards, custom, inGroup, minis, tiles } from "./test-helpers";
import type { TrayPartReq } from "./types";
import * as variantsModule from "./variants";

// The real componentOptions, wrapped so one test can return options without compartments.
vi.mock("./component", async (importOriginal) => {
  const actual = await importOriginal<typeof componentModule>();
  return { ...actual, componentOptions: vi.fn(actual.componentOptions) };
});

// The real buildVariants, wrapped so one test can offer only some of the variants.
vi.mock("./variants", async (importOriginal) => {
  const actual = await importOriginal<typeof variantsModule>();
  return { ...actual, buildVariants: vi.fn(actual.buildVariants) };
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
    const members = [cards({ access: "often" }), bulk({ access: "setup" })];
    const { requirements } = size(members, s, [inGroup(members)]);
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

  it("expands Copies into separate trays keyed p0…p2, with no combined tray and no (P1) suffix", () => {
    const { requirements } = size([bulk({ copies: 3 })], s);
    const req = at(requirements, 0);
    expect(req.variants.map((v) => v.id)).toEqual(["shallow|strip|split1", "deep|strip|split1"]);
    for (const v of req.variants) {
      expect(v.id).not.toContain("combined");
      expect(v.parts.map((p) => p.trayKey)).toEqual(["b1:p0:0", "b1:p1:0", "b1:p2:0"]);
      for (const part of v.parts) {
        expect(part.compartments.map((c) => c.contents)).toEqual(["Bits — Cubes ×30"]);
      }
    }
  });

  it("keeps 0.6's whole-tray variants for an item with Copies, and adds the splits", () => {
    // 0.6's per-player variants of these items (the "separate" ones), from main: the keys and
    // arrangements are the same now, the contents lost their " (P<n>)" and the ids their
    // "|separate". Its combined variants are gone; split2 and split3 copies are new.
    const mainBulk = [
      ["shallow|strip|split1", "strip", ["b1:p0:0", "b1:p1:0", "b1:p2:0"]],
      ["deep|strip|split1", "strip", ["b1:p0:0", "b1:p1:0", "b1:p2:0"]],
    ] as const;
    const mainCards = [
      ["upright-long|strip|split1", "strip", ["c1:p0:0", "c1:p1:0"]],
      ["upright-short|strip|split1", "strip", ["c1:p0:0", "c1:p1:0"]],
      ["flat|strip|split1", "strip", ["c1:p0:0", "c1:p1:0"]],
    ] as const;
    const cases = [
      [bulk({ copies: 3 }), mainBulk],
      [cards({ copies: 2, storage: "auto" }), mainCards],
    ] as const;
    for (const [item, snapshot] of cases) {
      const { requirements } = size([item], s);
      const whole = at(requirements, 0).variants.filter((v) =>
        v.parts.every((p) => p.trayKey.endsWith(":0")),
      );
      expect(
        whole.map((v) => [v.id, at(v.parts, 0).arrangement, v.parts.map((p) => p.trayKey)]),
      ).toEqual(snapshot.map(([id, arrangement, keys]) => [id, arrangement, keys]));
    }
  });

  it("gives a group Copies 4 as four identical trays keyed p0…p3", () => {
    const members = [cards(), bulk()];
    const { requirements } = size(members, s, [inGroup(members, "g", { copies: 4 })]);
    const req = at(requirements, 0);
    const whole = at(req.variants, 0);
    expect(whole.parts.map((p) => p.trayKey)).toEqual(["g:p0:0", "g:p1:0", "g:p2:0", "g:p3:0"]);
    for (const part of whole.parts) {
      expect(part.arrangement).toBe(at(whole.parts, 0).arrangement);
      expect(part.compartments).toEqual(at(whole.parts, 0).compartments);
    }
  });

  it("uses member order, not list order, as the strip order", () => {
    const resources = bulk({ id: "r", name: "Resources" });
    const starter = cards({ id: "s", name: "Starter deck" });
    const hero = minis({ id: "h", name: "Hero" });
    const components = [resources, starter, hero]; // list order
    const group = inGroup([hero, starter, resources]); // member order
    const { requirements } = size(components, s, [group]);
    const req = at(requirements, 0);
    expect(req.componentIds).toEqual(["h", "s", "r"]);
    expect(req.variants.length).toBeGreaterThan(0);
    for (const v of req.variants) {
      const owners = v.parts
        .flatMap((p) => p.compartments.map((c) => c.componentId))
        .filter((id, i, all) => id !== all[i - 1]);
      expect(owners).toEqual(["h", "s", "r"]);
    }
    const strip = req.variants.find(
      (v) => v.parts.length === 1 && at(v.parts, 0).arrangement === "strip",
    );
    expect(strip?.parts[0]?.compartments.map((c) => c.componentId)).toEqual(
      expect.arrayContaining(["h", "s", "r"]),
    );
    expect(at(requirements, 0).access).toBe(group.access);
  });

  it("takes the group's access, not its members'", () => {
    const members = [cards({ access: "often" }), bulk({ access: "often" })];
    const { requirements } = size(members, s, [inGroup(members, "g", { access: "setup" })]);
    expect(at(requirements, 0).access).toBe("setup");
  });

  it("gives an empty group no requirement, and a group of invalid members none", () => {
    const empty = size([cards()], s, [{ id: "g", name: "Empty", access: "often", memberIds: [] }]);
    expect(empty.requirements.map((r) => r.key)).toEqual(["c1"]);
    const invalid = [cards({ id: "i1", decks: [] }), bulk({ id: "i2", items: [] })];
    const only = size([...invalid, custom()], s, [inGroup(invalid)]);
    expect(only.requirements.map((r) => r.key)).toEqual(["x1"]);
    expect(only.notices).toEqual([]);
  });

  it("ignores a member id that names no component", () => {
    const { requirements } = size([cards()], s, [
      { id: "g", name: "Kit", access: "often", memberIds: ["gone", "c1"] },
    ]);
    expect(requirements.map((r) => [r.key, r.componentIds])).toEqual([["g", ["c1"]]]);
  });

  it("splits a group that does not fit the bed in every copy, the same way", () => {
    // Three 130 mm wells: whole, a strip is over 390 mm and two rows over 260 mm in each
    // direction; only three trays each fit a 250 mm bed.
    const members = ["x1", "x2", "x3"].map((id) =>
      custom({ id, name: id, w: 130, d: 130, h: 10, count: 1 }),
    );
    const { requirements } = size(members, s, [inGroup(members, "g", { copies: 2 })]);
    const req = at(requirements, 0);
    const bed = 250;
    const fits = req.variants.filter((v) =>
      v.parts.every((part) => {
        const o = minOuter(part, s, { lipped: false, level: 0 });
        return Math.min(o.w, o.d) <= bed && Math.max(o.w, o.d) <= bed;
      }),
    );
    expect(fits.length).toBeGreaterThan(0);
    for (const v of fits) {
      expect(v.parts.length).toBeGreaterThan(2); // more than one part in each of the 2 copies
      expect(v.parts.map((p) => p.trayKey)).toEqual(
        v.parts.map(
          (_, i) => `g:p${Math.floor(i / (v.parts.length / 2))}:${i % (v.parts.length / 2)}`,
        ),
      );
    }
    expect(fits.map((v) => v.parts.map((p) => p.trayKey))).toContainEqual([
      "g:p0:0",
      "g:p0:1",
      "g:p0:2",
      "g:p1:0",
      "g:p1:1",
      "g:p1:2",
    ]);
  });

  it("takes a group's copies from the group, and ignores a member's own", () => {
    const members = [cards({ copies: 2 }), bulk()];
    const { requirements, notices } = size(members, s, [inGroup(members)]);
    expect(notices).toEqual([]);
    expect(requirements.map((r) => r.key)).toEqual(["g"]);
    expect(at(requirements, 0).componentIds).toEqual(["c1", "b1"]);
    const trayKeys = at(requirements, 0).variants.flatMap((v) => v.parts.map((p) => p.trayKey));
    expect(trayKeys.every((k) => k.startsWith("g:p0:"))).toBe(true);
    const copied = size(members, s, [inGroup(members, "g", { copies: 2 })]);
    const keys = at(copied.requirements, 0).variants.flatMap((v) => v.parts.map((p) => p.trayKey));
    expect(keys).toContain("g:p1:0");
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

  it("leaves out a component with an invalid copies count without a sizing notice", () => {
    const { requirements, notices } = size([bulk({ copies: 0 }), cards()], s);
    expect(notices).toEqual([]);
    expect(requirements.map((r) => r.key)).toEqual(["c1"]);
  });

  it("keeps first-appearance order: a group stands where its first member does", () => {
    const components = [bulk(), cards(), tiles(), minis()];
    const { requirements } = size(components, s, [inGroup(components.slice(2))]);
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
      const deck = cards({ id: "c2", shortSide: 8, longSide: 8, storage: "flat" });
      const m = minis({ id: "m2", figures: figures(["A", 3, 3, 1], ["B", 3, 4, 1]) });
      const members = [bulk(), m, deck];
      const { requirements, notices } = size(members, s, [
        inGroup(members, "g", { name: "Player kit" }),
      ]);
      expect(requirements).toEqual([]);
      expect(notices.map((n) => [n.level, n.code, n.path])).toEqual([
        ["warning", "sizing.noFingerSlot", "/components/2"],
      ]);
      // The group's name, not its key ("g").
      expect(at(notices, 0).message).toMatch(
        /by Cards — Main ×52 with 3 mm of wall beside it, so the group "Player kit" is left out/,
      );
    });

    describe("a finger cut member order blocks", () => {
      // A one-card deck's well is too narrow for a cut through its front or back, so it needs a
      // free end wall; between two piles it has none. Member order is a promise: sizing never
      // moves the deck, and never drops the tray.
      const pile = (id: string) => bulk({ id, name: id, items: [{ name: "Pile", volumeMl: 40 }] });
      const starter = cards({
        id: "d1",
        name: "Starter deck",
        decks: [{ name: "Main", count: 1 }],
      });
      const wallCuts = (part: TrayPartReq, id: string): number =>
        part.compartments
          .filter((c) => c.componentId === id)
          .flatMap((c) => c.features)
          .filter((f) => f.type === "wallCutout").length;

      it("keeps the variants that give every cut, and says nothing, while there are any", () => {
        const members = [pile("b1"), starter, pile("b2")];
        const { requirements, notices } = size(members, s, [inGroup(members, "g")]);
        expect(notices).toEqual([]);
        const req = at(requirements, 0);
        expect(req.variants.length).toBeGreaterThan(0);
        for (const v of req.variants) {
          for (const part of v.parts) {
            if (part.compartments.some((c) => c.componentId === "d1")) {
              expect(wallCuts(part, "d1")).toBeGreaterThan(0);
            }
          }
        }
      });

      it("keeps the tray without the deck's cuts, and warns, when no variant gives it one", async () => {
        const actual = await vi.importActual<typeof variantsModule>("./variants");
        // Only the whole strip on offer: the deck stands between the piles in it.
        vi.mocked(variantsModule.buildVariants).mockImplementation((input) =>
          actual.buildVariants(input).filter((v) => v.id.endsWith("|strip|split1")),
        );
        try {
          const members = [pile("b1"), starter, pile("b2")];
          const { requirements, notices } = size(members, s, [
            inGroup(members, "g", { name: "Player kit" }),
          ]);
          const req = at(requirements, 0);
          expect(req.variants.length).toBeGreaterThan(0);
          expect(req.componentIds).toEqual(["b1", "d1", "b2"]);
          for (const v of req.variants) {
            for (const part of v.parts) {
              // order is kept, the deck's compartments have no wall cutout
              expect(part.compartments.map((c) => c.componentId)).toEqual(["b1", "d1", "b2"]);
              expect(wallCuts(part, "d1")).toBe(0);
              realizeTray(part, minOuter(part, s, { lipped: false, level: 0 }), s, {
                lipped: false,
                level: 0,
              });
            }
          }
          expect(notices).toEqual([
            {
              level: "warning",
              code: "sizing.noFingerSlot",
              path: "/components/1",
              message:
                "Starter deck has no finger cut here. Move it to the start of Player kit for one.",
            },
          ]);
        } finally {
          vi.mocked(variantsModule.buildVariants).mockImplementation(actual.buildVariants);
        }
      });

      it("keeps the other members' cuts, and drops a stuck member that no order would help", async () => {
        const actual = await vi.importActual<typeof variantsModule>("./variants");
        vi.mocked(variantsModule.buildVariants).mockImplementation((input) =>
          actual.buildVariants(input).filter((v) => v.id.endsWith("|strip|split1")),
        );
        try {
          // The 8 mm flat deck gets no cut anywhere: left out as before, with the group's name.
          const tiny = cards({ id: "c2", shortSide: 8, longSide: 8, storage: "flat" });
          const members = [pile("b1"), tiny, pile("b2")];
          const { requirements, notices } = size(members, DEFAULT_SETTINGS, [
            inGroup(members, "g", { name: "Player kit" }),
          ]);
          expect(requirements).toEqual([]);
          expect(notices.map((n) => n.message)).toEqual([
            expect.stringMatching(/so the group "Player kit" is left out/),
          ]);
        } finally {
          vi.mocked(variantsModule.buildVariants).mockImplementation(actual.buildVariants);
        }
      });
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
      const m = minis({ id: "m2", figures: tiny });
      const members = [cards(), m];
      const { requirements, notices } = size(members, s, [inGroup(members)]);
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
