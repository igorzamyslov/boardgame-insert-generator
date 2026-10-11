import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseNumber } from "./numbers";

describe("parseNumber", () => {
  it.each([
    ["63,5", 63.5],
    ["63.5", 63.5],
    ["  63,5\t", 63.5],
    ["88", 88],
    ["0,32", 0.32],
    [",5", 0.5],
    [".5", 0.5],
    ["5.", 5],
    ["-2", -2],
    ["−2", -2],
    ["+1", 1],
    ["1.000", 1],
    ["1,000", 1],
    ["0", 0],
  ])("reads %j as %d", (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "1.000,5",
    "1,000.5",
    "1 000",
    "1e3",
    "63,5 mm",
    "abc",
    "-",
    ",",
    "1,2,3",
    "Infinity",
    "0x10",
  ])("rejects %j", (text) => {
    expect(parseNumber(text)).toBeNull();
  });

  it("round-trips any number written with a decimal comma or point", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }).map((x) => Math.round(x * 100) / 100),
        fc.boolean(),
        (x, comma) => {
          const text = comma ? String(x).replace(".", ",") : String(x);
          expect(parseNumber(text)).toBe(x === 0 ? 0 : x);
        },
      ),
    );
  });
});
