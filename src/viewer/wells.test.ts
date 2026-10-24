// @vitest-environment node
// src/viewer/wells.test.ts
// Which compartment each triangle of a real built tray lies in (manifold builds the meshes), and that
// reading it leaves the mesh alone: the export builds its own meshes and never meets this.
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "../geometry/load";
import { buildTray } from "../geometry/tray";
import { GEO, compartment, cutout, strip, traySpec } from "../geometry/test-specs";
import type { Mesh } from "../geometry/types";
import { slabUnder } from "../model/lip";
import type { Settings, TraySpec } from "../model/types";
import { BODY, groupTriangles, wellOfTriangles } from "./wells";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const STEP: Settings = { ...GEO, lip: { ...GEO.lip, joint: "step" } };

/** The tray: two wells of 40 × 50 and 30 × 50 side by side, a divider between them. */
function twoWells(over: Partial<TraySpec> = {}): TraySpec {
  return traySpec({
    key: "t:p0:0",
    w: 1.6 + 40 + 1.2 + 30 + 1.6,
    d: 1.6 + 50 + 1.6,
    h: 20,
    compartments: strip([40, 30], 1.6, 50, 1.6, 1.2, (_x, _w, i) => ({ contents: `Item ${i}` })),
    ...over,
  });
}

/** Share of the triangles of class `wanted` that satisfy `test` at their centroid, and how many there are. */
function centroids(mesh: Mesh, which: Int32Array, wanted: number) {
  const out: { x: number; y: number; z: number }[] = [];
  which.forEach((w, t) => {
    if (w !== wanted) {
      return;
    }
    const at = (k: number) => (mesh.indices[3 * t + k] ?? 0) * 3;
    const pick = (o: number) =>
      [0, 1, 2].reduce((s, k) => s + (mesh.positions[at(k) + o] ?? 0), 0) / 3;
    out.push({ x: pick(0), y: pick(1), z: pick(2) });
  });
  return out;
}

describe("wellOfTriangles", () => {
  it("puts the floor and inner walls of each well in that well, and the rest in the body", () => {
    const spec = twoWells();
    const { mesh } = buildTray(m, spec, GEO);
    const which = wellOfTriangles(spec, mesh);
    for (const [i, c] of spec.compartments.entries()) {
      const inside = centroids(mesh, which, i);
      expect(inside.length).toBeGreaterThan(8);
      for (const p of inside) {
        expect(p.x).toBeGreaterThanOrEqual(c.x - 0.1);
        expect(p.x).toBeLessThanOrEqual(c.x + c.w + 0.1);
        expect(p.y).toBeGreaterThanOrEqual(c.y - 0.1);
        expect(p.y).toBeLessThanOrEqual(c.y + c.d + 0.1);
        expect(p.z).toBeGreaterThanOrEqual(c.floorZ - 0.1);
      }
      // the floor is in it: a triangle at the floor's height, facing up
      expect(inside.some((p) => Math.abs(p.z - c.floorZ) < 1e-6)).toBe(true);
    }
    // the rim, the outer walls and the bed are the body's: the top of the walls is at z = h
    const body = centroids(mesh, which, BODY);
    expect(body.some((p) => Math.abs(p.z - spec.h) < 1e-6)).toBe(true);
    expect(body.some((p) => Math.abs(p.z) < 1e-6)).toBe(true);
    expect(body.some((p) => p.x < 0.1 || p.x > spec.w - 0.1)).toBe(true);
  });

  it("leaves a cut through the wall, and a scoop's fillet stays in its well", () => {
    const spec = traySpec({
      key: "s:p0:0",
      w: 1.6 + 60 + 1.6,
      d: 1.6 + 50 + 1.6,
      h: 25,
      compartments: [
        compartment({
          x: 1.6,
          y: 1.6,
          w: 60,
          d: 50,
          kind: "scoop",
          features: [{ type: "scoop", side: "front", r: 12 }, cutout("left", 26, 12)],
        }),
      ],
    });
    const { mesh } = buildTray(m, spec, GEO);
    const which = wellOfTriangles(spec, mesh);
    const inside = centroids(mesh, which, 0);
    // the scoop rises from the floor to 12 mm, in front: well triangles are there and in the rect
    expect(inside.some((p) => p.y < 1.6 + 12 && p.z > 1.2 + 1)).toBe(true);
    expect(inside.every((p) => p.x >= 1.6 - 0.1 && p.y >= 1.6 - 0.1)).toBe(true);
    // the cut runs out through the left wall, past the well's edge: its faces are the body's
    expect(centroids(mesh, which, BODY).some((p) => p.x < 1.6 - 0.2 && p.z > 12 && p.z < 25)).toBe(
      true,
    );
  });

  it("counts a divider's slot sunk into the floor as part of its well", () => {
    const base = twoWells();
    const withSlot = twoWells({
      compartments: base.compartments.map((c, i) =>
        i === 0
          ? {
              ...c,
              floorZ: 3,
              features: [{ type: "dividerSlot", axis: "y", at: 21.6, width: 1.6, depth: 0.8 }],
            }
          : c,
      ),
    });
    const { mesh } = buildTray(m, withSlot, GEO);
    const which = wellOfTriangles(withSlot, mesh);
    const c = withSlot.compartments[0];
    const low = centroids(mesh, which, 0).filter((p) => p.z < (c?.floorZ ?? 0) - 0.01);
    expect(low.length).toBeGreaterThan(0);
  });

  it("finds the wells where the stepped base's slab lifts the mesh, with `below`", () => {
    const spec = twoWells({ level: 1, z: 20 });
    const below = slabUnder(STEP, spec);
    expect(below).toBeGreaterThan(0);
    const { mesh } = buildTray(m, spec, STEP);
    const right = wellOfTriangles(spec, mesh, below);
    const c = spec.compartments[0];
    const floor = below + (c?.floorZ ?? 0);
    // every triangle taken for a well is at or over the floor of the mesh's frame, where the seam is `below` up
    const inside = centroids(mesh, right, 0);
    expect(inside.length).toBeGreaterThan(8);
    expect(inside.every((p) => p.z >= floor - 0.06)).toBe(true);
    expect(inside.some((p) => Math.abs(p.z - floor) < 1e-6)).toBe(true);
  });

  it("has no wells in a solid part or a merged one", () => {
    const solid = twoWells({ solid: true });
    const { mesh } = buildTray(m, solid, GEO);
    expect(wellOfTriangles(solid, mesh).every((w) => w === BODY)).toBe(true);
  });

  it("does not face a well down: the bed under it and an engraved name are the body's", () => {
    const spec = twoWells({ partName: "T" });
    const { mesh } = buildTray(m, spec, { ...GEO, engraveNames: true });
    const which = wellOfTriangles(spec, mesh);
    which.forEach((w, t) => {
      if (w === BODY) {
        return;
      }
      const a = (mesh.indices[3 * t] ?? 0) * 3;
      const b = (mesh.indices[3 * t + 1] ?? 0) * 3;
      const c = (mesh.indices[3 * t + 2] ?? 0) * 3;
      const p = mesh.positions;
      const nz =
        ((p[b] ?? 0) - (p[a] ?? 0)) * ((p[c + 1] ?? 0) - (p[a + 1] ?? 0)) -
        ((p[b + 1] ?? 0) - (p[a + 1] ?? 0)) * ((p[c] ?? 0) - (p[a] ?? 0));
      expect(nz).toBeGreaterThanOrEqual(-1e-9);
    });
  });
});

describe("what the viewer does with a mesh", () => {
  it("leaves the mesh byte-identical: only a sorted copy of the indices is drawn", () => {
    const spec = twoWells();
    const { mesh } = buildTray(m, spec, GEO);
    const positions = mesh.positions.slice();
    const indices = mesh.indices.slice();
    const which = wellOfTriangles(spec, mesh);
    const { indices: sorted, groups } = groupTriangles(
      mesh.indices,
      which.map((w) => w + 1),
      3,
    );
    const bytes = (a: Float32Array | Uint32Array) =>
      new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    expect(bytes(mesh.positions)).toEqual(bytes(positions));
    expect(bytes(mesh.indices)).toEqual(bytes(indices));
    // the copy holds the same triangles, regrouped
    const key = (a: Uint32Array) =>
      Array.from({ length: a.length / 3 }, (_, t) =>
        [a[3 * t], a[3 * t + 1], a[3 * t + 2]].join(","),
      )
        .sort()
        .join("|");
    expect(key(sorted)).toBe(key(indices));
    expect(sorted).not.toBe(mesh.indices);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(indices.length);
  });

  it("reaches no export code, and no export code reaches it", () => {
    const sources = import.meta.glob<string>("../**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const importers = Object.entries(sources)
      .filter(
        ([path, text]) =>
          !path.endsWith(".test.ts") && /["']\.{1,2}\/(viewer\/)?wells["']/.test(text),
      )
      .map(([path]) => path);
    expect(importers).toEqual(["./scene.ts"]);
    expect(sources["./wells.ts"]).not.toMatch(/export\//);
  });
});

describe("groupTriangles", () => {
  it("lists each class's range of the sorted index buffer, leaving out an empty class", () => {
    const indices = Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const { indices: sorted, groups } = groupTriangles(indices, [2, 0, 2], 3);
    expect(Array.from(sorted)).toEqual([3, 4, 5, 0, 1, 2, 6, 7, 8]);
    expect(groups).toEqual([
      { start: 0, count: 3, cls: 0 },
      { start: 3, count: 6, cls: 2 },
    ]);
  });
});
