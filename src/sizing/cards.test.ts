import { describe, expect, it } from "vitest";
import { flatDecksOffered } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CardsComponent, Settings } from "../model/types";
import { cardDims, cardOptions, stackWidth } from "./cards";
import {
  AUTO_GROWTH_CEILING,
  DIVIDER_GROOVE,
  MIN_REACH_OVERLAP,
  PLATED_RETENTION,
} from "./constants";
import { dividerSlotWidth } from "./dividers";
import { mainClearance } from "./common";
import { at, cards } from "./test-helpers";
import type { CompartmentReq } from "./types";
import { ceilU, fromU } from "./units";

const s: Settings = DEFAULT_SETTINGS;
const cutout = (side: "left" | "right", depthFraction: number, floorNotch: boolean) => ({
  type: "wallCutout",
  side,
  depthFraction,
  floorNotch,
});

function deck(component: CardsComponent, settings: Settings = s, option = 0): CompartmentReq {
  return at(at(at(cardOptions(component, settings, 0).options, option).blocks, 0), 0);
}

describe("cardDims", () => {
  it("adds the standard sleeve to both sides and to the thickness", () => {
    const { dims, notices } = cardDims(cards(), s, 0);
    expect(dims.S).toBeCloseTo(66.5, 9);
    expect(dims.L).toBeCloseTo(91, 9);
    expect(dims.t).toBeCloseTo(0.42, 9);
    expect(notices).toEqual([]);
  });

  it("handles no sleeve, premium and custom sleeves", () => {
    expect(cardDims(cards({ sleeve: "none" }), s, 0).dims).toEqual({ S: 63.5, L: 88, t: 0.32 });
    const premium = cardDims(cards({ sleeve: "premium" }), s, 0).dims;
    expect(premium.S).toBeCloseTo(66.5, 9);
    expect(premium.t).toBeCloseTo(0.6, 9);
    const own = cardDims(cards({ sleeve: { w: 95, h: 70, thickness: 0.2 } }), s, 0).dims;
    expect(own.S).toBe(70);
    expect(own.L).toBe(95);
    expect(own.t).toBeCloseTo(0.52, 9);
  });

  it("accepts the sides entered the other way round", () => {
    const { dims } = cardDims(cards({ shortSide: 88, longSide: 63.5 }), s, 0);
    expect(dims.S).toBeCloseTo(66.5, 9);
    expect(dims.L).toBeCloseTo(91, 9);
  });

  it("uses a measured stack for the thickness but keeps the sleeve size", () => {
    const { dims } = cardDims(
      cards({ thickness: { mode: "measured", cards: 100, stackMm: 45 } }),
      s,
      0,
    );
    expect(dims.t).toBeCloseTo(0.45, 9);
    expect(dims.S).toBeCloseTo(66.5, 9);
  });

  it("accepts exactly the minimum measured thickness", () => {
    const { dims, notices } = cardDims(
      cards({ thickness: { mode: "measured", cards: 100, stackMm: 10 } }),
      s,
      0,
    );
    expect(dims.t).toBe(0.1);
    expect(notices).toEqual([]);
  });

  it("falls back to the preset when the measured stack is implausibly thin", () => {
    const { dims, notices } = cardDims(
      cards({ thickness: { mode: "measured", cards: 100, stackMm: 5 } }),
      s,
      3,
    );
    expect(dims.t).toBeCloseTo(0.42, 9);
    expect(notices).toHaveLength(1);
    expect(at(notices, 0)).toMatchObject({
      level: "warning",
      code: "sizing.measuredTooThin",
      path: "/components/3/thickness/stackMm",
    });
  });
});

describe("stackWidth", () => {
  it("is n·t·(1 + pct·fit) + cardStackClearance·fit", () => {
    expect(stackWidth(52, 0.42, s)).toBeCloseTo(23.4952, 9);
    // 21.84 · 1.042 + 1.4
    expect(stackWidth(52, 0.42, { ...s, fit: 1.4 })).toBeCloseTo(24.15728, 9);
  });
});

describe("cardOptions", () => {
  it("upright-long: stack along X, length along Y, height from the short side", () => {
    const c = deck(cards());
    expect(c.minW).toBe(23.5);
    expect(c.minD).toBeCloseTo(92.5, 9);
    expect(c.minH).toBeCloseTo(68, 9);
    expect(c.kind).toBe("well");
    expect(c.contents).toBe("Cards — Main ×52");
    expect(c.componentId).toBe("c1");
    // A deck never grows on its own (owner, 2026-10-23): no room by default, and nothing is
    // printed to fill any: a spacer axis only when `separators` is set.
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect(c.growth).toBeUndefined();
    expect(c.spacerAxis).toBeUndefined();
    // One channel, half the shallowest well deep, through the walls the card faces touch.
    expect(c.features).toEqual([cutout("left", 1 / 2, false), cutout("right", 1 / 2, false)]);
  });

  describe("growth (minimal-trays spec §5)", () => {
    // 52 cards at 0.42 mm each, 3 % and 1 mm stack clearance: a 23.5 mm stack.
    const stack = 23.5;
    // "auto" is what the fill setting "bigger wells" gives an item that asked for nothing
    const wells: Settings = { ...s, biggerWells: true };
    const max = { room: "max" } as const;

    it("is auto along the stack of an upright deck under bigger wells: the stack, at most 50 mm", () => {
      expect(deck(cards(), wells).growth).toEqual({ w: stack });
      // 200 cards: a 100 mm stack, so the ceiling is what binds
      const thick = deck(cards({ decks: [{ name: "Main", count: 200 }] }), wells);
      expect(thick.growth).toEqual({ w: AUTO_GROWTH_CEILING });
    });

    it("is off along the stack by default: content-tight, no spacer", () => {
      const c = deck(cards());
      expect(c.elastic).toEqual({ w: false, d: false, h: false });
      expect(c.growth).toBeUndefined();
      expect(c.spacerAxis).toBeUndefined();
    });

    it("takes a number as that many more cards, built into the well and not grown after", () => {
      // was a number of mm of growth; now "some" is counted in cards (owner, 2026-10-23)
      const c = deck(cards({ room: 20 }));
      expect(c.minW).toBe(fromU(ceilU(stackWidth(72, 0.42, s))));
      expect(c.elastic).toEqual({ w: false, d: false, h: false });
      expect(c.growth).toBeUndefined();
      expect(deck(cards({ room: 0 })).minW).toBe(23.5);
    });

    it("never grows across the cards: width and length are not growth axes", () => {
      const c = deck(cards(max));
      expect(c.elastic.d).toBe(false);
      expect(c.elastic.h).toBe(false);
      expect(c.growth).toEqual({ w: stack });
    });

    it("holds growth to the stack's own thickness when nothing fills the room", () => {
      // retention: as much as fits would let the deck topple past the stack's thickness
      expect(deck(cards(max)).growth).toEqual({ w: stack });
    });

    it("lets the spacer plates take it considerably further", () => {
      const plated = cards({ ...max, separators: 3 });
      expect(deck(plated).growth).toEqual({ w: stack * PLATED_RETENTION });
      // one plate is the spacer block, which fills the room solid just as well
      const one = deck(cards({ ...max, separators: 1 }));
      expect(one.growth).toEqual({ w: stack * PLATED_RETENTION });
      expect(one.spacerAxis).toBe("w");
    });

    it("has no spacer axis unless `separators` is set, at any room", () => {
      for (const [name, c, settings] of [
        ["max", cards(max), s],
        ["bigger wells", cards(), wells],
        ["some", cards({ room: 5 }), s],
      ] as const) {
        const req = deck(c, settings);
        expect(req.spacerAxis, name).toBeUndefined();
        expect(req.separators).toBeUndefined();
        expect(req.elastic.w, name).toBe(name !== "some");
      }
      expect(deck(cards({ separators: 0 })).spacerAxis).toBeUndefined();
      // plates with no room asked: nothing to fill, so no spacer either
      expect(deck(cards({ separators: 2 })).spacerAxis).toBeUndefined();
      expect(deck(cards({ ...max, separators: 2 })).spacerAxis).toBe("w");
    });

    it("holds an upright deck to what keeps it under its finger cut, when that is tighter", () => {
      const narrow = (width: number, biggerWells = false): Settings => ({
        ...s,
        biggerWells,
        fingerPocket: { ...s.fingerPocket, width },
      });
      const grown = (width: number, biggerWells = false) =>
        deck(cards(biggerWells ? {} : max), narrow(width, biggerWells)).growth;
      // 23.5 mm stack: a 14 mm cut leaves 14 + 23.5 - 20 = 17.5 mm of room, the default 25 mm cut
      // the retention's 23.5
      expect(grown(14)).toEqual({ w: 17.5 });
      expect(grown(14, true)).toEqual({ w: 17.5 });
      expect(grown(25)).toEqual({ w: stack });
      expect(grown(10)).toEqual({ w: 10 + stack - 2 * MIN_REACH_OVERLAP });
      // not once something holds the stack: the plates' limit applies as before
      expect(deck(cards({ ...max, separators: 2 }), narrow(14)).growth).toEqual({
        w: stack * PLATED_RETENTION,
      });
      // and not when the deck has no cut to reach it by
      expect(deck(cards({ ...max, fingerCuts: false }), narrow(14)).growth).toEqual({
        w: stack,
      });
    });

    it("leaves a flat deck's height alone: nothing slides and no cut crosses its stack", () => {
      const narrow: Settings = { ...s, fingerPocket: { ...s.fingerPocket, width: 10 } };
      // as much as fits has no cap of its own on a flat deck, a narrow cut or not
      expect(deck(cards({ storage: "flat", ...max }), narrow).growth).toBeUndefined();
    });

    it("does not grow a flat deck taller by default: the spare height is a riser's", () => {
      const flat = deck(cards({ storage: "flat" }));
      expect(flat.elastic).toEqual({ w: false, d: false, h: false });
      expect(flat.spacerAxis).toBeUndefined();
      // not even under bigger wells
      expect(deck(cards({ storage: "flat" }), wells).elastic.h).toBe(false);
    });

    it("grows a flat deck taller only when asked: more cards, or as much as fits", () => {
      const flat = (o: Partial<CardsComponent>) => deck(cards({ storage: "flat", ...o }));
      // some: more cards, so a taller well and no growth after
      const some = flat({ room: 52 });
      expect(some.minH).toBeGreaterThan(flat({}).minH);
      expect(some.elastic).toEqual({ w: false, d: false, h: false });
      // a flat stack cannot topple, so retention does not bound it; as much as fits has no cap
      expect(flat(max).growth).toBeUndefined();
      expect(flat(max).elastic).toEqual({ w: false, d: false, h: true });
    });
  });

  it("upright-short: height from the long side, length from the short side", () => {
    const c = deck(cards({ storage: "upright-short" }));
    expect(c.minW).toBe(23.5);
    expect(c.minD).toBeCloseTo(68, 9);
    expect(c.minH).toBeCloseTo(92.5, 9);
  });

  it("flat: the stack is the height, full-depth cutouts through both long walls", () => {
    const c = deck(cards({ storage: "flat" }));
    expect(c.minW).toBeCloseTo(68, 9);
    expect(c.minD).toBeCloseTo(92.5, 9);
    expect(c.minH).toBe(23.5); // 23.4952 rounded up
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect(c.spacerAxis).toBeUndefined();
    expect(c.features).toEqual([cutout("left", 1, true), cutout("right", 1, true)]);
  });

  it("auto offers upright-long, upright-short and flat, one block per deck", () => {
    const { options } = cardOptions(
      cards({
        storage: "auto",
        decks: [
          { name: "A", count: 40 },
          { name: "", count: 12 },
        ],
      }),
      s,
      0,
    );
    expect(options.map((o) => o.id)).toEqual(["upright-long", "upright-short", "flat"]);
    for (const option of options) {
      expect(option.blocks.map((b) => b.map((c) => c.contents))).toEqual([
        ["Cards — A ×40"],
        ["Cards ×12"],
      ]);
    }
  });

  it("scales the clearances by fit", () => {
    const c = deck(cards(), { ...s, fit: 1.4 });
    expect(c.minD).toBeCloseTo(93.1, 9);
    expect(c.minH).toBeCloseTo(68.6, 9);
    expect(c.minW).toBe(24.16);
  });

  it("a clearance override replaces cardClearance only and is not scaled", () => {
    const c = deck(cards({ clearance: 2 }), { ...s, fit: 1.4 });
    expect(c.minD).toBeCloseTo(93, 9);
    expect(c.minH).toBeCloseTo(68.5, 9);
    expect(c.minW).toBe(24.16); // stack clearance still × fit
  });

  it("drives the stack width from a measured thickness", () => {
    const c = deck(cards({ thickness: { mode: "measured", cards: 100, stackMm: 45 } }));
    expect(c.minW).toBe(25.11);
  });

  it("a deck of one card is a 1.33 mm well", () => {
    const c = deck(cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] }));
    expect(c.minW).toBe(1.33);
    expect(c.minD).toBeCloseTo(89.5, 9);
    expect(c.minH).toBeCloseTo(65, 9);
  });

  it("sleeved Tarot cards also get a flat option that lies low", () => {
    const { options } = cardOptions(
      cards({
        shortSide: 70,
        longSide: 120,
        storage: "auto",
        decks: [{ name: "Tarot", count: 80 }],
      }),
      s,
      0,
    );
    const upright = at(at(at(options, 0).blocks, 0), 0);
    const flat = at(at(at(options, 2).blocks, 0), 0);
    expect(upright.minH).toBeCloseTo(74.5, 9);
    expect(flat.minH).toBe(35.61); // 35.608 rounded up
    expect(flat.minW).toBeCloseTo(74.5, 9);
    expect(flat.minD).toBeCloseTo(124.5, 9);
  });

  it("passes the measuredTooThin notice through", () => {
    const { options, notices } = cardOptions(
      cards({ thickness: { mode: "measured", cards: 100, stackMm: 5 } }),
      s,
      3,
    );
    expect(options).toHaveLength(1);
    expect(notices.map((n) => [n.code, n.path])).toEqual([
      ["sizing.measuredTooThin", "/components/3/thickness/stackMm"],
    ]);
  });

  it("lays out a component whose validation only warns", () => {
    const { options, notices } = cardOptions(cards({ shortSide: 88, longSide: 63.5 }), s, 0);
    expect(options).toHaveLength(1);
    expect(notices).toEqual([]);
  });

  it("labels an unnamed deck with the component name, or its id when that is blank", () => {
    const named = deck(cards({ decks: [{ name: " ", count: 5 }] }));
    expect(named.contents).toBe("Cards ×5");
    const unnamed = deck(cards({ name: "", decks: [{ name: "", count: 5 }] }));
    expect(unnamed.contents).toBe("c1 ×5");
  });

  it("shows the component name beside a deck's own name, and never twice", () => {
    expect(
      deck(cards({ name: "Starter deck", decks: [{ name: "Deck 1", count: 15 }] })).contents,
    ).toBe("Starter deck — Deck 1 ×15");
    // an unnamed deck already falls back to the component's name
    expect(deck(cards({ name: "Starter deck", decks: [{ name: "", count: 15 }] })).contents).toBe(
      "Starter deck ×15",
    );
    // a deck called the same as its component
    expect(deck(cards({ name: "Main", decks: [{ name: "Main", count: 15 }] })).contents).toBe(
      "Main ×15",
    );
    // an unnamed component has no name to show, only its id as a fallback
    expect(deck(cards({ name: "", decks: [{ name: "Deck 1", count: 15 }] })).contents).toBe(
      "Deck 1 ×15",
    );
  });

  it("gives every tray of a split component the component name, so they read as a group", () => {
    const { options } = cardOptions(
      cards({
        name: "Starter deck",
        decks: [
          { name: "Deck 1", count: 15 },
          { name: "Deck 2", count: 20 },
          { name: "", count: 5 },
        ],
      }),
      s,
      0,
    );
    expect(at(options, 0).blocks.map((b) => b.map((c) => c.contents))).toEqual([
      ["Starter deck — Deck 1 ×15"],
      ["Starter deck — Deck 2 ×20"],
      ["Starter deck ×5"],
    ]);
  });

  describe("thickness correction", () => {
    it("scales the per-card thickness of a preset, sleeve included", () => {
      const base = cardDims(cards(), s, 0).dims;
      const scaled = cardDims(cards({ thickness: { mode: "preset", scale: 1.1 } }), s, 0).dims;
      expect(scaled.t).toBeCloseTo(base.t * 1.1, 9);
      expect(scaled.S).toBe(base.S);
      expect(scaled.L).toBe(base.L);
    });

    it("changes the stack, but adds no clearance of its own", () => {
      const plain = deck(cards({ decks: [{ name: "A", count: 100 }] }));
      const scaled = deck(
        cards({ decks: [{ name: "A", count: 100 }], thickness: { mode: "preset", scale: 1.1 } }),
      );
      // stack = n·t·(1 + pct·fit) + clearance: only the n·t·(1 + pct) part moves with the scale
      expect(scaled.minW - plain.minW).toBeCloseTo(100 * 0.42 * 0.1 * (1 + 0.03), 1);
      // the card's face is untouched
      expect(scaled.minD).toBe(plain.minD);
      expect(scaled.minH).toBe(plain.minH);
    });

    it("leaves a measured stack alone", () => {
      const measured = cards({ thickness: { mode: "measured", cards: 100, stackMm: 45 } });
      expect(cardDims(measured, s, 0).dims.t).toBeCloseTo(0.45, 9);
    });
  });

  it("auto with a custom sleeve offers all three storages", () => {
    const { options } = cardOptions(
      cards({
        storage: "auto",
        sleeve: { w: 95, h: 70, thickness: 0.2 },
        decks: [{ name: "Big", count: 10 }],
      }),
      s,
      0,
    );
    expect(options.map((o) => o.id)).toEqual(["upright-long", "upright-short", "flat"]);
    const [long, short, flat] = options.map((o) => at(at(o.blocks, 0), 0));
    // S = 70, L = 95, t = 0.52, stack = 10 · 0.52 · 1.03 + 1 = 6.356
    expect(long?.minW).toBe(6.36);
    expect([long?.minD, long?.minH]).toEqual([expect.closeTo(96.5, 9), expect.closeTo(71.5, 9)]);
    expect([short?.minD, short?.minH]).toEqual([expect.closeTo(71.5, 9), expect.closeTo(96.5, 9)]);
    expect([flat?.minW, flat?.minD, flat?.minH]).toEqual([
      expect.closeTo(71.5, 9),
      expect.closeTo(96.5, 9),
      expect.closeTo(6.36, 9),
    ]);
  });

  it("unsleeved cards in all three storages", () => {
    const { options } = cardOptions(cards({ sleeve: "none", storage: "auto" }), s, 0);
    const [long, short, flat] = options.map((o) => at(at(o.blocks, 0), 0));
    // S = 63.5, L = 88, t = 0.32, stack = 52 · 0.32 · 1.03 + 1 = 18.1392 → 18.14 rounded up
    expect([long?.minW, long?.minD, long?.minH]).toEqual([
      expect.closeTo(18.14, 9),
      expect.closeTo(89.5, 9),
      expect.closeTo(65, 9),
    ]);
    expect([short?.minW, short?.minD, short?.minH]).toEqual([
      expect.closeTo(18.14, 9),
      expect.closeTo(65, 9),
      expect.closeTo(89.5, 9),
    ]);
    expect([flat?.minW, flat?.minD, flat?.minH]).toEqual([
      expect.closeTo(65, 9),
      expect.closeTo(89.5, 9),
      expect.closeTo(18.14, 9),
    ]);
  });
});

describe("flat decks in one well (0.7.0, R7 and R21)", () => {
  const decks = [
    { name: "A", count: 12 },
    { name: "B", count: 30 },
    { name: "C", count: 12 },
  ];
  const shared = (over: Partial<CardsComponent> = {}) =>
    cards({ storage: "flat", flatDecks: "dividers", decks, ...over });
  const wells = (c: CardsComponent, option = 0) => at(cardOptions(c, s, 0).options, option).blocks;

  it("flat decks of 12/30/12 share one well with 2 slots", () => {
    const blocks = wells(shared());
    expect(blocks).toHaveLength(1);
    expect(at(blocks, 0)).toHaveLength(1);
    const well = deck(shared());
    const { dims } = cardDims(shared(), s, 0);
    const slot = dividerSlotWidth(s);
    const section = dims.S + mainClearance(shared(), s);
    expect(well.minD).toBeCloseTo(dims.L + mainClearance(shared(), s), 9);
    expect(well.minW).toBeCloseTo(3 * section + 2 * slot, 9);
    // The 30-card stack sets the height, whatever the decks beside it hold.
    const tallest = deck(cards({ storage: "flat", decks: [{ name: "B", count: 30 }] }));
    expect(well.minH).toBe(tallest.minH);
    expect(well.floorExtra).toBe(DIVIDER_GROOVE);
    expect(well.dividers).toBe(2);
    expect(well.elastic).toEqual({ w: false, d: false, h: false });
    expect(well.contents).toBe("Cards — A ×12 + B ×30 + C ×12");
  });

  it("every deck has finger access: one front-wall cut per section (R21)", () => {
    const well = deck(shared());
    expect(well.features).toEqual([
      { type: "wallCutout", side: "front", depthFraction: 1, floorNotch: true, perSection: true },
    ]);
  });

  it("walls default unchanged: the same item without flatDecks has one well per deck", () => {
    const plain = cards({ storage: "flat", decks });
    for (const c of [plain, { ...plain, flatDecks: "walls" as const }]) {
      const blocks = wells(c);
      expect(blocks).toHaveLength(3);
      for (const block of blocks) {
        const well = at(block, 0);
        expect(well.dividers).toBeUndefined();
        expect(well.floorExtra).toBeUndefined();
        expect(well.features).toEqual([cutout("left", 1, true), cutout("right", 1, true)]);
      }
    }
    expect(cardOptions({ ...plain, flatDecks: "walls" }, s, 0)).toEqual(cardOptions(plain, s, 0));
  });

  it("auto picks flat: the one well; the upright options keep one well per deck", () => {
    const { options } = cardOptions(shared({ storage: "auto" }), s, 0);
    expect(options.map((o) => o.id)).toEqual(["upright-long", "upright-short", "flat"]);
    expect(options.map((o) => o.blocks.length)).toEqual([3, 3, 1]);
    const plain = cardOptions(cards({ storage: "auto", decks }), s, 0).options;
    expect(options.slice(0, 2)).toEqual(plain.slice(0, 2));
  });

  it("one deck: flatDecks is ignored", () => {
    const one = [{ name: "A", count: 40 }];
    expect(cardOptions(shared({ decks: one }), s, 0)).toEqual(
      cardOptions(cards({ storage: "flat", decks: one }), s, 0),
    );
  });

  it("an upright storage ignores flatDecks", () => {
    expect(cardOptions(shared({ storage: "upright-long" }), s, 0)).toEqual(
      cardOptions(cards({ storage: "upright-long", decks }), s, 0),
    );
  });

  it("flatDecksOffered is true with two decks or more", () => {
    expect(flatDecksOffered(shared())).toBe(true);
    expect(flatDecksOffered(shared({ decks: [{ name: "A", count: 3 }] }))).toBe(false);
    expect(flatDecksOffered(cards({ decks: decks.slice(0, 2) }))).toBe(true);
  });
});
