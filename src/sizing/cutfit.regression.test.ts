import { describe, expect, it } from "vitest";
import { planTray } from "../geometry/plan";
import { narrowestCutMm } from "../model/settings";
import type { Component, Settings } from "../model/types";
import { size } from "./group";
import { minOuter, realizeTray } from "./realize";
import { assertTrayInvariants } from "./test-helpers";
import type { RealizeOptions } from "./types";

// Inputs the property "realizes every variant part at a larger outer" found at 8 times its run
// count (CutFitError from realizeTray at an outer larger than minOuter, for a part size() kept
// because it realizes at minOuter). Each is the shrunk counterexample, whole, with the extra
// width it was found at. size() keeps the part only if it gets its cuts at minOuter; slack then
// shifts the compartments by a few hundredths of a millimetre, and these are the shifts that used
// to leave a pocket without a cut.

const BASE = {
  wall: 0.9,
  floor: 0.8,
  divider: 0.8,
  fit: 0.7,
  cardClearance: 1.5,
  cardStackClearance: 1,
  cardStackClearancePct: 0.03,
  cardThickness: 0.32,
  pieceClearance: 1,
  boxClearance: 0.5,
  trayGap: 0.2,
  bottomChamfer: 0,
  cornerRadius: 3,
  scoopRadius: 12,
  lip: { enabled: false, height: 1, thickness: 0.9, ledge: 0.5, play: 0.25 },
  topPressFit: 0,
  packingFactor: 0.5,
  leftover: "spare",
  fillToTop: true,
  wallAbsorb: 0,
  infill: 15,
  playLimit: 1.5,
} as const;

const settings = (over: Partial<Settings> & { width: number }): Settings => {
  const { width, ...rest } = over;
  return {
    ...BASE,
    fingerPocket: { width, floorNotch: 0, wallRoom: 0, dividerRoom: 0 },
    ...rest,
  } as Settings;
};

const minis = (id: string, figures: unknown[], storage: "pockets" | "bulk") =>
  ({
    id,
    name: "Minis",
    access: "often",
    kind: "minis",
    figures,
    storage,
    groupId: "g",
  }) as unknown;
const fig = (w: number, d: number, h: number, count: number) => ({ name: "Fig", w, d, h, count });
const bits = (id: string, count: number) =>
  ({
    id,
    name: "Bits",
    access: "often",
    kind: "bulk",
    items: Array.from({ length: count }, () => ({ name: "Pile", volumeMl: 1 })),
    groupId: "g",
  }) as unknown;

const CASES: [string, Component[], Settings, number][] = [
  [
    // A back-row pocket's centre is the front row's pocket edge (x 2672 hundredths): the cut would
    // run out through the 0.8 mm divider between two wells. One member of a run having no room
    // used to drop the whole run, the pocket's other side included.
    "a pocket whose cut centre falls on the edge of the wells across",
    [
      minis("c0", [fig(10.32, 10, 10, 1), fig(13.3, 10, 10, 4)], "pockets"),
      bits("c1", 3),
    ] as Component[],
    settings({ width: 5.002, fit: 0.7 }),
    29.62,
  ],
  [
    // A back-row pocket exactly as wide as the cut plus its posts (11 mm, 5.00 mm between the
    // posts) twinned with a front-row pocket whose centre is a hundredth off its own: the run took
    // the first pocket's centre, one unit off, and the narrow pocket had no unit to spare.
    "twin pockets one of which has no hundredth to spare",
    [
      minis("c0", [fig(10, 10, 10.02, 2), fig(25.61, 10, 10, 2)], "pockets"),
      minis("c1", [fig(10, 10, 10, 1)], "bulk"),
    ] as Component[],
    settings({ width: 5.002, fit: 1 }),
    13.42,
  ],
  [
    // The same with a 25.63 mm neighbour, its centre half a hundredth off the other way.
    "the same, the neighbour a hundredth wider",
    [
      minis("c0", [fig(10, 10, 10, 2), fig(25.63, 10, 10, 2)], "pockets"),
      minis("c1", [fig(10, 10, 10, 1)], "bulk"),
    ] as Component[],
    settings({ width: 5.002, fit: 1 }),
    13.42,
  ],
  [
    // The seed-1 counterexample of the property at 1 000 runs. A row-1 pocket's channel leaves
    // through the 11 mm gap between two row-2 pockets, which are too narrow for a front or back
    // cut: placed first, it took the only route sideways they had.
    "a channel placed first that strands two narrow pockets",
    [
      minis("c0", [fig(10, 10.01, 10.02, 3), fig(24, 10, 10, 2)], "pockets"),
      minis("c1", [fig(10, 10, 10, 1)], "bulk"),
    ] as Component[],
    settings({
      width: 5.021,
      fit: 1,
      fingerPocket: { width: 5.021, floorNotch: 0, wallRoom: 0, dividerRoom: 6.361 },
    }),
    11.25,
  ],
  [
    // The property's next counterexample once the first was fixed (seed 1, 1 000 runs).
    "a custom well and three figure sizes in pockets, a wide divider room",
    [
      {
        id: "c0",
        name: "Thing",
        kind: "custom",
        access: "often",
        w: 13.95,
        d: 5,
        h: 1,
        count: 1,
        groupId: "g",
      } as unknown,
      minis(
        "c1",
        [fig(13.94, 10, 10, 2), fig(10, 10.01, 10.02, 4), fig(30.2, 10, 10, 3)],
        "pockets",
      ),
      minis("c2", [fig(16.55, 29.51, 29.86, 1)], "bulk"),
    ] as Component[],
    settings({
      width: 5.021,
      fit: 1,
      fingerPocket: { width: 5.021, floorNotch: 0, wallRoom: 0, dividerRoom: 13.941 },
    }),
    29.96,
  ],
];

const ground: RealizeOptions = { lipped: false, level: 0 };

describe.each(CASES)("realizing at a larger outer: %s", (_name, components, s, extraW) => {
  it("gets every pocket its cut at the minimum and at the larger outer", () => {
    const parts = size(components, s).requirements.flatMap((r) =>
      r.variants.flatMap((v) => v.parts),
    );
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      const m = minOuter(part, s, ground);
      for (const outer of [m, { w: m.w + extraW, d: m.d, h: m.h }]) {
        const r = realizeTray(part, outer, s, ground);
        assertTrayInvariants(r, outer, s, ground, part);
      }
    }
  });
});

describe("the narrowest cut", () => {
  it("is the setting rounded up to a hundredth, then down to an even count, under 10 mm", () => {
    expect(narrowestCutMm(5)).toBe(5);
    expect(narrowestCutMm(5.002)).toBe(5);
    expect(narrowestCutMm(5.01)).toBe(5);
    expect(narrowestCutMm(5.02)).toBe(5.02);
    expect(narrowestCutMm(5.021)).toBe(5.02);
    expect(narrowestCutMm(25)).toBe(10);
  });

  it("is what planTray accepts: a cut one hundredth under an odd setting", () => {
    // 5.01 mm setting (501 hundredths) in a 11.00 mm pocket (500 between its posts): the 5.00 mm
    // cut sizing places is accepted, not refused as 0.01 mm narrower than the setting.
    const s = settings({ width: 5.01, fit: 1 });
    const part = size(
      [minis("c0", [fig(10, 10.01, 10, 1)], "pockets")] as Component[],
      s,
    ).requirements.flatMap((r) => r.variants.flatMap((v) => v.parts))[0];
    expect(part).toBeDefined();
    if (part === undefined) {
      return;
    }
    const outer = minOuter(part, s, ground);
    const r = realizeTray(part, outer, s, ground);
    expect(() =>
      planTray(
        {
          key: "t",
          part: "tray",
          path: "",
          stack: 0,
          level: 0,
          x: 0,
          y: 0,
          z: 0,
          ...outer,
          rotated: false,
          wall: Math.max(s.wall, 0.9),
          floor: s.floor,
          lip: false,
          solid: false,
          compartments: r.compartments.map((c) => ({ ...c, kind: c.kind })),
        },
        s,
      ),
    ).not.toThrow();
  });
});
