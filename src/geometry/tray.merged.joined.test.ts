// @vitest-environment node
// src/geometry/tray.merged.joined.test.ts
// A merged part has one joined outline whatever its members carry. Seen by the owner in a slicer:
// where a riser with the rim's lip was folded into a filler, each member kept its own rounded
// corners and bottom chamfer at the seam, a notch between them (the part was built from its members
// and box bridges instead of as one shape, since a lipped member kept it from the one-shape build).
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import owner5 from "../../test/fixtures/star-realms-owner-5.json";
import { DEFAULT_ITERATIONS, optimize } from "../layout/optimize";
import { mergeParts } from "../layout/merge";
import { printableParts } from "../layout/printable";
import { TEST_PRINTER, traySpec } from "../layout/test-utils";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Project, Settings, TraySpec } from "../model/types";
import { size } from "../sizing";
import { loadManifold } from "./load";
import { mergedOutline } from "./merged-outline";
import { planTray } from "./plan";
import { withScope } from "./scope";
import { quarterSegments } from "./shapes";
import { problemsOf } from "./test-build";
import { buildTray } from "./tray";
import type { Mesh } from "./types";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const GAP = DEFAULT_SETTINGS.trayGap;
const WALL = 1.6;
const FLOOR = 1.2;
const LIPPED_WALL = 2.9; // a lipped wall carries the ring and its ledge
const R = DEFAULT_SETTINGS.cornerRadius;
const ARC = quarterSegments(R) + 1; // points on one rounded corner

function solid(mesh: Mesh): Manifold {
  return new m.Manifold(
    new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
  );
}

/** The part's horizontal slice at height z: its outer rings (those with material inside). */
function slice(mesh: Mesh, z: number): [number, number][][] {
  const s = solid(mesh);
  const cut = s.slice(z);
  const rings = cut.toPolygons() as [number, number][][];
  s.delete();
  cut.delete();
  return rings;
}
const area = (ring: [number, number][]): number =>
  ring.reduce((sum, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
    return sum + (x * y2 - x2 * y) / 2;
  }, 0);
const corners = (ring: [number, number][]): [number, number][] =>
  ring.filter(([x, y], i) => {
    const [px, py] = ring[(i + ring.length - 1) % ring.length] as [number, number];
    const [nx, ny] = ring[(i + 1) % ring.length] as [number, number];
    return Math.abs((x - px) * (ny - y) - (y - py) * (nx - x)) > 1e-4;
  });
const outer = (rings: [number, number][][]): [number, number][] =>
  corners(rings.reduce((big, ring) => (Math.abs(area(ring)) > Math.abs(area(big)) ? ring : big)));

/** The area inside the slice's outer rings (pockets filled), mm². */
const filled = (mesh: Mesh, z: number): number =>
  slice(mesh, z)
    .map(area)
    .filter((a) => a > 0)
    .reduce((sum, a) => sum + a, 0);

/**
 * The area of the merged part's outline as one rounded shape, `pull` mm in from it (the bottom
 * chamfer's step at a height under it): the union of its members' footprints and bridges, convex
 * corners rounded once (mergedOutline), as the one-shape build makes it; at `z` above the floor.
 */
function joinedArea(spec: TraySpec, settings: Settings, z: number, pull = 0): number {
  const merged = spec.merged as NonNullable<TraySpec["merged"]>;
  const inFrame = (b: { x: number; y: number; z: number; w: number; d: number; h: number }) => ({
    x0: b.x - spec.x,
    y0: b.y - spec.y,
    x1: b.x + b.w - spec.x,
    y1: b.y + b.d - spec.y,
    z0: b.z - spec.z,
    z1: b.z + b.h - spec.z,
  });
  const members = merged.members.map((member, i) => ({
    ...inFrame(member),
    radius: planTray(member, settings).cornerRadius,
    i,
  }));
  const feet = [...members, ...merged.bridges.map(inFrame)].filter((b) => b.z1 > z);
  const first = planTray(merged.members[0] as TraySpec, settings);
  const fallback = Math.min(...members.map((b) => b.radius));
  return withScope((scope) => {
    const outline = mergedOutline(m, scope, feet, first.chamfer, fallback);
    expect(outline).not.toBeNull();
    const section = scope.track(m.CrossSection.ofPolygons(outline?.rings ?? [], "NonZero"));
    const shrunk = pull > 0 ? scope.track(section.offset(-pull, "Miter", 10)) : section;
    return shrunk.area();
  });
}

const rim: Settings = { ...DEFAULT_SETTINGS, mergeRisers: true };

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

const riser = (o: Partial<TraySpec> = {}): TraySpec => {
  const f = filler({
    key: "a:p0:0:riser",
    part: "riser",
    path: "",
    stack: 0,
    w: 90,
    d: 60,
    h: 16.4,
    solid: false,
    lip: true,
    wall: LIPPED_WALL,
    ...o,
  });
  return {
    ...f,
    compartments: [
      {
        x: f.wall,
        y: f.wall,
        w: f.w - 2 * f.wall,
        d: f.d - 2 * f.wall,
        floorZ: FLOOR,
        kind: "spare",
        contents: "",
        features: [],
      },
    ],
  };
};

function built(parts: TraySpec[], settings: Settings) {
  const out = mergeParts(parts, { settings, printer: TEST_PRINTER });
  const spec = out.find((p) => p.merged) as TraySpec;
  expect(spec).toBeDefined();
  return { spec, ...buildTray(m, spec, settings) };
}

describe("a riser with the rim's lip folded into a filler", () => {
  const f = filler({ key: "leftover:0", x: 90 + GAP, y: 0, w: 10, d: 60 });

  it("has the lip on the riser, which the fold keeps", () => {
    const { spec } = built([riser(), f], rim);
    expect(spec.merged?.members.map((p) => p.part)).toEqual(["riser", "leftover"]);
    expect(planTray(riser(), rim).lip).not.toBeNull();
  });

  it("is one rounded outline: four corners, nothing at the seam", () => {
    const { mesh } = built([riser(), f], rim);
    const low = outer(slice(mesh, 10));
    expect(low).toHaveLength(4 * ARC);
    const high = outer(slice(mesh, 25));
    expect(high).toHaveLength(4 * ARC);
  });

  it("has the bottom chamfered once along the joined outline", () => {
    const { spec, mesh } = built([riser(), f], rim);
    const c = DEFAULT_SETTINGS.bottomChamfer;
    const foot = outer(slice(mesh, 0.001));
    expect(Math.min(...foot.map(([, y]) => y))).toBeCloseTo(c, 2);
    expect(Math.min(...foot.map(([x]) => x))).toBeCloseTo(c, 2);
    expect(Math.max(...foot.map(([x]) => x))).toBeCloseTo(spec.w - c, 2);
    expect(foot).toHaveLength(4 * ARC);
  });

  it("keeps the riser's lip exactly as the riser alone has it", () => {
    const { mesh, spec } = built([riser(), f], rim);
    const alone = buildTray(m, riser(), rim).mesh;
    const above = (mesh: Mesh): number => {
      const s = solid(mesh);
      const slab = m.Manifold.cube([90, 60, 3], false).translate([0, 0, 16.4]);
      const v = s.intersect(slab).volume();
      s.delete();
      slab.delete();
      return v;
    };
    expect(above(mesh)).toBeGreaterThan(100);
    expect(above(mesh)).toBeCloseTo(above(alone), 3);
    expect(problemsOf(m, spec, rim)).toEqual([]);
  });
});

describe("the owner's folded parts (star-realms-owner-5)", { timeout: 180_000 }, () => {
  const parsed = parseProject(owner5);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const p: Project = parsed.project;
  const layout = optimize(
    {
      requirements: size(p.components, p.settings).requirements,
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
      inputsHash: inputsHash(p),
      appVersion: "0.0.0-test",
    },
    1,
    DEFAULT_ITERATIONS,
  ).layout;

  for (const kind of ["rim", "step"] as const) {
    it(`every folded part has one joined outline, mid-height and at the bed (${kind})`, () => {
      expect(layout).not.toBeNull();
      const settings: Settings = {
        ...p.settings,
        mergeRisers: true,
        lip: { ...p.settings.lip, joint: kind },
      };
      const printed = printableParts(layout?.trays ?? [], {
        components: p.components,
        settings,
        printer: p.printer,
        locks: p.locks,
      });
      const folded = printed.trays.filter((t) => t.merged !== undefined);
      expect(folded.length).toBeGreaterThan(0);
      for (const t of folded) {
        const { mesh } = buildTray(m, t, settings);
        const c = planTray(t.merged?.members[0] as TraySpec, settings).chamfer;
        // above the chamfer: the whole outline
        expect(filled(mesh, 3), `${t.key} at 3 mm`).toBeCloseTo(joinedArea(t, settings, 3), 1);
        // in the chamfer: pulled in by what is left of it
        const z = 0.1;
        expect(filled(mesh, z), `${t.key} at ${z} mm`).toBeCloseTo(
          joinedArea(t, settings, z, c - z),
          1,
        );
        expect(problemsOf(m, t, settings), t.key).toEqual([]);
      }
    });
  }
});
