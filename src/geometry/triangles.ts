import type { Mesh } from "./types";

// Per-triangle data in float64: unit normal, centroid, area, bounds.
export interface Triangles {
  count: number;
  normals: Float64Array; // 3 per triangle (0,0,0 when degenerate)
  centroids: Float64Array; // 3 per triangle
  areas: Float64Array;
  minZ: Float64Array;
  maxZ: Float64Array;
}

export type Point = [number, number, number];

export function vertex(mesh: Mesh, index: number): Point {
  const p = mesh.positions;
  return [p[index * 3] ?? 0, p[index * 3 + 1] ?? 0, p[index * 3 + 2] ?? 0];
}

export function corners(mesh: Mesh, tri: number): [Point, Point, Point] {
  const ix = mesh.indices;
  return [
    vertex(mesh, ix[tri * 3] ?? 0),
    vertex(mesh, ix[tri * 3 + 1] ?? 0),
    vertex(mesh, ix[tri * 3 + 2] ?? 0),
  ];
}

export function triangles(mesh: Mesh): Triangles {
  const count = Math.floor(mesh.indices.length / 3);
  const normals = new Float64Array(count * 3);
  const centroids = new Float64Array(count * 3);
  const areas = new Float64Array(count);
  const minZ = new Float64Array(count);
  const maxZ = new Float64Array(count);
  for (let t = 0; t < count; t += 1) {
    const [a, b, c] = corners(mesh, t);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    areas[t] = len / 2;
    if (len > 0) {
      normals[t * 3] = nx / len;
      normals[t * 3 + 1] = ny / len;
      normals[t * 3 + 2] = nz / len;
    }
    centroids[t * 3] = (a[0] + b[0] + c[0]) / 3;
    centroids[t * 3 + 1] = (a[1] + b[1] + c[1]) / 3;
    centroids[t * 3 + 2] = (a[2] + b[2] + c[2]) / 3;
    minZ[t] = Math.min(a[2], b[2], c[2]);
    maxZ[t] = Math.max(a[2], b[2], c[2]);
  }
  return { count, normals, centroids, areas, minZ, maxZ };
}
