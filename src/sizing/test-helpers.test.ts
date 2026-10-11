import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CompartmentSpec } from "../model/types";
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
});
