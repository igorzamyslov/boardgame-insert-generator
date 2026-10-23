// @vitest-environment node
// src/geometry/tray.dip.test.ts
// A finger dip (FeatureSpec "fingerDip", geometry 0.9.3): a U cut from the top of a solid filler
// where it touches a tray. Built on a plain filler, a thin strip (cut across), an upper-level
// filler with the groove or the step at its foot, and a merged part: each a closed solid (genus 0)
// of the part's own size that prints without a single overhang, and a dip leaves a neighbour alone.
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { printMesh } from "../app/exportBuild";
import { mergeParts } from "../layout/merge";
import { printableParts } from "../layout/printable";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { dipDepth, edgeTopOf, fingerDipsOf } from "../model/finger-dip";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM } from "../model/settings";
import type { FeatureSpec, Settings, TraySpec } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { checkPrintability } from "./printability";
import { problemsOf } from "./test-build";
import { bounds, signedVolume, topology } from "./test-mesh";
import { buildTray } from "./tray";
import type { Mesh } from "./types";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const WIDTH = DEFAULT_SETTINGS.fingerPocket.width;
const RIM: Settings = DEFAULT_SETTINGS;
const STEP: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, kind: "step" } };
const NO_LIP: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, enabled: false } };

const dip = (
  side: "front" | "back" | "left" | "right",
  at: number,
  depth: number,
): FeatureSpec => ({
  type: "fingerDip",
  side,
  at,
  width: WIDTH,
  depth,
});

const filler = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({
    key: "leftover:0",
    part: "leftover",
    path: "",
    stack: 5,
    x: 0,
    y: 0,
    z: 0,
    w: 60,
    d: 40,
    h: 35,
    solid: true,
    ...o,
  });

function solidOf(mesh: Mesh): Manifold {
  return new m.Manifold(
    new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
  );
}

/** The area of the part's horizontal slice at height z (the outer ring less the holes). */
function sliceArea(mesh: Mesh, z: number): number {
  const s = solidOf(mesh);
  const cross = s.slice(z);
  const rings = cross.toPolygons();
  s.delete();
  cross.delete();
  return rings.reduce(
    (sum, ring) =>
      sum +
      ring.reduce((a, [x, y], i) => {
        const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
        return a + (x * y2 - x2 * y) / 2;
      }, 0),
    0,
  );
}

/**
 * How much of the slice at `z` a U dip of this width and depth takes out, per mm of its length:
 * the chord of its round bottom (radius width / 2, lowest `depth` under the top).
 */
function chord(depth: number, z: number, h: number): number {
  const r = WIDTH / 2;
  const centre = h - depth + r;
  return 2 * Math.sqrt(Math.max(0, r * r - (centre - z) ** 2));
}

describe("a finger dip on a plain filler", () => {
  const spec = filler({ features: [dip("front", 30, 17.5)] });

  it("plans a U that runs in 15 mm and ends in a post", () => {
    const plan = planTray(spec, NO_LIP);
    expect(plan.dips).toHaveLength(1);
    expect(plan.dips[0]).toMatchObject({
      side: "front",
      through: false,
      x0: 30 - WIDTH / 2,
      x1: 30 + WIDTH / 2,
      y0: 0,
      y1: 15,
      bottomZ: 35 - 17.5,
      radius: WIDTH / 2,
    });
  });

  it("builds a closed solid of the part's size, genus 0, that prints with no overhang", () => {
    expect(problemsOf(m, spec, NO_LIP)).toEqual([]);
    const { mesh, volumeMm3 } = buildTray(m, spec, NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    const plain = buildTray(m, filler(), NO_LIP);
    expect(volumeMm3).toBeLessThan(plain.volumeMm3);
  });

  it("takes the U's chord out of the slices, in from the face only as far as the dip runs", () => {
    const { mesh } = buildTray(m, spec, NO_LIP);
    const plain = buildTray(m, filler(), NO_LIP).mesh;
    for (const z of [22, 27, 32]) {
      const taken = sliceArea(plain, z) - sliceArea(mesh, z);
      expect(taken / (chord(17.5, z, 35) * 15)).toBeGreaterThan(0.97);
      expect(taken / (chord(17.5, z, 35) * 15)).toBeLessThan(1.03);
    }
    // below the bottom of the dip the part is whole
    expect(sliceArea(mesh, 16)).toBeCloseTo(sliceArea(plain, 16), 3);
  });

  it("opens on the face it names, for each of the four sides", () => {
    for (const [side, at] of [
      ["front", 30],
      ["back", 30],
      ["left", 20],
      ["right", 20],
    ] as const) {
      const s = filler({ w: 60, d: 60, features: [dip(side, at, 15)] });
      expect(problemsOf(m, s, NO_LIP)).toEqual([]);
      const open = planTray(s, NO_LIP).dips[0];
      expect(open?.side).toBe(side);
    }
  });
});

describe("a finger dip on a thin strip", () => {
  const spec = filler({ w: 90, d: 9.6, h: 15.2, features: [dip("front", 40, 7.6)] });

  it("is cut across the whole strip and open on both faces", () => {
    const plan = planTray(spec, NO_LIP);
    expect(plan.dips[0]).toMatchObject({ through: true, y0: 0, y1: 9.6 });
  });

  it("builds closed, genus 0 and printable, the strip whole under the dip", () => {
    expect(problemsOf(m, spec, NO_LIP)).toEqual([]);
    const { mesh } = buildTray(m, spec, NO_LIP);
    const plain = buildTray(m, filler({ w: 90, d: 9.6, h: 15.2 }), NO_LIP).mesh;
    const z = 15.2 - 7.6 + 5;
    const taken = sliceArea(plain, z) - sliceArea(mesh, z);
    expect(taken / (chord(7.6, z, 15.2) * 9.6)).toBeGreaterThan(0.97);
    expect(taken / (chord(7.6, z, 15.2) * 9.6)).toBeLessThan(1.03);
    // the strip stays one piece: its floor under the dip is whole
    expect(sliceArea(mesh, 15.2 - 7.6 - 0.5)).toBeCloseTo(sliceArea(plain, 15.2 - 7.6 - 0.5), 3);
  });
});

describe("a finger dip on a filler in an upper stack level", () => {
  // The groove (rim) or the slab (step) at its foot: the dip stops MIN_FEATURE_MM over its top.
  const upper = (o: Partial<TraySpec> = {}): TraySpec =>
    filler({ level: 1, z: 20, w: 80, d: 9.64, h: 7.4, stack: 0, ...o });

  it.each([
    ["the rim and groove", RIM],
    ["the stepped base", STEP],
  ])("with %s: builds closed, genus 0 and printable", (_name, settings) => {
    const depth = dipDepth(7.4, edgeTopOf(settings, 1), 7.4);
    expect(depth).toBeGreaterThanOrEqual(3);
    const spec = upper({ features: [dip("front", 40, depth)] });
    expect(problemsOf(m, spec, settings)).toEqual([]);
    const { mesh } = buildTray(m, spec, settings);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    // the dip is really cut: half a millimetre over its bottom (the mesh stands on its slab)
    const lift = planTray(spec, settings).step?.height ?? 0;
    const z = 7.4 - depth + lift + 0.5;
    const plain = buildTray(m, upper(), settings).mesh;
    expect(sliceArea(plain, z) - sliceArea(mesh, z)).toBeGreaterThan(5);
  });

  it.each([
    ["the rim and groove", RIM],
    ["the stepped base", STEP],
  ])(
    "with %s: refuses a dip that leaves under MIN_FEATURE_MM above the foot",
    (_name, settings) => {
      const top = edgeTopOf(settings, 1);
      // a hundredth too deep
      const depth = Math.round((7.4 - (top + MIN_FEATURE_MM)) * 100) / 100 + 0.02;
      expect(() => planTray(upper({ features: [dip("front", 40, depth)] }), settings)).toThrow(
        /wall and floor/,
      );
      // and the deepest one is accepted
      const most = Math.floor((7.4 - (top + MIN_FEATURE_MM)) * 100) / 100;
      expect(() => planTray(upper({ features: [dip("front", 40, most)] }), settings)).not.toThrow();
    },
  );

  it("a deeper filler takes the dip to half its height", () => {
    const spec = upper({ h: 15.2, features: [dip("back", 40, 7.6)] });
    expect(problemsOf(m, spec, RIM)).toEqual([]);
    expect(problemsOf(m, spec, STEP)).toEqual([]);
  });
});

describe("planTray's rules for a dip", () => {
  const plan = (s: TraySpec, settings: Settings = NO_LIP): unknown => planTray(s, settings);

  it("is only for a solid filler", () => {
    const f = [dip("front", 30, 10)];
    expect(() => plan(filler({ part: "riser", features: f }))).toThrow(/solid spacer/);
    expect(() => plan(filler({ part: "tray", features: f }))).toThrow(/solid spacer/);
    expect(() => plan(filler({ solid: false, features: f }))).toThrow(/solid spacer/);
  });

  it("is a feature this geometry version builds", async () => {
    const { KNOWN_FEATURE_TYPES } = await import("./types");
    expect(KNOWN_FEATURE_TYPES).toContain("fingerDip");
  });

  it("must lie on the part and keep wall beside it", () => {
    expect(() => plan(filler({ features: [dip("front", 90, 10)] }))).toThrow(
      /not centred on the spacer/,
    );
    // its side a millimetre from the end of the face leaves no wall beside it
    expect(() => plan(filler({ features: [dip("front", WIDTH / 2 + 1, 10)] }))).toThrow();
  });

  it("is narrower than the narrowest cut or invalid: refused", () => {
    const narrow: FeatureSpec = { type: "fingerDip", side: "front", at: 30, width: 4, depth: 10 };
    expect(() => plan(filler({ features: [narrow] }))).toThrow(/narrower/);
    const bad: FeatureSpec = { type: "fingerDip", side: "front", at: 30, width: WIDTH, depth: -1 };
    expect(() => plan(filler({ features: [bad] }))).toThrow(/invalid finger dip/);
  });

  it("stands away from another dip on the same part", () => {
    const f = filler({ w: 120, features: [dip("front", 40, 10), dip("front", 60, 10)] });
    expect(() => plan(f)).toThrow(/less than 0.8 mm apart/);
    const ok = filler({ w: 120, features: [dip("front", 40, 10), dip("front", 80, 10)] });
    expect(() => plan(ok)).not.toThrow();
  });

  it("is a compartment's business no more than a notch is", () => {
    const s = filler({
      solid: false,
      compartments: [
        {
          x: 1.6,
          y: 1.6,
          w: 56.8,
          d: 36.8,
          floorZ: 1.2,
          kind: "spare",
          contents: "",
          features: [dip("front", 30, 10)],
        },
      ],
    });
    expect(() => plan(s)).toThrow(/no compartment feature/);
  });
});

describe("a finger dip in a merged part", () => {
  const GAP = DEFAULT_SETTINGS.trayGap;
  // Two strips one behind the other, a tray gap apart: one merged part, a bridge between them.
  const members = (): TraySpec[] => [
    filler({ key: "leftover:0", x: 0, y: 0, w: 40, d: 60 }),
    filler({ key: "leftover:1", x: 0, y: 60 + GAP, w: 40, d: 60, stack: 6 }),
  ];
  const merged = (parts: TraySpec[]): TraySpec => {
    const out = mergeParts(parts, { settings: NO_LIP, printer: TEST_PRINTER }).find(
      (p) => p.merged,
    );
    expect(out).toBeDefined();
    return out as TraySpec;
  };
  const withDip = (spec: TraySpec, member: number, f: FeatureSpec): TraySpec => ({
    ...spec,
    merged: {
      ...(spec.merged as NonNullable<TraySpec["merged"]>),
      members: (spec.merged?.members ?? []).map((p, i) =>
        i === member ? { ...p, features: [f] } : p,
      ),
    },
  });

  it("builds closed, genus 0 and printable as it stands, taken out of its own member", () => {
    const plain = merged(members());
    // on the first strip's front face, which no bridge touches
    const spec = withDip(plain, 0, dip("front", 20, 17.5));
    const built = buildTray(m, spec, NO_LIP);
    const whole = buildTray(m, plain, NO_LIP);
    expect(topology(built.mesh)).toMatchObject({ closed: true, genus: 0 });
    const b = bounds(built.mesh);
    expect(b.max[0]).toBeCloseTo(plain.w, 2);
    expect(b.max[1]).toBeCloseTo(plain.d, 2);
    expect(b.max[2]).toBeCloseTo(plain.h, 2);
    expect(checkPrintability(printMesh(spec, built.mesh))).toMatchObject({
      ok: true,
      overhangTriangles: 0,
    });
    expect(signedVolume(built.mesh)).toBeCloseTo(built.volumeMm3, 0);
    // the dip runs 15 mm in from the face
    const z = 35 - 17.5 + 5;
    const taken = sliceArea(whole.mesh, z) - sliceArea(built.mesh, z);
    expect(taken / (chord(17.5, z, 35) * 15)).toBeGreaterThan(0.97);
    expect(taken / (chord(17.5, z, 35) * 15)).toBeLessThan(1.03);
  });

  it("a dip that meets the bridge never takes it, nor the member behind", () => {
    const plain = merged(members());
    // Forced onto the face the bridge fills: 15 mm in from the first strip's back face, the last
    // 3 mm of the dip are the bridge's (it reaches 3 mm into the strip) and the second strip's.
    // The part keeps both: the dip takes only the 12 mm inside the first strip's own material.
    const spec = withDip(plain, 0, dip("back", 20, 17.5));
    const built = buildTray(m, spec, NO_LIP);
    const whole = buildTray(m, plain, NO_LIP);
    expect(topology(built.mesh)).toMatchObject({ closed: true, genus: 0 });
    const z = 35 - 17.5 + 5;
    const taken = sliceArea(whole.mesh, z) - sliceArea(built.mesh, z);
    const reach = Math.min(DEFAULT_SETTINGS.cornerRadius, 60 / 2);
    expect(taken / (chord(17.5, z, 35) * (15 - reach))).toBeGreaterThan(0.97);
    expect(taken / (chord(17.5, z, 35) * (15 - reach))).toBeLessThan(1.03);
  });
});

describe("the seeds' dipped parts", () => {
  it.each(["harbour-kings", "star-realms"])(
    "%s: every part with a dip builds and prints",
    (name) => {
      const { project } = loadSeed(name);
      const printed = printableParts(project.layout?.trays ?? [], {
        components: project.components,
        settings: project.settings,
        printer: project.printer,
        locks: project.locks,
      }).trays;
      const dipped = printed.filter((p) => fingerDipsOf(p).length > 0);
      expect(dipped.length).toBeGreaterThan(0);
      for (const spec of dipped) {
        const { mesh, volumeMm3 } = buildTray(m, spec, project.settings);
        expect(topology(mesh), spec.key).toMatchObject({ closed: true, genus: 0 });
        expect(Math.abs(signedVolume(mesh) - volumeMm3), spec.key).toBeLessThan(1);
        const b = bounds(mesh);
        expect(b.max[0], spec.key).toBeCloseTo(spec.w, 2);
        expect(b.max[1], spec.key).toBeCloseTo(spec.d, 2);
        expect(b.max[2], spec.key).toBeCloseTo(spec.h, 2);
        const report = checkPrintability(printMesh(spec, mesh));
        expect(report.problems, spec.key).toEqual([]);
        expect(report.overhangTriangles, spec.key).toBe(0);
      }
    },
  );
});
