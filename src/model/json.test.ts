import { describe, expect, it } from "vitest";
import {
  escapePointerKey,
  isRecord,
  pointerKeys,
  quote,
  shorten,
  summarize,
  valueAt,
} from "./json";

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});

describe("pointerKeys", () => {
  it("splits a pointer into keys", () => {
    expect(pointerKeys("/settings/lip/play")).toEqual(["settings", "lip", "play"]);
    expect(pointerKeys("")).toEqual([]);
    expect(pointerKeys("/")).toEqual([""]);
  });

  it("decodes ~1 before ~0 (RFC 6901)", () => {
    expect(pointerKeys("/a~1b")).toEqual(["a/b"]);
    expect(pointerKeys("/a~0b")).toEqual(["a~b"]);
    expect(pointerKeys("/a~01")).toEqual(["a~1"]);
    expect(pointerKeys("/a~10")).toEqual(["a/0"]);
  });

  it("round-trips any key through escapePointerKey", () => {
    for (const key of ["plain", "a/b~c", "~1", "~0/", "//", "~"]) {
      expect(pointerKeys(`/x/${escapePointerKey(key)}`)).toEqual(["x", key]);
    }
  });
});

describe("valueAt", () => {
  const data = { a: { list: [10, { b: 2 }] } };

  it("follows keys and array indices", () => {
    expect(valueAt(data, [])).toBe(data);
    expect(valueAt(data, ["a", "list", "0"])).toBe(10);
    expect(valueAt(data, ["a", "list", "1", "b"])).toBe(2);
  });

  it("gives undefined for anything missing or not traversable", () => {
    expect(valueAt(data, ["nope"])).toBeUndefined();
    expect(valueAt(data, ["a", "list", "9"])).toBeUndefined();
    expect(valueAt(data, ["a", "list", "0", "b"])).toBeUndefined();
    expect(valueAt(null, ["a"])).toBeUndefined();
  });

  it("only follows own properties", () => {
    expect(valueAt({}, ["constructor"])).toBeUndefined();
    expect(valueAt({}, ["__proto__"])).toBeUndefined();
    expect(valueAt({}, ["toString"])).toBeUndefined();
    expect(valueAt({ a: {} }, ["a", "hasOwnProperty"])).toBeUndefined();
  });

  it("reads a parsed own __proto__ field", () => {
    const parsed = JSON.parse('{"__proto__": {"a": 1}}') as unknown;
    expect(valueAt(parsed, ["__proto__", "a"])).toBe(1);
  });

  it("only accepts plain indices on arrays", () => {
    expect(valueAt([1, 2], ["1"])).toBe(2);
    expect(valueAt([1, 2], ["length"])).toBeUndefined();
    expect(valueAt([1, 2], ["constructor"])).toBeUndefined();
    expect(valueAt([1, 2], ["01"])).toBeUndefined();
    expect(valueAt([1, 2], ["-1"])).toBeUndefined();
    expect(valueAt([1, 2], ["1.5"])).toBeUndefined();
  });
});

describe("summarize", () => {
  it("lists up to three problems", () => {
    expect(summarize([])).toBe("");
    expect(summarize(["a"])).toBe("a");
    expect(summarize(["a", "b", "c"])).toBe("a; b; c");
  });

  it("counts the rest", () => {
    expect(summarize(["a", "b", "c", "d", "e"])).toBe("a; b; c; and 2 more");
  });

  it("counts problems the caller omitted", () => {
    expect(summarize(["a", "b", "c"], 7)).toBe("a; b; c; and 7 more");
    expect(summarize(["a", "b", "c", "d"], 7)).toBe("a; b; c; and 8 more");
  });
});

describe("shorten and quote", () => {
  it("leaves short text alone", () => {
    expect(shorten("abc")).toBe("abc");
    expect(quote("abc")).toBe('"abc"');
    expect(shorten("x".repeat(40))).toBe("x".repeat(40));
  });

  it("cuts long text to 40 characters and an ellipsis", () => {
    expect(shorten("x".repeat(41))).toBe(`${"x".repeat(40)}…`);
    expect(quote("x".repeat(1e6))).toBe(`"${"x".repeat(40)}…"`);
  });
});
