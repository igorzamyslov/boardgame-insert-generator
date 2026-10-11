import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import {
  componentIsValid,
  compartment,
  cornerRelief,
  displayName,
  fingerPocket,
  label,
  mainClearance,
  pocketSides,
  reachU,
} from "./common";
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

  it("rounds the content up to whole 0.01 mm on every axis", () => {
    const c = compartment(
      {
        componentId: "a",
        contents: "A",
        kind: "well",
        w: 10.001,
        d: 20.004,
        h: 5.001,
        features: [],
      },
      s,
    );
    expect([c.minW, c.minD, c.minH]).toEqual([10.01, 20.01, 5.01]);
  });

  it("leaves at least 1 mm of content in a compartment with a finger pocket", () => {
    const input = {
      componentId: "a",
      contents: "A",
      kind: "pocket" as const,
      w: 0.5,
      d: 0.5,
      h: 0.5,
    };
    const c = compartment({ ...input, features: [fingerPocket("front", 1 / 3, true)] }, s);
    expect([c.minW, c.minD, c.minH]).toEqual([1, 13, 0.5]);
    const plain = compartment({ ...input, features: [cornerRelief()] }, s);
    expect([plain.minW, plain.minD]).toEqual([0.5, 0.5]);
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

describe("compartment pocket sides", () => {
  it("counts the reach once per pocket side, however many features sit on it", () => {
    const c = compartment(
      {
        componentId: "a",
        contents: "A",
        kind: "well",
        w: 10,
        d: 20,
        h: 5,
        features: [
          fingerPocket("front", 1 / 3, true),
          fingerPocket("front", 1, false),
          fingerPocket("left", 1, false),
          fingerPocket("left", 1 / 3, true),
        ],
      },
      s,
    );
    expect(c.minD).toBe(32);
    expect(c.minW).toBe(22);
  });
});

describe("features", () => {
  it("builds a finger pocket and a corner relief", () => {
    expect(fingerPocket("back", 0.5, true)).toEqual({
      type: "fingerPocket",
      side: "back",
      depthFraction: 0.5,
      perItem: true,
    });
    expect(cornerRelief()).toEqual({ type: "cornerRelief" });
  });
});

describe("displayName", () => {
  it("is the name, or the id when the name is blank", () => {
    expect(displayName(cards({ name: "Deck" }))).toBe("Deck");
    expect(displayName(cards({ name: "  " }))).toBe("c1");
  });
});

describe("componentIsValid", () => {
  it("is false only for error-level notices from validateComponent", () => {
    expect(componentIsValid(cards(), 0)).toBe(true);
    // short side longer than long side is a warning, not an error
    expect(componentIsValid(cards({ shortSide: 88, longSide: 63.5 }), 0)).toBe(true);
    expect(componentIsValid(cards({ shortSide: 0 }), 0)).toBe(false);
    expect(componentIsValid(custom({ count: 3000 }), 1)).toBe(false);
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

describe("pocketSides", () => {
  it("lists each finger-pocket side once, in feature order", () => {
    expect(
      pocketSides([
        fingerPocket("back", 1, true),
        cornerRelief(),
        { type: "scoop", side: "left" },
        fingerPocket("front", 1, true),
        fingerPocket("back", 1 / 3, true),
      ]),
    ).toEqual(["back", "front"]);
    expect(pocketSides([])).toEqual([]);
  });
});

describe("reachU", () => {
  it("rounds the finger reach up to whole 0.01 mm", () => {
    expect(reachU(s)).toBe(1200);
    expect(reachU({ ...s, fingerPocket: { ...s.fingerPocket, reach: 12.341 } })).toBe(1235);
  });
});
