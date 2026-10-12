import { describe, expect, it } from "vitest";
import { checkPrintability } from "./printability";
import { cubeMesh, signedVolume, topology } from "./test-mesh";
import type { Mesh } from "./types";

type P = [number, number, number];

function translate(mesh: Mesh, dz: number): Mesh {
  const positions = mesh.positions.slice();
  for (let i = 2; i < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) + dz;
  }
  return { positions, indices: mesh.indices };
}

// Square frustum 0..10 at the top (z = h), inset `inset` at the bottom
// (z = 0): its sides face down at atan(inset / h) from vertical.
function frustum(inset: number, h: number): Mesh {
  const a = inset;
  const b = 10 - inset;
  const positions = new Float32Array(
    [
      [a, a, 0],
      [b, a, 0],
      [b, b, 0],
      [a, b, 0],
      [0, 0, h],
      [10, 0, h],
      [10, 10, h],
      [0, 10, h],
    ].flat(),
  );
  return { positions, indices: cubeMesh().indices };
}

// Box [x0, x1] × [y0, y1] × [z0, z1] with outward (or, if `inward`, flipped) faces.
function box(min: P, max: P, inward = false): Mesh {
  const cube = cubeMesh(1);
  const positions = cube.positions.map((v, i) => {
    const lo = min[i % 3] ?? 0;
    return lo + v * ((max[i % 3] ?? 0) - lo);
  });
  const indices = inward ? Uint32Array.from(cube.indices).reverse() : cube.indices;
  return { positions, indices };
}

function merge(a: Mesh, b: Mesh): Mesh {
  const offset = a.positions.length / 3;
  const positions = new Float32Array([...a.positions, ...b.positions]);
  const indices = new Uint32Array([...a.indices, ...Array.from(b.indices, (i) => i + offset)]);
  return { positions, indices };
}

// A solid block with a closed cavity: the cavity faces point into the cavity.
function hollow(outer: [P, P], cavity: [P, P]): Mesh {
  return merge(box(outer[0], outer[1]), box(cavity[0], cavity[1], true));
}

// One triangle facing straight down at height z (an open mesh, enough for the overhang rule).
function downTriangle(z: number): Mesh {
  return {
    positions: new Float32Array([0, 0, z, 0, 10, z, 10, 0, z]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

// A cube on the bed plus an extra triangle (appended as new vertices).
function withExtraTriangle(mesh: Mesh, corners: [P, P, P]): Mesh {
  const base = mesh.positions.length / 3;
  return {
    positions: new Float32Array([...mesh.positions, ...corners.flat()]),
    indices: new Uint32Array([...mesh.indices, base, base + 1, base + 2]),
  };
}

// Solid whose XZ profile is a parallelogram sheared at 45°: both long faces slope, 0.5 mm apart
// horizontally. Extruded 10 mm along y.
function slantedSlab(): Mesh {
  const profile: [number, number][] = [
    [0, 0],
    [0.5, 0],
    [10.5, 10],
    [10, 10],
  ];
  const positions = new Float32Array(
    profile.flatMap(([x, z]) => [x, 0, z]).concat(profile.flatMap(([x, z]) => [x, 10, z])),
  );
  // Front (y = 0) vertices 0..3, back (y = 10) vertices 4..7. The triangle list below is wound
  // inward and reversed on return.
  const indices = new Uint32Array(
    [
      [0, 2, 1], // front cap
      [0, 3, 2],
      [4, 5, 6], // back cap
      [4, 6, 7],
      [0, 1, 5], // bottom
      [0, 5, 4],
      [1, 2, 6], // lower slope (faces +x, down)
      [1, 6, 5],
      [2, 3, 7], // top
      [2, 7, 6],
      [3, 0, 4], // upper slope (faces -x, up)
      [3, 4, 7],
    ].flat(),
  );
  return { positions, indices: Uint32Array.from(indices).reverse() };
}

// Octahedron of radius 5 centred at (5, 5, 5): every face is sloped at 54.7° from the vertical.
function octahedron(): Mesh {
  const positions = new Float32Array(
    [
      [10, 5, 5],
      [0, 5, 5],
      [5, 10, 5],
      [5, 0, 5],
      [5, 5, 10],
      [5, 5, 0],
    ].flat(),
  );
  const indices = new Uint32Array(
    [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [2, 0, 5],
      [1, 2, 5],
      [3, 1, 5],
      [0, 3, 5],
    ].flat(),
  );
  return { positions, indices };
}

describe("checkPrintability", () => {
  it("accepts a cube on the bed and measures its thickness", () => {
    const report = checkPrintability(cubeMesh(10));
    expect(report).toEqual({ ok: true, overhangTriangles: 0, minFeatureMm: 10, problems: [] });
  });

  describe("overhangs", () => {
    it("flags a down-facing face above the bed", () => {
      const report = checkPrintability(translate(cubeMesh(10), 5));
      expect(report.overhangTriangles).toBe(2);
      expect(report.ok).toBe(false);
      expect(report.problems[0]).toBe("2 triangles overhang more than 45° above the bed");
    });

    it("says 'triangle overhangs' for a single triangle", () => {
      const report = checkPrintability(downTriangle(5));
      expect(report.overhangTriangles).toBe(1);
      expect(report.problems[0]).toBe("1 triangle overhangs more than 45° above the bed");
    });

    it("skips a sliver whose float32 normal is noise (review 2, M-b), still catching a real one", () => {
      // 2 mm long, 0.00078 mm high: normal.z −0.768, area 7.8e-4 mm² (a true 45° chamfer face).
      const sliver: [P, P, P] = [
        [12, 0, 5],
        [13, 0.0006, 5.0005],
        [14, 0, 5],
      ];
      expect(checkPrintability(withExtraTriangle(cubeMesh(10), sliver)).overhangTriangles).toBe(0);
      // The same face 0.01 mm high is real.
      const face: [P, P, P] = [
        [12, 0, 5],
        [13, 0.006, 5.005],
        [14, 0, 5],
      ];
      expect(checkPrintability(withExtraTriangle(cubeMesh(10), face)).overhangTriangles).toBe(1);
    });

    it("accepts exactly 45° (normal.z = −0.7071 > −0.71)", () => {
      expect(checkPrintability(frustum(2, 2)).overhangTriangles).toBe(0);
    });

    it("accepts a face between 45° and the −0.71 limit", () => {
      // inset 2.01 over 2 mm: normal.z = −0.7089
      expect(checkPrintability(frustum(2.01, 2)).overhangTriangles).toBe(0);
    });

    it("rejects a face just past the −0.71 limit", () => {
      // inset 2.03 over 2 mm: normal.z = −0.7124
      expect(checkPrintability(frustum(2.03, 2)).overhangTriangles).toBe(8);
    });

    it("rejects faces overhanging more than 45°", () => {
      // inset 2.2 over 2 mm height: 47.7° from vertical
      expect(checkPrintability(frustum(2.2, 2)).overhangTriangles).toBe(8);
    });

    it("treats a face at z = 0.0005 as lying on the bed", () => {
      expect(checkPrintability(downTriangle(0.0005)).overhangTriangles).toBe(0);
    });

    it("treats a face at z = 0.002 as an overhang", () => {
      expect(checkPrintability(downTriangle(0.002)).overhangTriangles).toBe(1);
    });

    it("ignores a down-facing sliver below the minimum area", () => {
      // 0.01 × 0.005 mm right triangle (area 2.5e-5) facing down, 5 mm above the bed.
      const sliver: [P, P, P] = [
        [2, 2, 5],
        [2, 2.01, 5],
        [2.005, 2, 5],
      ];
      const report = checkPrintability(withExtraTriangle(cubeMesh(10), sliver));
      expect(report).toEqual({ ok: true, overhangTriangles: 0, minFeatureMm: 10, problems: [] });
    });
  });

  describe("thinnest feature", () => {
    it("accepts a feature of exactly 0.8 mm", () => {
      const report = checkPrintability(cubeMesh(0.8));
      expect(report.minFeatureMm).toBeCloseTo(0.8, 5);
      expect(report.ok).toBe(true);
    });

    it("accepts a feature within the 0.001 mm tolerance of 0.8 mm", () => {
      expect(checkPrintability(cubeMesh(0.7995)).ok).toBe(true);
    });

    it("reports features thinner than 0.8 mm with three decimals", () => {
      const report = checkPrintability(cubeMesh(0.798));
      expect(report.ok).toBe(false);
      expect(report.problems).toEqual(["thinnest feature is 0.798 mm (minimum 0.8 mm)"]);
    });

    it("reports features thinner than 0.8 mm", () => {
      const report = checkPrintability(cubeMesh(0.5));
      expect(report.minFeatureMm).toBeCloseTo(0.5, 5);
      expect(report.ok).toBe(false);
      expect(report.problems).toEqual(["thinnest feature is 0.500 mm (minimum 0.8 mm)"]);
    });

    it("measures a thin wall around a cavity with horizontal rays", () => {
      // 0.5 mm side walls, 3 mm floor and roof.
      const mesh = hollow(
        [
          [0, 0, 0],
          [10, 10, 10],
        ],
        [
          [0.5, 0.5, 3],
          [9.5, 9.5, 7],
        ],
      );
      expect(topology(mesh).closed).toBe(true);
      expect(signedVolume(mesh)).toBeCloseTo(1000 - 9 * 9 * 4, 3);
      const report = checkPrintability(mesh);
      expect(report.minFeatureMm).toBeCloseTo(0.5, 5);
      expect(report.problems).toContain("thinnest feature is 0.500 mm (minimum 0.8 mm)");
    });

    it("measures a thin floor under a cavity with vertical rays", () => {
      // 3 mm side walls and roof, 0.5 mm floor.
      const mesh = hollow(
        [
          [0, 0, 0],
          [10, 10, 10],
        ],
        [
          [3, 3, 0.5],
          [7, 7, 6],
        ],
      );
      const report = checkPrintability(mesh);
      expect(report.minFeatureMm).toBeCloseTo(0.5, 5);
      expect(report.ok).toBe(false);
    });

    it("measures the thinnest of a hollow box's walls, floor and roof", () => {
      // 1 mm everywhere; the closed cavity's roof is an overhang, which is reported separately.
      const mesh = hollow(
        [
          [0, 0, 0],
          [10, 10, 10],
        ],
        [
          [1, 1, 1],
          [9, 9, 9],
        ],
      );
      const report = checkPrintability(mesh);
      expect(report.minFeatureMm).toBeCloseTo(1, 5);
      expect(report.overhangTriangles).toBe(2);
    });

    it("does not sample sloped faces", () => {
      // The slab is 0.5 mm thick horizontally, but its faces are sloped, so only the caps are
      // measured; none of their rays reach a facing wall or floor.
      const slab = slantedSlab();
      expect(topology(slab).closed).toBe(true);
      expect(signedVolume(slab)).toBeCloseTo(0.5 * 10 * 10, 3);
      const report = checkPrintability(slab);
      expect(report.minFeatureMm).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(report.ok).toBe(true);
    });

    it("ignores a vertical sliver below the minimum area when measuring", () => {
      // 0.3 mm from the x = 0 wall, facing +x: a ray towards -x would read 0.3 mm.
      const sliver: [P, P, P] = [
        [0.3, 5, 5],
        [0.3, 5.01, 5],
        [0.3, 5, 5.005],
      ];
      const report = checkPrintability(withExtraTriangle(cubeMesh(10), sliver));
      expect(report.minFeatureMm).toBeCloseTo(10, 5);
      expect(report.ok).toBe(true);
    });
  });

  describe("meshes without anything to measure", () => {
    it("fails an empty mesh with a finite thickness of 0", () => {
      const report = checkPrintability({
        positions: new Float32Array(0),
        indices: new Uint32Array(0),
      });
      expect(report).toEqual({
        ok: false,
        overhangTriangles: 0,
        minFeatureMm: 0,
        problems: ["nothing to measure"],
      });
    });

    it("fails a mesh of only degenerate triangles", () => {
      const cube = cubeMesh(10);
      const report = checkPrintability({
        positions: cube.positions,
        indices: new Uint32Array([0, 1, 1, 2, 2, 2]),
      });
      expect(report.ok).toBe(false);
      expect(report.problems).toEqual(["nothing to measure"]);
    });

    it("falls back to the smallest bounding-box extent when no face can be measured", () => {
      const report = checkPrintability(octahedron());
      expect(topology(octahedron()).closed).toBe(true);
      expect(signedVolume(octahedron())).toBeGreaterThan(0);
      expect(report).toEqual({ ok: true, overhangTriangles: 0, minFeatureMm: 10, problems: [] });
      expect(Number.isFinite(report.minFeatureMm)).toBe(true);
    });
  });
});
