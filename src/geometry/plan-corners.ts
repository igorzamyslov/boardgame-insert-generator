import type { Side } from "../model/types";
import {
  CORNER_MARGIN,
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  SPEC_TOLERANCE,
  maxCornerRadius,
} from "../model/settings";
import { keepsApart } from "../model/cut-rules";
import { asEdge } from "../model/lip";
import type { BottomEdge } from "../model/lip";
import { cutFootprints, notchFloorBox } from "./plan-cuts";
import { MIN_RELIEF_RADIUS, RELIEF_CUT } from "./plan-types";
import type { CompartmentPlan, Rect, ReliefPlan } from "./plan-types";

interface TraySize {
  w: number;
  d: number;
}

// How far the bottom chamfer (or the groove) pulls the outer faces in at height z (0 above it).
function pullIn(edge: BottomEdge, z: number): number {
  return Math.max(0, edge.at(z) - z);
}

// Material on one side of a compartment that a corner relief may cut into: everything above
// MIN_WALL_MM toward an outer face (at the compartment floor, where the chamfer pulls the face in
// by chamfer − floorZ), half of what is above MIN_FEATURE_MM toward another compartment (which may
// have reliefs of its own). Toward an outer face the relief
// keeps the outer wall's CORNER_MARGIN like any cut there: near an outer corner the polygon of the
// rounded corner comes up to 0.08 mm closer than the straight face (maxCornerRadius).
function sideBudget(
  size: TraySize,
  plans: CompartmentPlan[],
  self: CompartmentPlan,
  side: Side,
  edge: BottomEdge,
): number {
  const c = self.rect;
  const toFace = { front: c.y0, back: size.d - c.y1, left: c.x0, right: size.w - c.x1 }[side];
  let budget = toFace - pullIn(edge, self.floorZ) - MIN_WALL_MM;
  const obstacles = plans.flatMap((other) => (other === self ? [] : [other.rect]));
  for (const o of obstacles) {
    const overlapsX = o.x0 < c.x1 && o.x1 > c.x0;
    const overlapsY = o.y0 < c.y1 && o.y1 > c.y0;
    let gap = Number.POSITIVE_INFINITY;
    if (side === "front" && overlapsX && o.y1 <= c.y0) {
      gap = c.y0 - o.y1;
    } else if (side === "back" && overlapsX && o.y0 >= c.y1) {
      gap = o.y0 - c.y1;
    } else if (side === "left" && overlapsY && o.x1 <= c.x0) {
      gap = c.x0 - o.x1;
    } else if (side === "right" && overlapsY && o.x0 >= c.x1) {
      gap = o.x0 - c.x1;
    }
    budget = Math.min(budget, (gap - MIN_FEATURE_MM) / 2);
  }
  return budget;
}

// The bounding box of a relief of radius r at corner (x, y), centred on the diagonal toward
// (sx, sy): it reaches r·(1 − 1/√2) past the corner and r·(1 + 1/√2) into the contents.
function reliefBox(x: number, y: number, sx: number, sy: number, r: number): Rect {
  const near = r * (Math.SQRT1_2 - 1);
  const far = r * (Math.SQRT1_2 + 1);
  const [x0, x1] = sx > 0 ? [x + near, x + far] : [x - far, x - near];
  const [y0, y1] = sy > 0 ? [y + near, y + far] : [y - far, y - near];
  return { x0, y0, x1, y1 };
}

// The largest radius up to `r` whose relief keeps MIN_FEATURE_MM from every wall cutout footprint
// (bisection: the relief's box only grows with its radius).
function clearOfCuts(
  x: number,
  y: number,
  sx: number,
  sy: number,
  r: number,
  cuts: Rect[],
): number {
  const clear = (radius: number): boolean =>
    cuts.every((cut) => keepsApart(reliefBox(x, y, sx, sy, radius), cut, 0));
  if (clear(r)) {
    return r;
  }
  let lo = 0;
  let hi = r;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// Ø`diameter` reliefs at the four compartment corners. Each circle passes
// through its corner and is centred on the corner's diagonal, so it cuts
// r·(1 − 1/√2) into both adjoining walls; r shrinks to fit the side budgets
// and to keep MIN_FEATURE_MM from every wall cutout and floor notch (its own compartment's too),
// and reliefs below MIN_RELIEF_RADIUS are dropped. A relief takes precedence over a top fillet:
// the fillets, planned last, keep clear of it (planTopFillets).
export function planReliefs(
  size: TraySize,
  plans: CompartmentPlan[],
  self: CompartmentPlan,
  diameter: number,
  chamferOrEdge: number | BottomEdge,
): ReliefPlan[] {
  if (!(diameter > 0)) {
    return [];
  }
  const edge = asEdge(chamferOrEdge);
  const budget: Record<Side, number> = {
    front: sideBudget(size, plans, self, "front", edge),
    back: sideBudget(size, plans, self, "back", edge),
    left: sideBudget(size, plans, self, "left", edge),
    right: sideBudget(size, plans, self, "right", edge),
  };
  const c = self.rect;
  const maxR = Math.min(diameter / 2, (c.x1 - c.x0) / 2, (c.y1 - c.y0) / 2);
  const corners: [number, number, number, number, Side, Side][] = [
    [c.x0, c.y0, 1, 1, "left", "front"],
    [c.x1, c.y0, -1, 1, "right", "front"],
    [c.x1, c.y1, -1, -1, "right", "back"],
    [c.x0, c.y1, 1, -1, "left", "back"],
  ];
  const cuts = cutFootprints(plans);
  const reliefs: ReliefPlan[] = [];
  for (const [x, y, sx, sy, sideX, sideY] of corners) {
    const fit = Math.min(maxR, budget[sideX] / RELIEF_CUT, budget[sideY] / RELIEF_CUT);
    const r = fit > 0 ? clearOfCuts(x, y, sx, sy, fit, cuts) : fit;
    if (r >= MIN_RELIEF_RADIUS) {
      const inset = r * Math.SQRT1_2;
      reliefs.push({ cx: x + sx * inset, cy: y + sy * inset, r });
    }
  }
  return reliefs;
}

// A cut corner or relief circle the outer corner arc must keep clear of: centre x, y, radius rho,
// and e = how far the chamfer pulls the outer contour in at the depth of the cut (the contour
// below the chamfer top is the rounded rectangle pulled in by e, arc radius R − e).
interface CornerDisc {
  x: number;
  y: number;
  rho: number;
  e: number;
}

// Sharp cut points of the part itself (where a spacer notch's sides meet its end faces), well above
// the chamfer.
interface CutPoint {
  x: number;
  y: number;
}

function cornerDiscs(
  compartments: CompartmentPlan[],
  edge: BottomEdge,
  points: readonly CutPoint[],
): CornerDisc[] {
  const discs: CornerDisc[] = points.map((pt) => ({ ...pt, rho: 0, e: 0 }));
  const corners = (rect: Rect, e: number): void => {
    discs.push(
      { x: rect.x0, y: rect.y0, rho: 0, e },
      { x: rect.x1, y: rect.y0, rho: 0, e },
      { x: rect.x1, y: rect.y1, rho: 0, e },
      { x: rect.x0, y: rect.y1, rho: 0, e },
    );
  };
  for (const c of compartments) {
    const e = pullIn(edge, c.floorZ);
    corners(c.rect, e);
    // A cut is conservatively measured at its lowest line; one with a floor notch (it goes down
    // through the bottom, and into the floor) at the bed.
    for (const cut of c.cuts) {
      if (cut.notch > 0) {
        corners(cut, edge.reach);
        corners(notchFloorBox(cut), edge.reach);
      } else {
        corners(cut, pullIn(edge, cut.bottomZ));
      }
    }
    c.reliefs.forEach((r) => discs.push({ x: r.cx, y: r.cy, rho: r.r, e }));
  }
  return discs;
}

// A cut point on an outer face (where a cut that leaves the tray meets it):
// its distance q along the face from the corner, else null. The wall between the cut's side and the
// face it runs along is thinnest at the exit face, where the corner's arc ends: q − R there, on the
// true arc and on its polygon alike (the polygon's vertices lie on the arc, its chords further
// out). So the arc ends MIN_FEATURE_MM before the side (review 1, I1: where it ran on to the side,
// that wall thinned to a wedge, 0.78 mm on the mesh).
function faceMargin(p: number, q: number): number | null {
  if (p <= SPEC_TOLERANCE) {
    return q;
  }
  return q <= SPEC_TOLERANCE ? p : null;
}

function nearestCorner(size: TraySize, disc: CornerDisc): { p: number; q: number } {
  return { p: Math.min(disc.x, size.w - disc.x), q: Math.min(disc.y, size.d - disc.y) };
}

// Effective outer corner radius: the setting, reduced so every compartment
// corner, cut corner and relief keeps MIN_FEATURE_MM + CORNER_MARGIN to the
// rounded outer corner (maxCornerRadius; also below the chamfer top, where the
// contour is pulled in by e), never below the bottom chamfer (a 45° chamfer
// under a corner tighter than the chamfer would overhang; planTray rejects a
// chamfer that then leaves a corner too thin, thinCorner).
export function planCornerRadius(
  size: TraySize,
  setting: number,
  chamferOrEdge: number | BottomEdge,
  compartments: CompartmentPlan[],
  points: readonly CutPoint[] = [],
): number {
  const edge = asEdge(chamferOrEdge);
  let r = Math.max(0, Math.min(setting, Math.min(size.w, size.d) / 2 - 0.01));
  for (const disc of cornerDiscs(compartments, edge, points)) {
    const { p, q } = nearestCorner(size, disc);
    const onFace = faceMargin(p, q);
    if (onFace !== null) {
      r = Math.min(r, onFace - MIN_FEATURE_MM);
    } else if (p < r && q < r) {
      r = Math.min(r, maxCornerRadius(p, q, disc.rho + disc.e));
    }
  }
  return Math.max(r, edge.round ?? edge.reach);
}

// The thinnest outer material left at a cut corner or relief when the outer corner radius is
// `radius`: R − e − rho − distance(centre, arc centre), measured on the true arc. Null when every
// one keeps MIN_FEATURE_MM + CORNER_MARGIN (the polygon approximating the arc lies up to 0.08 mm
// inside it; SPEC_TOLERANCE aside), else a description of the first that does not.
export function thinCorner(
  size: TraySize,
  radius: number,
  chamferOrEdge: number | BottomEdge,
  compartments: CompartmentPlan[],
  points: readonly CutPoint[] = [],
): string | null {
  for (const disc of cornerDiscs(compartments, asEdge(chamferOrEdge), points)) {
    const { p, q } = nearestCorner(size, disc);
    const onFace = faceMargin(p, q);
    if (onFace !== null) {
      if (onFace - radius < MIN_FEATURE_MM - SPEC_TOLERANCE) {
        return `a cut side meets the outer face ${onFace.toFixed(2)} mm from an outer corner, leaving ${(onFace - radius).toFixed(2)} mm of wall beside it past the arc`;
      }
    } else if (p < radius && q < radius) {
      const material = radius - disc.e - disc.rho - Math.hypot(radius - p, radius - q);
      if (material < MIN_FEATURE_MM + CORNER_MARGIN - SPEC_TOLERANCE) {
        return `a cut at ${p.toFixed(2)} × ${q.toFixed(2)} mm from an outer corner leaves only ${material.toFixed(2)} mm`;
      }
    }
  }
  return null;
}
