// src/plan/layers.ts
import { effective } from "../model/settings";
import type { Box, Settings, TraySpec } from "../model/types";

export interface PlanFrame {
  bc: number;
  usableW: number;
  usableD: number;
  innerW: number;
  innerD: number;
}

export function planFrame(box: Box, settings: Settings): PlanFrame {
  const bc = effective(settings).boxClearance;
  return {
    bc,
    usableW: box.innerWidth - 2 * bc,
    usableD: box.innerDepth - 2 * bc,
    innerW: box.innerWidth,
    innerD: box.innerDepth,
  };
}

/**
 * A part that goes into or under a tray rather than standing in the plan on its own: a card
 * spacer or divider, or the riser under a stack. It is numbered and listed, but not drawn as a tray.
 */
export function isAddOn(t: Pick<TraySpec, "part">): boolean {
  return t.part === "spacer" || t.part === "riser" || t.part === "divider";
}

export function levelsOf(trays: readonly TraySpec[]): number[] {
  const levels = new Set(trays.filter((t) => !isAddOn(t)).map((t) => t.level));
  return [...levels].sort((a, b) => a - b);
}

/**
 * The height of each layer, bottom first (the order of `levelsOf`). A layer's height is the stretch
 * from its lower edge to the next layer's: the lower edge is the least z of its trays (0 for the
 * first layer), and the top layer ends at the plan's highest point. The heights therefore add up to
 * the status line's "H of B mm high", which counts the same way. (The Layer switch no longer
 * prints them: DESIGN §7.)
 */
export function layerHeights(trays: readonly TraySpec[]): number[] {
  const levels = levelsOf(trays);
  const top = Math.max(0, ...trays.map((t) => t.z + t.h));
  const lower = levels.map((level, i) =>
    i === 0 ? 0 : Math.min(...traysAt(trays, level).map((t) => t.z)),
  );
  return levels.map((_, i) => (lower[i + 1] ?? top) - (lower[i] ?? 0));
}

export function traysAt(trays: readonly TraySpec[], level: number): TraySpec[] {
  return trays.filter(
    (t) =>
      !isAddOn(t) &&
      (t.merged ? t.merged.members.some((m) => m.level === level) : t.level === level),
  );
}

/** Every part that is drawn on its own: a merged part as its members, and no add-on (spacer, riser, divider). */
function drawnParts(trays: readonly TraySpec[]): TraySpec[] {
  return trays.flatMap((t) => (t.merged ? t.merged.members : [t])).filter((t) => !isAddOn(t));
}

/**
 * The parts a cut through the box from the front crosses, for its side view: the cut is at the
 * middle (y + d / 2) of the stack of two levels or more with the largest bottom footprint, since
 * that shows the layers where they are; with no such stack, at the middle of the largest tray at
 * the front (the least y). Each part is drawn where it is, so a block's x, z, w and h are the
 * tray's. Sorted by x, then z.
 */
export function sideSection(trays: readonly TraySpec[]): TraySpec[] {
  const parts = drawnParts(trays);
  if (parts.length === 0) {
    return [];
  }
  const area = (t: TraySpec): number => t.w * t.d;
  const stacks = new Map<number, TraySpec[]>();
  for (const t of parts) {
    stacks.set(t.stack, [...(stacks.get(t.stack) ?? []), t]);
  }
  let cutter: TraySpec | undefined;
  for (const members of stacks.values()) {
    if (new Set(members.map((t) => t.level)).size < 2) {
      continue;
    }
    const lowest = Math.min(...members.map((t) => t.level));
    const bottom = members
      .filter((t) => t.level === lowest)
      .reduce((best, t) => (area(t) > area(best) ? t : best));
    if (cutter === undefined || area(bottom) > area(cutter)) {
      cutter = bottom;
    }
  }
  if (cutter === undefined) {
    const front = Math.min(...parts.map((t) => t.y));
    cutter = parts
      .filter((t) => t.y === front)
      .reduce((best, t) => (area(t) > area(best) ? t : best));
  }
  const y0 = cutter.y + cutter.d / 2;
  return parts.filter((t) => t.y <= y0 && y0 < t.y + t.d).sort((a, b) => a.x - b.x || a.z - b.z);
}

type Footprint = Pick<TraySpec, "x" | "y" | "w" | "d">;

/**
 * The boxes a part shows on the plan of `level`. A part is its own box; a merged part is the
 * union of its members, so it is drawn as the members that stand on this layer (a folded-in riser
 * is under a tray and not seen from above).
 */
export function footprintsAt(t: TraySpec, level: number): Footprint[] {
  if (!t.merged) {
    return [t];
  }
  return t.merged.members.filter((m) => m.level === level && m.part !== "riser");
}

/** The largest of several boxes (the first on a tie): where a part's number and size are written. */
export function largestOf<T extends { w: number; h: number }>(rects: readonly T[]): T | undefined {
  return rects.reduce<T | undefined>(
    (best, r) => (best === undefined || r.w * r.h > best.w * best.h ? r : best),
    undefined,
  );
}

/** The loose parts that stand in the trays of `level`: spacers, spacer plates and dividers. */
export function spacersAt(trays: readonly TraySpec[], level: number): TraySpec[] {
  return trays.filter((t) => (t.part === "spacer" || t.part === "divider") && t.level === level);
}

export interface SvgRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Box coordinates (Y from the front) → SVG coordinates (front at the bottom). */
export function toSvgRect(t: Pick<TraySpec, "x" | "y" | "w" | "d">, f: PlanFrame): SvgRect {
  return { x: t.x, y: f.usableD - t.y - t.d, w: t.w, h: t.d };
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PLAN_MARGIN = 4;
export const FRONT_LABEL_SPACE = 14;

export function planViewBox(f: PlanFrame): ViewBox {
  return {
    x: -f.bc - PLAN_MARGIN,
    y: -f.bc - PLAN_MARGIN,
    w: f.innerW + 2 * PLAN_MARGIN,
    h: f.innerD + 2 * PLAN_MARGIN + FRONT_LABEL_SPACE,
  };
}

export function hitTest(
  rects: readonly { key: string; rect: SvgRect }[],
  p: { x: number; y: number },
): string | null {
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (
      r &&
      p.x >= r.rect.x &&
      p.x <= r.rect.x + r.rect.w &&
      p.y >= r.rect.y &&
      p.y <= r.rect.y + r.rect.h
    ) {
      return r.key;
    }
  }
  return null;
}

export function labelFontSize(r: SvgRect): number {
  return Math.max(6, Math.min(20, Math.min(r.w, r.h) * 0.3));
}
