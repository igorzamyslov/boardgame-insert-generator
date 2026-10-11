import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter, rowsOf, wallFor } from "./outer";
import { cards, custom, partOf, tiles } from "./test-helpers";
import type { RealizeOptions, TrayPartReq } from "./types";

const s: Settings = DEFAULT_SETTINGS;
const ground: RealizeOptions = { lipped: false, level: 0 };
const single = partOf([cards()], "upright-long|strip|split1");
const twoDecks = [
  cards({
    decks: [
      { name: "A", count: 52 },
      { name: "B", count: 30 },
    ],
  }),
];

describe("wallFor", () => {
  it("is the wall, or max(wall, lip.thickness + lip.ledge) on a lipped tray", () => {
    expect(wallFor(s, false)).toBe(1.6);
    expect(wallFor(s, true)).toBeCloseTo(2.9, 9);
    expect(wallFor({ ...s, lip: { ...s.lip, enabled: false } }, true)).toBe(1.6);
    expect(wallFor({ ...s, wall: 3.5 }, true)).toBe(3.5);
    expect(wallFor({ ...s, wall: 0.5 }, false)).toBe(0.8);
  });
});

describe("rowsOf", () => {
  it("keeps a strip as one row and splits rows2 after the first half", () => {
    expect(rowsOf("strip", [1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(rowsOf("rows2", [1, 2, 3])).toEqual([[1, 2], [3]]);
    expect(rowsOf("rows2", [1])).toEqual([[1]]);
  });
});

describe("minOuter", () => {
  it("adds walls and floor around one upright deck", () => {
    // inner 23.50 × 116.50, content 68 → 26.7 × 119.7 × 69.2
    expect(minOuter(single, s, ground)).toEqual({ w: 26.7, d: 119.7, h: 69.2 });
  });

  it("leaves room for the bottom chamfer c: w, d ≥ 2·(c + 0.8) and h ≥ c + 0.8", () => {
    const pip = (thickness: number, cfg: Settings): TrayPartReq =>
      partOf(
        [
          tiles({
            shape: { type: "rect", w: 1, d: 1 },
            thickness,
            count: 1,
            storage: "flat",
            clearance: 0,
          }),
        ],
        "flat-c1|strip|split1",
        cfg,
      );
    // A 5 mm finger pocket and 0.8 mm walls: 6.6 × 26.6 × 2.2 at the default 0.4 mm chamfer.
    const narrow: Settings = { ...s, wall: 0.8, fingerPocket: { width: 5, reach: 12 } };
    expect(minOuter(pip(1, narrow), narrow, ground)).toEqual({ w: 6.6, d: 26.6, h: 2.2 });
    const steep = { ...narrow, bottomChamfer: 3 };
    expect(minOuter(pip(1, steep), steep, ground)).toEqual({ w: 7.6, d: 26.6, h: 3.8 });
  });

  it("uses a chamfer of at least 0.5 mm above the ground level", () => {
    const thin: Settings = {
      ...s,
      wall: 0.8,
      floor: 0.8,
      bottomChamfer: 0.2,
      fingerPocket: { width: 5, reach: 12 },
      lip: { ...s.lip, enabled: false },
    };
    const part = partOf(
      [
        tiles({
          shape: { type: "rect", w: 1, d: 1 },
          thickness: 0.01,
          count: 1,
          storage: "flat",
          clearance: 0,
        }),
      ],
      "flat-c1|strip|split1",
      thin,
    );
    // Content depth 0.81: h = max(0.81, 0.2 + 0.8) on level 0, max(0.81, 0.5 + 0.8) above it.
    expect(minOuter(part, thin, ground)).toEqual({ w: 6.6, d: 26.6, h: 1 });
    expect(minOuter(part, thin, { lipped: false, level: 1 })).toEqual({ w: 6.6, d: 26.6, h: 1.3 });
  });

  it("uses the lipped wall on a tray that carries a lip", () => {
    expect(minOuter(single, s, { lipped: true, level: 0 })).toEqual({ w: 29.3, d: 122.3, h: 69.2 });
  });

  it("puts dividers between decks in a strip and between rows in rows2", () => {
    // 23.50 + 1.2 + 13.98 = 38.68 inner
    expect(minOuter(partOf(twoDecks, "upright-long|strip|split1"), s, ground)).toEqual({
      w: 41.88,
      d: 119.7,
      h: 69.2,
    });
    // rows: 116.5 + 1.2 + 116.5 = 234.2 inner
    expect(minOuter(partOf(twoDecks, "upright-long|rows2|split1"), s, ground)).toEqual({
      w: 26.7,
      d: 237.4,
      h: 69.2,
    });
  });

  it("widens the inner span to a full finger pocket for a one-card deck", () => {
    const solo = partOf(
      [cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] })],
      "upright-long|strip|split1",
    );
    expect(minOuter(solo, s, ground)).toEqual({ w: 25.2, d: 116.7, h: 66.2 });
  });

  it("gives sleeved Tarot cards a low flat tray next to the tall upright one", () => {
    const tarot = [
      cards({
        shortSide: 70,
        longSide: 120,
        storage: "auto",
        decks: [{ name: "Tarot", count: 80 }],
      }),
    ];
    expect(minOuter(partOf(tarot, "upright-long|strip|split1"), s, ground)).toEqual({
      w: 38.81,
      d: 151.7,
      h: 75.7,
    });
    expect(minOuter(partOf(tarot, "flat|strip|split1"), s, ground)).toEqual({
      w: 77.7,
      d: 151.7,
      h: 36.81,
    });
  });

  it("makes upper trays at least lip.height + 3 tall", () => {
    const thin = partOf([custom({ h: 1, count: 1 })], "custom|strip|split1");
    expect(minOuter(thin, s, ground).h).toBe(3.2);
    expect(minOuter(thin, s, { lipped: false, level: 1 }).h).toBe(5);
    expect(
      minOuter(thin, { ...s, lip: { ...s.lip, enabled: false } }, { lipped: false, level: 1 }).h,
    ).toBe(3.2);
  });

  it("never goes below the 0.8 mm minimum feature", () => {
    const flimsy = { ...s, wall: 0.5, divider: 0.3, floor: 0.4 };
    expect(minOuter(single, flimsy, ground)).toEqual({ w: 25.1, d: 118.1, h: 68.8 });
  });

  describe("settings that are not whole multiples of 0.01 mm", () => {
    const tiny = (over: Partial<Settings>): Settings => ({ ...s, ...over });

    it("rounds the wall up", () => {
      for (const [wall, w] of [
        [1.234, 25.98],
        [1.005, 25.52],
      ] as const) {
        const odd = tiny({ wall });
        const part = partOf([cards()], "upright-long|strip|split1", odd);
        expect(minOuter(part, odd, ground).w).toBe(w);
      }
    });

    it("rounds the divider up", () => {
      const odd = tiny({ divider: 1.234 });
      const part = partOf(twoDecks, "upright-long|strip|split1", odd);
      expect(minOuter(part, odd, ground).w).toBe(41.92);
    });

    it("rounds the floor up", () => {
      const odd = tiny({ floor: 1.234 });
      const part = partOf([cards()], "upright-long|strip|split1", odd);
      expect(minOuter(part, odd, ground).h).toBe(69.24);
    });

    it("rounds the lipped wall and the upper-tray height up", () => {
      const odd = tiny({ lip: { ...s.lip, thickness: 1.234, height: 2.004 } });
      const thin = partOf([custom({ h: 1, count: 1 })], "custom|strip|split1", odd);
      expect(minOuter(single, odd, { lipped: true, level: 0 }).w).toBe(29.38);
      expect(minOuter(thin, odd, { lipped: false, level: 1 }).h).toBe(5.01);
    });
  });

  it("rejects a part without compartments", () => {
    const empty: TrayPartReq = {
      trayKey: "x:p0:0",
      arrangement: "strip",
      compartments: [],
      rotatable: true,
    };
    expect(() => minOuter(empty, s, ground)).toThrow(RangeError);
  });
});
