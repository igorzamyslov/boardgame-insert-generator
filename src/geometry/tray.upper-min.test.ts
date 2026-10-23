// @vitest-environment node
// src/geometry/tray.upper-min.test.ts
// An upper tray is as low as its groove allows (owner, 2026-10-23: "trays higher than they need to
// be; the height should all go into the riser"): upperTrayMinH, the groove's 2.85 mm and 0.8 mm of
// wall above it (3.65 mm at the defaults), where it was lip.height + 3 mm (5 mm). Built at exactly
// that height with the groove, finger cuts, floor notches, dividers and an engraved name: each
// must plan, build as a closed printable solid with nothing thinner than 0.8 mm, and still sit on
// the lip below.
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { MIN_FEATURE_MM } from "../model/settings";
import { grooveOf, upperTrayMinH } from "../model/lip";
import type { Component, Settings, TraySpec } from "../model/types";
import { minOuter, realizeTray } from "../sizing";
import { bulk, cards, custom, partOf, tiles, withPlainCuts } from "../sizing/test-helpers";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { buildTray } from "./tray";
import { problemsOf, thinSlices } from "./test-build";
import { GEO, compartment, lippedLower, traySpec, traySpecFrom } from "./test-specs";
import type { Mesh } from "./types";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

function solid(mesh: Mesh): Manifold {
  return new m.Manifold(
    new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
  );
}

/** Every height through the groove, its roof, the floor and the wall above it. */
const sliceHeights = (h: number): number[] =>
  Array.from({ length: Math.floor(h / 0.1) }, (_, k) => 0.05 + k * 0.1);

const MIN_H = upperTrayMinH(GEO);

describe("upperTrayMinH: what the groove needs and nothing more", () => {
  it("is the groove's height plus the thinnest wall above it", () => {
    const g = grooveOf(GEO, 1);
    expect(g?.zTop).toBeCloseTo(2.85, 9);
    expect(MIN_H).toBeCloseTo(2.85 + MIN_FEATURE_MM, 9);
    expect(MIN_H).toBeCloseTo(3.65, 9);
  });

  it("follows the lip: its height, thickness and play, and is nothing with the lip off", () => {
    const tall: Settings = { ...GEO, lip: { ...GEO.lip, height: 3 } };
    expect(upperTrayMinH(tall)).toBeCloseTo(0.6 + 3 + 0.25 + MIN_FEATURE_MM, 9);
    const loose: Settings = { ...GEO, fit: 1.4 };
    expect(upperTrayMinH(loose)).toBeGreaterThan(MIN_H);
    expect(upperTrayMinH({ ...GEO, lip: { ...GEO.lip, enabled: false } })).toBe(0);
  });

  it("is the least planTray accepts: a hair less is refused", () => {
    const base = traySpec({
      key: "u:p0:0",
      level: 1,
      w: 60,
      d: 40,
      h: MIN_H,
      compartments: [compartment({ x: 2.56, y: 2.56, w: 54.88, d: 34.88 })],
    });
    expect(() => planTray(base, GEO)).not.toThrow();
    expect(() => planTray({ ...base, h: MIN_H - 0.05 }, GEO)).toThrow(/too small/);
  });
});

describe("a tray at exactly the minimum, with the groove", () => {
  // Two wells with a divider, an exit cut with a floor notch at the front of the first, a cut
  // through the divider between them, a floor 1.2 mm thick and a name on the underside.
  const spec = traySpec({
    key: "u:p0:0",
    level: 1,
    w: 100,
    d: 60,
    h: MIN_H,
    partName: "Cards",
    compartments: [
      compartment({
        x: 2.56,
        y: 2.56,
        w: 45,
        d: 54.88,
        features: [
          {
            type: "wallCutout",
            side: "front",
            at: 25.06,
            width: 22,
            depth: MIN_H - 1.2,
            floorNotch: 8,
          },
          {
            type: "wallCutout",
            side: "right",
            at: 30,
            width: 22,
            depth: MIN_H - 1.2,
            floorNotch: 0,
          },
        ],
      }),
      compartment({ x: 48.76, y: 2.56, w: 48.68, d: 54.88 }),
    ],
  });

  it("plans with its groove, and the cuts keep their wall", () => {
    const plan = planTray(spec, GEO);
    expect(plan.groove).toEqual(grooveOf(GEO, 1));
    expect(plan.compartments[0]?.cuts).toHaveLength(2);
  });

  it("builds a closed printable solid with nothing thinner than 0.8 mm, at every height", () => {
    expect(problemsOf(m, spec, GEO)).toEqual([]);
    const { mesh } = buildTray(m, spec, GEO);
    expect(thinSlices(m, mesh, sliceHeights(MIN_H))).toEqual([]);
  });

  it("leaves 0.8 mm of wall standing above the groove", () => {
    const g = grooveOf(GEO, 1);
    expect(MIN_H - (g?.zTop ?? 0)).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-9);
  });

  it("is refused at the next hundredth of a mm under it", () => {
    expect(() => planTray({ ...spec, h: MIN_H - 0.01 }, GEO)).toThrow(/too small/);
  });

  it("an exit cut without a floor notch is not cut at all here: the wall above the groove stays whole", () => {
    // its bottom would stand under the groove's roof, leaving less than 0.8 mm
    const notchless = {
      ...spec,
      compartments: [
        compartment({
          x: 2.56,
          y: 2.56,
          w: 45,
          d: 54.88,
          features: [
            {
              type: "wallCutout",
              side: "front",
              at: 25.06,
              width: 22,
              depth: MIN_H - 1.2,
              floorNotch: 0,
            },
          ],
        }),
        compartment({ x: 48.76, y: 2.56, w: 48.68, d: 54.88 }),
      ],
    } satisfies TraySpec;
    expect(() => planTray(notchless, GEO)).toThrow(/groove/);
  });
});

describe("what sizing makes at the minimum, built", () => {
  const things: [string, Component, string][] = [
    [
      "a card",
      cards({ storage: "flat", sleeve: "none", decks: [{ name: "D", count: 1 }] }),
      "flat|strip|split1",
    ],
    ["a thin custom piece", custom({ h: 1, count: 1 }), "custom|strip|split1"],
    [
      "bulk with finger cuts",
      bulk({ items: [{ name: "Cubes", count: 6, w: 8, d: 8, h: 2 }], fingerCuts: true }),
      "shallow|strip|split1",
    ],
    [
      "flat tiles",
      tiles({ shape: { type: "rect", w: 15, d: 15 }, thickness: 1, count: 2 }),
      "flat-c1|strip|split1",
    ],
  ];

  for (const lipped of [false, true]) {
    for (const [name, component, variant] of things) {
      it(`${name} in a tray at level 1${lipped ? " that carries a lip too" : ""}`, () => {
        const opts = { lipped, level: 1 };
        const part = partOf([component], variant, GEO);
        const outer = minOuter(part, GEO, opts);
        // it is as low as the groove allows, or the contents ask for more
        expect(outer.h).toBeGreaterThanOrEqual(MIN_H - 1e-9);
        const realized = realizeTray(part, outer, GEO, opts);
        const spec = {
          ...traySpecFrom(realized, outer, opts, GEO, part.trayKey),
          partName: "Cards",
        };
        expect(() => planTray(spec, GEO)).not.toThrow();
        expect(problemsOf(m, spec, GEO)).toEqual([]);
        const { mesh } = buildTray(m, spec, GEO);
        expect(thinSlices(m, mesh, sliceHeights(Math.min(spec.h, 12)))).toEqual([]);
      });
    }
  }

  it("makes a flat card exactly the minimum high: its cuts have a floor notch", () => {
    const card = cards({ storage: "flat", sleeve: "none", decks: [{ name: "D", count: 1 }] });
    const part = partOf([card], "flat|strip|split1", GEO);
    expect(minOuter(part, GEO, { lipped: false, level: 1 }).h).toBeCloseTo(MIN_H, 9);
  });

  it("makes a flat custom piece exactly the minimum high too: its cut has a floor notch, as a card's", () => {
    const part = partOf([custom({ h: 1, count: 1 })], "custom|strip|split1", GEO);
    expect(minOuter(part, GEO, { lipped: false, level: 1 }).h).toBeCloseTo(MIN_H, 9);
  });

  it("makes a piece with a plain finger cut as tall as that cut needs: 0.8 mm above the groove, 0.8 mm deep", () => {
    // a cut with no floor notch that leaves through the wall must keep MIN_FEATURE_MM of wall
    // above the groove's roof; at the minimum height there would be no cut, and no tray. Sizing
    // asks for one only of pieces 20 mm tall and more, so the request is built by hand.
    const plainPiece = (settings: Settings) =>
      withPlainCuts(partOf([custom({ h: 1, count: 1 })], "custom|strip|split1", settings));
    const part = plainPiece(GEO);
    const opts = { lipped: false, level: 1 };
    const outer = minOuter(part, GEO, opts);
    expect(outer.h).toBeCloseTo(MIN_H + MIN_FEATURE_MM, 9);
    const cuts = realizeTray(part, outer, GEO, opts).compartments.flatMap((c) =>
      c.features.flatMap((f) => (f.type === "wallCutout" ? [f] : [])),
    );
    expect(cuts.length).toBeGreaterThan(0);
    for (const cut of cuts) {
      expect(cut.depth).toBeCloseTo(MIN_FEATURE_MM, 9);
    }
    // on the ground (or with the lip off) it is the content that sets the height, as before
    expect(minOuter(part, GEO, { lipped: false, level: 0 }).h).toBeCloseTo(3.2, 9);
    const off: Settings = { ...GEO, lip: { ...GEO.lip, enabled: false } };
    expect(minOuter(plainPiece(off), off, opts).h).toBeCloseTo(3.2, 9);
  });
});

describe("the tray at the minimum on the lip below", () => {
  const upper = traySpec({
    key: "u:p0:0",
    level: 1,
    w: 100,
    d: 60,
    h: MIN_H,
    compartments: [compartment({ x: 2.56, y: 2.56, w: 94.88, d: 54.88 })],
  });
  const interference = (dx: number, dy: number): number => {
    const a = solid(buildTray(m, lippedLower, GEO).mesh);
    const b = solid(buildTray(m, upper, GEO).mesh).translate([dx, dy, lippedLower.h]);
    return a.intersect(b).volume();
  };

  it("touches only on the rim, with lip.play to each side", () => {
    expect(interference(0, 0)).toBeLessThan(1e-3);
    const play = GEO.lip.play;
    expect(interference(play - 0.01, 0)).toBeLessThan(1e-3);
    expect(interference(0, -(play - 0.01))).toBeLessThan(1e-3);
    expect(interference(play + 0.05, 0)).toBeGreaterThan(0.01);
  });

  it("stands flush, the lip's tip inside the groove with the roof above it", () => {
    const { mesh } = buildTray(m, upper, GEO);
    let top = 0;
    for (let i = 2; i < mesh.positions.length; i += 3) {
      top = Math.max(top, mesh.positions[i] ?? 0);
    }
    expect(top).toBeCloseTo(MIN_H, 6);
  });
});
