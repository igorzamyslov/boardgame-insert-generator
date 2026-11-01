import { describe, expect, it } from "vitest";
import { buildBvh, nearestHit } from "./bvh";
import { checkPrintability } from "./printability";
import { cubeMesh } from "./test-mesh";
import { triangles } from "./triangles";
import type { Mesh } from "./types";

// A small deterministic generator, so the meshes and rays are the same on every run.
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// `count` random triangles in a 10 mm cube, none sharing vertices (a soup is enough for ray queries).
function soup(count: number, seed: number): Mesh {
  const next = lcg(seed);
  const positions = new Float32Array(count * 9);
  for (let i = 0; i < positions.length; i += 1) {
    positions[i] = next() * 10;
  }
  return { positions, indices: Uint32Array.from({ length: count * 3 }, (_, i) => i) };
}

const unit = (v: number[]): number[] => {
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
};

describe("nearestHit with a limit", () => {
  const mesh = soup(400, 7);
  const bvh = buildBvh(mesh, triangles(mesh).centroids);
  const next = lcg(11);
  const rays = Array.from({ length: 300 }, () => ({
    origin: [next() * 10, next() * 10, next() * 10],
    dir: unit([next() - 0.5, next() - 0.5, next() - 0.5]),
  }));
  const any = (): boolean => true;
  const some = (t: number): boolean => t % 3 !== 0;

  it("finds hits in the soup, so the comparisons below mean something", () => {
    const hits = rays.filter((r) => nearestHit(bvh, r.origin, r.dir, any) < Infinity);
    expect(hits.length).toBeGreaterThan(50);
  });

  it("returns the unlimited hit when it is nearer than the limit, and the limit when it is not", () => {
    for (const accept of [any, some]) {
      for (const limit of [0.5, 2, 5, 20, Infinity]) {
        for (const { origin, dir } of rays) {
          const free = nearestHit(bvh, origin, dir, accept);
          expect(nearestHit(bvh, origin, dir, accept, limit)).toBe(Math.min(free, limit));
        }
      }
    }
  });

  it("keeps the shortest of many rays the same whatever the limit it carries along", () => {
    for (const accept of [any, some]) {
      const free = Math.min(...rays.map((r) => nearestHit(bvh, r.origin, r.dir, accept)));
      let carried = Infinity;
      for (const { origin, dir } of rays) {
        carried = Math.min(carried, nearestHit(bvh, origin, dir, accept, carried));
      }
      expect(carried).toBe(free);
    }
  });

  it("finds nothing in an empty mesh", () => {
    const empty = buildBvh(
      { positions: new Float32Array(0), indices: new Uint32Array(0) },
      new Float64Array(0),
    );
    expect(nearestHit(empty, [0, 0, 0], [0, 0, 1], any)).toBe(Infinity);
  });
});

describe("checkPrintability with the shortest-so-far limit", () => {
  it("measures a cube's thickness as its side, as every ray reports the same distance", () => {
    expect(checkPrintability(cubeMesh(10)).minFeatureMm).toBeCloseTo(10, 9);
  });

  it("reports the thinnest side of a slab", () => {
    const slab = cubeMesh(10);
    for (let i = 2; i < slab.positions.length; i += 3) {
      slab.positions[i] = (slab.positions[i] ?? 0) * 0.06;
    }
    expect(checkPrintability(slab, 0.4).minFeatureMm).toBeCloseTo(0.6, 5);
  });
});
