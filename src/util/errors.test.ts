// src/util/errors.test.ts
import { describe, expect, it } from "vitest";
import { errorText } from "./errors";

describe("errorText", () => {
  it("uses the message of an Error", () => {
    expect(errorText(new RangeError("out of range"))).toBe("out of range");
  });

  it("turns anything else into a string", () => {
    expect(errorText("plain")).toBe("plain");
    expect(errorText(42)).toBe("42");
    expect(errorText(undefined)).toBe("undefined");
  });
});
