import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { compartment, cornerRelief, fingerPocket, label, mainClearance } from "./common";
import { cards, custom } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("compartment", () => {
  it("adds one finger reach per pocket side to the matching axis", () => {
    const c = compartment(
      {
        componentId: "a",
        contents: "A",
        kind: "well",
        w: 10,
        d: 20,
        h: 5,
        features: [fingerPocket("front", 1, true), fingerPocket("left", 1, false), cornerRelief()],
      },
      s,
    );
    expect(c.minW).toBe(22);
    expect(c.minD).toBe(32);
    expect(c.minH).toBe(5);
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect("spacerAxis" in c).toBe(false);
    expect("minVolume" in c).toBe(false);
    expect("maxHRatio" in c).toBe(false);
  });

  it("keeps optional fields when given", () => {
    const c = compartment(
      {
        componentId: "a",
        contents: "A",
        kind: "scoop",
        w: 30,
        d: 30,
        h: 20,
        elastic: { w: true },
        features: [],
        spacerAxis: "w",
        minVolume: 100,
        maxHRatio: 1.5,
      },
      s,
    );
    expect(c.elastic).toEqual({ w: true, d: false, h: false });
    expect(c.spacerAxis).toBe("w");
    expect(c.minVolume).toBe(100);
    expect(c.maxHRatio).toBe(1.5);
  });
});

describe("mainClearance", () => {
  it("is cardClearance × fit for cards and pieceClearance × fit otherwise", () => {
    expect(mainClearance(cards(), { ...s, fit: 1.4 })).toBeCloseTo(2.1, 9);
    expect(mainClearance(custom(), { ...s, fit: 0.7 })).toBeCloseTo(0.7, 9);
  });

  it("uses the component override as an absolute total, not scaled by fit", () => {
    expect(mainClearance(cards({ clearance: 0.4 }), { ...s, fit: 1.4 })).toBe(0.4);
    expect(mainClearance(custom({ clearance: 0 }), { ...s, fit: 1.4 })).toBe(0);
  });
});

describe("label", () => {
  it("falls back when the name is blank", () => {
    expect(label("  ", "Cards")).toBe("Cards");
    expect(label("Main", "Cards")).toBe("Main");
  });
});
