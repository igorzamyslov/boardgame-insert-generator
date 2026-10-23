// src/ui/estimates.test.ts
import { describe, expect, it } from "vitest";
import { formatGrams } from "./estimates";

describe("formatGrams", () => {
  it("rounds to the gram and says about, never ≈", () => {
    expect(formatGrams(559.6)).toBe("about 560 g");
    expect(formatGrams(42.4)).toBe("about 42 g");
    expect(formatGrams(559.6)).not.toContain("≈");
  });

  it("reads at least 1 g", () => {
    expect(formatGrams(0.2)).toBe("about 1 g");
    expect(formatGrams(0)).toBe("about 1 g");
  });
});
