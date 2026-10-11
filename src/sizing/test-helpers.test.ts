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

  it("rejects a slot that starts 0.01 mm inside the wall", () => {
    expect(() => {
      assertTrayInvariants(trayWithSlot(12.59), outer, DEFAULT_SETTINGS, ground);
    }).toThrow();
  });

  it("rejects a slot that ends 0.01 mm inside the opposite wall", () => {
    expect(() => {
      assertTrayInvariants(trayWithSlot(14.11), outer, DEFAULT_SETTINGS, ground);
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
    // Chamfer 1.8: trays need h ≥ 2.6 (the wall and floor keep 1.6 + 1.2 − 1.8 = 1 mm).
    const steep = { ...DEFAULT_SETTINGS, bottomChamfer: 1.8 };
    const tray = trayWithSlot(12.6, 22, 12, 1);
    expect(() => {
      assertTrayInvariants(tray, { ...outer, h: 2.6 }, steep, ground);
    }).not.toThrow();
    expect(() => {
      assertTrayInvariants(tray, { ...outer, h: 2.59 }, steep, ground);
    }).toThrow(/too small/);
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
      w: 5.19,
      d: 92.5,
      h: 63,
      rotated: false,
      wall: 0,
      floor: 0,
      lip: false,
      solid: true,
      compartments: [],
    };
    // Chamfer 1.8: spacers need a 2 · (1.8 + 0.8) = 5.2 mm footprint.
    const steep = { ...DEFAULT_SETTINGS, bottomChamfer: 1.8 };
    const tray = { ...trayWithSlot(12.6), spacers: [spacer] };
    expect(() => {
      assertTrayInvariants(tray, outer, DEFAULT_SETTINGS, ground);
    }).not.toThrow();
    expect(() => {
      assertTrayInvariants(tray, outer, steep, ground);
    }).toThrow(/c1:p0:0:spacer: outer size 5.19/);
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

    it("plans the tray with planTray: a slot 0.8 mm from a spare passes, 0.79 mm does not", () => {
      expect(check([deck(1.6, 12, 20.8), spare(1.6 + 20.8 + 0.8)])).not.toThrow();
      expect(check([deck(1.6, 12, 20.8), spare(1.6 + 20.8 + 0.79)])).toThrow(
        /compartment 0: a finger pocket comes within 0\.8 mm of compartment 1/,
      );
    });

    it("accepts neighbouring decks whose slots merge into one channel", () => {
      // Centres 19.2 mm apart: at most maxChannelSpacing(11) = 20.06.
      expect(check([deck(1.6, 12.6), deck(22.8, 31.8)])).not.toThrow();
    });

    it("rejects a slot narrower than MIN_SLOT_WIDTH", () => {
      expect(check([deck(1.6, 9.1, 15), deck(22.8, 32.8, 15)])).not.toThrow();
      expect(check([deck(1.6, 9.1, 14.99), deck(22.8, 32.8, 14.99)])).toThrow(/slot width/);
    });
  });
});
