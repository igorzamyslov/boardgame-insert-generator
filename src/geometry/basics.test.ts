import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "./version";
import { UnsupportedFeatureError } from "./errors";
import { Scope, withScope } from "./scope";
import { KNOWN_COMPARTMENT_KINDS, KNOWN_FEATURE_TYPES, KNOWN_PARTS } from "./types";

function item(log: string[], name: string) {
  return { delete: () => log.push(name) };
}

describe("withScope", () => {
  it("deletes every tracked object in reverse order and returns the result", () => {
    const log: string[] = [];
    const result = withScope((scope) => {
      scope.track(item(log, "a"));
      scope.track(item(log, "b"));
      return 42;
    });
    expect(result).toBe(42);
    expect(log).toEqual(["b", "a"]);
  });

  it("deletes tracked objects when the body throws", () => {
    const log: string[] = [];
    expect(() =>
      withScope((scope) => {
        scope.track(item(log, "a"));
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(log).toEqual(["a"]);
  });

  it("track returns the object it was given", () => {
    const scope = new Scope();
    const thing = item([], "x");
    expect(scope.track(thing)).toBe(thing);
    scope.dispose();
  });
});

describe("UnsupportedFeatureError and GEOMETRY_VERSION", () => {
  it("names the unknown feature", () => {
    const err = new UnsupportedFeatureError("magnet");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnsupportedFeatureError");
    expect(err.feature).toBe("magnet");
    expect(err.message).toMatch(/"magnet".*newer app version/);
  });

  it("is at 0.7.2: 0.7.1 with no spacer unless asked for, a patch that changes no outer size", () => {
    expect(GEOMETRY_VERSION).toBe("0.7.2");
  });
});

describe("known value lists", () => {
  it("are frozen", () => {
    expect(Object.isFrozen(KNOWN_PARTS)).toBe(true);
    expect(Object.isFrozen(KNOWN_COMPARTMENT_KINDS)).toBe(true);
    expect(Object.isFrozen(KNOWN_FEATURE_TYPES)).toBe(true);
  });
});
