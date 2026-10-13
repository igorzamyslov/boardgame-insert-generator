import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings } from "../model/types";
import { minOuter } from "./realize";
import { realizeTray } from "./realize";
import { rotateRealized } from "./rotate";
import { assertTrayInvariants, at, bulk, cards, partOf } from "./test-helpers";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "./types";

// 10 mm of spare stack length: short enough that it becomes a spacer rather than a wall
// and a pocket, so there is a spacer here to turn.
const outer: OuterSize = { w: 36.7, d: 95.7, h: 69.2 };
const realized = realizeTray(
  partOf([cards({ stretch: true })], "upright-long|strip|split1"),
  outer,
  DEFAULT_SETTINGS,
  { lipped: false, level: 0 },
);

describe("rotateRealized", () => {
  it("turns compartments and spacers 90° counter-clockwise into the swapped outer", () => {
    const turned = rotateRealized(realized, outer);
    expect(at(turned.compartments, 0)).toMatchObject({ x: 1.6, y: 1.6, w: 92.5, d: 33.5 });
    expect(at(turned.compartments, 0).features).toEqual([
      { type: "wallCutout", side: "front", at: 47.85, width: 25, depth: 34, floorNotch: 0 },
      { type: "wallCutout", side: "back", at: 47.85, width: 25, depth: 34, floorNotch: 0 },
    ]);
    expect(at(turned.spacers, 0)).toMatchObject({
      x: 1.6,
      y: 25.1,
      w: 92.5,
      d: 10,
      z: 1.2,
      h: 63,
      rotated: true,
    });
  });

  it("turns a spacer's notch with it", () => {
    const sp: RealizedTray["spacers"][number] = {
      key: "s",
      part: "spacer",
      path: "",
      stack: 0,
      level: 0,
      x: 25.1,
      y: 1.6,
      z: 1.2,
      w: 30,
      d: 92.5,
      h: 63,
      rotated: false,
      wall: 0,
      floor: 0,
      lip: false,
      solid: true,
      compartments: [],
      features: [{ type: "spacerNotch", axis: "x", at: 40, width: 22, depth: 29 }],
    };
    const once = rotateRealized({ wall: 1.6, compartments: [], spacers: [sp] }, outer);
    expect(at(once.spacers, 0)).toMatchObject({ w: 92.5, d: 30, rotated: true });
    expect(at(once.spacers, 0).features).toEqual([
      { type: "spacerNotch", axis: "y", at: 52.5, width: 22, depth: 29 },
    ]);
    const twice = rotateRealized(once, { w: outer.d, d: outer.w, h: outer.h });
    expect(at(twice.spacers, 0).features).toEqual([
      { type: "spacerNotch", axis: "x", at: 52.5, width: 22, depth: 29 },
    ]);
  });

  it("maps left/right cutout positions onto the new X axis", () => {
    const synthetic: RealizedTray = {
      wall: 1.6,
      spacers: [],
      compartments: [
        {
          x: 10,
          y: 20,
          w: 30,
          d: 40,
          floorZ: 1.2,
          kind: "well",
          contents: "x",
          features: [
            { type: "wallCutout", side: "right", at: 35, width: 16, depth: 5, floorNotch: 8 },
            { type: "wallCutout", side: "front", at: 25, width: 16, depth: 5, floorNotch: 0 },
            { type: "scoop", side: "back", r: 5 },
            { type: "cornerRelief", d: 3 },
          ],
        },
      ],
    };
    expect(rotateRealized(synthetic, { w: 100, d: 80, h: 30 }).compartments).toEqual([
      {
        x: 20,
        y: 10,
        w: 40,
        d: 30,
        floorZ: 1.2,
        kind: "well",
        contents: "x",
        features: [
          { type: "wallCutout", side: "back", at: 45, width: 16, depth: 5, floorNotch: 8 },
          { type: "wallCutout", side: "right", at: 25, width: 16, depth: 5, floorNotch: 0 },
          { type: "scoop", side: "left", r: 5 },
          { type: "cornerRelief", d: 3 },
        ],
      },
    ]);
  });

  it("returns to the start after four turns", () => {
    let turned = realized;
    let size = outer;
    for (let i = 0; i < 4; i++) {
      turned = rotateRealized(turned, size);
      size = { w: size.d, d: size.w, h: size.h };
    }
    expect(turned).toEqual(realized);
  });

  describe("geometry invariants", () => {
    const ground: RealizeOptions = { lipped: false, level: 0 };
    const lipped: RealizeOptions = { lipped: true, level: 1 };
    const odd: Settings = {
      ...DEFAULT_SETTINGS,
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, width: 21.77 },
    };
    const cases: [string, TrayPartReq, Settings, RealizeOptions, OuterSize][] = [
      [
        "one deck",
        partOf([cards()], "upright-long|strip|split1"),
        DEFAULT_SETTINGS,
        ground,
        { w: 56.7, d: 119.7, h: 69.2 },
      ],
      [
        "one deck at an outer between whole units",
        partOf([cards()], "upright-long|strip|split1"),
        DEFAULT_SETTINGS,
        ground,
        { w: 56.703, d: 119.708, h: 69.2 },
      ],
      [
        "two rows",
        partOf(
          [
            cards({
              decks: [
                { name: "A", count: 52 },
                { name: "B", count: 30 },
              ],
            }),
          ],
          "upright-long|rows2|split1",
        ),
        DEFAULT_SETTINGS,
        ground,
        { w: 36.7, d: 237.4, h: 69.2 },
      ],
      [
        "bulk with scoop",
        partOf(
          [
            bulk({
              items: [
                { name: "Cubes", count: 30, w: 10, d: 10, h: 10 },
                { name: "Coins", volumeMl: 50 },
              ],
            }),
          ],
          "shallow|strip|split1",
        ),
        DEFAULT_SETTINGS,
        ground,
        { w: 119.18, d: 57.98, h: 40 },
      ],
      [
        "spacer case, lipped",
        partOf([cards()], "upright-long|strip|split1"),
        DEFAULT_SETTINGS,
        lipped,
        { w: 59.9, d: 122.9, h: 75 },
      ],
      [
        "odd finger width (half-unit cut centres)",
        partOf([cards()], "upright-long|strip|split1", odd),
        odd,
        ground,
        { w: 56.71, d: 119.71, h: 69.2 },
      ],
    ];

    it.each(cases)(
      "keeps every invariant after a turn: %s",
      (_name, part, settings, opts, outer) => {
        const fitted = minOuter(part, settings, opts);
        const size: OuterSize = {
          w: Math.max(outer.w, fitted.w),
          d: Math.max(outer.d, fitted.d),
          h: Math.max(outer.h, fitted.h),
        };
        const tray = realizeTray(part, size, settings, opts);
        assertTrayInvariants(tray, size, settings, opts);
        const turnedOuter: OuterSize = { w: size.d, d: size.w, h: size.h };
        const turned = rotateRealized(tray, size);
        assertTrayInvariants(turned, turnedOuter, settings, opts);
        expect(turned.compartments).toHaveLength(tray.compartments.length);
        expect(turned.spacers).toHaveLength(tray.spacers.length);
      },
    );

    it("keeps odd-width finger channels inside the walls through four successive turns", () => {
      const part = partOf([cards()], "upright-long|strip|split1", odd);
      const fitted = minOuter(part, odd, ground);
      const size: OuterSize = { ...fitted, w: fitted.w + 0.01, d: fitted.d + 0.01 };
      let turned = realizeTray(part, size, odd, ground);
      let turnedOuter = size;
      for (const sides of [
        ["front", "back"],
        ["right", "left"],
        ["back", "front"],
        ["left", "right"],
      ]) {
        turned = rotateRealized(turned, turnedOuter);
        turnedOuter = { w: turnedOuter.d, d: turnedOuter.w, h: turnedOuter.h };
        assertTrayInvariants(turned, turnedOuter, odd, ground);
        const cuts = at(turned.compartments, 0).features.filter((f) => f.type === "wallCutout");
        expect(cuts.map((f) => f.side)).toEqual(sides);
      }
    });
  });
});
