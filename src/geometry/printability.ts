import type { Mesh, PrintabilityReport } from "./types";
import { MIN_FEATURE_MM } from "../model/settings";
import { buildBvh, nearestHit } from "./bvh";
import { triangles } from "./triangles";

export const OVERHANG_NZ = -0.71; // a 45° face has normal.z = −0.7071, which passes
const BED_Z = 1e-3; // triangles entirely below this lie on the bed
const MIN_AREA = 1e-4; // mm²; ignore slivers whose float32 normals are noise
const VERTICAL = 0.02; // |normal.z| below this: a wall face
const HORIZONTAL = 0.98; // |normal.z| above this: a floor, top or bottom face

// Rule 6 + minimum feature check on a finished mesh.
// - Overhangs: triangles facing down more steeply than 45° (normal.z < −0.71)
//   that are not on the bed (z = 0).
// - Minimum feature: from the centroid of every wall face a horizontal ray
//   goes into the material and stops at the nearest wall face it leaves
//   through; from every horizontal face a vertical ray stops at the nearest
//   opposite horizontal face. The shortest such distance is the thinnest
//   wall, divider, lip or floor. Sloped faces (chamfers, scoop fillets, slot
//   bottoms) are not sampled, so sloped tops of walls are not reported as thin.
export function checkPrintability(mesh: Mesh): PrintabilityReport {
  const tri = triangles(mesh);
  const nz = (t: number): number => tri.normals[t * 3 + 2] ?? 0;
  let overhangTriangles = 0;
  for (let t = 0; t < tri.count; t += 1) {
    if ((tri.areas[t] ?? 0) >= MIN_AREA && nz(t) < OVERHANG_NZ && (tri.maxZ[t] ?? 0) > BED_Z) {
      overhangTriangles += 1;
    }
  }

  const bvh = buildBvh(mesh, tri.centroids);
  let minFeatureMm = Infinity;
  for (let t = 0; t < tri.count; t += 1) {
    if ((tri.areas[t] ?? 0) < MIN_AREA) {
      continue;
    }
    const n = [tri.normals[t * 3] ?? 0, tri.normals[t * 3 + 1] ?? 0, nz(t)];
    const origin = [
      tri.centroids[t * 3] ?? 0,
      tri.centroids[t * 3 + 1] ?? 0,
      tri.centroids[t * 3 + 2] ?? 0,
    ];
    let dir: number[];
    let accept: (other: number) => boolean;
    if (Math.abs(nz(t)) < VERTICAL) {
      const len = Math.hypot(n[0] ?? 0, n[1] ?? 0);
      dir = [-(n[0] ?? 0) / len, -(n[1] ?? 0) / len, 0];
      accept = (o) =>
        o !== t &&
        (tri.areas[o] ?? 0) >= MIN_AREA &&
        Math.abs(nz(o)) < VERTICAL &&
        (tri.normals[o * 3] ?? 0) * (dir[0] ?? 0) + (tri.normals[o * 3 + 1] ?? 0) * (dir[1] ?? 0) >
          0.5;
    } else if (Math.abs(nz(t)) > HORIZONTAL) {
      const down = nz(t) > 0 ? -1 : 1;
      dir = [0, 0, down];
      accept = (o) => o !== t && (tri.areas[o] ?? 0) >= MIN_AREA && nz(o) * down > HORIZONTAL;
    } else {
      continue;
    }
    minFeatureMm = Math.min(minFeatureMm, nearestHit(bvh, origin, dir, accept));
  }

  const problems: string[] = [];
  if (overhangTriangles > 0) {
    problems.push(`${overhangTriangles} triangles overhang more than 45° above the bed`);
  }
  if (minFeatureMm < MIN_FEATURE_MM - 1e-3) {
    problems.push(
      `thinnest feature is ${minFeatureMm.toFixed(2)} mm (minimum ${MIN_FEATURE_MM} mm)`,
    );
  }
  return { ok: problems.length === 0, overhangTriangles, minFeatureMm, problems };
}
