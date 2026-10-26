import { describe, expect, it } from "vitest";
import { applyFitChoice, DEFAULT_SETTINGS, effective } from "../model/settings";
import type { CardsComponent, Settings } from "../model/types";
import { cardOptions } from "./cards";
import { minisOptions } from "./minis";
import { at, cards, minis, tiles } from "./test-helpers";
import { tileOptions } from "./tiles";
import type { CompartmentReq } from "./types";

// 0.26.0 (owner, 2026-10-25): comfortable defaults. The owner's tray for 8 decks of 13 sleeved
// cards on Snug was tight along the card and across the deck, and a sleeved deck fans out in the
// hand. Card wells get 3 mm round the sleeve and the stack 10 % spring plus 2 mm; tiles count 5 %
// thicker; a figure's pocket has 2 mm.

const s: Settings = DEFAULT_SETTINGS;

const owner = (over: Partial<CardsComponent> = {}): CardsComponent =>
  cards({
    shortSide: 63.5,
    longSide: 88,
    sleeve: "premium",
    decks: Array.from({ length: 8 }, (_, i) => ({ name: `Deck ${i + 1}`, count: 13 })),
    storage: "upright-long",
    ...over,
  });

function wells(c: CardsComponent, settings: Settings = s): CompartmentReq[] {
  return at(cardOptions(c, settings, 0).options, 0).blocks.map((b) => at(b, 0));
}

describe("the owner's case: 8 decks of 13 premium-sleeved 63.5 × 88 cards, upright long", () => {
  it("is 69.5 × 94 round the sleeve (+3) and 7.8 × 1.10 + 2 = 10.58 mm across at Standard", () => {
    const all = wells(owner());
    expect(all).toHaveLength(8);
    for (const w of all) {
      expect(w.minD).toBeCloseTo(94, 6);
      expect(w.minH).toBeCloseTo(69.5, 6);
      expect(w.minW).toBeCloseTo(10.58, 2);
    }
  });

  it("is roomier than before: 3 mm round the card where Snug had 1.05", () => {
    const snug = wells(owner(), applyFitChoice(s, "tight"));
    expect(at(snug, 0).minD).toBeCloseTo(91 + 2.1, 6);
    // Snug stack: 7.8 × (1 + 0.1 × 0.7) + 2 × 0.7
    expect(at(snug, 0).minW).toBeCloseTo(7.8 * 1.07 + 1.4, 1);
  });
});

describe("the Snug floor", () => {
  it("never takes the footprint clearance under 1.5 mm or the stack allowance under 1 mm", () => {
    const tight: Settings = { ...s, fit: 0.2 };
    expect(effective(tight).cardClearance).toBe(1.5);
    const w = at(wells(owner(), tight), 0);
    expect(w.minD).toBeCloseTo(91 + 1.5, 6);
    // 7.8 × (1 + 0.1 × 0.2) + max(2 × 0.2, 1)
    expect(w.minW).toBeCloseTo(7.8 * 1.02 + 1, 1);
  });

  it("leaves an item's own clearance absolute", () => {
    const w = at(wells(owner({ clearance: 0.6 }), { ...s, fit: 0.2 }), 0);
    expect(w.minD).toBeCloseTo(91 + 0.6, 6);
  });
});

describe("the spring of a deck in sleeves", () => {
  const stack = (c: CardsComponent): number => at(wells(c), 0).minW;
  const one = (over: Partial<CardsComponent>): CardsComponent =>
    cards({ decks: [{ name: "A", count: 50 }], ...over });

  it("is 10 % for any sleeve, a custom one too, and 3 % without", () => {
    // 50 cards at 0.32 mm bare, 0.42 standard, 0.6 premium
    expect(stack(one({ sleeve: "none" }))).toBeCloseTo(50 * 0.32 * 1.03 + 2, 1);
    expect(stack(one({ sleeve: "standard" }))).toBeCloseTo(50 * 0.42 * 1.1 + 2, 1);
    expect(stack(one({ sleeve: "premium" }))).toBeCloseTo(50 * 0.6 * 1.1 + 2, 1);
    expect(stack(one({ sleeve: { w: 70, h: 95, thickness: 0.2 } }))).toBeCloseTo(
      50 * 0.52 * 1.1 + 2,
      1,
    );
  });

  it("applies to a measured deck too: it was pressed together", () => {
    const measured = one({ thickness: { mode: "measured", cards: 50, stackMm: 21 } });
    expect(stack(measured)).toBeCloseTo(21 * 1.1 + 2, 1);
    expect(stack({ ...measured, sleeve: "none" })).toBeCloseTo(21 * 1.03 + 2, 1);
  });

  it("scales with Fit like the rest", () => {
    const w = at(wells(one({ sleeve: "standard" }), { ...s, fit: 1.4 }), 0);
    expect(w.minW).toBeCloseTo(50 * 0.42 * 1.14 + 2.8, 1);
  });
});

describe("tiles", () => {
  it("count 5 % thicker in a flat stack, and keep the 1 mm clearance", () => {
    const flat = at(tileOptions(tiles({ thickness: 2, count: 20, storage: "flat" }), s).options, 0);
    const col = at(at(flat.blocks, 0), 0);
    // 20 tiles × 2 mm × 1.05 + 1 mm
    expect(col.minH).toBeCloseTo(20 * 2 * 1.05 + 1, 1);
  });

  it("count 5 % thicker standing on edge too", () => {
    const upright = tileOptions(tiles({ thickness: 2, count: 20, storage: "upright" }), s).options;
    const widths = upright.flatMap((o) => o.blocks.flat().map((w) => w.minW));
    expect(widths.some((w) => Math.abs(w - (20 * 2 * 1.05 + 1)) < 0.1)).toBe(true);
  });
});

describe("figures", () => {
  it("have 2 mm total round them in a pocket, 1.4 at Snug", () => {
    const hero = minis({ figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 1 }] });
    const p = at(at(minisOptions(hero, s).options, 0).blocks, 0);
    const pocket = at(p, 0);
    expect(pocket.minW).toBeCloseTo(27, 6);
    expect(pocket.minD).toBeCloseTo(27, 6);
    expect(pocket.minH).toBeCloseTo(42, 6);
    const snug = at(at(at(minisOptions(hero, applyFitChoice(s, "tight")).options, 0).blocks, 0), 0);
    expect(snug.minW).toBeCloseTo(26.4, 6);
  });

  it("leave a loose pile (bulk) with the piece clearance, and an item's own clearance absolute", () => {
    expect(effective(s).pieceClearance).toBe(1);
    const own = minis({
      clearance: 0.5,
      figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 1 }],
    });
    expect(at(at(at(minisOptions(own, s).options, 0).blocks, 0), 0).minW).toBeCloseTo(25.5, 6);
  });
});
