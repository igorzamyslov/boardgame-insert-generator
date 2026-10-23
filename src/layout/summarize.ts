import { builtLevel, rimOn, stepOf } from "../model/lip";
import { effective, topPlane } from "../model/settings";
import type { BoxMm, TraySpec } from "../model/types";
import { splitDividers } from "./dividers";
import { maxCrossing, rowPlayU } from "./fill";
import { mergeParts } from "./merge";
import { splitRisers } from "./risers";
import { openSpacers } from "./spacers";
import { nominalPlayU } from "./score";
import type { LayoutInput, LayoutSummary } from "./types";
import { toMm, toU, type Rect } from "./units";

/** PLA density, g/mm³ (1.24 g/cm³). */
export const PLA_G_PER_MM3 = 0.00124;

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Volume (mm³) two boxes share. */
function overlapMm3(a: BoxMm, b: BoxMm): number {
  const ov = (a0: number, a1: number, b0: number, b1: number): number =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return (
    ov(a.x, a.x + a.w, b.x, b.x + b.w) *
    ov(a.y, a.y + a.d, b.y, b.y + b.d) *
    ov(a.z, a.z + a.h, b.z, b.z + b.h)
  );
}

/**
 * A part's solid plastic volume (mm³): its upper bound, a part at 100 % infill, with chamfers and
 * radii ignored. A hollow tray's walls, dividers, floor and lip are all counted; a merged part
 * (mergeParts) is its members as they print alone, plus its solid bridges. (What a slicer really
 * uses at the owner's infill is app/filament.ts, from the built mesh.)
 */
function solidVolume(t: TraySpec, settings: LayoutInput["settings"]): number {
  const { lip } = settings;
  if (t.merged) {
    let solid = t.merged.members.reduce((sum, m) => sum + solidVolume(m, settings), 0);
    // A bridge reaches into the members it joins: only the part of it outside them is new plastic.
    for (const b of t.merged.bridges) {
      const inside = t.merged.members.reduce((sum, m) => sum + overlapMm3(b, m), 0);
      solid += Math.max(0, b.w * b.d * b.h - inside);
    }
    return solid;
  }
  // The stepped base's slab under a part above level 0 (spacers and dividers stand at level 0).
  const step = stepOf(settings, builtLevel(t));
  const slab = step
    ? Math.max(0, t.w - 2 * step.inset) * Math.max(0, t.d - 2 * step.inset) * step.height
    : 0;
  const outer = t.w * t.d * t.h + slab;
  if (t.solid) {
    return outer;
  }
  const hollow = t.compartments.reduce((s, c) => s + c.w * c.d * Math.max(0, t.h - c.floorZ), 0);
  const ring =
    t.lip && rimOn(settings)
      ? (t.w * t.d - Math.max(0, t.w - 2 * lip.thickness) * Math.max(0, t.d - 2 * lip.thickness)) *
        lip.height
      : 0;
  return outer - hollow + ring;
}

/** Results summary for a layout (spec §8.3). */
export function summarize(
  trays: TraySpec[],
  input: Pick<LayoutInput, "box" | "printer" | "settings" | "locks">,
): LayoutSummary {
  const { box, settings } = input;
  const eff = effective(settings);
  const usable =
    (box.innerWidth - 2 * eff.boxClearance) *
    (box.innerDepth - 2 * eff.boxClearance) *
    topPlane(box, settings);
  const printed = trays.filter((t) => t.part !== "spacer");
  const outerVolume = printed.reduce((s, t) => s + t.w * t.d * t.h, 0);
  let filament = 0;
  // The solid bound follows what is printed: each stack's raised floor comes out as a riser part, open
  // (mostly air) or solid per `leftover`. Counts and fill stay on the stored trays: the split moves
  // height between a tray and its riser without changing the space filled. A spacer is
  // an open box like a riser; its separator plates are not split out here (see partVolumes).
  const parts = mergeParts(
    openSpacers(
      splitDividers(
        splitRisers(trays, { settings, printer: input.printer, locks: input.locks }),
        settings,
      ),
      { settings },
    ),
    { settings, printer: input.printer },
  );
  for (const t of parts) {
    filament += solidVolume(t, settings);
  }
  const bottoms: Rect[] = printed
    .filter((t) => t.level === 0)
    .map((t) => ({ x: toU(t.x), y: toU(t.y), w: toU(t.w), d: toU(t.d) }));
  // The nominal play (clearance and gaps), or more where room beside an alike tray is left empty.
  const play = (crossed: number, alongX: boolean): number =>
    toMm(
      Math.max(
        nominalPlayU(toU(eff.boxClearance), toU(eff.trayGap), crossed),
        rowPlayU(toU(alongX ? box.innerWidth : box.innerDepth), bottoms, alongX),
      ),
    );
  const crossX = maxCrossing(bottoms, true);
  const crossY = maxCrossing(bottoms, false);
  return {
    fillPct: usable > 0 ? round((outerVolume / usable) * 100, 1) : 0,
    trayCount: printed.length,
    stackCount: new Set(printed.map((t) => t.stack)).size,
    fillerCount: parts.filter((t) => t.part === "leftover").length,
    mergeFillers: settings.mergeFillers,
    mergeRisers: settings.mergeRisers,
    minRiser: settings.minRiser,
    filamentG: round(filament * PLA_G_PER_MM3, 1),
    playLimit: settings.playLimit,
    playX: play(crossX, true),
    playY: play(crossY, false),
    crossX,
    crossY,
  };
}
