// Test helper: everything wrong with a built tray's mesh (topology, volume, bounds and
// printability), shared by the mesh sweeps and cases.
import type { ManifoldToplevel } from "manifold-3d";
import { lipAbove, slabUnder } from "../model/lip";
import { MIN_FEATURE_MM } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { checkPrintability } from "./printability";
import { bounds, signedVolume, topology } from "./test-mesh";
import { floorHoles } from "./test-specs";
import { buildTray } from "./tray";
import type { Mesh } from "./types";

// Everything wrong with the mesh of `spec`, or [] when it is a closed, printable solid of the
// spec's size.
export function problemsOf(m: ManifoldToplevel, spec: TraySpec, settings: Settings): string[] {
  const { mesh, volumeMm3 } = buildTray(m, spec, settings);
  const problems: string[] = [];
  const topo = topology(mesh);
  const holes = floorHoles(spec, settings);
  if (!topo.closed || topo.genus !== holes) {
    problems.push(
      `not a closed solid with ${holes} floor holes (closed ${topo.closed}, genus ${topo.genus})`,
    );
  }
  if (!(volumeMm3 > 0) || Math.abs(signedVolume(mesh) - volumeMm3) > 1) {
    problems.push(`volume ${volumeMm3} (mesh ${signedVolume(mesh)})`);
  }
  const b = bounds(mesh);
  const expected = [
    spec.w,
    spec.d,
    spec.h + lipAbove(settings, spec.lip) + slabUnder(settings, spec),
  ];
  const off = b.max.some(
    (v, k) => Math.abs(v - (expected[k] ?? 0)) > 1e-3 || Math.abs(b.min[k] ?? 1) > 1e-3,
  );
  if (off) {
    problems.push(`bounding box ${b.min.join(",")}..${b.max.join(",")} vs ${expected.join(",")}`);
  }
  const report = checkPrintability(mesh);
  if (!report.ok) {
    problems.push(...report.problems);
  }
  return problems;
}

/**
 * The pieces of the mesh's horizontal slices at heights `zs` thinner than MIN_FEATURE_MM: what an
 * opening by a square of that side (shrink, then grow back, mitred, so square corners come back
 * whole) takes away, over `minArea` mm² (the mitred offsets leave about 0.014 mm² where a corner
 * meets a short faceted edge; a feather between a relief and a top fillet was 0.03–0.06).
 * checkPrintability sees only faces, not how thin the solid between sloped ones is (review 3, M1).
 */
export function thinSlices(
  m: ManifoldToplevel,
  mesh: Mesh,
  zs: readonly number[],
  minArea = 0.02,
): string[] {
  const solid = new m.Manifold(
    new m.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }),
  );
  const half = MIN_FEATURE_MM / 2 - 1e-3;
  const thin: string[] = [];
  for (const z of zs) {
    const slice = solid.slice(z);
    const shrunk = slice.offset(-half, "Miter", 2);
    const opened = shrunk.offset(half, "Miter", 2);
    const lost = slice.subtract(opened);
    for (const piece of lost.decompose()) {
      const area = piece.area();
      if (area > minArea) {
        const b = piece.bounds();
        const at = [b.min[0], b.min[1], b.max[0], b.max[1]].map((v) => v.toFixed(2)).join(", ");
        thin.push(`z ${z.toFixed(2)}: ${area.toFixed(3)} mm² at ${at}`);
      }
      piece.delete();
    }
    [slice, shrunk, opened, lost].forEach((x) => x.delete());
  }
  solid.delete();
  return thin;
}
