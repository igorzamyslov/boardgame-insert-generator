// Test helper: everything wrong with a built tray's mesh (topology, volume, bounds and
// printability), shared by the mesh sweeps and cases.
import type { ManifoldToplevel } from "manifold-3d";
import type { Settings, TraySpec } from "../model/types";
import { checkPrintability } from "./printability";
import { bounds, signedVolume, topology } from "./test-mesh";
import { floorHoles } from "./test-specs";
import { buildTray } from "./tray";

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
  const expected = [spec.w, spec.d, spec.h + (spec.lip ? settings.lip.height : 0)];
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
