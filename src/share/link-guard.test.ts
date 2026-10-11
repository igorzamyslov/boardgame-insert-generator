import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeHash, encodeHash } from "./link";
import { noForeign } from "../model/schema";
import { sampleProject } from "../test-support/sample";

vi.mock("../model/schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../model/schema")>()),
  parseProject: () => {
    throw new Error("boom");
  },
}));

describe("decodeHash last-resort guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("turns an unexpected internal error into a result and logs it once", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = decodeHash(encodeHash(sampleProject(), noForeign()));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/incomplete or damaged/);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
