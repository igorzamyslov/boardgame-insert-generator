import { describe, expect, it } from "vitest";
import { pointerKeys, summarize } from "./json";
import { absorbErrors, addError, adopt, childCtx, newCtx, Reader } from "./schema-reader";

describe("Reader.at", () => {
  it("escapes keys as RFC 6901 segments so pointerKeys can read them back", () => {
    const r = new Reader({}, "/parent", newCtx(false));
    expect(r.at("a/b~c")).toBe("/parent/a~1b~0c");
    expect(pointerKeys(r.at("a/b~c"))).toEqual(["parent", "a/b~c"]);
  });
});

describe("Reader.tag", () => {
  it("returns a known value", () => {
    const ctx = newCtx(false);
    expect(new Reader({ t: "a" }, "", ctx).tag("t", ["a", "b"])).toBe("a");
    expect(ctx.errors).toEqual([]);
  });

  it("returns null and records one error for a missing or unknown value", () => {
    const ctx = newCtx(false);
    expect(new Reader({}, "", ctx).tag("t", ["a"])).toBeNull();
    expect(new Reader({ t: "z" }, "", ctx).tag("t", ["a"])).toBeNull();
    expect(new Reader({ t: 5 }, "", ctx).tag("t", ["a"])).toBeNull();
    expect(ctx.errors).toEqual(["/t: missing", '/t: unknown value "z"', "/t: expected text"]);
  });

  it("records an unknown string as an unknown value in newer files", () => {
    const ctx = newCtx(true);
    expect(new Reader({ t: "z" }, "", ctx).tag("t", ["a"])).toBeNull();
    expect(ctx.errors).toEqual([]);
    expect(ctx.unknownValues).toEqual(["/t"]);
  });
});

describe("adopt", () => {
  it("re-bases the child's notice paths from its place in the file to its place in the project", () => {
    const parent = newCtx(false);
    const child = childCtx(parent);
    child.notices.push(
      { level: "info", code: "a", message: "a", path: "/locks/3" },
      { level: "info", code: "b", message: "b", path: "/locks/3/w" },
      { level: "info", code: "c", message: "c", path: "/locks/30" },
      { level: "info", code: "d", message: "d" },
    );
    child.dropped.push("/locks/3/extra");
    adopt(parent, child, { from: "/locks/3", to: "/locks/1" });
    expect(parent.notices.map((n) => n.path)).toEqual([
      "/locks/1",
      "/locks/1/w",
      "/locks/30",
      undefined,
    ]);
    // Dropped fields aren't in the project, so they keep their place in the file.
    expect(parent.dropped).toEqual(["/locks/3/extra"]);
  });
});

describe("error collection", () => {
  it("keeps the first 100 problems and counts the rest", () => {
    const ctx = newCtx(false);
    for (let i = 0; i < 250; i++) {
      addError(ctx, `problem ${i}`);
    }
    expect(ctx.errors).toHaveLength(100);
    expect(ctx.omitted).toBe(150);
    expect(summarize(ctx.errors, ctx.omitted)).toBe(
      "problem 0; problem 1; problem 2; and 247 more",
    );
  });

  it("passes a child's problems and its count on to the parent", () => {
    const parent = newCtx(false);
    const child = childCtx(parent);
    for (let i = 0; i < 130; i++) {
      addError(child, `c${i}`);
    }
    addError(parent, "p");
    absorbErrors(parent, child);
    expect(parent.errors).toHaveLength(100);
    expect(parent.errors[0]).toBe("p");
    expect(parent.omitted).toBe(30 + 1);
  });
});
