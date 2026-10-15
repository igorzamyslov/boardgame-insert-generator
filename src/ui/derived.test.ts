import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { cardOptions } from "../sizing/cards";
import { componentOptions } from "../sizing/component";
import { at, bulk, cards, custom, minis, tiles } from "../sizing/test-helpers";
import { derivedSizes } from "./derived";

const s = DEFAULT_SETTINGS;

describe("derivedSizes", () => {
  it("says what a deck comes to: its thickness and the face of its well", () => {
    const c = cards({ name: "Starter", decks: [{ name: "Deck 1", count: 50 }] });
    // standard sleeves: 0.32 + 0.1 mm per card, 63.5 × 88 + 3 mm, 1.5 mm card clearance
    expect(derivedSizes(c, s, 0)).toEqual([
      "Starter — Deck 1: 50 cards ≈ 21 mm thick (0.42 mm per card), in a 68 × 92.5 mm well.",
    ]);
  });

  it("reads the well from what sizing produces, whatever the storage", () => {
    for (const storage of ["flat", "upright-long", "upright-short", "auto"] as const) {
      const c = cards({ storage });
      const flat = at(cardOptions({ ...c, storage: "flat" }, s, 0).options, 0);
      const well = at(at(flat.blocks, 0), 0);
      expect(derivedSizes(c, s, 0)[0]).toContain(`in a ${well.minW} × ${well.minD} mm well.`);
    }
  });

  it("gives one line per deck", () => {
    const c = cards({
      decks: [
        { name: "A", count: 10 },
        { name: "B", count: 20 },
      ],
    });
    expect(derivedSizes(c, s, 0)).toHaveLength(2);
  });

  it("shows the correction landing in the thickness, and in nothing else", () => {
    const base = cards({ decks: [{ name: "A", count: 100 }] });
    const fatter = cards({
      decks: [{ name: "A", count: 100 }],
      thickness: { mode: "preset", scale: 1.1 },
    });
    expect(derivedSizes(base, s, 0)[0]).toContain("100 cards ≈ 42 mm thick (0.42 mm per card)");
    expect(derivedSizes(fatter, s, 0)[0]).toContain("100 cards ≈ 46.2 mm thick (0.46 mm per card)");
    // the well's face is the same
    expect(derivedSizes(fatter, s, 0)[0]).toContain("in a 68 × 92.5 mm well.");
  });

  it("uses a measured stack, which replaces the preset", () => {
    const c = cards({
      decks: [{ name: "A", count: 100 }],
      thickness: { mode: "measured", cards: 100, stackMm: 45 },
    });
    expect(derivedSizes(c, s, 0)[0]).toContain("100 cards ≈ 45 mm thick (0.45 mm per card)");
  });

  it("gives tiles the stack height and the first option's well", () => {
    const c = tiles({ count: 60, thickness: 2, storage: "flat" });
    const well = at(at(at(componentOptions(c, s, 0).options, 0).blocks, 0), 0);
    expect(derivedSizes(c, s, 0)).toEqual([
      `60 tiles stack to 120 mm, in a ${well.minW} × ${well.minD} × ${well.minH} mm well (all in one column; a taller stack may be split).`,
    ]);
  });

  it("gives minis their pocket, per figure", () => {
    const c = minis({ figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 2 }] });
    expect(derivedSizes(c, s, 0)).toEqual(["Minis — Hero: a 26 × 26 × 41 mm pocket."]);
  });

  it("gives bulk the bin size of each shape and the volume it is based on", () => {
    const c = bulk({ items: [{ name: "Coins", volumeMl: 120 }] });
    const bins = componentOptions(c, s, 0).options.map((o) => at(at(o.blocks, 0), 0));
    const line = at(derivedSizes(c, s, 0), 0);
    expect(line).toContain("Bits — Coins: a bin of ");
    expect(line).toContain("for 120 ml.");
    for (const bin of bins) {
      expect(line).toContain(`${bin.minW} × ${bin.minD} × ${bin.minH} mm`);
    }
    expect(line).toContain("(shallow)");
    expect(line).toContain("(deep)");
  });

  it("gives minis stored as bulk the bins of bulk storage, shallow and deep", () => {
    const line = at(derivedSizes(minis({ storage: "bulk" }), s, 0), 0);
    expect(line).toContain("Minis — Hero: a bin of ");
    expect(line).toContain("(shallow)");
    expect(line).toContain("(deep)");
  });

  it("says nothing for a custom component or an invalid one", () => {
    expect(derivedSizes(custom(), s, 0)).toEqual([]);
    expect(derivedSizes(cards({ decks: [{ name: "A", count: 0 }] }), s, 0)).toEqual([]);
  });
});
