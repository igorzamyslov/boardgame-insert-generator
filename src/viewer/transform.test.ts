// src/viewer/transform.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import { EXPLODE_MM, boxOutline, isVisible, trayPosition } from "./transform";

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

  // A spacer sits inside its tray's well. Spread moves a part in proportion to its own
  // distance from the centre, so measuring the spacer from itself slid it through the tray's
  // wall; it has to travel with the tray and rise clear instead.
  it("keeps a card spacer in station with its tray and lifts it clear", () => {
    const tray = makeTray({ key: "a:p0:0", x: 160, y: 40, w: 40, d: 20 });
    const spacer = makeTray({
      key: "a:p0:0:spacer",
      part: "spacer",
      x: 190,
      y: 42,
      w: 8,
      d: 16,
    });
    const c: [number, number] = [100, 50];

    const t = trayPosition(tray, 1, c);
    const s = trayPosition(spacer, 1, c, tray);
    // Same sideways move as the tray, so it stays the same distance inside the well.
    expect(s[0] - spacer.x).toBeCloseTo(t[0] - tray.x);
    expect(s[1] - spacer.y).toBeCloseTo(t[1] - tray.y);
    // And it rises out of the tray, so it still reads as a part of its own.
    expect(s[2]).toBeGreaterThan(t[2]);
    // Nothing moves when the trays are together.
    expect(trayPosition(spacer, 0, c, tray)).toEqual([190, 42, 0]);
  });

  it("keeps a divider in station with its tray and lifts it clear, like a spacer", () => {
    const tray = makeTray({ key: "a:p0:0", x: 160, y: 40, w: 40, d: 20 });
    const divider = makeTray({
      key: "a:p0:0:divider:1",
      part: "divider",
      x: 180,
      y: 42,
      w: 3,
      d: 16,
    });
    const c: [number, number] = [100, 50];
    const t = trayPosition(tray, 1, c);
    const d = trayPosition(divider, 1, c, tray);
    expect(d[0] - divider.x).toBeCloseTo(t[0] - tray.x);
    expect(d[1] - divider.y).toBeCloseTo(t[1] - tray.y);
    expect(d[2]).toBeGreaterThan(t[2]);
    expect(trayPosition(divider, 0, c, tray)).toEqual([180, 42, 0]);
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
});
