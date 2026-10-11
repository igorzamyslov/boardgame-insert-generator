import type { Side } from "../model/types";
import { CORNER_MARGIN, MIN_FEATURE_MM, SPEC_TOLERANCE, maxCornerRadius } from "../model/settings";
import { MIN_RELIEF_RADIUS, RELIEF_CUT } from "./plan-types";
import type { CompartmentPlan, Rect, ReliefPlan } from "./plan-types";

interface TraySize {
  w: number;
  d: number;
}

// How far the bottom chamfer pulls the outer faces in at height z (0 above the chamfer).
function pullIn(chamfer: number, z: number): number {
  return Math.max(0, chamfer - z);
}

// Material on one side of a content rectangle that a corner relief may cut
// into: everything above MIN_FEATURE_MM toward an outer face (at the compartment
// floor, where the chamfer pulls the face in by chamfer − floorZ), half of it
// toward another compartment (which may have reliefs of its own) or its finger
// slots (which may reach past that compartment toward this one).
function sideBudget(
  size: TraySize,
  plans: CompartmentPlan[],
  self: CompartmentPlan,
  side: Side,
  chamfer: number,
): number {
  const c = self.content;
  const toFace = { front: c.y0, back: size.d - c.y1, left: c.x0, right: size.w - c.x1 }[side];
  let budget = toFace - pullIn(chamfer, self.floorZ) - MIN_FEATURE_MM;
  const obstacles = plans.flatMap((other) => (other === self ? [] : [other.rect, ...other.slots]));
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

// Ø`diameter` reliefs at the four content corners. Each circle passes
// through its corner and is centred on the corner's diagonal, so it cuts
// r·(1 − 1/√2) into both adjoining walls; r shrinks to fit the side budgets
// and reliefs below MIN_RELIEF_RADIUS are dropped.
export function planReliefs(
  size: TraySize,
  plans: CompartmentPlan[],
  self: CompartmentPlan,
  diameter: number,
  chamfer: number,
): ReliefPlan[] {
  if (!(diameter > 0)) {
    return [];
  }
  const budget: Record<Side, number> = {
    front: sideBudget(size, plans, self, "front", chamfer),
    back: sideBudget(size, plans, self, "back", chamfer),
    left: sideBudget(size, plans, self, "left", chamfer),
    right: sideBudget(size, plans, self, "right", chamfer),
  };
  const c = self.content;
  const maxR = Math.min(diameter / 2, (c.x1 - c.x0) / 2, (c.y1 - c.y0) / 2);
  const corners: [number, number, number, number, Side, Side][] = [
    [c.x0, c.y0, 1, 1, "left", "front"],
    [c.x1, c.y0, -1, 1, "right", "front"],
    [c.x1, c.y1, -1, -1, "right", "back"],
    [c.x0, c.y1, 1, -1, "left", "back"],
  ];
  const reliefs: ReliefPlan[] = [];
  for (const [x, y, sx, sy, sideX, sideY] of corners) {
    const r = Math.min(maxR, budget[sideX] / RELIEF_CUT, budget[sideY] / RELIEF_CUT);
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

function cornerDiscs(compartments: CompartmentPlan[], chamfer: number): CornerDisc[] {
  const discs: CornerDisc[] = [];
  const corners = (rect: Rect, e: number): void => {
    discs.push(
      { x: rect.x0, y: rect.y0, rho: 0, e },
      { x: rect.x1, y: rect.y0, rho: 0, e },
      { x: rect.x1, y: rect.y1, rho: 0, e },
      { x: rect.x0, y: rect.y1, rho: 0, e },
    );
  };
  for (const c of compartments) {
    const e = pullIn(chamfer, c.floorZ);
    corners(c.rect, e);
    // A slot is conservatively measured at its lowest line.
    c.slots.forEach((slot) => corners(slot, pullIn(chamfer, slot.bottomZ)));
    c.reliefs.forEach((r) => discs.push({ x: r.cx, y: r.cy, rho: r.r, e }));
  }
  return discs;
}

function nearestCorner(size: TraySize, disc: CornerDisc): { p: number; q: number } {
  return { p: Math.min(disc.x, size.w - disc.x), q: Math.min(disc.y, size.d - disc.y) };
}

// Effective outer corner radius: the setting, reduced so every compartment
// corner, slot corner and relief keeps MIN_FEATURE_MM + CORNER_MARGIN to the
// rounded outer corner (maxCornerRadius; also below the chamfer top, where the
// contour is pulled in by e), never below the bottom chamfer (a 45° chamfer
// under a corner tighter than the chamfer would overhang; planTray rejects a
// chamfer that then leaves a corner too thin, thinCorner).
export function planCornerRadius(
  size: TraySize,
  setting: number,
  chamfer: number,
  compartments: CompartmentPlan[],
): number {
  let r = Math.max(0, Math.min(setting, Math.min(size.w, size.d) / 2 - 0.01));
  for (const disc of cornerDiscs(compartments, chamfer)) {
    const { p, q } = nearestCorner(size, disc);
    if (p < r && q < r) {
      r = Math.min(r, maxCornerRadius(p, q, disc.rho + disc.e));
    }
  }
  return Math.max(r, chamfer);
}

// The thinnest outer material left at a cut corner or relief when the outer corner radius is
// `radius`: R − e − rho − distance(centre, arc centre), measured on the true arc. Null when every
// one keeps MIN_FEATURE_MM + CORNER_MARGIN (the polygon approximating the arc lies up to 0.08 mm
// inside it; SPEC_TOLERANCE aside), else a description of the first that does not.
export function thinCorner(
  size: TraySize,
  radius: number,
  chamfer: number,
  compartments: CompartmentPlan[],
): string | null {
  for (const disc of cornerDiscs(compartments, chamfer)) {
    const { p, q } = nearestCorner(size, disc);
    if (p < radius && q < radius) {
      const material = radius - disc.e - disc.rho - Math.hypot(radius - p, radius - q);
      if (material < MIN_FEATURE_MM + CORNER_MARGIN - SPEC_TOLERANCE) {
        return `a cut at ${p.toFixed(2)} × ${q.toFixed(2)} mm from an outer corner keeps only ${material.toFixed(2)} mm`;
      }
    }
  }
  return null;
}
