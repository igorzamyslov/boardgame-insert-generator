// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel, Vec2 } from "manifold-3d";
import { printMesh } from "../app/exportBuild";
import { mergeParts } from "../layout/merge";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { checkPrintability } from "./printability";
import { bounds, signedVolume, topology } from "./test-mesh";
import { quarterSegments } from "./shapes";
import { buildTray } from "./tray";

// A merged part (mergeParts) is built from its members and the bridges that fill the tray gaps
// between them: one closed solid of the bounding box's size, printable as it stands (or, when its
// members stand on different floors, turned upside down) without a single overhang.
let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const WALL = 1.6;
const FLOOR = 1.2;
const GAP = DEFAULT_SETTINGS.trayGap;
// Rim off: a filler in a stack level has a groove with it on, and is not merged.
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
  mergeRisers: true,
};

const filler = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({
    key: "leftover:0",
    part: "leftover",
    path: "0",
    stack: 5,
    h: 35,
    wall: WALL,
    floor: FLOOR,
    solid: true,
    ...o,
  });

const open = (o: Partial<TraySpec> = {}): TraySpec => {
  const f = filler({ solid: false, ...o });
  return {
    ...f,
    compartments: [
      {
        x: WALL,
        y: WALL,
        w: f.w - 2 * WALL,
        d: f.d - 2 * WALL,
        floorZ: FLOOR,
        kind: "spare",
        contents: "",
        features: [],
      },
    ],
  };
};

const riser = (o: Partial<TraySpec> = {}): TraySpec =>
  open({ key: "a:p0:0:riser", part: "riser", path: "", stack: 0, w: 90, d: 60, h: 16.4, ...o });

/** The one merged part of `parts`, built; the mesh as it prints. */
function built(parts: TraySpec[]) {
  const out = mergeParts(parts, { settings, printer: TEST_PRINTER });
  const spec = out.find((p) => p.merged) as TraySpec;
  expect(spec).toBeDefined();
  const { mesh, volumeMm3 } = buildTray(m, spec, settings);
  return { spec, mesh, volumeMm3, printed: printMesh(spec, mesh) };
}

function expectsBuilt(spec: TraySpec, mesh: ReturnType<typeof buildTray>["mesh"]): void {
  const topo = topology(mesh);
  expect(topo.closed).toBe(true);
  const b = bounds(mesh);
  const size = [spec.w, spec.d, spec.h];
  b.max.forEach((v, k) => expect(v).toBeCloseTo(size[k] ?? 0, 2));
  b.min.forEach((v) => expect(v).toBeCloseTo(0, 3));
}

describe("a merged part builds", () => {
  it("two solid strips across the tray gap: one closed solid that prints as it stands", () => {
    const a = filler({ key: "leftover:0", x: 90.2, y: 0, w: 10, d: 100 });
    const b = filler({ key: "leftover:1", x: 90.2, y: 100 + GAP, w: 10, d: 80, stack: 6 });
    const { spec, mesh, volumeMm3, printed } = built([a, b]);
    expectsBuilt(spec, mesh);
    expect(signedVolume(mesh)).toBeCloseTo(volumeMm3, 0);
    // the strips and the gap between them (rounded corners take a little off each end)
    expect(volumeMm3).toBeGreaterThan(10 * 180.2 * 35 * 0.97);
    expect(volumeMm3).toBeLessThanOrEqual(10 * 180.2 * 35);
    expect(spec.merged?.flipped).toBe(false);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });

  it("two open spare trays: the pockets stay, and nothing hangs", () => {
    const a = open({ key: "leftover:0", x: 0, y: 0, w: 60, d: 40 });
    const b = open({ key: "leftover:1", x: 60 + GAP, y: 0, w: 50, d: 40, stack: 6 });
    const { spec, mesh, volumeMm3, printed } = built([a, b]);
    expectsBuilt(spec, mesh);
    // far lighter than the solid block of the same size
    expect(volumeMm3).toBeLessThan(0.3 * 110.2 * 40 * 35);
    expect(checkPrintability(printed).ok).toBe(true);
  });

  it("a riser and a full-height filler: an L in elevation that stands and self-supports", () => {
    const f = filler({ key: "leftover:0", x: 90 + GAP, y: 0, w: 10, d: 60 });
    const { spec, mesh, printed } = built([riser(), f]);
    expectsBuilt(spec, mesh);
    expect(spec.merged?.members.map((p) => p.part)).toEqual(["riser", "leftover"]);
    expect(spec.merged?.flipped).toBe(false);
    // the wall stands the whole height; over the riser the part is 16.4 mm high
    const top = (from: number, to: number): number => {
      let z = 0;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i] ?? 0;
        if (x >= from && x <= to) {
          z = Math.max(z, mesh.positions[i + 2] ?? 0);
        }
      }
      return z;
    };
    expect(top(91, 101)).toBeCloseTo(35, 3);
    expect(top(0, 89)).toBeCloseTo(16.4, 3);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });

  it("a ledge filler in a stack level joins a ground one: printed upside down it self-supports", () => {
    const ground = filler({ key: "leftover:0", x: 0, y: 8.4 + GAP, w: 90, d: 8 });
    const ledge = filler({
      key: "leftover:1",
      x: 0,
      y: 0,
      w: 90,
      d: 8.4,
      z: 28.4,
      h: 6.6,
      level: 1,
      stack: 0,
    });
    const { spec, mesh, printed } = built([ground, ledge]);
    expectsBuilt(spec, mesh);
    expect(spec.merged?.flipped).toBe(true);
    // upside down, its top face (z = 35) is on the bed, and nothing overhangs
    const flipped = bounds(printed);
    expect(flipped.min[2]).toBeCloseTo(0, 3);
    expect(flipped.max[2]).toBeCloseTo(35, 3);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
    // as it stands, the ledge does hang: that is why it prints the other way up
    expect(checkPrintability(mesh).overhangTriangles).toBeGreaterThan(0);
  });

  it("a comb whose members have rounded corners leaves no fin in the notch between them", () => {
    // Four strips round a corner: the bridges must reach into the members, or each end of a
    // bridge would stand free in the notch between two rounded corners, 0.2 mm thick.
    const a = filler({ key: "leftover:0", x: 91.59, y: 0, w: 8.71, d: 100.12 });
    const b = filler({ key: "leftover:1", x: 0, y: 91.59, w: 91.45, d: 8.53, stack: 6 });
    const c = filler({ key: "leftover:2", x: 91.59, y: 100.26, w: 8.71, d: 94.04, stack: 7 });
    const { spec, mesh, printed } = built([a, b, c]);
    expect(spec.merged?.members).toHaveLength(3);
    expectsBuilt(spec, mesh);
    const report = checkPrintability(printed);
    expect(report.problems).toEqual([]);
    expect(report.minFeatureMm).toBeGreaterThan(2);
  });
});

// The merged outline is rounded once (spacer fillets after the merge): its convex corners get the
// corner radius, its concave ones stay sharp, and the seams between members leave no step.
describe("a merged part is rounded once, after the merge", () => {
  const R = DEFAULT_SETTINGS.cornerRadius;
  const ARC = quarterSegments(R) + 1; // points on one rounded corner

  /** The outlines of the part's horizontal slice at height z, outer ring first. */
  function slice(mesh: ReturnType<typeof buildTray>["mesh"], z: number): Vec2[][] {
    const solid = new m.Manifold(
      new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
    );
    const cut = solid.slice(z);
    const rings = cut.toPolygons();
    solid.delete();
    cut.delete();
    return rings;
  }
  const area = (ring: Vec2[]): number =>
    ring.reduce((sum, [x, y], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length] as Vec2;
      return sum + (x * y2 - x2 * y) / 2;
    }, 0);
  // The slice of a triangulated side face has a point where the diagonal crosses it: not a corner.
  const corners = (ring: Vec2[]): Vec2[] =>
    ring.filter(([x, y], i) => {
      const [px, py] = ring[(i + ring.length - 1) % ring.length] as Vec2;
      const [nx, ny] = ring[(i + 1) % ring.length] as Vec2;
      return Math.abs((x - px) * (ny - y) - (y - py) * (nx - x)) > 1e-4;
    });
  const outer = (rings: Vec2[][]): Vec2[] =>
    corners(rings.reduce((big, ring) => (Math.abs(area(ring)) > Math.abs(area(big)) ? ring : big)));
  const near = (ring: Vec2[], x: number, y: number): number =>
    Math.min(...ring.map(([px, py]) => Math.hypot(px - x, py - y)));

  it("two solid bars side by side make a rectangle: four rounded corners, nothing at the seam", () => {
    const a = filler({ key: "leftover:0", x: 0, y: 0, w: 60, d: 40 });
    const b = filler({ key: "leftover:1", x: 60 + GAP, y: 0, w: 20, d: 40, stack: 6 });
    const { spec, mesh } = built([a, b]);
    expectsBuilt(spec, mesh);
    const ring = outer(slice(mesh, 20));
    expect(ring).toHaveLength(4 * ARC);
    // no vertex along the straight faces, where the members meet
    for (const [x, y] of ring) {
      const atCorner = x < R + 1e-3 || x > spec.w - R - 1e-3;
      expect(atCorner, `(${x}, ${y})`).toBe(true);
    }
    // the corners are round: no vertex near the sharp corner
    for (const [x, y] of [
      [0, 0],
      [spec.w, 0],
      [0, spec.d],
      [spec.w, spec.d],
    ] as Vec2[]) {
      expect(near(ring, x, y)).toBeGreaterThan(R * (Math.SQRT2 - 1) - 0.05);
    }
  });

  it("an L of two bars: five rounded corners, one sharp inner corner, no step at the seam", () => {
    const a = filler({ key: "leftover:0", x: 0, y: 0, w: 60, d: 40 });
    const b = filler({ key: "leftover:1", x: 60 + GAP, y: 0, w: 20, d: 20, stack: 6 });
    const { spec, mesh } = built([a, b]);
    expectsBuilt(spec, mesh);
    const ring = outer(slice(mesh, 20));
    expect(ring).toHaveLength(5 * ARC + 1);
    // the inner corner (60, 20) is a vertex of its own, sharp
    expect(near(ring, 60, 20)).toBeLessThan(1e-3);
    // the bottom face runs straight from corner to corner: no vertex between the arcs
    const bottom = ring.filter(([, y]) => Math.abs(y) < 1e-6);
    expect(bottom.every(([x]) => x < R + 1e-3 || x > spec.w - R - 1e-3)).toBe(true);
  });

  it("two open spare trays: one rounded outline, each pocket kept, the seam solid", () => {
    const a = open({ key: "leftover:0", x: 0, y: 0, w: 60, d: 40 });
    const b = open({ key: "leftover:1", x: 60 + GAP, y: 0, w: 50, d: 40, stack: 6 });
    const { spec, mesh, printed } = built([a, b]);
    expectsBuilt(spec, mesh);
    const rings = slice(mesh, 20);
    expect(rings).toHaveLength(3); // the outline and the two pockets
    expect(outer(rings)).toHaveLength(4 * ARC);
    expect(checkPrintability(printed)).toMatchObject({ ok: true, overhangTriangles: 0 });
  });

  it("an L of two open trays: five rounded corners and a sharp inner one, the seam solid", () => {
    const a = open({ key: "leftover:0", x: 0, y: 0, w: 60, d: 40 });
    const b = open({ key: "leftover:1", x: 60 + GAP, y: 0, w: 30, d: 24, stack: 6 });
    const { spec, mesh } = built([a, b]);
    expectsBuilt(spec, mesh);
    const rings = slice(mesh, 20);
    expect(rings).toHaveLength(3);
    const ring = outer(rings);
    expect(ring).toHaveLength(5 * ARC + 1);
    expect(near(ring, 60, 24)).toBeLessThan(1e-3);
  });

  it("a riser and a tall filler: each height has its own rounded outline", () => {
    const f = filler({ key: "leftover:0", x: 90 + GAP, y: 0, w: 10, d: 60 });
    const { spec, mesh } = built([riser(), f]);
    expectsBuilt(spec, mesh);
    // over the riser the part is its whole footprint; above it, the filler's
    const low = outer(slice(mesh, 10));
    expect(low).toHaveLength(4 * ARC);
    expect(Math.min(...low.map(([x]) => x))).toBeCloseTo(0, 6);
    const high = outer(slice(mesh, 25));
    expect(high).toHaveLength(4 * ARC);
    expect(Math.min(...high.map(([x]) => x))).toBeCloseTo(90 + GAP, 3);
    expect(Math.max(...high.map(([x]) => x))).toBeCloseTo(spec.w, 3);
  });

  it("keeps the bottom chamfer along the whole joined outline", () => {
    const a = filler({ key: "leftover:0", x: 0, y: 0, w: 60, d: 40 });
    const b = filler({ key: "leftover:1", x: 60 + GAP, y: 0, w: 20, d: 20, stack: 6 });
    const { mesh } = built([a, b]);
    const c = DEFAULT_SETTINGS.bottomChamfer;
    const foot = outer(slice(mesh, 0.001));
    // at the bed the outline is pulled in by the chamfer, the seam included
    expect(Math.min(...foot.map(([, y]) => y))).toBeCloseTo(c, 2);
    expect(Math.min(...foot.map(([x]) => x))).toBeCloseTo(c, 2);
    const wall = outer(slice(mesh, 5));
    expect(Math.min(...wall.map(([, y]) => y))).toBeCloseTo(0, 6);
  });
});
