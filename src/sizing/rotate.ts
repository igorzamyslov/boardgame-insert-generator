import type { CompartmentSpec, FeatureSpec, Side, TraySpec } from "../model/types";
import type { OuterSize, RealizedTray } from "./types";
import { floorU, fromU, round2 } from "./units";

const TURNED: Record<Side, Side> = { front: "right", right: "back", back: "left", left: "front" };

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
    const alongX = f.side === "front" || f.side === "back";
    return { ...f, side: TURNED[f.side], at: alongX ? f.at : round2(depth - f.at) };
  };
  return {
    wall: r.wall,
    compartments: r.compartments.map((c): CompartmentSpec => ({
      ...turnRect(c),
      features: c.features.map(turnFeature),
    })),
    spacers: r.spacers.map((sp): TraySpec => ({ ...turnRect(sp), rotated: !sp.rotated })),
  };
}
