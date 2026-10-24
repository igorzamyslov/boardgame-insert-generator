// src/layout/reserve.ts
import { areaName } from "../model/settings";
import type { ReservedSpec } from "../model/types";
import type { Ctx } from "./context";
import type { Snap, Tree } from "./tree";
import type { Rect, U } from "./units";
import { toMm } from "./units";

/**
 * Space kept free on top for part of it only ("Keep space free on top → Part of it", with a size).
 *
 * Each area is a rectangle that lies in a corner of the floor, either way round: an anchor is a
 * number 0..7, the corner (`anchor % 4`: 0 front left, 1 front right, 2 back left, 3 back right)
 * plus 4 when the area is turned (its length along X). The stacks the rectangle overlaps stop at
 * the low plane (`Ctx.lowPlane`); every other stack reaches the lid (`Ctx.topPlane`). The paper
 * lies on those stacks, so they must all stand at one height, and the leaves tile the floor, so
 * everything under the rectangle is a stack or a filler at that height: the support is whole.
 *
 * Why a corner (owner brief, 2026-10-24; DESIGN.md decision log): a corner needs two cut lines to
 * meet the area's two inner edges, a wall position three and the middle four, and every extra line
 * is a row of stacks that cannot be placed freely; the stacks that reach the lid then make one block
 * and the low part one pocket; and the paper slides out over two open sides. A cut is drawn to the
 * area's edge whenever it can reach it (`snapOf`), so the trays the area covers end where it does.
 */
export const ANCHORS = 8;

/** One kept-free area placed: its rectangle in the floor's frame, and the height it lies at. */
export interface PlacedReserve {
  /** Index into `box.headroomAreas`. */
  readonly area: number;
  readonly rect: Rect;
  readonly anchor: number;
  /** The height the paper lies at: `Ctx.lowPlane`. */
  readonly z: U;
}

/** The anchors where area `k` of the context (not the box's index) fits the floor. */
export function validAnchors(ctx: Ctx, k: number): number[] {
  const a = ctx.areas[k];
  if (!a) {
    return [];
  }
  const out: number[] = [];
  for (let n = 0; n < ANCHORS; n++) {
    const turned = n >= 4;
    const w = turned ? a.d : a.w;
    const d = turned ? a.w : a.d;
    if (w <= ctx.floorW && d <= ctx.floorD) {
      out.push(n);
    }
  }
  return out;
}

/** The rectangle of area `k` at `anchor`. */
export function reserveRect(ctx: Ctx, k: number, anchor: number): Rect {
  const a = ctx.areas[k];
  if (!a) {
    return { x: 0, y: 0, w: 0, d: 0 };
  }
  const turned = anchor >= 4;
  const w = turned ? a.d : a.w;
  const d = turned ? a.w : a.d;
  const corner = anchor % 4;
  return {
    x: corner % 2 === 1 ? ctx.floorW - w : 0,
    y: corner >= 2 ? ctx.floorD - d : 0,
    w,
    d,
  };
}

/** Where each area of the context lies in `tree`: its own anchors, else the first each can have. */
export function reservedOf(ctx: Ctx, tree: Tree): PlacedReserve[] {
  return ctx.areas.map((a, k) => {
    const valid = validAnchors(ctx, k);
    const own = tree.reserve?.[k];
    const anchor = own !== undefined && valid.includes(own) ? own : (valid[0] ?? 0);
    return { area: a.area, rect: reserveRect(ctx, k, anchor), anchor, z: ctx.lowPlane };
  });
}

/** A rectangle's overlap with another has an area (touching edges do not count). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

/** The lines the cuts are drawn to: where an area's inner edge is (none when it spans the floor). */
export function snapOf(ctx: Ctx, reserved: readonly PlacedReserve[]): Snap {
  const x: U[] = [];
  const y: U[] = [];
  for (const r of reserved) {
    const ex = r.rect.x === 0 ? r.rect.w : r.rect.x;
    const ey = r.rect.y === 0 ? r.rect.d : r.rect.y;
    if (ex > 0 && ex < ctx.floorW && !x.includes(ex)) {
      x.push(ex);
    }
    if (ey > 0 && ey < ctx.floorD && !y.includes(ey)) {
      y.push(ey);
    }
  }
  return { x, y };
}

/**
 * How far the areas overlap each other, in units: two papers cannot lie in one place. Zero for one
 * area. The least of the overlap's two sides, so it is a length like the other overflows.
 */
export function reserveClash(reserved: readonly PlacedReserve[]): U {
  let total = 0;
  reserved.forEach((a, i) => {
    for (const b of reserved.slice(i + 1)) {
      if (overlaps(a.rect, b.rect)) {
        const w = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - Math.max(a.rect.x, b.rect.x);
        const d = Math.min(a.rect.y + a.rect.d, b.rect.y + b.rect.d) - Math.max(a.rect.y, b.rect.y);
        total += Math.min(w, d);
      }
    }
  });
  return total;
}

/**
 * The anchors a stored plan had (`StoredLayout.reserved`), so a warm start keeps the areas where the
 * person last saw them. An area the plan does not hold, or holds somewhere no anchor reaches (the
 * box changed), is left to its first anchor.
 */
export function storedAnchors(ctx: Ctx, stored: readonly ReservedSpec[] | undefined): number[] {
  return ctx.areas.map((a, k) => {
    const s = stored?.find((r) => r.area === a.area);
    if (!s) {
      return validAnchors(ctx, k)[0] ?? 0;
    }
    const near = (u: U, mm: number): boolean => Math.abs(toMm(u) - mm) <= 0.25;
    const hit = validAnchors(ctx, k).find((n) => {
      const r = reserveRect(ctx, k, n);
      return near(r.x, s.x) && near(r.y, s.y) && near(r.w, s.w) && near(r.d, s.d);
    });
    return hit ?? validAnchors(ctx, k)[0] ?? 0;
  });
}

/** The areas of a plan as the stored layout keeps them, in mm. */
export function reservedSpecs(ctx: Ctx, reserved: readonly PlacedReserve[]): ReservedSpec[] {
  return reserved.map((r) => ({
    area: r.area,
    name: areaName(ctx.input.box.headroomAreas?.[r.area]),
    x: toMm(r.rect.x),
    y: toMm(r.rect.y),
    w: toMm(r.rect.w),
    d: toMm(r.rect.d),
    z: toMm(r.z),
  }));
}

/** The stacks (their `stack` numbers) of stored trays that stand under a stored area. */
export function stacksUnder(
  trays: readonly { stack: number; x: number; y: number; w: number; d: number; part: string }[],
  reserved: readonly ReservedSpec[],
): Set<number> {
  const out = new Set<number>();
  for (const t of trays) {
    if (t.part === "spacer") {
      continue;
    }
    if (
      reserved.some((r) => t.x < r.x + r.w && r.x < t.x + t.w && t.y < r.y + r.d && r.y < t.y + t.d)
    ) {
      out.add(t.stack);
    }
  }
  return out;
}
