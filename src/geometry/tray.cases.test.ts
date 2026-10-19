// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM, applyFingerRoom } from "../model/settings";
import { alongX, axes } from "../model/cut-rules";
import type { Component, Settings, TraySpec } from "../model/types";
import { minOuter, realizeTray, size } from "../sizing";
import { at, bulk, cards, custom, partOf, tiles } from "../sizing/test-helpers";
import { loadManifold } from "./load";
import { filletStrip } from "./plan-cuts";
import { planTray } from "./plan";
import type { Rect, TrayPlan } from "./plan-types";
import { heightAt } from "./test-mesh";
import { problemsOf, thinSlices } from "./test-build";
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
    // The middle of each 3 mm post, in the wall beside the well's face: the wall stands to the
    // rim there, less what the 3 mm top fillet rounds off (spec §6.1: at the rim the fillet may
    // round a post into its wall; 3 − √(9 − 1.5²) ≈ 0.4 mm at its middle).
    for (const c of spec.compartments) {
      for (const f of c.features) {
        if (f.type !== "wallCutout") {
          continue;
        }
        const across = f.side === "left" || f.side === "right";
        const [lo, hi] = across ? [c.y, c.y + c.d] : [c.x, c.x + c.w];
        const face = { front: c.y, back: c.y + c.d, left: c.x, right: c.x + c.w }[f.side];
        const into = f.side === "front" || f.side === "left" ? -0.4 : 0.4;
        for (const u of [lo + 1.5, hi - 1.5]) {
          const [x, y] = across ? [face + into, u] : [u, face + into];
          const top = heightAt(mesh, x, y);
          expect(top, `${f.side} post of the well at ${c.x}, ${c.y}`).toBeGreaterThan(
            spec.h - 0.45,
          );
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

// Planned trays of sizing's output, and the boxes the cuts' top fillets round: beside each side of
// each cut, its fillet's radius along it, across its fillet strip.
function plannedTrays(
  component: Component,
  variantId: string,
  settings: Settings = DEFAULT_SETTINGS,
) {
  const part = partOf([component], variantId);
  return SWEEP_OPTIONS.map((opts) => {
    const outer = minOuter(part, settings, opts);
    const realized = realizeTray(part, outer, settings, opts);
    const spec = traySpecFrom(realized, outer, opts, settings, part.trayKey);
    return { opts, spec, plan: planTray(spec, settings) };
  });
}
function filletBoxes(plan: TrayPlan, spec: TraySpec): Rect[] {
  return plan.compartments.flatMap((c) =>
    c.cuts.flatMap((cut) => {
      const { v0, v1 } = filletStrip(cut, spec, plan.lip);
      const { u0, u1 } = axes(cut, cut.side);
      const [r0, r1] = cut.topFillets;
      return [
        [u0 - r0, u0],
        [u1, u1 + r1],
      ].map(([a = 0, b = 0]) =>
        alongX(cut.side) ? { x0: a, x1: b, y0: v0, y1: v1 } : { x0: v0, x1: v1, y0: a, y1: b },
      );
    }),
  );
}
const gapTo = (r: { cx: number; cy: number; r: number }, box: Rect): number =>
  Math.hypot(Math.max(box.x0 - r.cx, 0, r.cx - box.x1), Math.max(box.y0 - r.cy, 0, r.cy - box.y1)) -
  r.r;
const squareTiles = (cornerReliefs?: boolean) =>
  tiles({
    shape: { type: "rect", w: 15, d: 15 },
    thickness: 2,
    count: 40,
    ...(cornerReliefs === undefined ? {} : { cornerReliefs }),
  });

describe("corner reliefs beside the posts of a cut", () => {
  // A relief takes precedence over a top fillet (spec §6.1): at a well corner beside a cut's post
  // it keeps MIN_FEATURE_MM from the cut (so the post keeps 0.8 mm), and the fillet keeps that
  // from the relief. 15 mm squares laid flat (reliefs on by default) have 3 mm posts; two upright
  // decks of 20 × 25 mm cards with reliefs turned on, too, beside a channel as wide as they allow.
  const decks = cards({
    cornerReliefs: true,
    shortSide: 20,
    longSide: 25,
    decks: [
      { name: "A", count: 30 },
      { name: "B", count: 30 },
    ],
  });
  it.each<[string, Component, string]>([
    ["15 mm squares laid flat", squareTiles(), "flat-c4|strip|split1"],
    ["upright mini decks with reliefs on", decks, "upright-long|strip|split1"],
  ])("%s", (_name, component, variantId) => {
    for (const { opts, spec, plan } of plannedTrays(component, variantId)) {
      const cuts = plan.compartments.flatMap((c) => c.cuts);
      const fillets = filletBoxes(plan, spec).filter(
        (box) => box.x1 - box.x0 > 0 && box.y1 - box.y0 > 0,
      );
      let atPosts = 0;
      for (const c of plan.compartments) {
        for (const r of c.reliefs) {
          const toCut = Math.min(...cuts.map((cut) => gapTo(r, cut)));
          expect(toCut).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-6);
          for (const box of fillets) {
            expect(gapTo(r, box)).toBeGreaterThanOrEqual(MIN_FEATURE_MM - 1e-6);
          }
          // Shrunk below its Ø 3 mm for a post, and kept (not vacuous).
          atPosts += toCut < 3 && r.r < 1.5 - 1e-6 ? 1 : 0;
        }
      }
      expect(atPosts, JSON.stringify(opts)).toBeGreaterThan(0);
      expect(problemsOf(m, spec, DEFAULT_SETTINGS), JSON.stringify(opts)).toEqual([]);
    }
  });
});

describe("top fillets on interior dividers (review 3, M2)", () => {
  // Sample 25: the dividers' strips lie clear of the outer corners' arcs.
  const through = (plan: TrayPlan) =>
    plan.compartments.flatMap((c) => c.cuts.filter((cut) => cut.into !== null));

  it("rounds the dividers' cuts with the full 3 mm when the tiles have no corner reliefs", () => {
    const { plan } = at(plannedTrays(squareTiles(false), "flat-c4|strip|split1"), 0);
    expect(through(plan).length).toBeGreaterThan(0);
    for (const cut of through(plan)) {
      expect(cut.topFillets).toEqual([3, 3]);
    }
  });

  it("keeps the reliefs at the posts and shrinks the fillets beside them (relief first)", () => {
    const { spec, plan } = at(plannedTrays(squareTiles(), "flat-c4|strip|split1"), 0);
    expect(plan.compartments.every((c) => c.reliefs.length === 4)).toBe(true);
    const radii = through(plan).flatMap((cut) => cut.topFillets);
    expect(radii.every((r) => r > 0 && r < 3)).toBe(true);
    const reliefs = plan.compartments.flatMap((c) => c.reliefs);
    for (const box of filletBoxes(plan, spec)) {
      expect(Math.min(...reliefs.map((r) => gapTo(r, box)))).toBeGreaterThanOrEqual(
        MIN_FEATURE_MM - 1e-6,
      );
    }
  });
});

describe("no piece thinner than 0.8 mm near the rim (review 3, M1)", () => {
  // The top fillets and reliefs are the subject, so the trays are built without the rim between
  // layers (on by default now): an upper tray's groove is not what these slices look at.
  const NO_RIM: Settings = {
    ...DEFAULT_SETTINGS,
    lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
  };
  // checkPrintability sees faces only; slicing finds thin solid between sloped faces, such as a
  // top fillet meeting a corner relief at a post (0.04 mm wide at h − 0.2). With reliefs on, the
  // relief stays and the fillet beside it is smaller; with them off, the fillet is 3 mm.
  const below = (h: number) => [0.1, 0.2, 0.4, 0.8, 1.5, 2.5, 3.5].map((t) => h - t);
  const wells = (cornerReliefs: boolean) =>
    custom({ w: 16, d: 16, h: 20, count: 3, cornerReliefs });
  it.each<[string, Component, string, boolean]>([
    ["three 16 mm custom wells, reliefs on", wells(true), "custom|strip|split1", true],
    ["three 16 mm custom wells, reliefs off", wells(false), "custom|strip|split1", false],
    [
      "15 mm squares laid flat (sample 25), reliefs on",
      squareTiles(),
      "flat-c4|strip|split1",
      true,
    ],
    ["15 mm squares laid flat, reliefs off", squareTiles(false), "flat-c4|strip|split1", false],
  ])("%s", (_name, component, variantId, reliefs) => {
    for (const { opts, spec, plan } of plannedTrays(component, variantId, NO_RIM)) {
      const radii = plan.compartments.flatMap((c) => c.cuts.flatMap((cut) => cut.topFillets));
      expect(plan.compartments.some((c) => c.reliefs.length > 0)).toBe(reliefs);
      if (reliefs && !opts.lipped) {
        expect(radii.some((r) => r > 0 && r < 3 - 1e-6)).toBe(true);
      }
      const { mesh } = buildTray(m, spec, NO_RIM);
      // Below the rim: the lip's chamfered top is 0.6 mm wide by design (spec §6.1).
      expect(thinSlices(m, mesh, below(spec.h)), JSON.stringify(opts)).toEqual([]);
    }
  });
});
