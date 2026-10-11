import { describe, expect, it } from "vitest";
import { KIND_NAMES } from "./defaults";
import { deepFreeze } from "./freeze";
import { BED_PRESETS, CARD_PRESETS, SLEEVES } from "./presets";
import { MIGRATIONS, SCHEMA_NOTICE_CODES } from "./schema";
import { FIT_CHOICES, WALL_CHOICES } from "./settings";
import { VALIDATION_NOTICE_CODES } from "./validate";

describe("deepFreeze", () => {
  it("freezes nested objects and arrays and returns the same value", () => {
    const value = { a: { b: [1, { c: 2 }] } };
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
  });

  it("leaves primitives alone", () => {
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze(null)).toBeNull();
  });
});

describe("shared constants", () => {
  it.each([
    ["CARD_PRESETS", CARD_PRESETS],
    ["SLEEVES", SLEEVES],
    ["BED_PRESETS", BED_PRESETS],
    ["WALL_CHOICES", WALL_CHOICES],
    ["FIT_CHOICES", FIT_CHOICES],
    ["KIND_NAMES", KIND_NAMES],
    ["MIGRATIONS", MIGRATIONS],
    ["SCHEMA_NOTICE_CODES", SCHEMA_NOTICE_CODES],
    ["VALIDATION_NOTICE_CODES", VALIDATION_NOTICE_CODES],
  ])("%s is frozen, entries included", (_, value: object) => {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of Object.values(value) as unknown[]) {
      if (typeof entry === "object" && entry !== null) {
        expect(Object.isFrozen(entry)).toBe(true);
      }
    }
  });
});
