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

describe("minisOptions labels", () => {
  it("shows the component name beside a figure's, and not twice", () => {
    const component = minis({
      name: "Heroes",
      figures: [
        { name: "Knight", w: 25, d: 25, h: 40, count: 2 },
        { name: "", w: 25, d: 25, h: 40, count: 1 },
      ],
    });
    const { options } = minisOptions(component, DEFAULT_SETTINGS);
    expect(at(options, 0).blocks.map((b) => b.map((c) => c.contents))).toEqual([
      ["Heroes — Knight 1/2", "Heroes — Knight 2/2"],
      ["Heroes"],
    ]);
  });
});

describe("minisOptions", () => {
  it("makes one pocket per figure, cut half its depth through the front and back walls", () => {
    const { options, notices } = minisOptions(minis(), s);
    expect(notices).toEqual([]);
    expect(options.map((o) => o.id)).toEqual(["standing", "lying"]);
    const standing = at(options, 0);
    expect(standing.blocks).toHaveLength(1);
    const block = at(standing.blocks, 0);
    expect(block.map((c) => c.contents)).toEqual(["Minis — Hero 1/2", "Minis — Hero 2/2"]);
    const pocket = at(block, 0);
    expect(pocket).toMatchObject({ kind: "pocket", minW: 26, minD: 26, minH: 41 });
    expect(pocket.elastic).toEqual({ w: false, d: false, h: false });
    expect(pocket.features).toEqual([
      { type: "wallCutout", side: "front", depthFraction: 0.5, floorNotch: false },
      { type: "wallCutout", side: "back", depthFraction: 0.5, floorNotch: false },
    ]);
    expect(at(at(at(options, 1).blocks, 0), 0)).toMatchObject({ minW: 41, minD: 26, minH: 26 });
  });

  describe("a short figure: a full-depth cut with a floor notch, front and back", () => {
    const pocketOf = (figure: { w: number; d: number; h: number }, variant = 0) =>
      at(
        at(
          at(
            minisOptions(minis({ figures: [{ name: "Pawn", count: 2, ...figure }] }), s).options,
            variant,
          ).blocks,
          0,
        ),
        0,
      );
    const cuts = (c: ReturnType<typeof pocketOf>) =>
      c.features.flatMap((f) => (f.type === "wallCutout" ? [f] : []));
    const notched = [
      { type: "wallCutout", side: "front", depthFraction: 1, floorNotch: true },
      { type: "wallCutout", side: "back", depthFraction: 1, floorNotch: true },
    ];
    const half = [
      { type: "wallCutout", side: "front", depthFraction: 0.5, floorNotch: false },
      { type: "wallCutout", side: "back", depthFraction: 0.5, floorNotch: false },
    ];

    it("asks for the cut to the floor and the notch for a 12 mm figure", () => {
      expect(cuts(pocketOf({ w: 12, d: 12, h: 12 }))).toEqual(notched);
    });

    it("stops at 20 mm: a half-deep cut leaves a fingertip's 10 mm of its side from there", () => {
      expect(cuts(pocketOf({ w: 25, d: 25, h: 19.99 }))).toEqual(notched);
      expect(cuts(pocketOf({ w: 25, d: 25, h: 20 }))).toEqual(half);
      expect(cuts(pocketOf({ w: 25, d: 25, h: 32 }))).toEqual(half);
    });

    it("judges the figure's height in each variant: a tall figure that lies down 15 mm high is short", () => {
      // standing it is 30 mm tall; lying it is as high as its larger footprint side
      expect(cuts(pocketOf({ w: 15, d: 15, h: 30 }, 0))).toEqual(half);
      expect(cuts(pocketOf({ w: 15, d: 15, h: 30 }, 1))).toEqual(notched);
      // lying it is 30 mm high, taller than a fingertip's half-depth needs
      expect(cuts(pocketOf({ w: 10, d: 30, h: 50 }, 1))).toEqual(half);
    });
  });

  it("offers no lying variant when nothing is taller than wide", () => {
    const { options } = minisOptions(
      minis({ figures: [{ name: "Cart", w: 30, d: 20, h: 15, count: 1 }] }),
      s,
    );
    expect(options.map((o) => o.id)).toEqual(["standing"]);
    expect(at(at(at(options, 0).blocks, 0), 0).contents).toBe("Minis — Cart");
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
    expect(shallow.contents).toBe("Minis — Hero ×2");
    expect(shallow.minVolume).toBe(100000);
    expect(shallow.minH).toBe(26);
    expect(shallow.minW).toBe(62.02); // √(100000/26) = 62.017…, rounded up
    const deep = at(at(at(options, 1).blocks, 0), 0);
    // A bin you scoop from keeps its pile within reach (SCOOP_REACH − BIN_FREEBOARD = 30 mm),
    // so the deep shape spreads wider instead of going deeper.
    expect(deep.minW).toBe(57.74); // √(100000/30) = 57.735…, rounded up
    expect(deep.minH).toBe(30);
  });

  it("bulk mode packs by the figure's own packing when it has one", () => {
    const { options } = minisOptions(minis({ storage: "bulk", packing: 1 }), s);
    // the bounding-box volume is 50 000 mm³: at packing 1 the pile needs exactly that
    expect(at(at(at(options, 0).blocks, 0), 0).minVolume).toBe(50000);
  });
});

describe("minis growth (minimal-trays spec §5)", () => {
  const pocket = (c = minis(), option = 0) =>
    at(at(at(minisOptions(c, s).options, option).blocks, 0), 0);

  it("keeps pockets tight by default: more room only makes a loose fit", () => {
    expect(pocket().elastic).toEqual({ w: false, d: false, h: false });
    expect(pocket().growth).toBeUndefined();
  });

  it("makes pockets looser in width and length when asked, never in depth", () => {
    const c = pocket(minis({ growth: { w: 4, d: "auto", h: "max" } }));
    expect(c.elastic).toEqual({ w: true, d: true, h: false });
    // auto: the figure's own 25 mm
    expect(c.growth).toEqual({ w: 4, d: 25 });
  });

  it("stored as bulk, grows like loose pieces: auto on every axis", () => {
    const c = pocket(minis({ storage: "bulk" }));
    expect(c.elastic).toEqual({ w: true, d: true, h: true });
    expect(minis({ storage: "bulk", growth: { h: "off" } }).growth).toEqual({ h: "off" });
    expect(pocket(minis({ storage: "bulk", growth: { h: "off" } })).elastic.h).toBe(false);
  });
});
