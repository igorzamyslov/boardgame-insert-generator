// @vitest-environment node
// src/viewer/colors.test.ts
// The colour work behind the 3D view, with the real three.js Color: a plan fill must reach the screen
// as that fill (it came out near white), and the lights must put a top face back to it.
import { Color, SRGBColorSpace } from "three";
import { describe, expect, it } from "vitest";
import { shadeHex } from "../ui/identity";
import {
  AMBIENT_INTENSITY,
  DARKEN_L,
  SUN_INTENSITY,
  darkenedBy,
  fadedColor,
  hexOf,
  litColor,
  litShare,
} from "./colors";

/** OKLCH of a colour, worked out here on its own (so the test does not repeat the code's path). */
function oklch(hex: string): { L: number; C: number; h: number } {
  const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    C: Math.hypot(a, bb),
    h: Math.atan2(bb, a),
  };
}

describe("darkenedBy", () => {
  it("is the 8% the owner chose", () => {
    expect(DARKEN_L).toBe(0.08);
  });

  it("takes the drop off OKLCH lightness and keeps chroma and hue", () => {
    for (const hex of ["#74c2b8", "#8fb4e8", "#e6a3c9", "#c5c8cd", "#d9b46a"]) {
      const before = oklch(hex);
      const after = oklch(hexOf(darkenedBy(new Color(hex), 0.08)));
      expect(after.L, hex).toBeCloseTo(before.L - 0.08, 2);
      expect(after.C, hex).toBeCloseTo(before.C, 2);
      if (before.C > 0.02) {
        expect(after.h, hex).toBeCloseTo(before.h, 1);
      }
    }
  });

  it("leaves a colour as it is at 0", () => {
    expect(hexOf(darkenedBy(new Color("#74c2b8"), 0))).toBe("#74c2b8");
  });
});

describe("litColor", () => {
  it("only darkens every light-scheme shade, by DARKEN_L: a pale fill is not 'dark'", () => {
    for (const kind of ["cards", "bulk", "tiles", "minis", "custom", "group"] as const) {
      for (let i = 0; i < 6; i++) {
        const fill = shadeHex(kind, i, "light").fill;
        expect(hexOf(litColor(fill)), `${kind} ${i}`).toBe(
          hexOf(darkenedBy(new Color(fill), DARKEN_L)),
        );
      }
    }
  });

  it("turns the group teal into its darker self, not into the near white that linear lightness gave", () => {
    const shown = oklch(hexOf(litColor("#74C2B8")));
    const plan = oklch("#74c2b8");
    expect(shown.L).toBeCloseTo(plan.L - 0.08, 2);
    expect(shown.C).toBeCloseTo(plan.C, 2);
  });

  it("lifts a dark shade in sRGB lightness, by a quarter and a tenth of saturation", () => {
    const lifted = litColor("#1F5D56");
    const was = { h: 0, s: 0, l: 0 };
    new Color("#1F5D56").getHSL(was, SRGBColorSpace);
    const by = new Color().setHSL(was.h, Math.min(1, was.s + 0.1), was.l + 0.25, SRGBColorSpace);
    expect(hexOf(lifted)).toBe(hexOf(darkenedBy(by, DARKEN_L)));
  });
});

describe("hexOf", () => {
  it("writes sRGB, so a colour makes the round trip", () => {
    for (const hex of ["#000000", "#ffffff", "#74c2b8", "#f4f3ef", "#7f7f7f"]) {
      expect(hexOf(new Color(hex))).toBe(hex);
    }
  });
});

const PAGE_RGB = [0xf4, 0xf3, 0xef];

describe("fadedColor", () => {
  const page = new Color("#f4f3ef");

  it("keeps the colour at no fade and takes the page's at all", () => {
    const base = new Color("#74c2b8");
    expect(hexOf(fadedColor(new Color(), base, page, 0))).toBe("#74c2b8");
    expect(hexOf(fadedColor(new Color(), base, page, 1))).toBe("#f4f3ef");
  });

  it("blends in sRGB, as the plan blends a dimmed tile with the page", () => {
    const black = new Color("#000000");
    const white = new Color("#ffffff");
    // halfway between black and white is #808080 in sRGB; in linear light it would be #bcbcbc
    expect(hexOf(fadedColor(new Color(), black, white, 0.5))).toBe("#808080");
    // the plan's dim: 0.4 of the page over the tile
    const out = fadedColor(new Color(), new Color("#74c2b8"), page, 0.4);
    expect(hexOf(out)).toBe(
      `#${[0x74, 0xc2, 0xb8]
        .map((v, i) =>
          Math.round(v + ((PAGE_RGB[i] ?? 0) - v) * 0.4)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`,
    );
  });
});

describe("the lights", () => {
  it("light a face turned straight up to exactly its own colour", () => {
    expect(litShare([0, 0, 1])).toBeCloseTo(1, 12);
  });

  it("put a top face on the screen as the plan's fill darkened by DARKEN_L, byte for byte (the plan's own fill, byte for byte, at 0: measured in the running app, top-down: #74C2B8, #C0D3F7, #F0C2D6 and #FBDEAB in both views)", () => {
    for (const fill of ["#74C2B8", "#93C0B5", "#9ECFC6", "#E0C4CC", "#EED3DC", "#C0D3F7"]) {
      const shown = litColor(fill).multiplyScalar(litShare([0, 0, 1]));
      expect(hexOf(shown), fill).toBe(hexOf(darkenedBy(new Color(fill), DARKEN_L)));
    }
  });

  it("leave a side facing the sun lighter than one facing away, and none black", () => {
    const toSun = litShare(
      [-1, -2, 0.2].map((v) => v / Math.hypot(1, 2, 0.2)) as [number, number, number],
    );
    const away = litShare([1, 2, 0]);
    expect(toSun).toBeGreaterThan(away);
    expect(away).toBeCloseTo(AMBIENT_INTENSITY / Math.PI, 12);
    expect(away).toBeGreaterThan(0.3);
    expect(toSun).toBeLessThan(1);
  });

  it("use an ambient light that is part of the whole, and a sun that is the rest", () => {
    expect(AMBIENT_INTENSITY).toBeGreaterThan(0);
    expect(SUN_INTENSITY).toBeGreaterThan(0);
  });
});

describe("a dimmed tray", () => {
  it("shows the colour the plan's dimmed tile does: the fill at 0.6 over the box, measured as #99C6BA for the teal #74C2B8", () => {
    const shown = fadedColor(new Color(), new Color("#74C2B8"), new Color("#d3cdbf"), 0.4);
    // one level of a byte is the plan's own rounding of the blend
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hexOf(shown).slice(1 + i, 3 + i), 16));
    const [er, eg, eb] = [0x99, 0xc6, 0xba];
    expect(Math.abs((r ?? 0) - er)).toBeLessThanOrEqual(1);
    expect(Math.abs((g ?? 0) - eg)).toBeLessThanOrEqual(1);
    expect(Math.abs((b ?? 0) - eb)).toBeLessThanOrEqual(1);
  });
});
