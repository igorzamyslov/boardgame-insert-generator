// src/geometry/plan-chamfers.ts
import type { FeatureSpec, Side, TraySpec } from "../model/types";
import { MIN_FEATURE_MM, SPEC_TOLERANCE as TOL } from "../model/settings";
import { CHAMFER_LAND_MM, CHAMFER_MIN_MM, isTopChamfer } from "../model/top-chamfer";
import type { BottomEdge } from "../model/lip";
import type { ChamferPlan } from "./plan-types";

// Top chamfers (FeatureSpec "topChamfer", model/top-chamfer.ts): planned and checked on their own,
// like the spacer's notch, because a chamfer belongs to the part and not to a compartment. In the
// part's own frame (origin at its outer min corner); the rules:
// - only a solid filler has one, with no lip on top (the chamfer is measured from its top);
// - it is at least CHAMFER_MIN_MM, and leaves MIN_FEATURE_MM of wall above the bottom edge
//   (chamfer, groove or step) where it leaves through the face;
// - the chamfers on opposite faces of a part leave CHAMFER_LAND_MM of its top flat;
// - the chamfers on one face do not overlap.

const SIDES: readonly Side[] = ["front", "back", "left", "right"];

type Fail = (message: string) => never;

interface Frame {
  w: number;
  d: number;
  h: number;
  edge: BottomEdge;
}

export function planTopChamfers(
  spec: TraySpec,
  features: readonly FeatureSpec[],
  frame: Frame,
  lipped: boolean,
  fail: Fail,
): ChamferPlan[] {
  const found = features.filter(isTopChamfer);
  if (found.length === 0) {
    return [];
  }
  if (spec.part !== "leftover" || !spec.solid) {
    fail("only a solid spacer has a top chamfer");
  }
  if (lipped) {
    fail("a spacer with a lip has no top chamfer");
  }
  const plans = found.map((f) => {
    const { side, from, to, size } = f;
    if (
      !SIDES.includes(side) ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      !(Number.isFinite(size) && size > 0)
    ) {
      return fail("invalid top chamfer");
    }
    const where = `the ${side} top chamfer`;
    const span = side === "front" || side === "back" ? frame.w : frame.d;
    if (from < -TOL || to > span + TOL || !(to > from)) {
      fail(`${where} is not within the spacer's ${side} face`);
    }
    if (size < CHAMFER_MIN_MM - TOL) {
      fail(`${where} is under ${CHAMFER_MIN_MM} mm`);
    }
    if (frame.h - size < frame.edge.top + MIN_FEATURE_MM - TOL) {
      fail(
        `${where} leaves less than ${MIN_FEATURE_MM} mm of wall above the ${frame.edge.reach} mm bottom ${frame.edge.top === frame.edge.reach ? "chamfer" : "groove or step"}`,
      );
    }
    return { side, a: Math.max(0, from), b: Math.min(span, to), size };
  });
  const biggest = (side: Side): number =>
    Math.max(0, ...plans.filter((p) => p.side === side).map((p) => p.size));
  for (const [lo, hi, across] of [
    ["front", "back", frame.d],
    ["left", "right", frame.w],
  ] as const) {
    if (biggest(lo) + biggest(hi) > across - CHAMFER_LAND_MM + TOL) {
      fail(`the ${lo} and ${hi} top chamfers leave less than ${CHAMFER_LAND_MM} mm of flat top`);
    }
  }
  for (const side of SIDES) {
    const mine = plans.filter((p) => p.side === side).sort((p, q) => p.a - q.a);
    mine.forEach((p, i) => {
      if (i > 0 && p.a < (mine[i - 1]?.b ?? 0) - TOL) {
        fail(`two ${side} top chamfers overlap`);
      }
    });
  }
  return plans;
}
