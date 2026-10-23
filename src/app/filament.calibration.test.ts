// src/app/filament.calibration.test.ts
// @vitest-environment node
// The estimate against a slicer. The reference is OrcaSlicer 2.4.2 on its Bambu Lab X1 Carbon 0.4
// nozzle, 0.20mm Standard profile with 2 wall loops, 15 % sparse infill, 5 top and 3 bottom layers,
// PLA at 1.24 g/cm³: it used 575.0 g for the 8 parts of the `harbour-kings-flat` seed (DESIGN §7
// has the whole calibration, six inserts). If the geometry changes enough to move this, slice the
// parts again before moving the tolerance.
import { describe, expect, it } from "vitest";
import { buildTray, loadManifold } from "../geometry";
import { printableParts } from "../layout";
import { loadSeed } from "../test-support/harbourKings";
import { measurePart, partGrams } from "./filament";

const SLICER_G = 575.0;

describe("filament estimate against the slicer", () => {
  it("is within 10 % of the slicer's grams for the flat Harbour Kings seed", async () => {
    const { project } = loadSeed("harbour-kings-flat");
    expect(project.settings.infill).toBe(15);
    expect(project.printer.layerHeight).toBe(0.2);
    const printed = printableParts(project.layout?.trays ?? [], {
      components: project.components,
      settings: project.settings,
      printer: project.printer,
      locks: project.locks,
    });
    expect(printed.trays).toHaveLength(8);
    const m = await loadManifold();
    let grams = 0;
    for (const spec of printed.trays) {
      const built = buildTray(m, spec, project.settings);
      grams += partGrams(
        measurePart(built.mesh, built.volumeMm3),
        project.settings,
        project.printer.layerHeight,
      );
    }
    expect(grams / SLICER_G).toBeGreaterThan(0.9);
    expect(grams / SLICER_G).toBeLessThan(1.1);
  });
});
