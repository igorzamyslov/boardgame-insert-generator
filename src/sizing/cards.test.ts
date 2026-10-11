import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CardsComponent, Settings } from "../model/types";
import { cardDims, cardOptions, stackWidth } from "./cards";
import { at, cards } from "./test-helpers";
import type { CompartmentReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const pocket = (side: "front" | "back", depthFraction: number) => ({
  type: "fingerPocket",
  side,
  depthFraction,
  perItem: true,
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
  it("upright-long: stack along X, length + two reaches along Y, height from the short side", () => {
    const c = deck(cards());
    expect(c.minW).toBe(23.5);
    expect(c.minD).toBeCloseTo(116.5, 9);
    expect(c.minH).toBeCloseTo(68, 9);
    expect(c.kind).toBe("well");
    expect(c.contents).toBe("Main ×52");
    expect(c.componentId).toBe("c1");
    expect(c.elastic).toEqual({ w: true, d: false, h: false });
    expect(c.spacerAxis).toBe("w");
    expect(c.features).toEqual([pocket("front", 1 / 3), pocket("back", 1 / 3)]);
  });

  it("upright-short: height from the long side, length from the short side", () => {
    const c = deck(cards({ storage: "upright-short" }));
    expect(c.minW).toBe(23.5);
    expect(c.minD).toBeCloseTo(92, 9);
    expect(c.minH).toBeCloseTo(92.5, 9);
  });

  it("flat: the stack is the height, full-depth pockets on both short sides", () => {
    const c = deck(cards({ storage: "flat" }));
    expect(c.minW).toBeCloseTo(68, 9);
    expect(c.minD).toBeCloseTo(116.5, 9);
    expect(c.minH).toBeCloseTo(23.4952, 9);
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect(c.spacerAxis).toBeUndefined();
    expect(c.features).toEqual([pocket("front", 1), pocket("back", 1)]);
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
        ["A ×40"],
        ["Cards ×12"],
      ]);
    }
  });

  it("scales the clearances by fit", () => {
    const c = deck(cards(), { ...s, fit: 1.4 });
    expect(c.minD).toBeCloseTo(117.1, 9);
    expect(c.minH).toBeCloseTo(68.6, 9);
    expect(c.minW).toBe(24.16);
  });

  it("a clearance override replaces cardClearance only and is not scaled", () => {
    const c = deck(cards({ clearance: 2 }), { ...s, fit: 1.4 });
    expect(c.minD).toBeCloseTo(117, 9);
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
    expect(c.minD).toBeCloseTo(113.5, 9);
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
    expect(flat.minH).toBeCloseTo(35.608, 9);
    expect(flat.minW).toBeCloseTo(74.5, 9);
    expect(flat.minD).toBeCloseTo(148.5, 9);
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
    expect([long?.minD, long?.minH]).toEqual([expect.closeTo(120.5, 9), expect.closeTo(71.5, 9)]);
    expect([short?.minD, short?.minH]).toEqual([expect.closeTo(95.5, 9), expect.closeTo(96.5, 9)]);
    expect([flat?.minW, flat?.minD, flat?.minH]).toEqual([
      expect.closeTo(71.5, 9),
      expect.closeTo(120.5, 9),
      expect.closeTo(6.356, 9),
    ]);
  });

  it("unsleeved cards in all three storages", () => {
    const { options } = cardOptions(cards({ sleeve: "none", storage: "auto" }), s, 0);
    const [long, short, flat] = options.map((o) => at(at(o.blocks, 0), 0));
    // S = 63.5, L = 88, t = 0.32, stack = 52 · 0.32 · 1.03 + 1 = 18.1392 → 18.14 rounded up
    expect([long?.minW, long?.minD, long?.minH]).toEqual([
      expect.closeTo(18.14, 9),
      expect.closeTo(113.5, 9),
      expect.closeTo(65, 9),
    ]);
    expect([short?.minW, short?.minD, short?.minH]).toEqual([
      expect.closeTo(18.14, 9),
      expect.closeTo(89, 9),
      expect.closeTo(89.5, 9),
    ]);
    expect([flat?.minW, flat?.minD, flat?.minH]).toEqual([
      expect.closeTo(65, 9),
      expect.closeTo(113.5, 9),
      expect.closeTo(18.1392, 9),
    ]);
  });
});
