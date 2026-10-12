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
} from "./exportBuild";
import type { ExportProgress } from "./exportBuild";
import type { BuiltMesh } from "./meshes";
import { cubeMesh, makeTray } from "./test-helpers";

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
    const progress: ExportProgress[] = [];
    const yieldToUi = vi.fn(() => Promise.resolve());
    const out = await buildPartsZip(parts, {
      getMesh: ok,
      onProgress: (p) => progress.push(p),
      yieldToUi,
    });
    expect(yieldToUi.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(progress[0]).toEqual({ done: 0, total: 25 });
    expect(progress.at(-1)).toEqual({ done: 25, total: 25 });
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]?.done).toBeGreaterThanOrEqual(progress[i - 1]?.done ?? 0);
    }
    const files = Object.keys(unzipSync(out.data));
    expect(files).toHaveLength(25);
    expect(files.every((f) => /^\d\d-[A-Za-z0-9._-]+\.3mf$/.test(f))).toBe(true);
    expect(out.included).toBe(25);
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
