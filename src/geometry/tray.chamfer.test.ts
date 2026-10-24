// @vitest-environment node
// src/geometry/tray.chamfer.test.ts
// A top chamfer (FeatureSpec "topChamfer", geometry 0.9.8): a 45° chamfer along the top edge of a
// solid filler where it touches a tray. Built on a plain filler (each of the four faces), a thin
// strip (both long edges), an upper-level filler with the groove or the step at its foot, and a
// merged part: each a closed solid (genus 0) of the part's own size that prints without a single
// overhang, and a chamfer leaves a neighbour alone.
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { printMesh } from "../app/exportBuild";
import { addTopChamfers } from "../layout/chamfers";
import { mergeParts } from "../layout/merge";
import { printableParts } from "../layout/printable";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { CHAMFER_MIN_MM, edgeTopOf, topChamfersOf } from "../model/top-chamfer";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM } from "../model/settings";
import type { FeatureSpec, Settings, Side, TraySpec } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { planEngravings } from "./engrave";
import { checkPrintability } from "./printability";
import { problemsOf } from "./test-build";
import { bounds, signedVolume, topology } from "./test-mesh";
import { buildTray } from "./tray";
import type { Mesh } from "./types";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const RIM: Settings = DEFAULT_SETTINGS;
const STEP: Settings = {
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, joint: "step" as const },
};
const NO_LIP: Settings = {
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, joint: "off" as const },
};

const chamfer = (side: Side, from: number, to: number, size = 5): FeatureSpec => ({
  type: "topChamfer",
  side,
  from,
  to,
  size,
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
 * How much of the slice at z a chamfer of this size takes out, per mm of its length: the strip
 * of the face the 45° slope has reached, z less the height the slope starts at.
 */
const reach = (size: number, z: number, h: number): number =>
  Math.max(0, Math.min(size, z - (h - size)));

describe("a top chamfer on a plain filler", () => {
  const spec = filler({ features: [chamfer("front", 10, 50)] });

  it("plans the wedge along the face", () => {
    expect(planTray(spec, NO_LIP).chamfers).toEqual([{ side: "front", a: 10, b: 50, size: 5 }]);
  });

  it("builds a closed solid of the part's size, genus 0, that prints with no overhang", () => {
    expect(problemsOf(m, spec, NO_LIP)).toEqual([]);
    const { mesh, volumeMm3 } = buildTray(m, spec, NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    const b = bounds(mesh);
    expect(b.max[0]).toBeCloseTo(60, 2);
    expect(b.max[1]).toBeCloseTo(40, 2);
    expect(b.max[2]).toBeCloseTo(35, 2);
    expect(volumeMm3).toBeLessThan(buildTray(m, filler(), NO_LIP).volumeMm3);
    expect(Math.abs(signedVolume(mesh) - volumeMm3)).toBeLessThan(1);
  });

  it("takes a wedge out of the slices: the slope's reach times the chamfer's length", () => {
    const { mesh } = buildTray(m, spec, NO_LIP);
    const plain = buildTray(m, filler(), NO_LIP).mesh;
    for (const z of [31, 33, 34.5]) {
      const taken = sliceArea(plain, z) - sliceArea(mesh, z);
      expect(taken / (reach(5, z, 35) * 40)).toBeGreaterThan(0.97);
      expect(taken / (reach(5, z, 35) * 40)).toBeLessThan(1.03);
    }
    // below the slope the part is whole
    expect(sliceArea(mesh, 29)).toBeCloseTo(sliceArea(plain, 29), 3);
  });

  it("is a 45° slope: the top is 5 mm in, the face is cut 5 mm down", () => {
    const { mesh } = buildTray(m, spec, NO_LIP);
    const has = (x: number, y: number, z: number): boolean =>
      Array.from({ length: mesh.positions.length / 3 }, (_, i) => i).some(
        (i) =>
          Math.abs((mesh.positions[i * 3] ?? 0) - x) < 0.02 &&
          Math.abs((mesh.positions[i * 3 + 1] ?? 0) - y) < 0.02 &&
          Math.abs((mesh.positions[i * 3 + 2] ?? 0) - z) < 0.02,
      );
    // at each end of the chamfer: the top edge 5 mm in from the face, the foot of the slope 5 mm down
    for (const x of [10, 50]) {
      expect(has(x, 5, 35), `top at x ${x}`).toBe(true);
      expect(has(x, 0, 30), `foot at x ${x}`).toBe(true);
    }
  });

  it("opens on the face it names, for each of the four sides", () => {
    for (const [side, to] of [
      ["front", 60],
      ["back", 60],
      ["left", 40],
      ["right", 40],
    ] as const) {
      const s = filler({ features: [chamfer(side, 0, to)] });
      expect(problemsOf(m, s, NO_LIP)).toEqual([]);
      expect(planTray(s, NO_LIP).chamfers[0]?.side).toBe(side);
      const { mesh } = buildTray(m, s, NO_LIP);
      expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
      expect(checkPrintability(mesh).overhangTriangles).toBe(0);
      const plain = buildTray(m, filler(), NO_LIP).mesh;
      const taken = sliceArea(plain, 34.5) - sliceArea(mesh, 34.5);
      expect(taken / (reach(5, 34.5, 35) * to)).toBeGreaterThan(0.95);
      expect(taken / (reach(5, 34.5, 35) * to)).toBeLessThan(1.05);
    }
  });

  it("runs out through the end faces when it spans the whole face", () => {
    const { mesh } = buildTray(m, filler({ features: [chamfer("front", 0, 60)] }), NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    // the cut reaches the part's end faces and the rounded corners: nothing is left of the slope
    // standing as a ridge at either end
    const plain = buildTray(m, filler(), NO_LIP).mesh;
    const taken = sliceArea(plain, 34.9) - sliceArea(mesh, 34.9);
    expect(taken).toBeGreaterThan(0.9 * 4.9 * 60 - 20);
  });
});

describe("two chamfered faces that meet at a corner", () => {
  // Owner, 2026-10-24: a face with a tray against it is chamfered end to end, so two such faces
  // run into each other at the corner. Each cuts a plane; what is left is below both, a mitre.
  const W = 60;
  const D = 40;
  const H = 35;
  const spec = filler({ features: [chamfer("front", 0, W), chamfer("left", 0, D)] });
  const plain = (): Mesh => buildTray(m, filler(), NO_LIP).mesh;

  it("builds closed, genus 0, printable, of the part's size", () => {
    expect(problemsOf(m, spec, NO_LIP)).toEqual([]);
    const { mesh, volumeMm3 } = buildTray(m, spec, NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    const b = bounds(mesh);
    expect([b.max[0], b.max[1], b.max[2]].map((v) => Math.round((v ?? 0) * 100) / 100)).toEqual([
      W,
      D,
      H,
    ]);
    expect(Math.abs(signedVolume(mesh) - volumeMm3)).toBeLessThan(1);
  });

  it("is a clean mitre: the top stays a rectangle inset by the slope, with no notch or spike", () => {
    const { mesh } = buildTray(m, spec, NO_LIP);
    // just under the top, what is left is the part's top less a band of `size - 0.05` along the
    // front and left faces; a notch at the corner would take more, a spike or ridge would leave more
    for (const z of [H - 0.05, H - 1, H - 2.5, H - 4.5]) {
      const r = reach(5, z, H);
      const expected = (W - r) * (D - r);
      expect(sliceArea(mesh, z) / expected, `z ${z}`).toBeGreaterThan(0.99);
      expect(sliceArea(mesh, z) / expected, `z ${z}`).toBeLessThan(1.01);
    }
    // the same as two single chamfers cut separately, less their overlap at the corner
    const front = buildTray(m, filler({ features: [chamfer("front", 0, W)] }), NO_LIP).mesh;
    const left = buildTray(m, filler({ features: [chamfer("left", 0, D)] }), NO_LIP).mesh;
    const z = H - 2;
    const r = reach(5, z, H);
    const both =
      sliceArea(plain(), z) -
      (sliceArea(plain(), z) - sliceArea(front, z)) -
      (sliceArea(plain(), z) - sliceArea(left, z)) +
      r * r;
    expect(sliceArea(mesh, z) / both).toBeGreaterThan(0.99);
    expect(sliceArea(mesh, z) / both).toBeLessThan(1.01);
  });

  it("is clean at the other three corners, and with all four faces chamfered", () => {
    const all = filler({
      features: [
        chamfer("front", 0, W),
        chamfer("back", 0, W),
        chamfer("left", 0, D),
        chamfer("right", 0, D),
      ],
    });
    expect(problemsOf(m, all, NO_LIP)).toEqual([]);
    const { mesh } = buildTray(m, all, NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    for (const z of [H - 0.05, H - 2.5]) {
      const r = reach(5, z, H);
      const expected = (W - 2 * r) * (D - 2 * r);
      expect(sliceArea(mesh, z) / expected, `z ${z}`).toBeGreaterThan(0.99);
      expect(sliceArea(mesh, z) / expected, `z ${z}`).toBeLessThan(1.01);
    }
  });

  it("is clean when the two faces have chamfers of different sizes", () => {
    const odd = filler({ features: [chamfer("front", 0, W, 5), chamfer("left", 0, D, 3.2)] });
    expect(problemsOf(m, odd, NO_LIP)).toEqual([]);
    const { mesh } = buildTray(m, odd, NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });
});

describe("a chamfer the layout pass puts on the whole of a face", () => {
  const GAP = DEFAULT_SETTINGS.trayGap;
  const tray = (o: Partial<TraySpec> = {}): TraySpec =>
    traySpec({ key: "t", part: "tray", x: 0, y: 0, z: 0, w: 60, d: 20, h: 35, ...o });

  it("is built along the whole face though the tray's side is a third of it", () => {
    const parts = addTopChamfers([tray(), filler({ x: 60 + GAP, y: 0, w: 40, d: 60, h: 35 })], {
      settings: NO_LIP,
    });
    const spec = parts[1] as TraySpec;
    expect(topChamfersOf(spec).map(({ chamfer: c }) => [c.side, c.from, c.to])).toEqual([
      ["left", 0, 60],
    ]);
    expect(problemsOf(m, spec, NO_LIP)).toEqual([]);
    const { mesh } = buildTray(m, spec, NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    const plain = buildTray(m, filler({ w: 40, d: 60, h: 35 }), NO_LIP).mesh;
    const z = 34.5;
    const taken = sliceArea(plain, z) - sliceArea(mesh, z);
    expect(taken / (reach(5, z, 35) * 60)).toBeGreaterThan(0.97);
    expect(taken / (reach(5, z, 35) * 60)).toBeLessThan(1.03);
  });
});

describe("top chamfers on a thin strip", () => {
  const spec = filler({
    w: 90,
    d: 10,
    h: 15.2,
    features: [chamfer("front", 0, 90, 4.2), chamfer("back", 0, 90, 4.2)],
  });

  it("chamfers both long edges and leaves the top flat between them", () => {
    expect(planTray(spec, NO_LIP).chamfers).toHaveLength(2);
    expect(problemsOf(m, spec, NO_LIP)).toEqual([]);
    const { mesh } = buildTray(m, spec, NO_LIP);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
    // at the very top what is left is the flat: 10 − 2 · 4.2 = 1.6 mm across, 90 long
    const plain = buildTray(m, filler({ w: 90, d: 10, h: 15.2 }), NO_LIP).mesh;
    const z = 15.2 - 0.05;
    const flat = sliceArea(mesh, z);
    const expected = (10 - 2 * (4.2 - 0.05)) * 90;
    expect(flat / expected).toBeGreaterThan(0.9);
    expect(flat / expected).toBeLessThan(1.1);
    expect(sliceArea(mesh, 9)).toBeCloseTo(sliceArea(plain, 9), 3);
  });
});

describe("a top chamfer on a filler in an upper stack level", () => {
  // The groove (rim) or the slab (step) at its foot: the chamfer stops MIN_FEATURE_MM over its top.
  const upper = (o: Partial<TraySpec> = {}): TraySpec =>
    filler({ level: 1, z: 20, w: 80, d: 20, h: 7.4, stack: 0, ...o });

  it.each([
    ["the rim and groove", RIM],
    ["the stepped base", STEP],
  ])("with %s: builds closed, genus 0 and printable", (_name, settings) => {
    const size = Math.floor((7.4 - (edgeTopOf(settings, 1) + MIN_FEATURE_MM)) * 100) / 100;
    expect(size).toBeGreaterThanOrEqual(CHAMFER_MIN_MM);
    const spec = upper({ features: [chamfer("front", 0, 80, size)] });
    expect(problemsOf(m, spec, settings)).toEqual([]);
    const { mesh } = buildTray(m, spec, settings);
    expect(topology(mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(mesh)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });

  it.each([
    ["the rim and groove", RIM],
    ["the stepped base", STEP],
  ])(
    "with %s: refuses a chamfer that leaves under MIN_FEATURE_MM above the foot",
    (_n, settings) => {
      const most = Math.floor((7.4 - (edgeTopOf(settings, 1) + MIN_FEATURE_MM)) * 100) / 100;
      expect(() =>
        planTray(upper({ features: [chamfer("front", 0, 80, most + 0.02)] }), settings),
      ).toThrow(/wall above/);
      expect(() =>
        planTray(upper({ features: [chamfer("front", 0, 80, most)] }), settings),
      ).not.toThrow();
    },
  );
});

describe("planTray's rules for a top chamfer", () => {
  const plan = (s: TraySpec, settings: Settings = NO_LIP): unknown => planTray(s, settings);

  it("is only for a solid filler", () => {
    const f = [chamfer("front", 0, 30)];
    expect(() => plan(filler({ part: "riser", features: f }))).toThrow(/solid spacer/);
    expect(() => plan(filler({ part: "tray", features: f }))).toThrow(/solid spacer/);
    expect(() => plan(filler({ solid: false, features: f }))).toThrow(/solid spacer/);
  });

  it("is a feature this geometry version builds, and the finger dip is gone", async () => {
    const { KNOWN_FEATURE_TYPES } = await import("./types");
    expect(KNOWN_FEATURE_TYPES).toContain("topChamfer");
    expect(KNOWN_FEATURE_TYPES).not.toContain("fingerDip");
  });

  it("must lie on the face, be at least CHAMFER_MIN_MM and be a real stretch", () => {
    expect(() => plan(filler({ features: [chamfer("front", 0, 70)] }))).toThrow(/within the/);
    expect(() => plan(filler({ features: [chamfer("front", 30, 30)] }))).toThrow(/within the/);
    expect(() => plan(filler({ features: [chamfer("front", 0, 30, 2.5)] }))).toThrow(/under 3 mm/);
    expect(() => plan(filler({ features: [chamfer("front", 0, 30, -1)] }))).toThrow(/invalid/);
  });

  it("leaves the top flat across the part: the two faces' chamfers keep CHAMFER_LAND_MM", () => {
    const thin = (a: number, b: number): TraySpec =>
      filler({ w: 60, d: 10, features: [chamfer("front", 0, 60, a), chamfer("back", 0, 60, b)] });
    expect(() => plan(thin(4.2, 4.2))).not.toThrow();
    expect(() => plan(thin(4.3, 4.2))).toThrow(/flat top/);
  });

  it("does not overlap another chamfer on the same face", () => {
    const f = filler({ features: [chamfer("front", 0, 30), chamfer("front", 20, 50)] });
    expect(() => plan(f)).toThrow(/overlap/);
    const ok = filler({ features: [chamfer("front", 0, 20), chamfer("front", 30, 50)] });
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
          features: [chamfer("front", 0, 30)],
        },
      ],
    });
    expect(() => plan(s)).toThrow(/no compartment feature/);
  });
});

describe("the engraved name keeps clear of a chamfer on its face", () => {
  it("moves to a face the chamfer is not on", () => {
    const plain = planEngravings(planTray(filler({ h: 20 }), NO_LIP), "TRADE");
    const cut = planEngravings(
      planTray(filler({ h: 20, features: [chamfer("front", 0, 60)] }), NO_LIP),
      "TRADE",
    );
    expect(plain.walls.map((e) => e.face)).toContain("front");
    expect(cut.walls.map((e) => e.face)).not.toContain("front");
  });
});

describe("the engraved name on a face that is chamfered end to end", () => {
  it("stays on a tall face, below the chamfer's foot, clear of the slope", () => {
    const tall = filler({ h: 35, features: [chamfer("front", 0, 60)] });
    const planned = planEngravings(planTray(tall, NO_LIP), "TRADE");
    expect(planned.walls.map((e) => e.face)).toContain("front");
    // the text is under the foot of the 5 mm slope, so cutting it leaves a closed solid
    const spec = { ...tall, partName: "TRADE" };
    const named = buildTray(m, spec, NO_LIP);
    expect(topology(named.mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(named.volumeMm3).toBeLessThan(buildTray(m, tall, NO_LIP).volumeMm3);
  });
});

describe("a top chamfer in a merged part", () => {
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
  const withChamfer = (spec: TraySpec, member: number, f: FeatureSpec): TraySpec => ({
    ...spec,
    merged: {
      ...(spec.merged as NonNullable<TraySpec["merged"]>),
      members: (spec.merged?.members ?? []).map((p, i) =>
        i === member ? { ...p, features: [f] } : p,
      ),
    },
  });

  it("builds closed, genus 0 and printable as it stands, cut on its own member", () => {
    const plain = merged(members());
    // on the first strip's left face, which no bridge touches
    const spec = withChamfer(plain, 0, chamfer("left", 0, 57));
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
    const z = 34.5;
    const taken = sliceArea(whole.mesh, z) - sliceArea(built.mesh, z);
    // 57 mm of the 60: the bridge to the next strip is not cut
    expect(taken / (reach(5, z, 35) * 57)).toBeGreaterThan(0.95);
    expect(taken / (reach(5, z, 35) * 57)).toBeLessThan(1.05);
  });
});

describe("a top chamfer along each member of a merged part", () => {
  const GAP = DEFAULT_SETTINGS.trayGap;
  const tray = (o: Partial<TraySpec> = {}): TraySpec =>
    traySpec({ key: "t", part: "tray", x: 0, y: 0, z: 0, w: 60, d: 30, h: 35, ...o });
  const strips = (): TraySpec[] => [
    filler({ key: "leftover:0", x: 60 + GAP, y: 0, w: 40, d: 60 }),
    filler({ key: "leftover:1", x: 60 + GAP, y: 60 + GAP, w: 40, d: 60, stack: 6 }),
  ];

  it("runs the whole member, the bridge included, and builds closed, genus 0 and printable", () => {
    // a tray beside the first 30 mm of the first member and 30 mm of the second
    const joined = mergeParts([tray({ key: "a" }), tray({ key: "b", y: 60 + GAP }), ...strips()], {
      settings: NO_LIP,
      printer: TEST_PRINTER,
    });
    const part = addTopChamfers(joined, { settings: NO_LIP }).find((p) => p.merged) as TraySpec;
    expect(part.merged?.bridges.length).toBeGreaterThan(0);
    expect(
      topChamfersOf(part).map(({ part: p, chamfer: c }) => [p.key, c.side, c.from, c.to]),
    ).toEqual([
      ["leftover:0", "left", 0, 60],
      ["leftover:1", "left", 0, 60],
    ]);
    const built = buildTray(m, part, NO_LIP);
    const plain = buildTray(m, joined.find((p) => p.merged) as TraySpec, NO_LIP);
    expect(topology(built.mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(printMesh(part, built.mesh))).toMatchObject({
      ok: true,
      overhangTriangles: 0,
    });
    const z = 34.5;
    const taken = sliceArea(plain.mesh, z) - sliceArea(built.mesh, z);
    expect(taken / (reach(5, z, 35) * 120)).toBeGreaterThan(0.95);
    expect(taken / (reach(5, z, 35) * 120)).toBeLessThan(1.05);
  });
});

describe("a top chamfer at the corner where two spacers meet", () => {
  const GAP = DEFAULT_SETTINGS.trayGap;
  // a spacer across the foot of a tray, and a strip up its side that reaches the spacer's end
  const parts = (): TraySpec[] => [
    traySpec({ key: "t", part: "tray", x: 0, y: 0, z: 0, w: 60, d: 60, h: 35 }),
    filler({ key: "leftover:0", x: 0, y: 60 + GAP, w: 60, d: 20 }),
    filler({ key: "leftover:1", x: 60 + GAP, y: 0, w: 20, d: 80 + GAP }),
  ];

  it("cuts the slope to the end of the spacer's face, over the bridge, and leaves a closed printable part", () => {
    const joined = mergeParts(parts(), { settings: NO_LIP, printer: TEST_PRINTER });
    const part = addTopChamfers(joined, { settings: NO_LIP }).find((p) => p.merged) as TraySpec;
    expect(part.merged?.bridges.length).toBeGreaterThan(0);
    const built = buildTray(m, part, NO_LIP);
    expect(topology(built.mesh)).toMatchObject({ closed: true, genus: 0 });
    expect(checkPrintability(printMesh(part, built.mesh))).toMatchObject({
      ok: true,
      overhangTriangles: 0,
    });
    // the spacer's face toward the tray is the part's front (y = 0 in the part's frame): its slope's
    // triangles (normal at 45° up and out) run the spacer's whole 60 mm, not 57
    const { positions: pos, indices: ix } = built.mesh;
    const at = (i: number): [number, number, number] => [
      pos[(ix[i] as number) * 3] as number,
      pos[(ix[i] as number) * 3 + 1] as number,
      pos[(ix[i] as number) * 3 + 2] as number,
    ];
    const xs: number[] = [];
    for (let i = 0; i < ix.length; i += 3) {
      const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
      const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
      const f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
      const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
      const len = Math.hypot(...(n as [number, number, number]));
      const up = (n[2] as number) / len;
      const out = (n[1] as number) / len;
      if (up > 0.6 && up < 0.8 && out < -0.6 && Math.min(a[2], b[2], c[2]) > 29) {
        xs.push(a[0], b[0], c[0]);
      }
    }
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(60 - 1e-3);
  });
});

describe("the seeds' chamfered parts", () => {
  it.each(["harbour-kings", "star-realms"])(
    "%s: every part with a chamfer builds and prints",
    (name) => {
      const { project } = loadSeed(name);
      const printed = printableParts(project.layout?.trays ?? [], {
        components: project.components,
        settings: project.settings,
        printer: project.printer,
        locks: project.locks,
      }).trays;
      const chamfered = printed.filter((p) => topChamfersOf(p).length > 0);
      expect(chamfered.length).toBeGreaterThan(0);
      for (const spec of chamfered) {
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
