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
    expect(componentOptions(bulk(), s, 1)).toEqual(bulkOptions(bulk(), s, 1));
    expect(componentOptions(tiles(), s, 1)).toEqual(tileOptions(tiles(), s, 1));
    expect(componentOptions(minis(), s, 1)).toEqual(minisOptions(minis(), s, 1));
    expect(componentOptions(custom(), s, 1)).toEqual(customOptions(custom(), s, 1));
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
