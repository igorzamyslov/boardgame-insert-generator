import { describe, expect, it } from "vitest";
import { isGuillotineTiling } from "./test-hard-rules";

describe("isGuillotineTiling", () => {
  const region = { x: 0, y: 0, w: 1000, d: 500 };

  it("accepts exact tilings with the gap along every cut", () => {
    expect(isGuillotineTiling([region], region, 20)).toBe(true);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 490, d: 500 },
          { x: 510, y: 0, w: 490, d: 240 },
          { x: 510, y: 260, w: 490, d: 240 },
        ],
        region,
        20,
      ),
    ).toBe(true);
  });

  it("rejects holes, wrong gaps and overlaps", () => {
    expect(isGuillotineTiling([{ x: 0, y: 0, w: 900, d: 500 }], region, 20)).toBe(false);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 490, d: 500 },
          { x: 500, y: 0, w: 500, d: 500 },
        ],
        region,
        20,
      ),
    ).toBe(false);
    expect(
      isGuillotineTiling(
        [
          { x: 0, y: 0, w: 600, d: 500 },
          { x: 500, y: 0, w: 500, d: 500 },
        ],
        region,
        20,
      ),
    ).toBe(false);
  });
});
