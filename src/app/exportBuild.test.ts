// src/app/exportBuild.test.ts
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { GeometryBuildError } from "../geometry/client";
import type { FeatureSpec } from "../model/types";
import {
  NothingToExportError,
  buildCombined3mf,
  buildPartsZip,
  buildStlZip,
  meshFootprint,
  objectName,
  planExport,
  printMesh,
} from "./exportBuild";
import type { BuiltMesh } from "./meshes";
import { cubeMesh, makeTray } from "./test-helpers";
import type { Mesh } from "../geometry/types";

const ok = (): Promise<BuiltMesh> =>
  Promise.resolve({ mesh: cubeMesh([20, 30, 10]), volumeMm3: 6000 });

function trays(n: number) {
  return Array.from({ length: n }, (_v, i) => makeTray({ key: `t${i}:p0:0`, stack: i }));
}

describe("planExport", () => {
  it("numbers parts and sets aside unsupported ones with a reason", () => {
    const magnet = makeTray({
      key: "m:p0:0",
      stack: 9,
      compartments: [
        {
          x: 2,
          y: 2,
          w: 9,
          d: 9,
          floorZ: 1.2,
          kind: "well",
          contents: "M",
          features: [{ type: "magnet" } as unknown as FeatureSpec],
        },
      ],
    });
    const plan = planExport([...trays(2), magnet]);
    expect(plan.parts.map((p) => p.number)).toEqual([1, 2]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]?.reason).toMatch(/magnet/);
    expect(plan.skipped[0]?.part.number).toBe(3);
  });
});

describe("export builders", () => {
  it("yields after every part for 25 parts and reports monotonic progress", async () => {
    const parts = planExport(trays(25)).parts;
    const events: string[] = [];
    const out = await buildPartsZip(parts, {
      getMesh: () => {
        events.push("mesh");
        return ok();
      },
      onProgress: (p) => {
        expect(p.total).toBe(25);
        events.push(`progress:${p.done}`);
      },
      yieldToUi: () => {
        events.push("yield");
        return Promise.resolve();
      },
    });
    // Mesh phase: progress 0, then per part a mesh, its progress and a yield before the next mesh.
    const expected = ["progress:0"];
    for (let i = 1; i <= 25; i += 1) {
      expected.push("mesh", `progress:${String(i)}`, "yield");
    }
    expect(events.slice(0, expected.length)).toEqual(expected);
    // Write phase: one yield after every file.
    expect(events.slice(expected.length)).toEqual(Array.from({ length: 25 }, () => "yield"));
    expect(events.filter((e) => e.startsWith("progress"))).toHaveLength(26);
    expect(events.filter((e) => e === "yield")).toHaveLength(50);
    const files = Object.keys(unzipSync(out.data));
    expect(files).toHaveLength(25);
    expect(files.every((f) => /^\d\d-[A-Za-z0-9._-]+\.3mf$/.test(f))).toBe(true);
    expect(out.included).toBe(25);
  });

  it("rethrows an abort instead of reporting it as a failed part", async () => {
    const parts = planExport(trays(3)).parts;
    const getMesh = vi.fn((spec: { key: string }) =>
      spec.key === "t1:p0:0"
        ? Promise.reject(new GeometryBuildError("cancelled", "AbortError"))
        : ok(),
    );
    await expect(
      buildPartsZip(parts, {
        getMesh,
        onProgress: vi.fn(),
        yieldToUi: () => Promise.resolve(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(getMesh).toHaveBeenCalledTimes(2);
  });

  it("continues past a tray whose mesh fails and reports it", async () => {
    const parts = planExport(trays(3)).parts;
    const getMesh = vi.fn((spec: { key: string }) =>
      spec.key === "t1:p0:0"
        ? Promise.reject(
            new GeometryBuildError("Tray t1:p0:0: compartments overlap", "TraySpecError"),
          )
        : ok(),
    );
    const out = await buildStlZip(parts, {
      getMesh,
      onProgress: vi.fn(),
      yieldToUi: () => Promise.resolve(),
    });
    expect(Object.keys(unzipSync(out.data))).toHaveLength(2);
    expect(Object.keys(unzipSync(out.data)).every((f) => f.endsWith(".stl"))).toBe(true);
    expect(out.failed.map((f) => [f.part.number, f.reason])).toEqual([
      [2, "Tray t1:p0:0: compartments overlap"],
    ]);
  });

  it("writes one combined 3MF laid out in a grid", async () => {
    const parts = planExport(trays(4)).parts;
    const out = await buildCombined3mf(
      parts,
      { x: 200, y: 200 },
      // no yieldToUi: the default, a real macrotask yield, completes the export too
      { getMesh: ok, onProgress: vi.fn() },
    );
    expect(String.fromCharCode(out.data[0] ?? 0, out.data[1] ?? 0)).toBe("PK");
    expect(out.included).toBe(4);
  });

  it("refuses when nothing could be built", async () => {
    const parts = planExport(trays(1)).parts;
    await expect(
      buildPartsZip(parts, {
        getMesh: () => Promise.reject(new Error("Geometry worker failed: crash")),
        onProgress: vi.fn(),
        yieldToUi: () => Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(NothingToExportError);
  });

  it("names objects and measures footprints", () => {
    const part = planExport(trays(1)).parts[0];
    if (!part) {
      throw new Error("no part");
    }
    expect(objectName(part)).toBe("01 Deck A ×40");
    expect(meshFootprint(cubeMesh([20, 30, 10]))).toEqual({ w: 20, d: 30 });
  });
});

describe("a merged part that prints upside down (merged.flipped)", () => {
  const merged = (flipped: boolean) =>
    makeTray({
      key: "merged:0",
      part: "leftover",
      solid: true,
      compartments: [],
      w: 20,
      d: 30,
      h: 10,
      merged: { members: [], bridges: [], flipped },
    });
  /** A wedge, so that turning it over shows: tall at the back (y = d), low at the front. */
  const wedge: Mesh = {
    positions: new Float32Array([0, 0, 0, 20, 0, 0, 20, 30, 0, 0, 30, 0, 0, 30, 10, 20, 30, 10]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4]),
  };

  it("prints every other part, and a merged part that stands, as it was built", () => {
    expect(printMesh(makeTray(), wedge)).toBe(wedge);
    expect(printMesh(merged(false), wedge)).toBe(wedge);
  });

  it("turns a flipped one half a turn about X, back on the bed, without mirroring it", () => {
    const out = printMesh(merged(true), wedge);
    expect(out).not.toBe(wedge);
    expect(Array.from(out.indices)).toEqual(Array.from(wedge.indices));
    // (x, y, z) -> (x, d - y, h - z)
    expect(Array.from(out.positions.slice(0, 6))).toEqual([0, 30, 10, 20, 30, 10]);
    expect(Array.from(out.positions.slice(12, 15))).toEqual([0, 0, 0]);
    // the same footprint and height, so it lays out on the bed as before
    expect(meshFootprint(out)).toEqual(meshFootprint(wedge));
    // a rotation keeps the winding: the cube's volume is positive before and after
    const cube = cubeMesh([20, 30, 10]);
    const turned = printMesh(merged(true), cube);
    expect(Array.from(turned.indices)).toEqual(Array.from(cube.indices));
    expect(turned.positions[2]).toBe(10); // the old bottom corner (0, 0, 0) is now (0, 30, 10)
    expect(turned.positions[1]).toBe(30);
  });

  it("is what the export writes: the STL holds the turned mesh", async () => {
    const parts = planExport([merged(true)]).parts;
    const seen: Mesh[] = [];
    const out = await buildStlZip(parts, {
      getMesh: () => {
        seen.push(wedge);
        return Promise.resolve({ mesh: wedge, volumeMm3: 1 });
      },
      onProgress: vi.fn(),
      yieldToUi: () => Promise.resolve(),
    });
    expect(out.included).toBe(1);
    expect(seen).toHaveLength(1);
    const stl = Object.values(unzipSync(out.data))[0] as Uint8Array;
    // binary STL: 80-byte header, a count, then 50 bytes a triangle (normal, three vertices)
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    // first triangle (0,0,0) (20,0,0) (20,30,0) turned: (0,30,10) (20,30,10) (20,0,10)
    expect(view.getFloat32(84 + 12 + 4, true)).toBe(30);
    expect(view.getFloat32(84 + 12 + 8, true)).toBe(10);
  });
});
