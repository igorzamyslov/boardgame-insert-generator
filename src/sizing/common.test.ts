import { describe, expect, it } from "vitest";
import { newComponent } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import {
  componentIsValid,
  compartment,
  cornerRelief,
  cutoutSides,
  displayName,
  label,
  mainClearance,
  wallCutout,
} from "./common";
import { componentOptions } from "./component";
import { at, cards, custom } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("compartment", () => {
  it("takes the content as the minimum, with no finger reach", () => {
    const c = compartment({
      componentId: "a",
      contents: "A",
      kind: "well",
      w: 10,
      d: 20,
      h: 5,
      features: [wallCutout("front", 0.5, false), cornerRelief()],
    });
    expect(c.minW).toBe(10);
    expect(c.minD).toBe(20);
    expect(c.minH).toBe(5);
    expect(c.elastic).toEqual({ w: false, d: false, h: false });
    expect("spacerAxis" in c).toBe(false);
    expect("minVolume" in c).toBe(false);
    expect("maxHRatio" in c).toBe(false);
  });

  it("rounds the content up to whole 0.01 mm on every axis", () => {
    const c = compartment({
      componentId: "a",
      contents: "A",
      kind: "well",
      w: 10.001,
      d: 20.004,
      h: 5.001,
      features: [],
    });
    expect([c.minW, c.minD, c.minH]).toEqual([10.01, 20.01, 5.01]);
  });

  it("keeps optional fields when given", () => {
    const c = compartment({
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
    });
    expect(c.elastic).toEqual({ w: true, d: false, h: false });
    expect(c.spacerAxis).toBe("w");
    expect(c.minVolume).toBe(100);
    expect(c.maxHRatio).toBe(1.5);
  });
});

describe("features", () => {
  it("builds a wall cutout and a corner relief", () => {
    expect(wallCutout("back", 0.5, false)).toEqual({
      type: "wallCutout",
      side: "back",
      depthFraction: 0.5,
      floorNotch: false,
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

describe("cutoutSides", () => {
  it("lists each wall-cutout side once, in feature order", () => {
    expect(
      cutoutSides([
        wallCutout("back", 1, true),
        cornerRelief(),
        { type: "scoop", side: "left" },
        wallCutout("front", 1, true),
        wallCutout("back", 0.5, false),
      ]),
    ).toEqual(["back", "front"]);
    expect(cutoutSides([])).toEqual([]);
  });
});

describe("a new component's blank inner line name", () => {
  it.each([
    ["cards", "Cards ×50"],
    ["bulk", "Bits ×20"],
    ["minis", "Miniatures 1/4"],
  ] as const)("labels a new %s compartment with the component's name", (kind, expected) => {
    const options = componentOptions(newComponent(kind), DEFAULT_SETTINGS, 0).options;
    const first = at(at(at(options, 0).blocks, 0), 0);
    expect(first.contents).toBe(expected);
  });
});
