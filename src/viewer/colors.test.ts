// @vitest-environment node
// src/viewer/colors.test.ts
// The colour work behind the 3D view, with the real three.js Color: a plan fill must reach the screen
// as that fill (it came out near white), and the lights must put a top face back to it.
import { Color, SRGBColorSpace } from "three";
import { describe, expect, it } from "vitest";
import { shadeHex } from "../ui/identity";
import { AMBIENT_INTENSITY, SUN_INTENSITY, fadedColor, hexOf, litColor, litShare } from "./colors";

describe("litColor", () => {
  it("leaves every light-scheme shade as it is: a pale fill is not 'dark'", () => {
    for (const kind of ["cards", "bulk", "tiles", "minis", "custom", "group"] as const) {
      for (let i = 0; i < 6; i++) {
        const fill = shadeHex(kind, i, "light").fill;
        expect(hexOf(litColor(fill)), `${kind} ${i}`).toBe(fill.toLowerCase());
      }
    }
  });

  it("turns the group teal into itself, not into the near white that linear lightness gave", () => {
    expect(hexOf(litColor("#74C2B8"))).toBe("#74c2b8");
  });

  it("lifts a dark shade in sRGB lightness, by a quarter and a tenth of saturation", () => {
    const lifted = litColor("#1F5D56");
    const hsl = { h: 0, s: 0, l: 0 };
    const was = { h: 0, s: 0, l: 0 };
    lifted.getHSL(hsl, SRGBColorSpace);
    new Color("#1F5D56").getHSL(was, SRGBColorSpace);
    expect(hsl.l).toBeCloseTo(was.l + 0.25, 2);
    expect(hsl.s).toBeCloseTo(Math.min(1, was.s + 0.1), 2);
    expect(hsl.h).toBeCloseTo(was.h, 2);
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
