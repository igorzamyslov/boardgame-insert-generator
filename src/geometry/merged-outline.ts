import type { Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";
import type { Scope } from "./scope";
import { quarterSegments } from "./shapes";

// The outline of a merged part (several fillers and risers printed as one, buildMerged): the union
// of its members' footprints and bridges, rounded once. Every outline of a merged part is a union
// of axis-aligned rectangles, so every corner is a right angle, either convex (material inside the
// angle: it gets the corner radius, as a part alone would) or concave (it stays sharp: rounding it
// would add material to the gap between two trays). Built from the rectangles' union and not from
// rounded members, so the seams between members leave no step.

/** A rectangle of the footprint, mm; `radius` is the corner radius of the member it belongs to. */
export interface FootBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Absent for a bridge, which has no corners of its own. */
  radius?: number;
}

/** The rounded outline: closed rings (the material on the left of each, so holes run clockwise). */
export interface Outline {
  rings: Vec2[][];
  /**
   * Per ring point, the step that pulls the outline in by `inset` on both adjoining edges (the
   * ring's point at the bed, under a 45° chamfer of that size).
   */
  pulled: Vec2[][];
}

const SAME = 1e-3; // two points closer than this are one (mm)
const MIN_ARC_LEFT = 0.05; // a chamfer may leave a corner arc at least this much radius

type Point = readonly [number, number];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const len = (a: Point): number => Math.hypot(a[0], a[1]);
const unit = (a: Point): Point => {
  const l = len(a);
  return [a[0] / l, a[1] / l];
};
const left = (a: Point): Point => [-a[1], a[0]];

/** A ring without repeated points and without points in the middle of a straight run. */
function simplified(ring: readonly Vec2[]): Vec2[] {
  let pts = ring.map((p): Vec2 => [p[0], p[1]]);
  for (let again = true; again;) {
    again = false;
    const next: Vec2[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const prev = pts[(i + pts.length - 1) % pts.length] as Vec2;
      const p = pts[i] as Vec2;
      const after = pts[(i + 1) % pts.length] as Vec2;
      const a = sub(p, prev);
      const b = sub(after, p);
      const dropped = len(a) < SAME || Math.abs(a[0] * b[1] - a[1] * b[0]) < SAME * len(b);
      if (dropped && pts.length > 3) {
        again = true;
      } else {
        next.push(p);
      }
    }
    pts = next;
  }
  return pts;
}

/**
 * The outline of the union of `boxes`, its convex corners rounded with the radius of the box that
 * has a corner there (the smallest, where several do; `fallback` where none has), at most half of
 * either edge it joins; null when this cannot be done safely: a radius that would leave the
 * chamfer `inset` less than MIN_ARC_LEFT of an arc, or no outline at all. The arcs have
 * `quarterSegments(radius)` segments on a corner, as the rounded rectangles of shapes.ts.
 */
export function mergedOutline(
  m: ManifoldToplevel,
  scope: Scope,
  boxes: readonly FootBox[],
  inset: number,
  fallback: number,
): Outline | null {
  const parts = boxes.map((b) =>
    scope.track(m.CrossSection.square([b.x1 - b.x0, b.y1 - b.y0]).translate([b.x0, b.y0])),
  );
  const union = scope.track(m.CrossSection.union(parts));
  const polygons = union.toPolygons().map(simplified);
  if (polygons.length === 0 || polygons.some((p) => p.length < 4)) {
    return null;
  }
  const radiusAt = (p: Point): number => {
    const found = boxes.flatMap((b) =>
      b.radius !== undefined &&
      [b.x0, b.x1].some((x) => Math.abs(x - p[0]) < SAME) &&
      [b.y0, b.y1].some((y) => Math.abs(y - p[1]) < SAME)
        ? [b.radius]
        : [],
    );
    return found.length > 0 ? Math.min(...found) : fallback;
  };
  const rings: Vec2[][] = [];
  const pulled: Vec2[][] = [];
  for (const polygon of polygons) {
    const ring: Vec2[] = [];
    const n = polygon.length;
    for (let i = 0; i < n; i += 1) {
      const prev = polygon[(i + n - 1) % n] as Vec2;
      const p = polygon[i] as Vec2;
      const next = polygon[(i + 1) % n] as Vec2;
      const into = sub(p, prev);
      const out = sub(next, p);
      const turn = into[0] * out[1] - into[1] * out[0];
      if (turn <= 0) {
        ring.push(p); // a concave corner stays sharp
        continue;
      }
      const r = Math.min(radiusAt(p), len(into) / 2, len(out) / 2);
      if (!(r >= inset + MIN_ARC_LEFT)) {
        return null;
      }
      const u1 = unit(into);
      const u2 = unit(out);
      // The arc runs from p − r·u1 to p + r·u2 round the centre p − r·u1 + r·u2.
      const centre: Point = [p[0] - r * u1[0] + r * u2[0], p[1] - r * u1[1] + r * u2[1]];
      const a0 = Math.atan2(-u2[1], -u2[0]);
      const segments = quarterSegments(r);
      for (let k = 0; k <= segments; k += 1) {
        const a = a0 + (Math.PI / 2) * (k / segments);
        ring.push([centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)]);
      }
    }
    const rounded = simplified(ring);
    rings.push(rounded);
    const step: Vec2[] = [];
    for (let i = 0; i < rounded.length; i += 1) {
      const prev = rounded[(i + rounded.length - 1) % rounded.length] as Vec2;
      const p = rounded[i] as Vec2;
      const next = rounded[(i + 1) % rounded.length] as Vec2;
      const n1 = left(unit(sub(p, prev)));
      const n2 = left(unit(sub(next, p)));
      const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      if (!(k > 0.2)) {
        return null;
      }
      step.push([(inset * (n1[0] + n2[0])) / k, (inset * (n1[1] + n2[1])) / k]);
    }
    pulled.push(step);
  }
  return { rings, pulled };
}

/** One height of a merged part: the outline it has up to `top`, mm above the floor. */
export interface Band {
  outline: Outline;
  top: number;
}

/**
 * The solid of a merged part's outlines (`bands`, lowest top first; each is inside the one before,
 * since a taller member's footprint is part of every lower band's): each band is its outline
 * straight up to its top, and the first has the bottom edge pulled in 45° by `inset`, along the
 * whole joined outline. Null when the chamfer cannot be put on (a ring point is missing from the
 * kernel's own cross-section).
 */
export function mergedBody(
  m: ManifoldToplevel,
  scope: Scope,
  bands: readonly Band[],
  inset: number,
): Manifold | null {
  const prisms: Manifold[] = [];
  for (const [i, { outline, top }] of bands.entries()) {
    const section = scope.track(m.CrossSection.ofPolygons(outline.rings, "NonZero"));
    const chamfered = i === 0 && inset > 0;
    const from = i === 0 ? 0 : inset;
    const first = chamfered ? inset : from;
    prisms.push(scope.track(m.Manifold.extrude(section, top - first).translate([0, 0, first])));
    if (chamfered) {
      const slab = scope.track(m.Manifold.extrude(section, inset));
      const spots = outline.rings.flatMap((ring, r) =>
        ring.map((p, k) => ({ p, step: (outline.pulled[r] as Vec2[])[k] as Vec2 })),
      );
      let missed = 0;
      const pulled = scope.track(
        slab.warp((v) => {
          if (v[2] > 1e-9) {
            return;
          }
          const at = spots.find(({ p }) => Math.hypot(p[0] - v[0], p[1] - v[1]) < SAME / 10);
          if (at) {
            v[0] += at.step[0];
            v[1] += at.step[1];
          } else {
            missed += 1;
          }
        }),
      );
      if (missed > 0) {
        return null;
      }
      prisms.push(pulled);
    }
  }
  return scope.track(m.Manifold.union(prisms));
}
