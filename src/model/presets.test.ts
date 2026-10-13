import { describe, expect, it } from "vitest";
import { BAMBU_256_BED, BED_PRESETS, CARD_PRESETS, SLEEVES, STANDARD_CARD } from "./presets";

describe("presets", () => {
  it("has the nine card sizes from the spec", () => {
    expect(CARD_PRESETS.map((p) => [p.label, p.shortSide, p.longSide])).toEqual([
      ["Standard", 63.5, 88],
      ["Standard American", 56, 87],
      ["Euro", 59, 92],
      ["Mini Euro", 44, 68],
      ["Mini American", 41, 63],
      ["Tarot", 70, 120],
      ["French Tarot", 61, 112],
      ["Extra Large", 65, 100],
      ["Dixit", 80, 120],
    ]);
  });

  it("stores every card preset short side first, with unique ids", () => {
    for (const p of CARD_PRESETS) {
      expect(p.shortSide).toBeLessThanOrEqual(p.longSide);
    }
    expect(new Set(CARD_PRESETS.map((p) => p.id)).size).toBe(CARD_PRESETS.length);
  });

  it("has the sleeve table from the spec", () => {
    expect(SLEEVES).toEqual({
      none: { addThickness: 0, addSize: 0 },
      standard: { addThickness: 0.1, addSize: 3 },
      premium: { addThickness: 0.28, addSize: 3 },
    });
  });

  it("names the standard card first in its list and the Bambu bed in the bed list", () => {
    expect(CARD_PRESETS[0]).toBe(STANDARD_CARD);
    expect(STANDARD_CARD).toMatchObject({ id: "standard", shortSide: 63.5, longSide: 88 });
    expect(BED_PRESETS).toContain(BAMBU_256_BED);
    expect(BAMBU_256_BED).toMatchObject({ id: "bambu-256", bedX: 256, bedY: 256, bedZ: 256 });
  });

  it("lists the bed presets by size, smallest first, each with the printers it fits", () => {
    expect(BED_PRESETS.map((b) => [b.bedX, b.bedY, b.bedZ])).toEqual([
      [180, 180, 180],
      [220, 220, 250],
      [250, 210, 220],
      [256, 256, 256],
      [300, 300, 300],
      [350, 350, 350],
    ]);
    for (const b of BED_PRESETS) {
      expect(b.label).toBe(`${b.bedX} × ${b.bedY} × ${b.bedZ} mm`);
      expect(b.examples).not.toBe("");
    }
  });

  it("marks the common card sizes, standard first", () => {
    expect(CARD_PRESETS.filter((p) => p.common).map((p) => p.id)).toEqual([
      "standard",
      "standard-american",
      "euro",
      "mini-euro",
      "tarot",
    ]);
  });
});
