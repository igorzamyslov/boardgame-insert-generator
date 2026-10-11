import { describe, expect, it } from "vitest";
import { toStl } from "./stl";
import { cubeMesh } from "../geometry/test-mesh";

describe("toStl", () => {
  it("writes header, count and 50 bytes per triangle", () => {
    const stl = toStl(cubeMesh(10), "Main deck");
    expect(stl.length).toBe(84 + 50 * 12);
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    expect(view.getUint32(80, true)).toBe(12);
    const header = new TextDecoder().decode(stl.subarray(0, 80));
    expect(header.startsWith("insert-generator Main deck")).toBe(true);
    expect(header.startsWith("solid")).toBe(false);
    expect(header.trimEnd()).toBe("insert-generator Main deck");
  });

  it("computes unit normals and keeps vertex order", () => {
    const stl = toStl(cubeMesh(10), "x");
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    // triangle 0 = vertices 0, 2, 1 of the bottom face: normal (0, 0, −1)
    expect([0, 4, 8].map((o) => view.getFloat32(84 + o, true))).toEqual([0, 0, -1]);
    const v1 = [12, 16, 20].map((o) => view.getFloat32(84 + o, true));
    const v2 = [24, 28, 32].map((o) => view.getFloat32(84 + o, true));
    expect(v1).toEqual([0, 0, 0]);
    expect(v2).toEqual([10, 10, 0]);
    expect(view.getUint16(84 + 48, true)).toBe(0);
  });

  it("keeps the header ASCII and 80 bytes for any name", () => {
    const stl = toStl(cubeMesh(1), `Würfel 🎲 ${"x".repeat(200)}`);
    const header = stl.subarray(0, 80);
    expect([...header].every((b) => b >= 0x20 && b <= 0x7e)).toBe(true);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(12);
  });

  it("writes a zero normal for degenerate triangles instead of NaN", () => {
    const cube = cubeMesh(1);
    const stl = toStl({ positions: cube.positions, indices: new Uint32Array([0, 1, 1]) }, "d");
    const view = new DataView(stl.buffer);
    expect([0, 4, 8].map((o) => view.getFloat32(84 + o, true))).toEqual([0, 0, 0]);
  });

  it("writes a large mesh with the exact size, count and last triangle", () => {
    // 200 000 triangles (a fan over a ring), well beyond a typical tray.
    const n = 200_000;
    const positions = new Float32Array((n + 1) * 3);
    for (let i = 0; i < n; i += 1) {
      positions[(i + 1) * 3] = i;
      positions[(i + 1) * 3 + 1] = 1;
    }
    const indices = new Uint32Array(n * 3);
    for (let t = 0; t < n; t += 1) {
      indices.set([0, t + 1, ((t + 1) % n) + 1], t * 3);
    }
    const stl = toStl({ positions, indices }, "big");
    expect(stl.length).toBe(84 + 50 * n);
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    expect(view.getUint32(80, true)).toBe(n);
    // last triangle is (0, n, 1): its second vertex is (n − 1, 1, 0)
    const last = 84 + 50 * (n - 1);
    expect(view.getFloat32(last + 12, true)).toBe(0);
    expect(view.getFloat32(last + 24, true)).toBe(n - 1);
  });
});
