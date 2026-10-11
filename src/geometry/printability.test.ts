import { describe, expect, it } from "vitest";
import { checkPrintability } from "./printability";
import { cubeMesh } from "./test-mesh";
import type { Mesh } from "./types";

function translate(mesh: Mesh, dz: number): Mesh {
  const positions = mesh.positions.slice();
  for (let i = 2; i < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) + dz;
  }
  return { positions, indices: mesh.indices };
}

// Square frustum 0..10 at the top (z = h), inset `inset` at the bottom
// (z = 0): its sides face down at atan(inset / h) from vertical.
function frustum(inset: number, h: number, z0 = 0): Mesh {
  const a = inset;
  const b = 10 - inset;
  const positions = new Float32Array([
    a,
    a,
    z0,
    b,
    a,
    z0,
    b,
    b,
    z0,
    a,
    b,
    z0,
    0,
    0,
    z0 + h,
    10,
    0,
    z0 + h,
    10,
    10,
    z0 + h,
    0,
    10,
    z0 + h,
  ]);
  return { positions, indices: cubeMesh().indices };
}

describe("checkPrintability", () => {
  it("accepts a cube on the bed and measures its thickness", () => {
    const report = checkPrintability(cubeMesh(10));
    expect(report).toEqual({ ok: true, overhangTriangles: 0, minFeatureMm: 10, problems: [] });
  });

  it("flags a down-facing face above the bed", () => {
    const report = checkPrintability(translate(cubeMesh(10), 5));
    expect(report.overhangTriangles).toBe(2);
    expect(report.ok).toBe(false);
    expect(report.problems[0]).toMatch(/2 triangles overhang/);
  });

  it("accepts exactly 45° (normal.z = −0.7071 > −0.71)", () => {
    expect(checkPrintability(frustum(2, 2)).overhangTriangles).toBe(0);
  });

  it("rejects faces overhanging more than 45°", () => {
    // inset 2.2 over 2 mm height: 47.7° from vertical
    expect(checkPrintability(frustum(2.2, 2)).overhangTriangles).toBe(8);
  });

  it("reports features thinner than 0.8 mm", () => {
    const report = checkPrintability(cubeMesh(0.5));
    expect(report.minFeatureMm).toBeCloseTo(0.5, 5);
    expect(report.ok).toBe(false);
    expect(report.problems).toEqual(["thinnest feature is 0.50 mm (minimum 0.8 mm)"]);
  });

  it("ignores degenerate triangles", () => {
    const cube = cubeMesh(10);
    const indices = new Uint32Array([...cube.indices, 0, 1, 1]);
    expect(checkPrintability({ positions: cube.positions, indices }).ok).toBe(true);
  });
});
