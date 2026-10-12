import { effective, topPlane } from "../model/settings";
import type { TraySpec } from "../model/types";
import { maxCrossing } from "./fill";
import { nominalPlayU } from "./score";
import type { LayoutInput, LayoutSummary } from "./types";
import { toMm, toU, type Rect } from "./units";

/** PLA density, g/mm³ (1.24 g/cm³). */
const PLA_G_PER_MM3 = 0.00124;

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Upper bound of a part's plastic volume (mm³): 100 % infill, chamfers and radii ignored. */
function solidVolume(t: TraySpec, lip: LayoutInput["settings"]["lip"]): number {
  const outer = t.w * t.d * t.h;
  if (t.solid) {
    return outer;
  }
  const hollow = t.compartments.reduce((s, c) => s + c.w * c.d * Math.max(0, t.h - c.floorZ), 0);
  const ring = t.lip
    ? (t.w * t.d - Math.max(0, t.w - 2 * lip.thickness) * Math.max(0, t.d - 2 * lip.thickness)) *
      lip.height
    : 0;
  return outer - hollow + ring;
}

/** Results summary for a layout (spec §8.3). */
export function summarize(
  trays: TraySpec[],
  input: Pick<LayoutInput, "box" | "settings">,
): LayoutSummary {
  const { box, settings } = input;
  const eff = effective(settings);
  const usable =
    (box.innerWidth - 2 * eff.boxClearance) *
    (box.innerDepth - 2 * eff.boxClearance) *
    topPlane(box, settings);
  const printed = trays.filter((t) => t.part !== "spacer");
  const outerVolume = printed.reduce((s, t) => s + t.w * t.d * t.h, 0);
  const filament = trays.reduce((s, t) => s + solidVolume(t, settings.lip), 0);
  const bottoms: Rect[] = printed
    .filter((t) => t.level === 0)
    .map((t) => ({ x: toU(t.x), y: toU(t.y), w: toU(t.w), d: toU(t.d) }));
  const play = (crossed: number): number =>
    toMm(nominalPlayU(toU(eff.boxClearance), toU(eff.trayGap), crossed));
  return {
    fillPct: usable > 0 ? round((outerVolume / usable) * 100, 1) : 0,
    trayCount: printed.length,
    stackCount: new Set(printed.map((t) => t.stack)).size,
    filamentG: round(filament * PLA_G_PER_MM3, 1),
    playX: play(maxCrossing(bottoms, true)),
    playY: play(maxCrossing(bottoms, false)),
  };
}
