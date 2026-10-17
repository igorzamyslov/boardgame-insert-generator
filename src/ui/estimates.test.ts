// src/ui/estimates.test.ts
import { describe, expect, it } from "vitest";
import { formatGrams, formatPrintCost, formatPrintTime } from "./estimates";

describe("formatGrams", () => {
  it("rounds to the gram and says about, never ≈", () => {
    expect(formatGrams(559.6)).toBe("about 560 g");
    expect(formatGrams(42.4)).toBe("about 42 g");
  });

  it("reads at least 1 g", () => {
    expect(formatGrams(0.2)).toBe("about 1 g");
    expect(formatGrams(0)).toBe("about 1 g");
  });
});

describe("formatPrintTime", () => {
  it("rounds to 5 minutes under an hour", () => {
    expect(formatPrintTime(43)).toBe("about 45 min");
    expect(formatPrintTime(0.4)).toBe("about 5 min");
    expect(formatPrintTime(32)).toBe("about 30 min");
  });

  it("rounds to the half hour from an hour", () => {
    expect(formatPrintTime(59)).toBe("about 1 h");
    expect(formatPrintTime(60)).toBe("about 1 h");
    expect(formatPrintTime(208)).toBe("about 3.5 h");
    expect(formatPrintTime(1980)).toBe("about 33 h");
    expect(formatPrintTime(640)).toBe("about 10.5 h");
  });

  it("never writes the approximation sign", () => {
    expect(`${formatGrams(100)} ${formatPrintTime(100)}`).not.toContain("≈");
  });
});

describe("formatPrintCost", () => {
  it("says the time, then the grams, with one about", () => {
    expect(formatPrintCost(208, 58.2)).toBe("about 3.5 h, 58 g");
    expect(formatPrintCost(43, 0.2)).toBe("about 45 min, 1 g");
  });
});
