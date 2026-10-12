// src/viewer/transform.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import { EXPLODE_MM, boxOutline, isVisible, trayColor, trayPosition } from "./transform";

describe("viewer transforms", () => {
  it("lifts upper levels when exploded", () => {
    const upper = makeTray({ x: 3, y: 4, z: 40, level: 1 });
    expect(trayPosition(upper, 0)).toEqual([3, 4, 40]);
    expect(trayPosition(upper, 1)).toEqual([3, 4, 40 + EXPLODE_MM]);
    expect(trayPosition(makeTray({ level: 0 }), 1)).toEqual([0, 0, 0]);
  });

  it("filters layers", () => {
    expect(isVisible(makeTray({ level: 2 }), null)).toBe(true);
    expect(isVisible(makeTray({ level: 2 }), 1)).toBe(false);
  });

  it("outlines the inner box around the clearance origin", () => {
    expect(
      boxOutline(
        { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100, innerHeight: 50 },
        DEFAULT_SETTINGS,
      ),
    ).toEqual({
      min: [-0.5, -0.5, 0],
      size: [200, 100, 50],
    });
  });

  it("spreads colours", () => {
    expect(trayColor(0)).toEqual({ h: 0, s: 0.45, l: 0.62 });
    expect(trayColor(1).h).not.toBe(trayColor(2).h);
  });
});
