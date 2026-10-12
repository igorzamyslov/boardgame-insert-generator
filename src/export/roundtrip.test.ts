// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "../geometry/load";
import { buildTray } from "../geometry/tray";
import { GEO, lippedLower, scoopBulk, slotStrip, uprightChannel } from "../geometry/test-specs";
import { signedVolume, topology } from "../geometry/test-mesh";
import type { Mesh } from "../geometry/types";
import { gridLayout, partFileName, to3mf, toStl, zipFiles } from "./index";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

// Minimal reader for the XML our writer emits.
function readModel(xml: string): { name: string; mesh: Mesh }[] {
  return xml
    .split("<object ")
    .slice(1)
    .map((chunk) => {
      const name = /name="([^"]*)"/.exec(chunk)?.[1] ?? "";
      const verts = [...chunk.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(
        (v) => [v[1], v[2], v[3]].map(Number),
      );
      const tris = [...chunk.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(
        (t) => [t[1], t[2], t[3]].map(Number),
      );
      return { name, mesh: { positions: new Float32Array(verts), indices: new Uint32Array(tris) } };
    });
}

describe("export round trip with real trays", () => {
  it("keeps every tray closed, outward-wound and the same size in the combined 3MF", () => {
    const specs = [uprightChannel, slotStrip, scoopBulk, lippedLower];
    const built = specs.map((s) => buildTray(m, s, GEO));
    const offsets = gridLayout(specs, { x: 246, y: 246 }, 5);
    const bytes = to3mf(
      built.map((b, i) => ({
        name: specs[i]?.key ?? "",
        mesh: b.mesh,
        transform: offsets[i] ?? [0, 0, 0],
      })),
    );
    const model = strFromU8(unzipSync(bytes)["3D/3dmodel.model"] ?? new Uint8Array());
    expect(model).toContain('unit="millimeter"');
    const parsed = readModel(model);
    expect(parsed.map((p) => p.name)).toEqual(specs.map((s) => s.key));
    parsed.forEach((p, i) => {
      const original = built[i];
      expect(p.mesh.positions.length).toBe(original?.mesh.positions.length);
      expect(p.mesh.indices.length).toBe(original?.mesh.indices.length);
      expect(topology(p.mesh).closed).toBe(true);
      expect(signedVolume(p.mesh)).toBeGreaterThan(0);
      expect(Math.abs(signedVolume(p.mesh) - (original?.volumeMm3 ?? 0))).toBeLessThan(1);
    });
  });

  it("STL zip has one file per part with 84 + 50n bytes", () => {
    const b = buildTray(m, scoopBulk, GEO);
    const stl = toStl(b.mesh, "Bits");
    expect(stl.length).toBe(84 + 50 * (b.mesh.indices.length / 3));
    const name = partFileName(1, "Bits ×3", "stl");
    const files = unzipSync(zipFiles([{ name, data: stl }]));
    expect(Object.keys(files)).toEqual(["01-Bits-3.stl"]);
    expect(files[name]?.length).toBe(stl.length);
  });
});
