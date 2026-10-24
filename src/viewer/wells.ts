// src/viewer/wells.ts
// Which compartment each triangle of a tray's mesh lies inside, so the scene can draw a well's floor
// and inner walls in the well's own colour (the plan draws its cells so). The mesh is one solid and
// stays one: this only reads it, and the export never sees it. Pure, so it is tested without a renderer.
import type { Mesh } from "../geometry/types";
import type { TraySpec } from "../model/types";

/** How far off a compartment's rectangle (and floor) a vertex may be and still lie on it, mm. */
export const WELL_TOLERANCE_MM = 0.05;

/** A triangle in no compartment: the tray's body. */
export const BODY = -1;

interface Well {
  index: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The lowest z of what is cut for it: its floor, or the floor of a divider slot in it. */
  zMin: number;
}

/** The rectangles of a part's compartments in the mesh's frame (z = 0 at the bed, `below` under the seam). */
function wellsOf(spec: TraySpec, below: number): Well[] {
  // A solid part and a merged one (fillers and risers only) have no wells to colour.
  if (spec.solid || spec.merged !== undefined) {
    return [];
  }
  return spec.compartments.map((c, index) => {
    const slot = Math.max(
      0,
      ...(c.features ?? []).map((f) => (f.type === "dividerSlot" ? f.depth : 0)),
    );
    return {
      index,
      x0: c.x - WELL_TOLERANCE_MM,
      y0: c.y - WELL_TOLERANCE_MM,
      x1: c.x + c.w + WELL_TOLERANCE_MM,
      y1: c.y + c.d + WELL_TOLERANCE_MM,
      zMin: below + c.floorZ - slot - WELL_TOLERANCE_MM,
    };
  });
}

/**
 * For each triangle of `mesh`, the index of the compartment of `spec` it lies in, or BODY. A
 * triangle lies in a compartment when its three corners are inside its rectangle (so the floor, the
 * inner walls, the rounded inner corners and a scoop's fillet, but not the rim, which spans the wall
 * to the next well, nor a cut through the wall, which runs past the rectangle) and at or above its
 * floor (a divider slot sunk into the floor counts), and it does not face down (the bed under the
 * well, and a name engraved in it, are the body's). `below` is how far the mesh's bed face is under
 * the spec's z (a part with the stepped base hangs a slab).
 */
export function wellOfTriangles(spec: TraySpec, mesh: Mesh, below = 0): Int32Array {
  const count = mesh.indices.length / 3;
  const out = new Int32Array(count).fill(BODY);
  const wells = wellsOf(spec, below);
  if (wells.length === 0) {
    return out;
  }
  const p = mesh.positions;
  const at = (i: number): [number, number, number] => [
    p[3 * i] ?? 0,
    p[3 * i + 1] ?? 0,
    p[3 * i + 2] ?? 0,
  ];
  for (let t = 0; t < count; t++) {
    const a = at(mesh.indices[3 * t] ?? 0);
    const b = at(mesh.indices[3 * t + 1] ?? 0);
    const c = at(mesh.indices[3 * t + 2] ?? 0);
    // Facing down: the z of the cross product of two edges (CCW seen from outside).
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const area = Math.hypot(
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      nz,
    );
    if (area > 0 && nz / area < -0.5) {
      continue;
    }
    const zLow = Math.min(a[2], b[2], c[2]);
    for (const w of wells) {
      if (
        zLow >= w.zMin &&
        [a, b, c].every((v) => v[0] >= w.x0 && v[0] <= w.x1 && v[1] >= w.y0 && v[1] <= w.y1)
      ) {
        out[t] = w.index;
        break;
      }
    }
  }
  return out;
}

/**
 * A mesh's triangles sorted by what they are drawn in, as the draw ranges of one index buffer:
 * `indices` holds every triangle of the first class, then of the second, and so on; `groups` says,
 * for each class that has any, where its triangles start and how many there are (in indices). The
 * vertices are untouched, so the geometry stays the one mesh. `classes[i]` is the class of
 * triangle i; a class with no triangle has no group.
 */
export function groupTriangles(
  indices: Uint32Array,
  classes: ArrayLike<number>,
  classCount: number,
): { indices: Uint32Array; groups: { start: number; count: number; cls: number }[] } {
  const counts = new Array<number>(classCount).fill(0);
  for (const cls of Array.from(classes)) {
    counts[cls] = (counts[cls] ?? 0) + 1;
  }
  const starts: number[] = [];
  let next = 0;
  for (const n of counts) {
    starts.push(next);
    next += n * 3;
  }
  const fill = [...starts];
  const sorted = new Uint32Array(indices.length);
  for (let t = 0; t < classes.length; t++) {
    const cls = classes[t] ?? 0;
    const to = fill[cls] ?? 0;
    sorted[to] = indices[3 * t] ?? 0;
    sorted[to + 1] = indices[3 * t + 1] ?? 0;
    sorted[to + 2] = indices[3 * t + 2] ?? 0;
    fill[cls] = to + 3;
  }
  const groups = counts
    .map((n, cls) => ({ start: starts[cls] ?? 0, count: n * 3, cls }))
    .filter((g) => g.count > 0);
  return { indices: sorted, groups };
}
