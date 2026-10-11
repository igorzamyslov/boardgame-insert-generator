import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CompartmentSpec, TraySpec } from "../model/types";
import { assertTrayInvariants, at } from "./test-helpers";
import type { OuterSize, RealizeOptions, RealizedTray } from "./types";

const outer: OuterSize = { w: 26.7, d: 119.7, h: 69.2 };
const ground: RealizeOptions = { lipped: false, level: 0 };

function trayWithSlot(slotAt: number, width = 22): RealizedTray {
  const compartment: CompartmentSpec = {
    x: 1.6,
    y: 1.6,
    w: 23.5,
    d: 116.5,
    floorZ: 1.2,
    kind: "well",
    contents: "Main ×52",
    features: [{ type: "fingerPocket", side: "front", at: slotAt, width, reach: 12, depth: 22.67 }],
  };
  return { wall: 1.6, compartments: [compartment], spacers: [] };
}

describe("assertTrayInvariants", () => {
  it("accepts a slot that touches the inner wall faces", () => {
    expect(() => {
      assertTrayInvariants(trayWithSlot(12.6), outer, DEFAULT_SETTINGS, ground);
    }).not.toThrow();
  });

  it("rejects a slot that starts 0.005 mm inside the wall", () => {
    expect(() => {
      assertTrayInvariants(trayWithSlot(12.595), outer, DEFAULT_SETTINGS, ground);
    }).toThrow();
  });

  it("rejects a slot that ends 0.005 mm inside the opposite wall", () => {
    expect(() => {
      assertTrayInvariants(trayWithSlot(14.105), outer, DEFAULT_SETTINGS, ground);
    }).toThrow();
  });

  it("rejects a compartment that is too close to another one", () => {
    const tray = trayWithSlot(12.6);
    const first = at(tray.compartments, 0);
    const second: CompartmentSpec = { ...first, x: first.x + first.w + 1.19, features: [] };
    expect(() => {
      assertTrayInvariants(
        { ...tray, compartments: [first, second] },
        { ...outer, w: 60 },
        DEFAULT_SETTINGS,
        ground,
      );
    }).toThrow();
  });

  it("rejects a tray too small for its bottom chamfer", () => {
    const steep = { ...DEFAULT_SETTINGS, bottomChamfer: 3 };
    const tray = trayWithSlot(12.6);
    expect(() => {
      assertTrayInvariants(tray, outer, steep, ground);
    }).not.toThrow();
    expect(() => {
      assertTrayInvariants(tray, { ...outer, h: 3.79 }, steep, ground);
    }).toThrow();
  });

  it("rejects a spacer too small for its bottom chamfer", () => {
    const spacer: TraySpec = {
      key: "c1:p0:0:spacer",
      part: "spacer",
      path: "",
      stack: 0,
      level: 0,
      x: 10,
      y: 13.6,
      z: 1.2,
      w: 7.59,
      d: 92.5,
      h: 63,
      rotated: false,
      wall: 0,
      floor: 0,
      lip: false,
      solid: true,
      compartments: [],
    };
    const steep = { ...DEFAULT_SETTINGS, bottomChamfer: 3 };
    const tray = { ...trayWithSlot(12.6), spacers: [spacer] };
    expect(() => {
      assertTrayInvariants(tray, outer, DEFAULT_SETTINGS, ground);
    }).not.toThrow();
    expect(() => {
      assertTrayInvariants(tray, outer, steep, ground);
    }).toThrow();
  });
});
