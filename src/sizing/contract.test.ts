import { describe, expect, it } from "vitest";
import { SLEEVES } from "../model/presets";
import { DEFAULT_SETTINGS, effective } from "../model/settings";

describe("plan 1 values that sizing relies on", () => {
  it("uses the spec §5 defaults, with cardStackClearancePct as a fraction", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      wall: 1.6,
      floor: 1.2,
      divider: 1.2,
      fit: 1,
      cardClearance: 1.5,
      cardStackClearance: 1,
      cardStackClearancePct: 0.03,
      cardThickness: 0.32,
      pieceClearance: 1,
      scoopRadius: 12,
      fingerPocket: { width: 25 },
      lip: { enabled: false, height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 },
      packingFactor: 0.5,
    });
  });

  it("has the sleeve table", () => {
    expect(SLEEVES).toMatchObject({
      none: { addThickness: 0, addSize: 0 },
      standard: { addThickness: 0.1, addSize: 3 },
      premium: { addThickness: 0.28, addSize: 3 },
    });
  });

  it("scales clearances by fit", () => {
    const e = effective({ ...DEFAULT_SETTINGS, fit: 1.4 });
    expect(e.cardClearance).toBeCloseTo(2.1, 9);
    expect(e.cardStackClearance).toBeCloseTo(1.4, 9);
    expect(e.pieceClearance).toBeCloseTo(1.4, 9);
  });
});
