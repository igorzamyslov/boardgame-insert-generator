// @vitest-environment node
// src/geometry/tray.flat-custom.test.ts
// Flat custom items and short figures ask for the full-depth finger cut with a floor notch, as
// flat cards and tiles do (investigation "getting contents out", 2026-10-23): a half-deep cut left
// a 2 mm board below the cut, and on a low upper tray a plain cut is capped at 0.8 mm above the
// groove. Built from what sizing makes: each part plans, builds as a closed printable solid with
// nothing thinner than 0.8 mm, has the notch in its floor, and keeps its underside name clear.
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { upperTrayMinH } from "../model/lip";
import type { Component, TraySpec } from "../model/types";
import { minOuter, realizeTray } from "../sizing";
import { custom, minis, partOf } from "../sizing/test-helpers";
import { planUnderside } from "./engrave";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { notchFloorBox } from "./plan-cuts";
import { buildTray } from "./tray";
import { problemsOf, thinSlices } from "./test-build";
import { GEO, traySpecFrom } from "./test-specs";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const sliceHeights = (h: number): number[] =>
  Array.from({ length: Math.floor(h / 0.1) }, (_, k) => 0.05 + k * 0.1);

const MIN_H = upperTrayMinH(GEO);

function specOf(component: Component, variant: string, opts: { lipped: boolean; level: number }) {
  const part = partOf([component], variant, GEO);
  const outer = minOuter(part, GEO, opts);
  const realized = realizeTray(part, outer, GEO, opts);
  return { outer, spec: { ...traySpecFrom(realized, outer, opts, GEO, part.trayKey) } };
}

const cutsOf = (spec: TraySpec) =>
  spec.compartments.flatMap((c) => c.features.flatMap((f) => (f.type === "wallCutout" ? [f] : [])));

const things: [string, Component, string][] = [
  [
    "two 2 mm boards in a 3 mm well",
    custom({ name: "Boards", w: 60, d: 40, h: 2, count: 2, clearance: 1 }),
    "custom|strip|split1",
  ],
  ["a 10 mm dial", custom({ w: 40, d: 30, h: 10, count: 2 }), "custom|strip|split1"],
  [
    "a 12 mm figure",
    minis({ figures: [{ name: "Pawn", w: 20, d: 20, h: 12, count: 3 }] }),
    "standing|strip|split1",
  ],
];

describe("a flat custom item or short figure: the notched cut, built", () => {
  for (const [name, component, variant] of things) {
    for (const [level, lipped] of [
      [0, false],
      [0, true],
      [1, false],
      [1, true],
    ] as const) {
      it(`${name}, level ${level}${lipped ? ", lipped" : ""}: plans, builds printable, notched`, () => {
        const { outer, spec } = specOf(component, variant, { lipped, level });
        expect(outer.h).toBeGreaterThanOrEqual(level === 0 ? 0 : MIN_H - 1e-9);
        const cuts = cutsOf(spec);
        expect(cuts.length).toBeGreaterThan(0);
        for (const cut of cuts) {
          // every cut has its notch and goes the whole depth of its well
          expect(cut.floorNotch).toBeGreaterThan(0);
          const well = spec.compartments.find((c) => c.features.includes(cut));
          expect(cut.depth).toBeCloseTo(spec.h - (well?.floorZ ?? 0), 6);
        }
        const plan = planTray(spec, GEO);
        for (const p of plan.compartments) {
          expect(p.cuts.every((c) => c.notch > 0)).toBe(true);
        }
        expect(problemsOf(m, { ...spec, partName: "Dial" }, GEO)).toEqual([]);
        const { mesh } = buildTray(m, spec, GEO);
        expect(thinSlices(m, mesh, sliceHeights(Math.min(spec.h, 12)))).toEqual([]);
      });
    }
  }

  it("is a low upper tray no taller than the groove needs: its cut is notched, a plain one would not fit", () => {
    const { outer, spec } = specOf(custom({ h: 1, count: 1 }), "custom|strip|split1", {
      lipped: false,
      level: 1,
    });
    // a plain cut asked for 4.45 mm of tray (0.8 mm of wall above the groove); this one is 3.65
    expect(outer.h).toBeCloseTo(MIN_H, 9);
    expect(planTray(spec, GEO).groove).not.toBeNull();
    const plain = {
      ...spec,
      compartments: spec.compartments.map((c) => ({
        ...c,
        features: c.features.map((f) => (f.type === "wallCutout" ? { ...f, floorNotch: 0 } : f)),
      })),
    };
    expect(() => planTray(plain, GEO)).toThrow(/groove/);
  });

  it("takes material out of the floor under the item: the notch is in the mesh", () => {
    const [, board, variant] = things[0] as [string, Component, string];
    const { spec } = specOf(board, variant, { lipped: false, level: 0 });
    const without = {
      ...spec,
      compartments: spec.compartments.map((c) => ({
        ...c,
        features: c.features.map((f) => (f.type === "wallCutout" ? { ...f, floorNotch: 0 } : f)),
      })),
    };
    const a = buildTray(m, spec, GEO).volumeMm3;
    const b = buildTray(m, without, GEO).volumeMm3;
    // a half-disc of 12.5 mm radius through the floor, for each of the two boards' wells
    expect(b - a).toBeGreaterThan(50);
  });
});

describe("the underside name keeps clear of the notches", () => {
  for (const [name, component, variant] of things) {
    it(`${name}: the name is left off or lies clear of every notch`, () => {
      const { spec } = specOf(component, variant, { lipped: false, level: 0 });
      const plan = planTray(spec, GEO);
      const under = planUnderside(plan, "Dial");
      if (under !== null) {
        const half = (under.box.x1 - under.box.x0) / 2;
        const across = (under.box.y1 - under.box.y0) / 2;
        for (const p of plan.compartments) {
          for (const cut of p.cuts) {
            if (cut.notch <= 0) {
              continue;
            }
            const n = notchFloorBox(cut);
            const clearX = n.x0 > under.cx + half || n.x1 < under.cx - half;
            const clearY = n.y0 > under.cy + across || n.y1 < under.cy - across;
            expect(clearX || clearY).toBe(true);
          }
        }
      }
      expect(problemsOf(m, { ...spec, partName: "Dial" }, GEO)).toEqual([]);
    });
  }
});
