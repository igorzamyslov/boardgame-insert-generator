import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { lyingDims, minisOptions } from "./minis";
import { at, minis } from "./test-helpers";

const s: Settings = DEFAULT_SETTINGS;

describe("lyingDims", () => {
  it("lays a tall figure down along its larger footprint side", () => {
    expect(lyingDims({ w: 20, d: 30, h: 50 })).toEqual({ w: 20, d: 50, h: 30 });
    expect(lyingDims({ w: 30, d: 20, h: 50 })).toEqual({ w: 50, d: 20, h: 30 });
    expect(lyingDims({ w: 25, d: 25, h: 40 })).toEqual({ w: 40, d: 25, h: 25 });
  });

  it("leaves a figure that is not taller than wide alone", () => {
    expect(lyingDims({ w: 30, d: 20, h: 15 })).toEqual({ w: 30, d: 20, h: 15 });
  });
});

describe("minisOptions", () => {
  it("makes one pocket per figure, cut half its depth through the front wall", () => {
    const { options, notices } = minisOptions(minis(), s);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["standing", "lying"]);
    const standing = at(options, 0);
    expect(standing.blocks).toHaveLength(1);
    const block = at(standing.blocks, 0);
    expect(block.map((c) => c.contents)).toEqual(["Hero 1/2", "Hero 2/2"]);
    const pocket = at(block, 0);
    expect(pocket).toMatchObject({ kind: "pocket", minW: 26, minD: 26, minH: 41 });
    expect(pocket.elastic).toEqual({ w: false, d: false, h: false });
    expect(pocket.features).toEqual([
      { type: "wallCutout", side: "front", depthFraction: 0.5, floorNotch: false },
    ]);
    expect(at(at(at(options, 1).blocks, 0), 0)).toMatchObject({ minW: 41, minD: 26, minH: 26 });
  });

  it("offers no lying variant when nothing is taller than wide", () => {
    const { options } = minisOptions(
      minis({ figures: [{ name: "Cart", w: 30, d: 20, h: 15, count: 1 }] }),
      s,
    );
    expect(options.map((o) => o.id)).toEqual(["standing"]);
    expect(at(at(at(options, 0).blocks, 0), 0).contents).toBe("Cart");
  });

  it("keeps one block per figure line so splits happen by figure", () => {
    const { options } = minisOptions(
      minis({
        figures: [
          { name: "Hero", w: 25, d: 25, h: 40, count: 2 },
          { name: "Boss", w: 50, d: 50, h: 45, count: 1 },
        ],
      }),
      s,
    );
    expect(at(options, 0).blocks.map((b) => b.length)).toEqual([2, 1]);
  });

  it("falls back to the component name for an unnamed figure", () => {
    const { options } = minisOptions(
      minis({ figures: [{ name: " ", w: 30, d: 20, h: 15, count: 1 }] }),
      s,
    );
    expect(at(at(at(options, 0).blocks, 0), 0).contents).toBe("Minis");
  });

  it("bulk mode uses the bounding-box volume ÷ packingFactor", () => {
    const { options } = minisOptions(minis({ storage: "bulk" }), s);
    expect(options.map((o) => o.id)).toEqual(["bulk-shallow", "bulk-deep"]);
    const shallow = at(at(at(options, 0).blocks, 0), 0);
    expect(shallow.kind).toBe("scoop");
    expect(shallow.contents).toBe("Hero ×2");
    expect(shallow.minVolume).toBe(100000);
    expect(shallow.minH).toBe(26);
    expect(shallow.minW).toBe(62.02); // √(100000/26) = 62.017…, rounded up
    const deep = at(at(at(options, 1).blocks, 0), 0);
    // A bin you scoop from keeps its pile within reach (SCOOP_REACH − BIN_FREEBOARD = 30 mm),
    // so the deep shape spreads wider instead of going deeper.
    expect(deep.minW).toBe(57.74); // √(100000/30) = 57.735…, rounded up
    expect(deep.minH).toBe(30);
  });
});
