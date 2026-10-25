import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION, BUILD_ID, SCHEMA_VERSION, parseSemver } from "./version";

describe("version", () => {
  it("takes APP_VERSION from package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("is at schema 0.4.0 (0.4.0 moves the old card clearance defaults to the comfortable ones, a MINOR with a migration, while 0.x): 0.2.0 made groups their own list and Copies replace perPlayer, 0.2.1 adds minRiser, 0.2.2 the rim's kind and the step's height, 0.2.3 a figure's keepUpright, 0.2.4 a bulk or minis item's own packing (additive PATCHes), 0.3.0 replaces per-axis growth and stretch with one `room` per item and drops group growth (a MINOR with a migration, while 0.x), 0.3.1 adds the box's `headroomAreas` and the layout's `reserved` (an additive PATCH), 0.3.2 adds the `separatorPlate` feature to a stored layout (an additive PATCH), 0.3.3 replaces the rim's switch and kind with one `joint` (Off, Auto, Rim and groove, Stepped base) and adds the layout's `joint` (an additive PATCH: an older file reads as the joint it meant), 0.3.4 adds the project's `listOrder`, the order the rail lists its items in (an additive PATCH)", () => {
    expect(SCHEMA_VERSION).toBe("0.4.0");
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
