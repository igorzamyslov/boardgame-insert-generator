import { MIN_FEATURE_MM, SPEC_TOLERANCE as TOL } from "../model/settings";
import type { Rect, SlotPlan } from "./plan-types";

// Divider slots (FeatureSpec "dividerSlot", minimal-trays spec §5): a slot in a well's floor that a
// divider stands in. It is cut across the whole well, along `axis`, wall to wall, `width` wide and
// `depth` below the floor, and is open at the top, so nothing about it overhangs.

export interface SlotRequest {
  axis: unknown;
  at: number;
  width: number;
  depth: number;
}

type Fail = (message: string) => never;

/**
 * Plans one slot of the compartment `rect` (floor at `floorZ`) of a tray `frame` big:
 * - it lies within the well across its width (it may not cut into a wall);
 * - its bottom keeps MIN_FEATURE_MM of floor above the bed, and above the 45° bottom chamfer
 *   where the slot is within `chamfer` of an outer face (the chamfer rises that much at the face).
 */
export function planSlot(
  q: SlotRequest,
  index: number,
  rect: Rect,
  floorZ: number,
  frame: { w: number; d: number },
  chamfer: number,
  fail: Fail,
): SlotPlan {
  const where = `compartment ${index}: the divider slot at ${q.at} mm`;
  if (
    (q.axis !== "x" && q.axis !== "y") ||
    !Number.isFinite(q.at) ||
    !(Number.isFinite(q.width) && q.width > 0) ||
    !(Number.isFinite(q.depth) && q.depth > 0)
  ) {
    return fail(`compartment ${index} has an invalid divider slot`);
  }
  const r = q.width / 2;
  const [a, b] = [q.at - r, q.at + r];
  const along = q.axis === "y";
  const box: Rect = along
    ? { x0: a, x1: b, y0: rect.y0, y1: rect.y1 }
    : { x0: rect.x0, x1: rect.x1, y0: a, y1: b };
  if (
    box.x0 < rect.x0 - TOL ||
    box.x1 > rect.x1 + TOL ||
    box.y0 < rect.y0 - TOL ||
    box.y1 > rect.y1 + TOL
  ) {
    fail(`${where} is not within compartment ${index}`);
  }
  const bottomZ = floorZ - q.depth;
  // The distance from the slot to the nearest outer face, for the chamfer under it.
  const nearest = Math.min(box.x0, box.y0, frame.w - box.x1, frame.d - box.y1);
  if (bottomZ - Math.max(0, chamfer - nearest) < MIN_FEATURE_MM - TOL) {
    fail(
      `${where} leaves less than ${MIN_FEATURE_MM} mm of floor under it (floor ${floorZ} mm, slot ${q.depth} mm deep, ${chamfer} mm bottom chamfer)`,
    );
  }
  return { ...box, bottomZ };
}

/** Two slots of one compartment overlap or touch: a divider needs the floor between its slot and the next. */
export function checkSlots(slots: readonly SlotPlan[], index: number, fail: Fail): void {
  slots.forEach((s, i) => {
    slots.forEach((t, j) => {
      if (
        j > i &&
        s.x0 < t.x1 + TOL &&
        t.x0 < s.x1 + TOL &&
        s.y0 < t.y1 + TOL &&
        t.y0 < s.y1 + TOL
      ) {
        fail(`compartment ${index}: divider slots ${i} and ${j} overlap`);
      }
    });
  });
}
