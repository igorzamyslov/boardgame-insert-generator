// Test helpers: mesh topology and bounds.
import type { Mesh } from "./types";

export interface Topology {
  closed: boolean; // every directed edge has exactly one opposite edge
  genus: number;
  vertices: number;
  triangles: number;
}

export function topology(mesh: Mesh): Topology {
  const edges = new Map<string, number>();
  const tris = mesh.indices.length / 3;
  for (let t = 0; t < tris; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = mesh.indices[t * 3 + k] ?? 0;
      const b = mesh.indices[t * 3 + ((k + 1) % 3)] ?? 0;
      const key = `${a},${b}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let closed = true;
  for (const [key, count] of edges) {
    const [a, b] = key.split(",");
    if (count !== 1 || edges.get(`${b},${a}`) !== 1) {
      closed = false;
    }
  }
  const vertices = mesh.positions.length / 3;
  const euler = vertices - edges.size / 2 + tris;
  return { closed, genus: (2 - euler) / 2, vertices, triangles: tris };
}

export function bounds(mesh: Mesh): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = mesh.positions[i + k] ?? 0;
      min[k] = Math.min(min[k] ?? Infinity, v);
      max[k] = Math.max(max[k] ?? -Infinity, v);
    }
  }
  return { min, max };
}

// Signed volume (positive for outward CCW winding).
export function signedVolume(mesh: Mesh): number {
  const p = mesh.positions;
  const ix = mesh.indices;
  let sum = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = (ix[t] ?? 0) * 3;
    const b = (ix[t + 1] ?? 0) * 3;
    const c = (ix[t + 2] ?? 0) * 3;
    const ax = p[a] ?? 0;
    const ay = p[a + 1] ?? 0;
    const az = p[a + 2] ?? 0;
    const bx = p[b] ?? 0;
    const by = p[b + 1] ?? 0;
    const bz = p[b + 2] ?? 0;
    const cx = p[c] ?? 0;
    const cy = p[c + 1] ?? 0;
    const cz = p[c + 2] ?? 0;
    sum += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return sum / 6;
}

// Cube 0..s mesh (8 vertices, 12 triangles, CCW outward) for export tests.
export function cubeMesh(s = 10): Mesh {
  const positions = new Float32Array([
    0,
    0,
    0,
    s,
    0,
    0,
    s,
    s,
    0,
    0,
    s,
    0,
    0,
    0,
    s,
    s,
    0,
    s,
    s,
    s,
    s,
    0,
    s,
    s,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  return { positions, indices };
}
