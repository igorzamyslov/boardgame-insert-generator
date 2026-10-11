import { describe, expect, it } from "vitest";
import type { CompartmentSpec } from "../model/types";
import { hasGrip } from "./grip";

const base: CompartmentSpec = {
  x: 0,
  y: 0,
  w: 20,
  d: 30,
  floorZ: 1.2,
  kind: "well",
  contents: "x",
  features: [],
};

describe("hasGrip", () => {
  it("accepts a compartment whose smaller side is at least 25 mm", () => {
    expect(hasGrip([base, { ...base, w: 25 }])).toBe(true);
  });

  it("accepts a finger pocket", () => {
    expect(
      hasGrip([
        {
          ...base,
          features: [
            { type: "fingerPocket", side: "front", at: 10, width: 22, reach: 12, depth: 5 },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("rejects small compartments without a finger pocket", () => {
    expect(hasGrip([base, { ...base, w: 24.99, d: 80 }])).toBe(false);
    expect(hasGrip([{ ...base, features: [{ type: "cornerRelief", d: 3 }] }])).toBe(false);
    expect(hasGrip([])).toBe(false);
  });
});
