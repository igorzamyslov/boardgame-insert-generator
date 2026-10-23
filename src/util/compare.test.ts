import { describe, expect, it } from "vitest";
import { compareCodeUnits, compareNatural } from "./compare";

describe("compareCodeUnits", () => {
  it("orders by UTF-16 code unit, not by locale", () => {
    expect(["a", "B", "ä", "A"].sort(compareCodeUnits)).toEqual(["A", "B", "a", "ä"]);
    expect(["10", "9", "01", "1"].sort(compareCodeUnits)).toEqual(["01", "1", "10", "9"]);
  });

  it("returns 0 for equal strings and a prefix sorts first", () => {
    expect(compareCodeUnits("ab", "ab")).toBe(0);
    expect(compareCodeUnits("a", "ab")).toBeLessThan(0);
    expect(compareCodeUnits("ab", "a")).toBeGreaterThan(0);
  });
});

describe("compareNatural", () => {
  it("counts runs of digits by value", () => {
    expect(["Cards 10", "Cards 2", "Cards 1", "Cards 20"].sort(compareNatural)).toEqual([
      "Cards 1",
      "Cards 2",
      "Cards 10",
      "Cards 20",
    ]);
    expect(["Deck 2", "Deck 02", "Deck 1"].sort(compareNatural)[0]).toBe("Deck 1");
  });

  it("ignores case in the text, and is total and symmetric", () => {
    expect(["tiles", "Cards", "Dice"].sort(compareNatural)).toEqual(["Cards", "Dice", "tiles"]);
    expect(compareNatural("a", "A")).not.toBe(0);
    expect(compareNatural("a", "A")).toBe(-compareNatural("A", "a"));
    expect(compareNatural("Cards", "Cards")).toBe(0);
    expect(compareNatural("Cards", "Cards 1")).toBeLessThan(0);
  });
});
