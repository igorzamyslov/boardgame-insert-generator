import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is 8 base36 characters", () => {
    expect(newId()).toMatch(/^[0-9a-z]{8}$/);
  });

  it("does not repeat in 10 000 draws", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(ids.size).toBe(10_000);
  });

  it("skips bytes of 252 and above and maps the rest modulo 36", () => {
    const batches = [
      [255, 252, 0, 35, 36, 251, 1, 2],
      [3, 4, 5, 6, 7, 8, 9, 10],
    ];
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      const next = batches.shift() ?? [];
      if (array instanceof Uint8Array) {
        array.set(next);
      }
      return array;
    });

    // Accepted bytes in order: 0, 35, 36, 251, 1, 2 from the first batch, then 3, 4.
    // 0 → '0', 35 → 'z', 36 → '0', 251 → 'z' (251 - 216 = 35), 1 → '1', 2 → '2', 3 → '3', 4 → '4'.
    expect(newId()).toBe("0z0z1234");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
