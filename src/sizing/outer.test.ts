import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MIN_WALL_MM } from "../model/settings";
import type { Settings } from "../model/types";
import { rowsOf, wallFor } from "./outer";
import { minOuter } from "./realize";
import { cards, custom, partOf, tiles } from "./test-helpers";
import type { RealizeOptions, TrayPartReq } from "./types";

// These cover sizing with a locating lip available (the lipped wall, upper-tray
// minimums), so they turn it on; the app's own default is off.
const s: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, enabled: true } };
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
    expect(wallFor({ ...s, wall: 0.5 }, false)).toBe(MIN_WALL_MM);
    expect(MIN_WALL_MM).toBeCloseTo(0.9, 9);
  });

  it("is thicker above level 0 with the lip on, for the groove under the tray's outer edge", () => {
    // 2.56 mm at the defaults: the groove's inner wall (1.45) and 0.8, and enough that no well
    // corner shrinks the 3 mm outer corner radius
    expect(wallFor(s, false, 1)).toBeCloseTo(2.55, 1);
    expect(wallFor(s, false, 1)).toBeGreaterThan(wallFor(s, false, 0));
    // a lipped wall that is thicker already stays as it is
    expect(wallFor(s, true, 1)).toBeCloseTo(2.9, 9);
    // level 0 and the lip off: as before
    expect(wallFor(s, false, 0)).toBe(1.6);
    expect(wallFor({ ...s, lip: { ...s.lip, enabled: false } }, false, 1)).toBe(1.6);
    expect(wallFor({ ...s, lip: { ...s.lip, enabled: false } }, true, 1)).toBe(1.6);
  });
});

describe("rowsOf", () => {
  it("keeps a strip as one row and splits rows2 after the first half", () => {
    expect(rowsOf("strip", [1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(rowsOf("rows2", [1, 2, 3])).toEqual([[1, 2], [3]]);
    expect(rowsOf("rows2", [1])).toEqual([[1]]);
    // A part's rowBreak sets the front row.
    expect(rowsOf("rows2", [1, 2, 3, 4], 1)).toEqual([[1], [2, 3, 4]]);
    expect(rowsOf("rows2", [1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
    expect(rowsOf("strip", [1, 2, 3], 1)).toEqual([[1, 2, 3]]);
    // columns: cut before each break (group-tray-fill spec §3 (b)); no breaks, one column.
    expect(rowsOf("columns", [1, 2, 3, 4, 5], undefined, [1, 3])).toEqual([[1], [2, 3], [4, 5]]);
    expect(rowsOf("columns", [1, 2])).toEqual([[1, 2]]);
  });
});

describe("minOuter", () => {
  it("adds walls and floor around one upright deck", () => {
    // inner 23.50 × 92.50, content 68 → 26.7 × 95.7 × 69.2
    expect(minOuter(single, s, ground)).toEqual({ w: 26.7, d: 95.7, h: 69.2 });
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
    // A 1 mm tile and 0.9 mm walls: 2.8 × 2.8 × 2.2 at the default 0.4 mm chamfer (its cutouts
    // need no room of their own).
    const narrow: Settings = { ...s, wall: 0.9 };
    expect(minOuter(pip(1, narrow), narrow, ground)).toEqual({ w: 2.8, d: 2.8, h: 2.2 });
    // minOuter is plain arithmetic: a 3 mm chamfer on 0.9 mm walls is invalid for size() (settingsValid)
    // but still gives the chamfer minimums.
    const steep = { ...narrow, bottomChamfer: 3 };
    expect(minOuter(pip(1, narrow), steep, ground)).toEqual({ w: 7.6, d: 7.6, h: 3.8 });
  });

  it("uses a chamfer of at least 0.5 mm above the ground level", () => {
    const thin: Settings = {
      ...s,
      wall: 0.9,
      floor: 0.8,
      bottomChamfer: 0.2,
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
    expect(minOuter(part, thin, ground)).toEqual({ w: 2.8, d: 2.8, h: 1 });
    expect(minOuter(part, thin, { lipped: false, level: 1 })).toEqual({ w: 2.8, d: 2.8, h: 1.3 });
  });

  it("uses the lipped wall on a tray that carries a lip", () => {
    expect(minOuter(single, s, { lipped: true, level: 0 })).toEqual({ w: 29.3, d: 98.3, h: 69.2 });
  });

  it("puts dividers between decks in a strip and between rows in rows2", () => {
    // 23.50 + 1.2 + 13.98 = 38.68 inner
    expect(minOuter(partOf(twoDecks, "upright-long|strip|split1"), s, ground)).toEqual({
      w: 41.88,
      d: 95.7,
      h: 69.2,
    });
    // rows: 92.5 + 1.2 + 92.5 = 186.2 inner
    expect(minOuter(partOf(twoDecks, "upright-long|rows2|split1"), s, ground)).toEqual({
      w: 26.7,
      d: 189.4,
      h: 69.2,
    });
  });

  it("needs no room for a cut: a custom piece's tray is its well and walls", () => {
    const piece = partOf([custom({ w: 30, d: 20, h: 5, count: 1 })], "custom|strip|split1");
    expect(minOuter(piece, s, ground)).toEqual({ w: 34.2, d: 24.2, h: 7.2 });
  });

  it("does not widen a one-card deck: its finger channel needs no room of its own", () => {
    const solo = partOf(
      [cards({ sleeve: "none", decks: [{ name: "Solo", count: 1 }] })],
      "upright-long|strip|split1",
    );
    expect(minOuter(solo, s, ground)).toEqual({ w: 4.53, d: 92.7, h: 66.2 });
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
      d: 127.7,
      h: 75.7,
    });
    expect(minOuter(partOf(tarot, "flat|strip|split1"), s, ground)).toEqual({
      w: 77.7,
      d: 127.7,
      h: 36.81,
    });
  });

  it("makes upper trays as tall as their groove needs: its height plus the thinnest wall above it", () => {
    const thin = partOf([custom({ h: 1, count: 1, fingerCuts: false })], "custom|strip|split1");
    expect(minOuter(thin, s, ground).h).toBe(3.2);
    // the groove is 2.85 mm high at the outer face (flat 0.6 + lip 2 + play 0.25), and 0.8 mm of
    // wall stands above it
    expect(minOuter(thin, s, { lipped: false, level: 1 }).h).toBe(3.65);
    expect(
      minOuter(thin, { ...s, lip: { ...s.lip, enabled: false } }, { lipped: false, level: 1 }).h,
    ).toBe(3.2);
  });

  it("makes an upper tray with a plain finger cut 0.8 mm taller: the cut needs wall above the groove and depth of its own", () => {
    // a cut without a floor notch that leaves through the wall stands MIN_FEATURE_MM above the
    // groove's roof, so at the least height there would be no cut (realize: withCutRoom)
    const cut = partOf([custom({ h: 1, count: 1 })], "custom|strip|split1");
    expect(minOuter(cut, s, { lipped: false, level: 1 }).h).toBe(4.45);
    expect(minOuter(cut, s, ground).h).toBe(3.2);
  });

  it("never goes below MIN_WALL_MM walls and 0.8 mm dividers and floors", () => {
    const flimsy = { ...s, wall: 0.5, divider: 0.3, floor: 0.4 };
    expect(minOuter(single, flimsy, ground)).toEqual({ w: 25.3, d: 94.3, h: 68.8 });
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
      const thin = partOf(
        [custom({ h: 1, count: 1, fingerCuts: false })],
        "custom|strip|split1",
        odd,
      );
      expect(minOuter(single, odd, { lipped: true, level: 0 }).w).toBe(29.38);
      expect(minOuter(thin, odd, { lipped: false, level: 1 }).h).toBe(3.66);
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
