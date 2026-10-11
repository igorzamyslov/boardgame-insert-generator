import { describe, expect, it } from "vitest";
import { bounds, cubeMesh, signedVolume, topology } from "./test-mesh";

describe("test mesh helpers", () => {
  it("builds a closed, outward cube of genus 0", () => {
    const cube = cubeMesh();
    expect(topology(cube)).toEqual({ closed: true, genus: 0, vertices: 8, triangles: 12 });
    expect(signedVolume(cube)).toBeCloseTo(1000, 6);
    expect(bounds(cube)).toEqual({ min: [0, 0, 0], max: [10, 10, 10] });
  });

  it("scales the cube with its size argument", () => {
    const cube = cubeMesh(2);
    expect(signedVolume(cube)).toBeCloseTo(8, 6);
    expect(bounds(cube).max).toEqual([2, 2, 2]);
  });

  it("reports an open mesh and a flipped one", () => {
    const cube = cubeMesh();
    const open = { positions: cube.positions, indices: cube.indices.slice(0, -3) };
    expect(topology(open).closed).toBe(false);
    const flipped = {
      positions: cube.positions,
      indices: Uint32Array.from(cube.indices).reverse(),
    };
    expect(signedVolume(flipped)).toBeCloseTo(-1000, 6);
    expect(topology(flipped).closed).toBe(true);
  });

  it("measures bounds of an arbitrary vertex set", () => {
    const mesh = {
      positions: new Float32Array([-1, 2, 3, 4, -5, 6, 0, 0, -7]),
      indices: new Uint32Array([0, 1, 2]),
    };
    expect(bounds(mesh)).toEqual({ min: [-1, -5, -7], max: [4, 2, 6] });
  });
});
