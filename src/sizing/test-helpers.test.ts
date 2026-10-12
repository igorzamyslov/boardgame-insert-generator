import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CompartmentSpec, TraySpec } from "../model/types";
import { assertTrayInvariants, at } from "./test-helpers";
import type { OuterSize, RealizeOptions, RealizedTray } from "./types";

const outer: OuterSize = { w: 26.7, d: 119.7, h: 69.2 };
const ground: RealizeOptions = { lipped: false, level: 0 };

function trayWithCut(cutAt: number, width = 10, depth = 22.67): RealizedTray {
  const compartment: CompartmentSpec = {
    x: 1.6,
    y: 1.6,
    w: 23.5,
    d: 116.5,
    floorZ: 1.2,
    kind: "well",
    contents: "Main ×52",
    features: [{ type: "wallCutout", side: "front", at: cutAt, width, depth, floorNotch: 0 }],
  };
  return { wall: 1.6, compartments: [compartment], spacers: [] };
}

/** The tray of trayWithCut without its cut. */
function plain(): RealizedTray {
  const tray = trayWithCut(12.6);
  return { ...tray, compartments: tray.compartments.map((c) => ({ ...c, features: [] })) };
}

describe("assertTrayInvariants", () => {
  it("accepts a cut keeping 3 mm posts to the well's faces", () => {
    expect(() => {
      assertTrayInvariants(trayWithCut(9.6), outer, DEFAULT_SETTINGS, ground);
    }).not.toThrow();
    expect(() => {
      assertTrayInvariants(trayWithCut(17.1), outer, DEFAULT_SETTINGS, ground);
    }).not.toThrow();
  });

  it("rejects a cut 0.01 mm closer to either face", () => {
    for (const cutAt of [9.59, 17.11]) {
      expect(() => {
        assertTrayInvariants(trayWithCut(cutAt), outer, DEFAULT_SETTINGS, ground);
      }).toThrow(/posts/);
    }
  });

  it("rejects a cut narrower than 10 mm", () => {
    expect(() => {
      assertTrayInvariants(trayWithCut(12.6, 9.99), outer, DEFAULT_SETTINGS, ground);
    }).toThrow(/cutout width/);
  });

  it("rejects a compartment that is too close to another one", () => {
    const tray = trayWithCut(12.6);
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
    const tray = plain();
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
    const tray = { ...plain(), spacers: [spacer] };
    expect(() => {
      assertTrayInvariants(tray, outer, DEFAULT_SETTINGS, ground);
    }).not.toThrow();
    expect(() => {
      assertTrayInvariants(tray, outer, steep, ground);
    }).toThrow(/c1:p0:0:spacer: outer size 5.19/);
  });

  it("rejects a wall cutout wider than the setting or with a notch over the setting", () => {
    const cut = (width: number, floorNotch: number): RealizedTray => {
      const tray = trayWithCut(12.6);
      const well = { ...at(tray.compartments, 0), y: 1.6, d: 92.5 };
      // One cutout: the 23.5 mm well has no room for two 12.5 mm notches.
      const features = [
        {
          type: "wallCutout" as const,
          side: "left" as const,
          at: 47.85,
          width,
          depth: 30,
          floorNotch,
        },
      ];
      return { ...tray, compartments: [{ ...well, features }] };
    };
    const short: OuterSize = { ...outer, d: 95.7 };
    const check = (tray: RealizedTray) => () => {
      assertTrayInvariants(tray, short, DEFAULT_SETTINGS, ground);
    };
    expect(check(cut(25, 12.5))).not.toThrow();
    expect(check(cut(25.02, 12.5))).toThrow(/cutout width/);
    expect(check(cut(25, 12.51))).toThrow(/floor notch/);
    // A notch reaches past half a narrower cut's width.
    expect(check(cut(12, 12.5))).not.toThrow();
  });

  it("rejects a spacer in a channelled well that is not notched to match", () => {
    const well: CompartmentSpec = {
      x: 1.6,
      y: 1.6,
      w: 53.5,
      d: 92.5,
      floorZ: 1.2,
      kind: "well",
      contents: "Main ×52",
      features: (["left", "right"] as const).map((side) => ({
        type: "wallCutout" as const,
        side,
        at: 47.85,
        width: 22,
        depth: 34,
        floorNotch: 0,
      })),
    };
    const spacer: TraySpec = {
      key: "c1:p0:0:spacer",
      part: "spacer",
      path: "",
      stack: 0,
      level: 0,
      x: 25.1,
      y: 1.6,
      z: 1.2,
      w: 30,
      d: 92.5,
      h: 63,
      rotated: false,
      wall: 0,
      floor: 0,
      lip: false,
      solid: true,
      compartments: [],
    };
    const notch = { type: "spacerNotch" as const, axis: "x" as const, at: 46.25, width: 22 };
    const check = (sp: TraySpec) => () => {
      assertTrayInvariants(
        { wall: 1.6, compartments: [well], spacers: [sp] },
        { w: 56.7, d: 95.7, h: 69.2 },
        DEFAULT_SETTINGS,
        ground,
      );
    };
    expect(check({ ...spacer, features: [{ ...notch, depth: 29 }] })).not.toThrow();
    expect(check(spacer)).toThrow(/spacer notch/);
    expect(check({ ...spacer, features: [{ ...notch, depth: 28 }] })).toThrow(/spacer notch/);
  });
});
