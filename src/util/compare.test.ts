import { describe, expect, it } from "vitest";
import { compareCodeUnits } from "./compare";

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
