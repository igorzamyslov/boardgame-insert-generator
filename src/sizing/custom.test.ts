import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { customOptions } from "./custom";
import { at, custom } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("customOptions", () => {
  it("makes one well per item with a half-deep cut through its front wall and corner reliefs", () => {
    // a tall item (30 mm): half its depth is 15 mm of its side to take hold of
    const { options, notices } = customOptions(custom({ h: 30 }), s);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["custom"]);
    const blocks = at(options, 0).blocks;
    expect(blocks.map((b) => b.map((c) => c.contents))).toEqual([["Dial 1/2"], ["Dial 2/2"]]);
    expect(at(at(blocks, 0), 0)).toEqual({
      componentId: "x1",
      contents: "Dial 1/2",
      kind: "well",
      minW: 41,
      minD: 31,
      minH: 31,
      elastic: { w: false, d: false, h: false },
      features: [
        { type: "wallCutout", side: "front", depthFraction: 0.5, floorNotch: false },
        { type: "cornerRelief" },
      ],
    });
  });

  describe("a flat item: a full-depth cut with a floor notch, as flat cards and tiles get", () => {
    const features = (h: number, over: Parameters<typeof custom>[0] = {}) =>
      at(at(at(customOptions(custom({ h, count: 1, ...over }), s).options, 0).blocks, 0), 0)
        .features;
    const cut = (h: number, over: Parameters<typeof custom>[0] = {}) =>
      features(h, over).find((f) => f.type === "wallCutout");

    it("asks for the cut to the floor and the notch under a 2 mm board", () => {
      expect(features(2)).toEqual([
        { type: "wallCutout", side: "front", depthFraction: 1, floorNotch: true },
        { type: "cornerRelief" },
      ]);
    });

    it("includes the default 10 mm item: half its depth is 5 mm, less than a fingertip", () => {
      expect(cut(10)).toEqual({
        type: "wallCutout",
        side: "front",
        depthFraction: 1,
        floorNotch: true,
      });
    });

    it("stops at 20 mm of item height: a half-deep cut leaves a fingertip's 10 mm of its side from there", () => {
      expect(cut(19.99)).toMatchObject({ depthFraction: 1, floorNotch: true });
      expect(cut(20)).toMatchObject({ depthFraction: 0.5, floorNotch: false });
      expect(cut(60)).toMatchObject({ depthFraction: 0.5, floorNotch: false });
    });

    it("goes by the item's own height, not by the well's clearance", () => {
      expect(cut(19.5, { clearance: 2 })).toMatchObject({ depthFraction: 1, floorNotch: true });
    });

    it("asks for nothing with finger cuts off", () => {
      expect(cut(2, { fingerCuts: false })).toBeUndefined();
    });
  });

  it("uses the clearance override, unscaled by fit", () => {
    const { options } = customOptions(custom({ clearance: 0.5, count: 1 }), { ...s, fit: 1.4 });
    const well = at(at(at(options, 0).blocks, 0), 0);
    expect(well.minW).toBe(40.5);
    expect(well.contents).toBe("Dial");
  });

  it("falls back to the component id when the name is blank", () => {
    const { options } = customOptions(custom({ name: "  ", count: 1 }), s);
    expect(at(at(at(options, 0).blocks, 0), 0).contents).toBe("x1");
  });
});

describe("custom growth (minimal-trays spec §5)", () => {
  const well = (c = custom()) => at(at(at(customOptions(c, s).options, 0).blocks, 0), 0);

  it("is off on every axis by default: tolerance only", () => {
    expect(well().elastic).toEqual({ w: false, d: false, h: false });
    expect(well().growth).toBeUndefined();
  });

  it("never grows: it has no room row, whatever a file sets or the fill setting says", () => {
    // was per-axis number, auto and max growth; a custom item offers no room (owner, 2026-10-23)
    const c = custom();
    expect(well({ ...c, room: "max" } as never).elastic).toEqual({ w: false, d: false, h: false });
    const wells = { ...s, biggerWells: true };
    const bigger = at(at(at(customOptions(c, wells).options, 0).blocks, 0), 0);
    expect(bigger.elastic).toEqual({ w: false, d: false, h: false });
    expect(bigger.growth).toBeUndefined();
  });
});
