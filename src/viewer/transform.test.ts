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

  it("spreads a single layer apart from the box centre when exploded", () => {
    const left = makeTray({ x: 0, y: 40, w: 40, d: 20, level: 0 });
    const right = makeTray({ x: 160, y: 40, w: 40, d: 20, level: 0 });
    const c: [number, number] = [100, 50];
    expect(trayPosition(left, 0, c)).toEqual([0, 40, 0]);
    const l = trayPosition(left, 1, c);
    const r = trayPosition(right, 1, c);
    expect(l[0]).toBeLessThan(0);
    expect(r[0]).toBeGreaterThan(160);
    expect(r[0] - l[0]).toBeGreaterThan(160);
    expect(l[1]).toBe(40);
    // A tray at the very centre stays where it is.
    expect(trayPosition(makeTray({ x: 80, y: 40, w: 40, d: 20 }), 1, c)).toEqual([80, 40, 0]);
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
