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

export function traysAt(trays: readonly TraySpec[], level: number): TraySpec[] {
  return trays.filter(
    (t) =>
      !isAddOn(t) &&
      (t.merged ? t.merged.members.some((m) => m.level === level) : t.level === level),
  );
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

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clientToSvg(
  rect: ClientRect,
  vb: ViewBox,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const scale = Math.min(rect.width / vb.w, rect.height / vb.h);
  if (!(scale > 0)) {
    return null;
  }
  const offsetX = (rect.width - vb.w * scale) / 2;
  const offsetY = (rect.height - vb.h * scale) / 2;
  return {
    x: vb.x + (clientX - rect.left - offsetX) / scale,
    y: vb.y + (clientY - rect.top - offsetY) / scale,
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
