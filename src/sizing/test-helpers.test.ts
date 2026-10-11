import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CompartmentSpec, TraySpec } from "../model/types";
import { assertTrayInvariants, at } from "./test-helpers";
import type { OuterSize, RealizeOptions, RealizedTray } from "./types";

const outer: OuterSize = { w: 26.7, d: 119.7, h: 69.2 };
const ground: RealizeOptions = { lipped: false, level: 0 };

function trayWithSlot(slotAt: number, width = 22, reach = 12, depth = 22.67): RealizedTray {
  const compartment: CompartmentSpec = {
    x: 1.6,
    y: 1.6,
    w: 23.5,
    d: 116.5,
    floorZ: 1.2,
    kind: "well",
    contents: "Main ×52",
    features: [{ type: "fingerPocket", side: "front", at: slotAt, width, reach, depth }],
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

  it("rejects a finger pocket without width, reach or depth", () => {
    for (const tray of [
      trayWithSlot(12.6, 0),
      trayWithSlot(12.6, 22, 0),
      trayWithSlot(12.6, 22, 12, 0),
    ]) {
      expect(() => {
        assertTrayInvariants(tray, outer, DEFAULT_SETTINGS, ground);
      }).toThrow();
    }
  });

  it("rejects reach bands that leave less than 1 mm for the contents", () => {
    expect(() => {
      assertTrayInvariants(trayWithSlot(12.6, 22, 115.5), outer, DEFAULT_SETTINGS, ground);
    }).not.toThrow();
    expect(() => {
      assertTrayInvariants(trayWithSlot(12.6, 22, 115.51), outer, DEFAULT_SETTINGS, ground);
    }).toThrow();
  });

  describe("finger slot clearance", () => {
    // Two 20 mm decks side by side with a 1.2 mm divider; their slots are 22 mm wide.
    const wide: OuterSize = { ...outer, w: 1.6 + 20 + 1.2 + 20 + 1.6 };
    const deck = (x: number, slotAt: number, width = 22): CompartmentSpec => ({
      ...at(trayWithSlot(slotAt, width).compartments, 0),
      x,
      w: 20,
    });
    const spare = (x: number): CompartmentSpec => ({
      x,
      y: 1.6,
      w: wide.w - 1.6 - x,
      d: 116.5,
      floorZ: 1.2,
      kind: "spare",
      contents: "spare",
      features: [],
    });
    const check = (compartments: CompartmentSpec[]) => () => {
      assertTrayInvariants(
        { wall: 1.6, compartments, spacers: [] },
        wide,
        DEFAULT_SETTINGS,
        ground,
      );
    };

    it("accepts a slot 0.8 mm from a spare compartment", () => {
      expect(check([deck(1.6, 12, 20.8), spare(1.6 + 20.8 + 0.8)])).not.toThrow();
    });

    it("rejects a slot 0.79 mm from, or reaching into, a spare compartment", () => {
      expect(check([deck(1.6, 12, 20.8), spare(1.6 + 20.8 + 0.79)])).toThrow(/spare/);
      // The plan 3 regression: a 22 mm slot that ends inside the neighbouring spare well.
      expect(check([deck(1.6, 12.6), spare(1.6 + 20 + 1.2)])).toThrow(/spare/);
    });

    it("accepts neighbouring decks whose slots merge into one channel", () => {
      // Centres 19.2 mm apart: at most maxChannelSpacing(11) = 20.06.
      expect(check([deck(1.6, 12.6), deck(22.8, 31.8)])).not.toThrow();
      const same = 1.6 + 20 + 0.6;
      expect(check([deck(1.6, same, 40), deck(22.8, same, 40)])).not.toThrow();
    });

    it("rejects slots that overlap too little to merge, or come too close", () => {
      // 20 mm slots 20.4 mm apart (more than maxChannelSpacing(10) = 18.27) with a 0.4 mm gap.
      expect(check([deck(1.6, 11.6, 20), deck(22.8, 32, 20)])).toThrow(/merge with it/);
      // Different widths never merge.
      expect(check([deck(1.6, 12.6), deck(22.8, 31.8, 21.8)])).toThrow(/must keep 0.8 mm/);
    });
  });
});
