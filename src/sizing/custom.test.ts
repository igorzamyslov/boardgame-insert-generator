import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { customOptions } from "./custom";
import { at, custom } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("customOptions", () => {
  it("makes one well per item with a half-deep cut through its front wall and corner reliefs", () => {
    const { options, notices } = customOptions(custom(), s);
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
      minH: 11,
      elastic: { w: false, d: false, h: false },
      features: [
        { type: "wallCutout", side: "front", depthFraction: 0.5, floorNotch: false },
        { type: "cornerRelief" },
      ],
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

  it("grows the axes it is asked to, by number, auto or max", () => {
    const c = well(custom({ growth: { w: 3, d: "auto", h: "max" } }));
    expect(c.elastic).toEqual({ w: true, d: true, h: true });
    // auto: the item's 30 mm depth, under the 50 mm ceiling
    expect(c.growth).toEqual({ w: 3, d: 30 });
  });
});
