import type { Settings, TraySpec } from "../model/types";
import { realizeTray, rotateRealized } from "../sizing";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "../sizing/types";
import type { Ctx } from "./context";
import type { Plan } from "./fill";
import { roundMm, toMm } from "./units";

/** Same signature as sizing's realizeTray; injectable for unit tests. */
export type Realize = (
  part: TrayPartReq,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
) => RealizedTray;

/**
 * Turns an integer plan into TraySpecs in mm (spec §8.4): realizeTray fills each tray's
 * compartments (slack, raised floors, spacers) with the same `lipped` flag the TraySpec
 * carries (roadmap §4.6); spacers are translated into box coordinates and follow their
 * tray; leftovers become a spare tray or a solid block. Clamping to the minimum outer size
 * only matters for infeasible attempts (feasible plans are never below it); at or above it
 * sizing guarantees the tray realizes, so any error from realize is a bug and propagates
 * (amendment 1). Walls and floors are written as sizing writes them (ctx.wall, ctx.floor:
 * rounded up to 0.01 mm, the wall at least MIN_WALL_MM).
 */
export function materialize(ctx: Ctx, plan: Plan, realize: Realize = realizeTray): TraySpec[] {
  const s = ctx.input.settings;
  const wall = toMm(ctx.wall);
  const floor = toMm(ctx.floor);
  const out: TraySpec[] = [];
  for (const t of plan.trays) {
    const part = ctx.part(t.item);
    if (!part) {
      continue;
    }
    const m = ctx.metrics(t.item, t.lipped, t.level);
    const minW = t.item.rotated ? m.d : m.w;
    const minD = t.item.rotated ? m.w : m.d;
    const w = toMm(Math.max(t.w, minW));
    const d = toMm(Math.max(t.d, minD));
    const h = toMm(Math.max(t.h, m.h));
    const opts = { lipped: t.lipped, level: t.level };
    // realizeTray works in the part's own frame; a rotated placement is realized at the
    // swapped size and turned 90° counter-clockwise by sizing's rotateRealized.
    const own = t.item.rotated ? { w: d, d: w, h } : { w, d, h };
    const realized = t.item.rotated
      ? rotateRealized(realize(part, own, s, opts), own)
      : realize(part, own, s, opts);
    const x = toMm(t.x);
    const y = toMm(t.y);
    const z = toMm(t.z);
    out.push({
      key: part.trayKey,
      part: "tray",
      path: t.path,
      stack: t.stack,
      level: t.level,
      x,
      y,
      z,
      w,
      d,
      h,
      rotated: t.item.rotated,
      wall,
      floor,
      lip: t.lipped,
      solid: false,
      compartments: realized.compartments,
    });
    for (const sp of realized.spacers) {
      out.push({
        ...sp,
        key: `${part.trayKey}:spacer`,
        part: "spacer",
        path: "",
        stack: t.stack,
        level: t.level,
        x: roundMm(x + sp.x),
        y: roundMm(y + sp.y),
        z: roundMm(z + sp.z),
        solid: true,
        compartments: [],
      });
    }
  }
  plan.leftovers.forEach((l, n) => {
    const w = toMm(l.w);
    const d = toMm(l.d);
    out.push({
      key: `leftover:${n}`,
      part: "leftover",
      path: l.path,
      stack: l.stack,
      level: 0,
      x: toMm(l.x),
      y: toMm(l.y),
      z: 0,
      w,
      d,
      h: toMm(l.h),
      rotated: false,
      wall,
      floor,
      lip: false,
      solid: l.solid,
      compartments: l.solid
        ? []
        : [
            {
              x: wall,
              y: wall,
              w: roundMm(w - 2 * wall),
              d: roundMm(d - 2 * wall),
              floorZ: floor,
              kind: "spare",
              contents: "",
              features: [],
            },
          ],
    });
  });
  return out;
}
