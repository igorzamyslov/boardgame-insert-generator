import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { orientations, minisOptions } from "./minis";
import { minOuter } from "./realize";
import { size } from "./group";
import { at, minis } from "./test-helpers";

const s: Settings = DEFAULT_SETTINGS;

describe("orientations", () => {
  const key = (d: { w: number; d: number; h: number }) => `${d.w}×${d.d}×${d.h}`;

  it("lists each resting face once, the figure as given first", () => {
    expect(orientations({ w: 20, d: 30, h: 50 }, false).map(key)).toEqual([
      "20×30×50", // as given
      "20×50×30", // on its side
      "50×30×20", // flat
    ]);
  });

  it("lays a figure that is wider than tall down too (the airship: 33 × 101 × 41)", () => {
    expect(orientations({ w: 33, d: 101, h: 41 }, false).map(key)).toEqual([
      "33×101×41",
      "41×101×33", // flat on its largest face
      "33×41×101", // on its tail
    ]);
  });

  it("leaves a figure kept upright as it is", () => {
    expect(orientations({ w: 20, d: 30, h: 50 }, true).map(key)).toEqual(["20×30×50"]);
  });

  it("has one orientation for a cube", () => {
    expect(orientations({ w: 25, d: 25, h: 25 }, false)).toHaveLength(1);
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
    expect(options.map((o) => o.id)).toEqual(["standing", "lying", "lying-turned"]);
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
    // 25 × 25 × 40 on its side: as high as it is wide
    expect(at(at(at(options, 1).blocks, 0), 0)).toMatchObject({ minW: 41, minD: 26, minH: 26 });
  });

  describe("a short figure: a full-depth cut with a floor notch, front and back", () => {
    const pocketOf = (figure: { w: number; d: number; h: number }, id = "standing") => {
      const { options } = minisOptions(
        minis({ figures: [{ name: "Pawn", count: 2, ...figure }] }),
        s,
      );
      return at(
        at(
          at(
            options.filter((o) => o.id === id),
            0,
          ).blocks,
          0,
        ),
        0,
      );
    };
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
      expect(cuts(pocketOf({ w: 15, d: 15, h: 30 }))).toEqual(half);
      expect(cuts(pocketOf({ w: 15, d: 15, h: 30 }, "lying"))).toEqual(notched);
      // on its side it is 30 mm high, taller than a fingertip's half-depth needs
      expect(cuts(pocketOf({ w: 10, d: 30, h: 50 }, "lying"))).toEqual(half);
    });
  });

  it("lays a figure down that is wider than tall, and offers its pocket turned in plan", () => {
    const { options } = minisOptions(
      minis({ figures: [{ name: "Cart", w: 30, d: 20, h: 15, count: 1 }] }),
      s,
    );
    expect(options.map((o) => o.id)).toEqual([
      "standing",
      "standing-turned",
      "lying",
      "lying-turned",
      "tall",
      "tall-turned",
    ]);
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

describe("any side, any turn", () => {
  const airship = { name: "Airship", w: 33, d: 101, h: 41, count: 1 };
  const trayVolume = (c: ReturnType<typeof minis>, only?: string): number => {
    const { requirements } = size([c], s);
    const candidates = requirements
      .flatMap((r) => r.variants)
      .filter((v) => only === undefined || v.id.startsWith(`${only}|`));
    expect(candidates.length).toBeGreaterThan(0);
    return Math.min(
      ...candidates.map((v) => {
        const o = minOuter(at(v.parts, 0), s, { lipped: false, level: 0 });
        return o.w * o.d * o.h;
      }),
    );
  };

  it("offers the airship lying, and its tray is smaller than standing", () => {
    const c = minis({ figures: [airship] });
    const { options } = minisOptions(c, s);
    expect(options.map((o) => o.id)).toContain("flat");
    const standing = at(at(at(options, 0).blocks, 0), 0);
    expect(standing).toMatchObject({ minW: 34, minD: 102, minH: 42 });
    const flat = at(
      at(
        at(
          options.filter((o) => o.id === "flat"),
          0,
        ).blocks,
        0,
      ),
      0,
    );
    expect(flat).toMatchObject({ minW: 42, minD: 102, minH: 34 });
    expect(trayVolume(c)).toBeLessThan(trayVolume(c, "standing"));
  });

  it("keeps a figure marked keep upright standing, and never lays it down", () => {
    const { options } = minisOptions(minis({ figures: [{ ...airship, keepUpright: true }] }), s);
    expect(options.map((o) => o.id)).toEqual(["standing", "standing-turned"]);
    for (const o of options) {
      expect(at(at(o.blocks, 0), 0).minH).toBe(42);
    }
  });

  it("lays down only the figures not kept upright", () => {
    const { options } = minisOptions(
      minis({
        figures: [
          { ...airship, keepUpright: true },
          { name: "Hero", w: 25, d: 25, h: 40, count: 1 },
        ],
      }),
      s,
    );
    const lying = at(
      options.filter((o) => o.id === "lying"),
      0,
    );
    expect(at(at(lying.blocks, 0), 0).minH).toBe(42);
    expect(at(at(lying.blocks, 1), 0).minH).toBe(26);
  });

  it("turns pockets in plan by itself: a turned option swaps w and d", () => {
    const { options } = minisOptions(minis({ figures: [airship] }), s);
    const standing = at(
      at(
        at(
          options.filter((o) => o.id === "standing"),
          0,
        ).blocks,
        0,
      ),
      0,
    );
    const turned = at(
      at(
        at(
          options.filter((o) => o.id === "standing-turned"),
          0,
        ).blocks,
        0,
      ),
      0,
    );
    expect([turned.minW, turned.minD, turned.minH]).toEqual([
      standing.minD,
      standing.minW,
      standing.minH,
    ]);
  });
});
