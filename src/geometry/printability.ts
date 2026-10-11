import type { Mesh, PrintabilityReport } from "./types";
import type { Triangles } from "./triangles";
import { MIN_FEATURE_MM } from "../model/settings";
import { buildBvh, nearestHit } from "./bvh";
import { triangles } from "./triangles";

export const OVERHANG_NZ = -0.71; // a 45° face has normal.z = −0.7071, which passes
const BED_Z = 1e-3; // triangles entirely below this lie on the bed
const MIN_AREA = 1e-4; // mm²; ignore slivers whose float32 normals are noise
const VERTICAL = 0.02; // |normal.z| below this: a wall face
const HORIZONTAL = 0.98; // |normal.z| above this: a floor, top or bottom face
const FACING = 0.5; // an exit wall must face the ray by at least this cosine
const THICKNESS_TOLERANCE = 1e-3; // mm; float32 noise allowed below the minimum feature

const at = (values: Float64Array, index: number): number => values[index] ?? 0;

// Triangles with a normal that means something.
function usable(tri: Triangles, t: number): boolean {
  return at(tri.areas, t) >= MIN_AREA;
}

function overhangCount(tri: Triangles): number {
  let count = 0;
  for (let t = 0; t < tri.count; t += 1) {
    if (usable(tri, t) && at(tri.normals, t * 3 + 2) < OVERHANG_NZ && at(tri.maxZ, t) > BED_Z) {
      count += 1;
    }
  }
  return count;
}

interface Probe {
  origin: number[];
  dir: number[];
  accept: (other: number) => boolean; // faces the ray may stop at
}

// The ray that measures the material behind triangle `t`, or null for a sloped (or unusable)
// face: chamfers, scoop fillets and slot bottoms are not sampled.
function probe(tri: Triangles, t: number): Probe | null {
  if (!usable(tri, t)) {
    return null;
  }
  const nx = at(tri.normals, t * 3);
  const ny = at(tri.normals, t * 3 + 1);
  const nz = at(tri.normals, t * 3 + 2);
  const origin = [
    at(tri.centroids, t * 3),
    at(tri.centroids, t * 3 + 1),
    at(tri.centroids, t * 3 + 2),
  ];
  if (Math.abs(nz) < VERTICAL) {
    const len = Math.hypot(nx, ny);
    const dx = -nx / len;
    const dy = -ny / len;
    return {
      origin,
      dir: [dx, dy, 0],
      accept: (o) =>
        o !== t &&
        usable(tri, o) &&
        Math.abs(at(tri.normals, o * 3 + 2)) < VERTICAL &&
        at(tri.normals, o * 3) * dx + at(tri.normals, o * 3 + 1) * dy > FACING,
    };
  }
  if (Math.abs(nz) > HORIZONTAL) {
    const down = nz > 0 ? -1 : 1;
    return {
      origin,
      dir: [0, 0, down],
      accept: (o) => o !== t && usable(tri, o) && at(tri.normals, o * 3 + 2) * down > HORIZONTAL,
    };
  }
  return null;
}

// Smallest side of the mesh's axis-aligned bounding box.
function smallestExtent(mesh: Mesh): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 1) {
    const k = i % 3;
    const v = mesh.positions[i] ?? 0;
    min[k] = Math.min(min[k] ?? Infinity, v);
    max[k] = Math.max(max[k] ?? -Infinity, v);
  }
  return Math.min(...max.map((hi, k) => hi - (min[k] ?? 0)));
}

// Rule 6 + minimum feature check on a finished mesh.
// - Overhangs: triangles facing down more steeply than 45° (normal.z < −0.71)
//   that are not on the bed (z = 0).
// - Minimum feature: from the centroid of every wall face a horizontal ray
//   goes into the material and stops at the nearest wall face it could leave
//   through (one facing the ray); from every horizontal face a vertical ray
//   stops at the nearest opposite horizontal face. The shortest such distance
//   is the thinnest wall, divider, lip or floor. Sloped faces (chamfers,
//   scoop fillets, slot bottoms) are neither sampled nor stopped at, so sloped
//   tops of walls are not reported as thin; a ray that skips a sloped exit
//   continues to a farther face, so a thickness may be overestimated, but the
//   reported distance is always a real one along the ray. Only centroids are
//   sampled, so a polygon vertex can be thinner than reported by up to the
//   facet sagitta.
// - A mesh without usable triangles reports minFeatureMm 0 and the problem
//   "nothing to measure". A mesh with no measurable face (every ray misses)
//   reports its smallest bounding-box extent instead, so minFeatureMm is
//   always finite and survives JSON.
//
// Cost: about 1 s per 50k triangles (a BVH ray query per sampled face). Run it
// only in the geometry worker on a finished build, never per keystroke or on
// the main thread.
export function checkPrintability(mesh: Mesh): PrintabilityReport {
  const tri = triangles(mesh);
  let usableCount = 0;
  for (let t = 0; t < tri.count; t += 1) {
    usableCount += usable(tri, t) ? 1 : 0;
  }
  if (usableCount === 0) {
    return { ok: false, overhangTriangles: 0, minFeatureMm: 0, problems: ["nothing to measure"] };
  }

  const overhangTriangles = overhangCount(tri);
  const bvh = buildBvh(mesh, tri.centroids);
  let minFeatureMm = Infinity;
  for (let t = 0; t < tri.count; t += 1) {
    const ray = probe(tri, t);
    if (ray !== null) {
      minFeatureMm = Math.min(minFeatureMm, nearestHit(bvh, ray.origin, ray.dir, ray.accept));
    }
  }
  if (!Number.isFinite(minFeatureMm)) {
    minFeatureMm = smallestExtent(mesh);
  }

  const problems: string[] = [];
  if (overhangTriangles > 0) {
    const noun = overhangTriangles === 1 ? "triangle overhangs" : "triangles overhang";
    problems.push(`${overhangTriangles} ${noun} more than 45° above the bed`);
  }
  if (minFeatureMm < MIN_FEATURE_MM - THICKNESS_TOLERANCE) {
    problems.push(
      `thinnest feature is ${minFeatureMm.toFixed(3)} mm (minimum ${MIN_FEATURE_MM} mm)`,
    );
  }
  return { ok: problems.length === 0, overhangTriangles, minFeatureMm, problems };
}
