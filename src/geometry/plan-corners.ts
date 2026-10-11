import type { Side } from "../model/types";
import { MIN_FEATURE_MM, maxCornerRadius } from "../model/settings";
import { MIN_RELIEF_RADIUS, RELIEF_CUT } from "./plan-types";
import type { CompartmentPlan, ReliefPlan } from "./plan-types";

export interface TraySize {
  w: number;
  d: number;
}

// Material on one side of a content rectangle that a corner relief may cut
// into: everything above MIN_FEATURE_MM toward an outer face, half of it toward
// another compartment (which may have reliefs of its own).
export function sideBudget(
  size: TraySize,
  plans: CompartmentPlan[],
  self: CompartmentPlan,
  side: Side,
): number {
  const c = self.content;
  const toFace = { front: c.y0, back: size.d - c.y1, left: c.x0, right: size.w - c.x1 }[side];
  let budget = toFace - MIN_FEATURE_MM;
  for (const other of plans) {
    if (other === self) {
      continue;
    }
    const o = other.rect;
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
): ReliefPlan[] {
  if (!(diameter > 0)) {
    return [];
  }
  const budget: Record<Side, number> = {
    front: sideBudget(size, plans, self, "front"),
    back: sideBudget(size, plans, self, "back"),
    left: sideBudget(size, plans, self, "left"),
    right: sideBudget(size, plans, self, "right"),
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

// Effective outer corner radius: the setting, reduced so no compartment
// corner, slot corner or relief comes closer than MIN_FEATURE_MM to a rounded
// outer corner, never below the bottom chamfer (a 45° chamfer under a corner
// tighter than the chamfer would overhang).
export function planCornerRadius(
  size: TraySize,
  setting: number,
  chamfer: number,
  compartments: CompartmentPlan[],
): number {
  let r = Math.max(0, Math.min(setting, Math.min(size.w, size.d) / 2 - 0.01));
  const discs: [number, number, number][] = [];
  for (const c of compartments) {
    for (const rect of [c.rect, ...c.slots]) {
      discs.push(
        [rect.x0, rect.y0, 0],
        [rect.x1, rect.y0, 0],
        [rect.x1, rect.y1, 0],
        [rect.x0, rect.y1, 0],
      );
    }
    for (const relief of c.reliefs) {
      discs.push([relief.cx, relief.cy, relief.r]);
    }
  }
  for (const [x, y, rho] of discs) {
    const p = Math.min(x, size.w - x);
    const q = Math.min(y, size.d - y);
    if (p < r && q < r) {
      r = Math.min(r, maxCornerRadius(p, q, rho));
    }
  }
  return Math.max(r, chamfer);
}
