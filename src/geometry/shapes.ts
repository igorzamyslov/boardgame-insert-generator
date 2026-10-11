import type { Manifold, ManifoldToplevel, Vec2, Vec3 } from "manifold-3d";
import type { Scope } from "./scope";

// Every solid here is convex and built with Manifold.hull over points we
// generate ourselves. That keeps arcs on fixed angles (k · 90° / n), so a
// ring and its inset copy have matching vertices and a lofted 45° chamfer is
// made of exact 45° (or steeper) facets.

export interface Layer {
  ring: Vec2[];
  z: number;
}

// Segments per 90° of arc: 2 for tiny radii, up to 16 (64 per circle).
export function quarterSegments(r: number): number {
  return Math.min(16, Math.max(2, Math.ceil(r * 2)));
}

// Rectangle [x0, x1] × [y0, y1] with corner radius r, counter-clockwise.
// n = segments per corner; pass the same n to rings that are lofted together.
export function roundedRectRing(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  n: number,
): Vec2[] {
  if (r <= 1e-6) {
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -90],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, 90],
    [x0 + r, y0 + r, 180],
  ];
  const pts: Vec2[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= n; k += 1) {
      const a = ((a0 + (90 * k) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

// Circle with `segments` vertices (a multiple of 4), the first at angle 0,
// so there are vertices exactly at 0°, 90°, 180° and 270°.
export function circleRing(cx: number, cy: number, r: number, segments: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k < segments; k += 1) {
    const a = (2 * Math.PI * k) / segments;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function hullPoints(m: ManifoldToplevel, scope: Scope, points: Vec3[]): Manifold {
  return scope.track(m.Manifold.hull(points));
}

// Convex hull of horizontal rings placed at their z (a loft of convex rings).
export function loft(m: ManifoldToplevel, scope: Scope, layers: Layer[]): Manifold {
  const points: Vec3[] = [];
  for (const { ring, z } of layers) {
    for (const [x, y] of ring) {
      points.push([x, y, z]);
    }
  }
  return hullPoints(m, scope, points);
}

export function prism(
  m: ManifoldToplevel,
  scope: Scope,
  ring: Vec2[],
  z0: number,
  z1: number,
): Manifold {
  return loft(m, scope, [
    { ring, z: z0 },
    { ring, z: z1 },
  ]);
}

export function box(m: ManifoldToplevel, scope: Scope, min: Vec3, max: Vec3): Manifold {
  return prism(m, scope, roundedRectRing(min[0], min[1], max[0], max[1], 0, 1), min[2], max[2]);
}

// Horizontal cylinder of radius r whose axis runs along X (axis "x") or Y
// (axis "y") from `from` to `to`, through the point (a, z) where a is the
// cross-axis coordinate (y for axis "x", x for axis "y").
export function horizontalCylinder(
  m: ManifoldToplevel,
  scope: Scope,
  axis: "x" | "y",
  from: number,
  to: number,
  a: number,
  z: number,
  r: number,
): Manifold {
  const points: Vec3[] = [];
  for (const [u, v] of circleRing(a, z, r, 4 * quarterSegments(r))) {
    for (const e of [from, to]) {
      points.push(axis === "x" ? [e, u, v] : [u, e, v]);
    }
  }
  return hullPoints(m, scope, points);
}
