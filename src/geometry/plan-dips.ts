// src/geometry/plan-dips.ts
import type { FeatureSpec, Side, TraySpec } from "../model/types";
import { MIN_FEATURE_MM, POST_MM, SPEC_TOLERANCE as TOL } from "../model/settings";
import { keepsApart } from "../model/cut-rules";
import { dipBox, isFingerDip } from "../model/finger-dip";
import type { BottomEdge } from "../model/lip";
import type { DipPlan } from "./plan-types";

// Finger dips (FeatureSpec "fingerDip", model/finger-dip.ts): planned and checked on their own,
// like the spacer's notch, because a dip belongs to the part and not to a compartment. In the
// part's own frame (origin at its outer min corner); each rule is a wall cutout's (plan-cuts.ts):
// - only a solid filler has one, and a dip is a U in a face it opens on, so its centre lies on the
//   face and its sides keep MIN_FEATURE_MM of material, against the bottom edge (chamfer, groove
//   or step) where it leaves through the face and along the face beside it, at their lowest
//   height (the round bottom 45° up);
// - one that ends in the part leaves a post of POST_MM behind it (dipRun);
// - no dip comes within MIN_FEATURE_MM of another on the same part.

const SIDES: readonly Side[] = ["front", "back", "left", "right"];

type Fail = (message: string) => never;

interface Frame {
  w: number;
  d: number;
  h: number;
  edge: BottomEdge;
  /** The narrowest cut: MIN_CUT_MM, or fingerPocket.width if smaller. */
  minCut: number;
}

export function planFingerDips(
  spec: TraySpec,
  features: readonly FeatureSpec[],
  frame: Frame,
  fail: Fail,
): DipPlan[] {
  const dips = features.filter(isFingerDip);
  if (dips.length === 0) {
    return [];
  }
  if (spec.part !== "leftover" || !spec.solid) {
    fail("only a solid spacer has a finger dip");
  }
  const plans = dips.map((f) => {
    const { side, at, width, depth } = f;
    if (
      !SIDES.includes(side) ||
      !Number.isFinite(at) ||
      !(Number.isFinite(width) && width > 0) ||
      !(Number.isFinite(depth) && depth > 0)
    ) {
      return fail("invalid finger dip");
    }
    const where = `the ${side} finger dip at ${at} mm`;
    if (width < frame.minCut - TOL) {
      fail(`${where} is narrower than ${frame.minCut} mm`);
    }
    const alongX = side === "front" || side === "back";
    const span = alongX ? frame.w : frame.d;
    if (at < -TOL || at > span + TOL) {
      fail(`${where} is not centred on the spacer`);
    }
    const r = width / 2;
    const [a, b] = [at - r, at + r];
    const box = dipBox(f, frame);
    const across = alongX ? frame.d : frame.w;
    if (!box.through && across - (alongX ? box.y1 - box.y0 : box.x1 - box.x0) < POST_MM - TOL) {
      fail(`${where} leaves less than a ${POST_MM} mm post behind it`);
    }
    const bottomZ = frame.h - Math.min(depth, frame.h);
    const material = (distance: number, height: number): number =>
      distance + height - frame.edge.at(height);
    const sideHeight = bottomZ + (2 - Math.SQRT2) * r;
    if (
      material(0, bottomZ) < MIN_FEATURE_MM - TOL ||
      material(Math.max(0, Math.min(a, span - b)), sideHeight) < MIN_FEATURE_MM - TOL
    ) {
      fail(
        `${where} leaves less than ${MIN_FEATURE_MM} mm of wall and floor against the ${frame.edge.reach} mm bottom ${frame.edge.top === frame.edge.reach ? "chamfer" : "groove or step"}`,
      );
    }
    return {
      x0: box.x0,
      x1: box.x1,
      y0: box.y0,
      y1: box.y1,
      side,
      through: box.through,
      bottomZ,
      radius: r,
    };
  });
  plans.forEach((p, i) => {
    plans.forEach((q, j) => {
      if (j > i && !keepsApart(p, q, TOL)) {
        fail(`finger dips ${i} and ${j} are less than ${MIN_FEATURE_MM} mm apart`);
      }
    });
  });
  return plans;
}

/**
 * Where the sides of the dips meet the part's outer faces, for the outer corner radius: both
 * sides on the face a dip opens on, and on the opposite face of one cut across.
 */
export function dipEdges(plans: readonly DipPlan[]): { x: number; y: number }[] {
  return plans.flatMap((p) => {
    const alongX = p.side === "front" || p.side === "back";
    const [lo, hi] = alongX ? [p.x0, p.x1] : [p.y0, p.y1];
    const [near, far] = alongX ? [p.y0, p.y1] : [p.x0, p.x1];
    const faces = p.through ? [near, far] : [p.side === "front" || p.side === "left" ? near : far];
    return [lo, hi].flatMap((u) => faces.map((v) => (alongX ? { x: u, y: v } : { x: v, y: u })));
  });
}
