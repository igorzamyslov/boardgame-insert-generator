import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION, BUILD_ID, SCHEMA_VERSION, parseSemver } from "./version";

describe("version", () => {
  it("takes APP_VERSION from package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("is at schema 0.2.4: 0.2.0 made groups their own list and Copies replace perPlayer, 0.2.1 adds minRiser, 0.2.2 the rim's kind and the step's height, 0.2.3 a figure's keepUpright, 0.2.4 a bulk or minis item's own packing (additive PATCHes)", () => {
    expect(SCHEMA_VERSION).toBe("0.2.4");
  });

  it("parses strict semver", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("0.10.0")).toEqual({ major: 0, minor: 10, patch: 0 });
  });

  it.each(["", "1", "1.2", "v1.2.3", "1.2.3-beta", "01.2.3", "1.2.3.4", " 1.2.3"])(
    "rejects %j",
    (v) => {
      expect(parseSemver(v)).toBeNull();
    },
  );

  it("has a build id: a short SHA (optionally -dirty), or unknown without git", () => {
    expect(BUILD_ID).toMatch(/^([0-9a-f]{7}(-dirty)?|unknown)$/);
  });
});
