import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import { customOptions } from "./custom";
import { at, custom } from "./test-helpers";

const s = DEFAULT_SETTINGS;

describe("customOptions", () => {
  it("makes one well per item with a full-depth front pocket and corner reliefs", () => {
    const { options, notices } = customOptions(custom(), s, 0);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["custom"]);
    const blocks = at(options, 0).blocks;
    expect(blocks.map((b) => b.map((c) => c.contents))).toEqual([["Dial 1/2"], ["Dial 2/2"]]);
    expect(at(at(blocks, 0), 0)).toEqual({
      componentId: "x1",
      contents: "Dial 1/2",
      kind: "well",
      minW: 41,
      minD: 43,
      minH: 11,
      elastic: { w: false, d: false, h: false },
      features: [
        { type: "fingerPocket", side: "front", depthFraction: 1, perItem: true },
        { type: "cornerRelief" },
      ],
    });
  });

  it("uses the clearance override, unscaled by fit", () => {
    const { options } = customOptions(custom({ clearance: 0.5, count: 1 }), { ...s, fit: 1.4 }, 0);
    const well = at(at(at(options, 0).blocks, 0), 0);
    expect(well.minW).toBe(40.5);
    expect(well.contents).toBe("Dial");
  });

  it("falls back to the component id when the name is blank", () => {
    const { options } = customOptions(custom({ name: "  ", count: 1 }), s, 0);
    expect(at(at(at(options, 0).blocks, 0), 0).contents).toBe("x1");
  });

  it("returns no options and no notices for an invalid component", () => {
    for (const component of [custom({ h: -1 }), custom({ count: 0 }), custom({ count: 1.5 })]) {
      expect(customOptions(component, s, 5)).toEqual({ options: [], notices: [] });
    }
  });
});
