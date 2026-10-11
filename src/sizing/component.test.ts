import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { bulkOptions } from "./bulk";
import { cardOptions } from "./cards";
import { componentOptions, isLoose } from "./component";
import { customOptions } from "./custom";
import { minisOptions } from "./minis";
import { bulk, cards, custom, minis, tiles } from "./test-helpers";
import { tileOptions } from "./tiles";

const s = DEFAULT_SETTINGS;

describe("componentOptions", () => {
  it("dispatches by kind", () => {
    expect(componentOptions(cards(), s, 1)).toEqual(cardOptions(cards(), s, 1));
    expect(componentOptions(bulk(), s, 1)).toEqual(bulkOptions(bulk(), s));
    expect(componentOptions(tiles(), s, 1)).toEqual(tileOptions(tiles(), s));
    expect(componentOptions(minis(), s, 1)).toEqual(minisOptions(minis(), s));
    expect(componentOptions(custom(), s, 1)).toEqual(customOptions(custom(), s));
  });

  // validateProject already reports these; sizing must not repeat them.
  const none = { options: [], notices: [] };

  it("returns no options and no notices for invalid cards", () => {
    for (const bad of [
      cards({ decks: [] }),
      cards({ shortSide: 0 }),
      cards({ decks: [{ name: "A", count: 0 }] }),
      cards({ sleeve: { w: 0, h: 70, thickness: 0.2 } }),
      cards({ thickness: { mode: "measured", cards: 0, stackMm: 45 } }),
      cards({ thickness: { mode: "measured", cards: 100, stackMm: Number.NaN } }),
    ]) {
      expect(componentOptions(bad, s, 2)).toEqual(none);
    }
  });

  it("returns no options and no notices for invalid bulk", () => {
    for (const bad of [
      bulk({ items: [] }),
      bulk({ items: [{ name: "X", count: 0, w: 1, d: 0, h: 1 }] }),
      bulk({ items: [{ name: "Y", volumeMl: -1 }] }),
    ]) {
      expect(componentOptions(bad, s, 1)).toEqual(none);
    }
  });

  it("returns no options and no notices for invalid tiles", () => {
    for (const bad of [
      tiles({ thickness: 0 }),
      tiles({ count: 0 }),
      tiles({ shape: { type: "rect", w: 0, d: 20 } }),
      tiles({ shape: { type: "hex", flatToFlat: -1, orientation: "flat" } }),
    ]) {
      expect(componentOptions(bad, s, 2)).toEqual(none);
    }
  });

  it("returns no options and no notices for invalid minis", () => {
    for (const bad of [
      minis({ figures: [] }),
      minis({ figures: [{ name: "X", w: 0, d: 10, h: 10, count: 1 }] }),
      minis({ figures: [{ name: "X", w: 10, d: 10, h: 10, count: 1.5 }] }),
      minis({ storage: "bulk", figures: [] }),
    ]) {
      expect(componentOptions(bad, s, 4)).toEqual(none);
    }
  });

  it("returns no options and no notices for an invalid custom component", () => {
    for (const bad of [custom({ h: -1 }), custom({ count: 0 }), custom({ count: 1.5 })]) {
      expect(componentOptions(bad, s, 5)).toEqual(none);
    }
  });
});

describe("isLoose", () => {
  it("flags bulk, tiles and bulk minis", () => {
    expect(isLoose(bulk())).toBe(true);
    expect(isLoose(tiles())).toBe(true);
    expect(isLoose(minis({ storage: "bulk" }))).toBe(true);
    expect(isLoose(minis())).toBe(false);
    expect(isLoose(cards())).toBe(false);
    expect(isLoose(custom())).toBe(false);
  });
});
