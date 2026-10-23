// src/app/filament.test.ts
import { describe, expect, it } from "vitest";
import { BOTTOM_LAYERS, measurePart, partGrams, SIDE_SHELL_MM, TOP_LAYERS } from "./filament";
import { cubeMesh } from "./test-helpers";

const G = 0.00124; // g per mm³ of PLA

describe("measurePart", () => {
  it("splits a box's surface into sides, top and bottom", () => {
    const m = measurePart(cubeMesh([10, 20, 30]), 6000);
    expect(m.volumeMm3).toBe(6000);
    expect(m.upMm2).toBeCloseTo(200);
    expect(m.downMm2).toBeCloseTo(200);
    expect(m.sideMm2).toBeCloseTo(2 * 10 * 30 + 2 * 20 * 30);
  });

  it("counts a face within 45 degrees of flat as a top or a bottom", () => {
    // one triangle tilted 30 degrees from flat, facing up, and one facing down
    const positions = new Float32Array([
      0, 0, 0, 10, 0, 0, 0, 10, 5.77, 0, 0, 0, 0, 10, 0, 10, 0, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const m = measurePart({ positions, indices }, 1);
    expect(m.upMm2).toBeGreaterThan(0);
    expect(m.downMm2).toBeGreaterThan(0);
    expect(m.sideMm2).toBe(0);
  });
});

describe("partGrams", () => {
  const box = measurePart(cubeMesh([60, 60, 40]), 60 * 60 * 40);
  const shell = 2 * (60 + 60) * 40 * SIDE_SHELL_MM + 60 * 60 * (TOP_LAYERS + BOTTOM_LAYERS) * 0.2;

  it("prints the shell solid and the rest at the infill", () => {
    const volume = 60 * 60 * 40;
    expect(partGrams(box, { infill: 15 }, 0.2)).toBeCloseTo(
      (shell + (volume - shell) * 0.15) * G,
      6,
    );
    expect(partGrams(box, { infill: 100 }, 0.2)).toBeCloseTo(volume * G, 6);
  });

  it("grows with the infill and with thicker layers", () => {
    expect(partGrams(box, { infill: 40 }, 0.2)).toBeGreaterThan(
      partGrams(box, { infill: 15 }, 0.2),
    );
    expect(partGrams(box, { infill: 15 }, 0.3)).toBeGreaterThan(
      partGrams(box, { infill: 15 }, 0.2),
    );
  });

  it("never gives more than the solid part: a thin wall prints fully solid", () => {
    // 1.2 mm thick, 80 × 80: both faces' shell is deeper than the part is thick
    const plate = measurePart(cubeMesh([80, 80, 1.2]), 80 * 80 * 1.2);
    expect(partGrams(plate, { infill: 15 }, 0.2)).toBeCloseTo(80 * 80 * 1.2 * G, 6);
    expect(partGrams(plate, { infill: 0 }, 0.2)).toBeCloseTo(80 * 80 * 1.2 * G, 6);
  });

  it("takes the infill as a percentage between 0 and 100", () => {
    expect(partGrams(box, { infill: 250 }, 0.2)).toBe(partGrams(box, { infill: 100 }, 0.2));
    expect(partGrams(box, { infill: -5 }, 0.2)).toBe(partGrams(box, { infill: 0 }, 0.2));
  });
});
