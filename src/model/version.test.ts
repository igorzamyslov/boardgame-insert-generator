import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION, SCHEMA_VERSION, isPreview, parseSemver } from "./version";

describe("version", () => {
  it("takes APP_VERSION from package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("is at schema 0.1.4: 0.1.3 plus the fillToTop setting", () => {
    expect(SCHEMA_VERSION).toBe("0.1.4");
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

  it("treats 0.x as preview", () => {
    expect(isPreview("0.1.0")).toBe(true);
    expect(isPreview("1.0.0")).toBe(false);
  });
});
