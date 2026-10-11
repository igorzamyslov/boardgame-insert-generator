import type { Mesh } from "./types";
import { corners } from "./triangles";

// Small bounding-volume hierarchy for nearest-hit ray queries on a mesh.

interface Node {
  min: [number, number, number];
  max: [number, number, number];
  left: Node | null;
  right: Node | null;
  tris: number[]; // leaf triangles (empty for inner nodes)
}

export interface Bvh {
  mesh: Mesh;
  root: Node | null;
}

const LEAF_SIZE = 8;

function bounds(mesh: Mesh, tris: number[]): Pick<Node, "min" | "max"> {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (const p of corners(mesh, t)) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k] ?? Infinity, p[k] ?? 0);
        max[k] = Math.max(max[k] ?? -Infinity, p[k] ?? 0);
      }
    }
  }
  return { min, max };
}

function build(mesh: Mesh, tris: number[], centroids: Float64Array): Node {
  const { min, max } = bounds(mesh, tris);
  if (tris.length <= LEAF_SIZE) {
    return { min, max, left: null, right: null, tris };
  }
  const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const axis = extent.indexOf(Math.max(...extent));
  const sorted = [...tris].sort(
    (a, b) => (centroids[a * 3 + axis] ?? 0) - (centroids[b * 3 + axis] ?? 0),
  );
  const mid = sorted.length >> 1;
  return {
    min,
    max,
    left: build(mesh, sorted.slice(0, mid), centroids),
    right: build(mesh, sorted.slice(mid), centroids),
    tris: [],
  };
}

export function buildBvh(mesh: Mesh, centroids: Float64Array): Bvh {
  const count = Math.floor(mesh.indices.length / 3);
  const all = Array.from({ length: count }, (_, i) => i);
  return { mesh, root: count === 0 ? null : build(mesh, all, centroids) };
}

// Distance along the ray to the box, or Infinity if missed.
function hitBox(node: Node, o: number[], inv: number[], best: number): number {
  let tmin = 0;
  let tmax = best;
  for (let k = 0; k < 3; k += 1) {
    const ok = o[k] ?? 0;
    const ik = inv[k] ?? 0;
    const lo = node.min[k] ?? 0;
    const hi = node.max[k] ?? 0;
    if (!Number.isFinite(ik)) {
      if (ok < lo || ok > hi) {
        return Infinity;
      }
      continue;
    }
    let t0 = (lo - ok) * ik;
    let t1 = (hi - ok) * ik;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
    }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) {
      return Infinity;
    }
  }
  return tmin;
}

// Möller–Trumbore; returns t > 0 or Infinity.
function hitTriangle(mesh: Mesh, tri: number, o: number[], dir: number[]): number {
  const [a, b, c] = corners(mesh, tri);
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const d0 = dir[0] ?? 0;
  const d1 = dir[1] ?? 0;
  const d2 = dir[2] ?? 0;
  const px = d1 * (e2[2] ?? 0) - d2 * (e2[1] ?? 0);
  const py = d2 * (e2[0] ?? 0) - d0 * (e2[2] ?? 0);
  const pz = d0 * (e2[1] ?? 0) - d1 * (e2[0] ?? 0);
  const det = (e1[0] ?? 0) * px + (e1[1] ?? 0) * py + (e1[2] ?? 0) * pz;
  if (Math.abs(det) < 1e-12) {
    return Infinity;
  }
  const inv = 1 / det;
  const sx = (o[0] ?? 0) - a[0];
  const sy = (o[1] ?? 0) - a[1];
  const sz = (o[2] ?? 0) - a[2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < -1e-9 || u > 1 + 1e-9) {
    return Infinity;
  }
  const qx = sy * (e1[2] ?? 0) - sz * (e1[1] ?? 0);
  const qy = sz * (e1[0] ?? 0) - sx * (e1[2] ?? 0);
  const qz = sx * (e1[1] ?? 0) - sy * (e1[0] ?? 0);
  const v = (d0 * qx + d1 * qy + d2 * qz) * inv;
  if (v < -1e-9 || u + v > 1 + 1e-9) {
    return Infinity;
  }
  const t = ((e2[0] ?? 0) * qx + (e2[1] ?? 0) * qy + (e2[2] ?? 0) * qz) * inv;
  return t > 1e-6 ? t : Infinity;
}

// Nearest t > 0 along origin + t·dir over triangles accepted by `accept`.
export function nearestHit(
  bvh: Bvh,
  origin: number[],
  dir: number[],
  accept: (tri: number) => boolean,
): number {
  if (bvh.root === null) {
    return Infinity;
  }
  const inv = dir.map((v) => 1 / v);
  let best = Infinity;
  const stack: Node[] = [bvh.root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || hitBox(node, origin, inv, best) === Infinity) {
      continue;
    }
    if (node.left !== null && node.right !== null) {
      stack.push(node.left, node.right);
      continue;
    }
    for (const tri of node.tris) {
      if (accept(tri)) {
        best = Math.min(best, hitTriangle(bvh.mesh, tri, origin, dir));
      }
    }
  }
  return best;
}
