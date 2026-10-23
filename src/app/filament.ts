// src/app/filament.ts
// How much plastic a built part takes, as a slicer on its default profile would use it. Read from
// the part's mesh (area and volume are cheap to take from the triangles), so a chamfer, a scoop or
// a cutout counts as built. Calibrated against OrcaSlicer on six real inserts (DESIGN §7).
import type { Mesh } from "../geometry/types";
import { PLA_G_PER_MM3 } from "../layout";
import type { Settings } from "../model/types";

/**
 * How deep from a surface a slicer prints solid, whatever the infill. Not settings: nobody should
 * have to know them to read a grams figure.
 * - Sides: 2 wall loops of about 0.42 mm are 0.84 mm, but walls 1.2 to 1.6 mm thick share their
 *   loops and gap fill with the infill between, and a corner is not two full loops; 0.7 mm is what
 *   the slicer used on the calibration inserts.
 * - Up: 5 top layers, and down: 3 bottom layers, each as thick as the printer's layer.
 */
export const SIDE_SHELL_MM = 0.7;
export const TOP_LAYERS = 5;
export const BOTTOM_LAYERS = 3;

/** A face is a top or a bottom when it is within about 45 degrees of flat, else it is a side. */
const FLAT = 0.7;

/** What the estimate needs of a built part: its volume and how much surface faces which way (mm, mm²). */
export interface PartMeasure {
  volumeMm3: number;
  sideMm2: number;
  upMm2: number;
  downMm2: number;
}

/** The volume and the surface of a part's mesh, split into sides, tops and bottoms. */
export function measurePart(mesh: Mesh, volumeMm3: number): PartMeasure {
  const p = mesh.positions;
  const idx = mesh.indices;
  let side = 0;
  let up = 0;
  let down = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = (idx[t] ?? 0) * 3;
    const b = (idx[t + 1] ?? 0) * 3;
    const c = (idx[t + 2] ?? 0) * 3;
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const twice = Math.hypot(nx, ny, nz);
    if (twice === 0) {
      continue;
    }
    const area = twice / 2;
    const cos = nz / twice;
    if (cos > FLAT) {
      up += area;
    } else if (cos < -FLAT) {
      down += area;
    } else {
      side += area;
    }
  }
  return { volumeMm3, sideMm2: side, upMm2: up, downMm2: down };
}

/**
 * The plastic of one part, in grams: the shell (surface × how deep it prints solid, but never more
 * than the part itself, so a thin wall prints fully solid) plus the rest of the volume at the infill.
 */
export function partGrams(
  m: PartMeasure,
  settings: Pick<Settings, "infill">,
  layerHeight: number,
): number {
  const infill = Math.min(100, Math.max(0, settings.infill)) / 100;
  const shell = Math.min(
    m.volumeMm3,
    m.sideMm2 * SIDE_SHELL_MM +
      m.upMm2 * TOP_LAYERS * layerHeight +
      m.downMm2 * BOTTOM_LAYERS * layerHeight,
  );
  return (shell + (m.volumeMm3 - shell) * infill) * PLA_G_PER_MM3;
}
