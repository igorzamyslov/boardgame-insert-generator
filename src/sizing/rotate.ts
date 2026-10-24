import type { CompartmentSpec, FeatureSpec, Side, TraySpec } from "../model/types";
import type { OuterSize, RealizedTray } from "./types";
import { floorU, fromU, round2 } from "./units";

const TURNED: Record<Side, Side> = { front: "right", right: "back", back: "left", left: "front" };

/**
 * A spacer's notch turned with the spacer (90° counter-clockwise, its frame's d becoming the new
 * w): a notch along x (centred on local y) comes to run along y, centred on d − at; one along y
 * comes to run along x at the same centre.
 */
function turnNotch(f: FeatureSpec, d: number): FeatureSpec {
  if (f.type !== "spacerNotch") {
    return f;
  }
  return f.axis === "x" ? { ...f, axis: "y", at: round2(d - f.at) } : { ...f, axis: "x" };
}

/**
 * Rotates a tray realized at `outer` (its own frame) by 90° counter-clockwise about +Z.
 * The result lives in the rotated outer { w: outer.d, d: outer.w, h: outer.h }.
 * realizeTray works in whole units of the floored outer, so the rotation does too.
 */
export function rotateRealized(r: RealizedTray, outer: OuterSize): RealizedTray {
  const depth = fromU(floorU(outer.d));
  const turnRect = <T extends { x: number; y: number; w: number; d: number }>(item: T): T => ({
    ...item,
    x: round2(depth - item.y - item.d),
    y: item.x,
    w: item.d,
    d: item.w,
  });
  const turnFeature = (f: FeatureSpec): FeatureSpec => {
    if (f.type === "cornerRelief") {
      return f;
    }
    if (f.type === "scoop") {
      return { ...f, side: TURNED[f.side] };
    }
    if (f.type === "spacerNotch") {
      // Sizing puts spacer notches on spacers only (turnNotch).
      throw new Error("internal: a spacer notch on a compartment");
    }
    if (f.type === "topChamfer") {
      // Derived at print time on printed fillers (layout/chamfers.ts), never on a compartment.
      throw new Error("internal: a top chamfer on a compartment");
    }
    if (f.type === "separatorPlate") {
      // Horizontal and across the whole well: turning the tray changes nothing about it.
      return f;
    }
    if (f.type === "dividerSlot") {
      // A slot along y at x = at comes to run along x at the same centre; one along x comes to run
      // along y at depth − at.
      return f.axis === "y" ? { ...f, axis: "x" } : { ...f, axis: "y", at: round2(depth - f.at) };
    }
    // Wall cutouts: `at` runs along the side, so it turns with it.
    const alongX = f.side === "front" || f.side === "back";
    return { ...f, side: TURNED[f.side], at: alongX ? f.at : round2(depth - f.at) };
  };
  return {
    wall: r.wall,
    compartments: r.compartments.map((c): CompartmentSpec => ({
      ...turnRect(c),
      features: c.features.map(turnFeature),
    })),
    spacers: r.spacers.map((sp): TraySpec => {
      const turned: TraySpec = { ...turnRect(sp), rotated: !sp.rotated };
      return sp.features === undefined
        ? turned
        : { ...turned, features: sp.features.map((f) => turnNotch(f, sp.d)) };
    }),
  };
}
