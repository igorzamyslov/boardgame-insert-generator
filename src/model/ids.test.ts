import { describe, expect, it } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("is 8 base36 characters", () => {
    expect(newId()).toMatch(/^[0-9a-z]{8}$/);
  });

  it("does not repeat in 10 000 draws", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(ids.size).toBe(10_000);
  });
});
