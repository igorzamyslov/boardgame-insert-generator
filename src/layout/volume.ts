// src/layout/volume.ts
// How much room the items need against how much the box has, whatever the search found: the sum of
// each item's smallest tray option (outer, walls included) against the box under the headroom. A
// lower bound with no packing waste, so a figure above the box is a verdict and one close to it a
// warning; it names no single culprit, which is why it does not move between search budgets.
import type { Ctx } from "./context";
import { partLabel } from "./labels";
import { toMm } from "./units";

export interface VolumeItem {
  /** The requirement's key (an item's or a group's). */
  readonly key: string;
  readonly componentIds: readonly string[];
  /** What the item's trays hold, as the plan names them ("Faction ×7"). */
  readonly label: string;
  /** Its smallest variant's trays, outer volume, mm³. */
  readonly mm3: number;
}

export interface VolumeBudget {
  /** The items' smallest tray options added up, mm³. */
  readonly needMm3: number;
  /** The box floor (less the box clearance) times the height under the headroom, mm³: summarize's usable volume. */
  readonly boxMm3: number;
  /** Biggest first. */
  readonly items: readonly VolumeItem[];
}

/** The smallest outer volume (mm³) any variant of requirement `req` needs, every tray of it counted. */
function smallestOf(ctx: Ctx, req: number): number {
  const variants = ctx.input.requirements[req]?.variants ?? [];
  let best = Infinity;
  variants.forEach((v, variant) => {
    const mm3 = v.parts.reduce((sum, _, part) => {
      const m = ctx.metrics({ req, variant, part }, false, 0);
      return sum + toMm(m.w) * toMm(m.d) * toMm(m.h);
    }, 0);
    best = Math.min(best, mm3);
  });
  return Number.isFinite(best) ? best : 0;
}

/** `nameOf` calls an item by what the person named it (the plan's contents text is long); absent or undefined: the contents. */
export function volumeBudget(ctx: Ctx, nameOf?: (key: string) => string | undefined): VolumeBudget {
  const items = ctx.input.requirements
    .map((r, i): VolumeItem => {
      const names = (r.variants[0]?.parts ?? []).flatMap((p) =>
        p.compartments.map((c) => c.contents),
      );
      return {
        key: r.key,
        componentIds: r.componentIds,
        label: nameOf?.(r.key) ?? partLabel(names, r.key),
        mm3: smallestOf(ctx, i),
      };
    })
    .sort((a, b) => b.mm3 - a.mm3);
  return {
    needMm3: items.reduce((s, i) => s + i.mm3, 0),
    boxMm3: toMm(ctx.floorW) * toMm(ctx.floorD) * toMm(ctx.topPlane),
    items,
  };
}
