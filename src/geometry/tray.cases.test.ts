// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { DEFAULT_SETTINGS, applyFingerRoom } from "../model/settings";
import type { Component, Settings } from "../model/types";
import { minOuter, realizeTray, size } from "../sizing";
import { at, bulk, cards, partOf, tiles } from "../sizing/test-helpers";
import { loadManifold } from "./load";
import { heightAt } from "./test-mesh";
import { problemsOf } from "./test-build";
import {
  CHAMFER_1,
  SWEEP_OPTIONS,
  THINNEST,
  THIN_WALLS,
  largestChamfer,
  traySpecFrom,
} from "./test-specs";
import { buildTray } from "./tray";

// Real sizing output built into meshes for the cases the reviews found: each must come out as a
// closed, printable solid of its spec's size (problemsOf).

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

describe("buildTray at the thinnest wall and largest chamfer", () => {
  it("keeps 0.8 mm beside a flat-tile cutout that leaves the tray near an outer corner", () => {
    // 15 mm square tiles laid flat: the cut is as long as the 16 mm well, its sides 0.9 mm from the
    // faces they run along (review 1, I1: the arc ended where they met the exit face, 0.784 mm).
    const settings = THINNEST(DEFAULT_SETTINGS);
    const component = tiles({ shape: { type: "rect", w: 15, d: 15 }, thickness: 2, count: 40 });
    const part = partOf([component], "flat-c1|strip|split1", settings);
    const opts = { lipped: false, level: 0 };
    const outer = minOuter(part, settings, opts);
    const realized = realizeTray(part, outer, settings, opts);
    const spec = traySpecFrom(realized, outer, opts, settings, part.trayKey);
    expect(problemsOf(m, spec, settings)).toEqual([]);
  });
});

describe("buildTray with finger room on a cut across the row", () => {
  it("builds a deck kept between bulk compartments, cut through its thicker front and back", () => {
    // A hand-built part: the deck gets no cut along its row, so it is cut through the front and
    // back walls, which take the 10 mm of finger room.
    const settings = applyFingerRoom(DEFAULT_SETTINGS, true);
    const pile = (id: string) =>
      bulk({ id, groupId: "g", items: [{ name: "Pile", volumeMl: 40 }] });
    const deck = cards({
      groupId: "g",
      shortSide: 63,
      longSide: 88,
      decks: [{ name: "D", count: 80 }],
    });
    const sorted = partOf(
      [pile("b1"), deck, pile("b2")],
      "shallow+upright-long+shallow|strip|split1",
      settings,
    );
    const part = { ...sorted, compartments: [1, 0, 2].map((i) => at(sorted.compartments, i)) };
    for (const opts of SWEEP_OPTIONS) {
      const outer = minOuter(part, settings, opts);
      const realized = realizeTray(part, outer, settings, opts);
      const spec = traySpecFrom(realized, outer, opts, settings, part.trayKey);
      const well = at(spec.compartments, 1);
      expect(
        well.features
          .filter((f) => f.type === "wallCutout")
          .map((f) => f.type === "wallCutout" && f.side),
      ).toEqual(["front", "back"]);
      expect(problemsOf(m, spec, settings), JSON.stringify(opts)).toEqual([]);
    }
  });
});

describe("cut sides beside a well's rounded corners, with a floor notch (review 2, C1′)", () => {
  // The repros of review 2: slivers of 0.002–0.114 mm of a well's 0.5 mm corner beside a cut.
  const squares = tiles({ shape: { type: "rect", w: 15, d: 15 }, thickness: 2, count: 40 });
  const smallHexes = tiles({
    shape: { type: "hex", flatToFlat: 8.5, orientation: "flat" },
    thickness: 1.5,
    count: 19,
    storage: "auto",
  });
  const manyDecks = cards({
    shortSide: 57,
    longSide: 87,
    storage: "auto",
    decks: [1, 120, 5, 40, 2, 70].map((count, i) => ({ name: `D${i}`, count })),
  });
  const cases: [string, Component[], Settings, [number, number][]][] = [
    ["15 mm squares, thinnest walls", [squares], THIN_WALLS(DEFAULT_SETTINGS), [[0, 0]]],
    ["15 mm squares, 1 mm chamfer", [squares], CHAMFER_1(DEFAULT_SETTINGS), [[0, 0]]],
    [
      "8.5 mm hexes, 0.9 mm wall and floor at the largest chamfer",
      [smallHexes],
      largestChamfer({ ...DEFAULT_SETTINGS, wall: 0.9, floor: 0.9 }),
      [
        [0, 0],
        [1, 1],
      ],
    ],
    ["many decks, thinnest walls", [manyDecks], THIN_WALLS(DEFAULT_SETTINGS), [[0, 0]]],
    ["many decks, thinnest everything", [manyDecks], THINNEST(DEFAULT_SETTINGS), [[0, 0]]],
  ];
  it.each(cases)("%s", { timeout: 60_000 }, (_name, components, settings, slacks) => {
    const failures: string[] = [];
    for (const req of size(components, settings).requirements) {
      for (const variant of req.variants) {
        for (const part of variant.parts) {
          for (const opts of [
            { lipped: false, level: 0 },
            { lipped: false, level: 1 },
          ]) {
            for (const [dw, dd] of slacks) {
              const min = minOuter(part, settings, opts);
              const outer = { ...min, w: min.w + dw, d: min.d + dd };
              const realized = realizeTray(part, outer, settings, opts);
              const spec = traySpecFrom(realized, outer, opts, settings, part.trayKey);
              const problems = problemsOf(m, spec, settings);
              if (problems.length > 0) {
                failures.push(`${variant.id} L${opts.level} +${dw}: ${problems.join("; ")}`);
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("posts: a cut never removes a whole wall", () => {
  it("keeps full-height posts beside every cut of 15 mm square tiles laid flat (sample 25)", () => {
    const squares = tiles({ shape: { type: "rect", w: 15, d: 15 }, thickness: 2, count: 40 });
    const part = partOf([squares], "flat-c4|strip|split1");
    const opts = { lipped: false, level: 0 };
    const outer = minOuter(part, DEFAULT_SETTINGS, opts);
    const realized = realizeTray(part, outer, DEFAULT_SETTINGS, opts);
    const spec = traySpecFrom(realized, outer, opts, DEFAULT_SETTINGS, part.trayKey);
    const { mesh } = buildTray(m, spec, DEFAULT_SETTINGS);
    expect(problemsOf(m, spec, DEFAULT_SETTINGS)).toEqual([]);
    // The rim stands at full height 0.5…2.5 mm beside each well's corners on the cut walls.
    const top: [number, number][] = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (Math.abs((mesh.positions[i + 2] ?? 0) - spec.h) < 1e-3) {
        top.push([mesh.positions[i] ?? 0, mesh.positions[i + 1] ?? 0]);
      }
    }
    for (const c of spec.compartments) {
      for (const f of c.features) {
        if (f.type !== "wallCutout") {
          continue;
        }
        const across = f.side === "left" || f.side === "right";
        const [lo, hi] = across ? [c.y, c.y + c.d] : [c.x, c.x + c.w];
        const face = { front: c.y, back: c.y + c.d, left: c.x, right: c.x + c.w }[f.side];
        for (const [p0, p1] of [
          [lo + 0.5, lo + 2.5],
          [hi - 2.5, hi - 0.5],
        ]) {
          const post = top.some(([x, y]) => {
            const [u, v] = across ? [y, x] : [x, y];
            return u >= (p0 ?? 0) && u <= (p1 ?? 0) && Math.abs(v - face) < 0.8;
          });
          expect(post, `${f.side} post of the well at ${c.x}, ${c.y}`).toBe(true);
        }
      }
    }
  });
});

describe("buildTray with the finger cut and curved floor toggles", () => {
  const settings = DEFAULT_SETTINGS;
  const built = (component: Component, opts: { lipped: boolean; level: number }) => {
    const part = partOf([component], "shallow|strip|split1", settings);
    const outer = minOuter(part, settings, opts);
    const realized = realizeTray(part, outer, settings, opts);
    const spec = traySpecFrom(realized, outer, opts, settings, part.trayKey);
    return { spec, mesh: buildTray(m, spec, settings).mesh };
  };

  it("builds a plain box with a flat floor and whole walls when both are off", () => {
    for (const opts of SWEEP_OPTIONS) {
      const { spec, mesh } = built(bulk({ fingerCuts: false, curvedFloor: false }), opts);
      const well = at(spec.compartments, 0);
      expect([well.kind, well.features]).toEqual(["well", []]);
      expect(problemsOf(m, spec, settings), JSON.stringify(opts)).toEqual([]);
      for (const fx of [0.1, 0.5, 0.9]) {
        for (const fy of [0.1, 0.5, 0.9]) {
          const [x, y] = [well.x + fx * well.w, well.y + fy * well.d];
          expect(heightAt(mesh, x, y)).toBeCloseTo(well.floorZ, 4);
        }
      }
      const midX = well.x + well.w / 2;
      expect(heightAt(mesh, midX, well.y / 2)).toBeCloseTo(spec.h, 4);
      expect(heightAt(mesh, midX, (well.y + well.d + spec.d) / 2)).toBeCloseTo(spec.h, 4);
    }
  });

  it("builds bulk with finger cuts: a front cut half the bits deep and the scoop at the back", () => {
    for (const opts of SWEEP_OPTIONS) {
      const { spec, mesh } = built(bulk({ fingerCuts: true }), opts);
      const well = at(spec.compartments, 0);
      expect(well.kind).toBe("scoop");
      expect(well.features.map((f) => [f.type, "side" in f ? f.side : null])).toEqual([
        ["wallCutout", "front"],
        ["scoop", "back"],
      ]);
      expect(problemsOf(m, spec, settings), JSON.stringify(opts)).toEqual([]);
      const midX = well.x + well.w / 2;
      expect(heightAt(mesh, midX, well.y / 2)).toBeLessThan(spec.h - 1);
      expect(heightAt(mesh, midX, well.y + well.d - 1)).toBeGreaterThan(well.floorZ + 1);
      expect(heightAt(mesh, midX, well.y + 1)).toBeCloseTo(well.floorZ, 4);
    }
  });
});
