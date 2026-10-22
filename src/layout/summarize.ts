import { effective, topPlane } from "../model/settings";
import type { BoxMm, TraySpec } from "../model/types";
import { splitDividers } from "./dividers";
import { maxCrossing } from "./fill";
import { mergeParts } from "./merge";
import { splitRisers } from "./risers";
import { openSpacers } from "./spacers";
import { nominalPlayU } from "./score";
import type { LayoutInput, LayoutSummary } from "./types";
import { toMm, toU, type Rect } from "./units";

/** PLA density, g/mm³ (1.24 g/cm³). */
const PLA_G_PER_MM3 = 0.00124;

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * Perimeters a slicer prints around every layer, and the extrusion width of each. Not settings:
 * 3 × 0.45 mm = 1.35 mm is a little over the 2 perimeters (about 0.9 mm) most slicers default
 * to, which errs towards more plastic, and 0.45 mm is what a 0.4 mm nozzle lays down. Nobody
 * should have to know either to read a grams estimate.
 */
export const PERIMETERS = 3;
export const EXTRUSION_WIDTH_MM = 0.45;
/** Solid layers above and below any sparse interior: 5, as in common 0.2 mm slicer profiles. */
export const SOLID_LAYERS = 5;

/**
 * Mean volumetric flow (mm³/s) the print-time estimate assumes. Not a setting: the estimate is too
 * rough for a knob to mean anything. A 0.45 mm line 0.2 mm high at 60 mm/s is 5.4 mm³/s while it
 * extrudes; 4 mm³/s allows for the slower perimeters and top layers, and nothing else: travel,
 * acceleration, cooling and layer-time slowdowns are not modelled, so a real print usually takes
 * longer (small parts a good deal longer). It is a nominal figure, not a prediction.
 */
export const PRINT_FLOW_MM3_PER_S = 4;

/** Where a slicer prints solid whatever the infill: how deep from a surface, sideways and vertically (mm). */
export function shellThickness(layerHeight: number): { side: number; vertical: number } {
  return { side: PERIMETERS * EXTRUSION_WIDTH_MM, vertical: SOLID_LAYERS * layerHeight };
}

/** Volume (mm³) of a w × d × h box left once a shell is stripped off every face: its sparse core. */
function coreVolume(
  w: number,
  d: number,
  h: number,
  shell: { side: number; vertical: number },
): number {
  return (
    Math.max(0, w - 2 * shell.side) *
    Math.max(0, d - 2 * shell.side) *
    Math.max(0, h - 2 * shell.vertical)
  );
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
 * A part's plastic volume (mm³), as the solid upper bound and as the estimate at `infill`
 * (0..1). The bound is 100 % infill, with chamfers and radii ignored.
 *
 * The estimate is a shell-and-core model: material within `shell` of a surface prints solid
 * (perimeters, top and bottom layers), and only a core deeper than that is printed at `infill`.
 * Anything under two shells thick is therefore wholly solid. Finding the exact core of a hollow
 * tray is not worth it, so this approximates, on the high (plastic-heavy) side:
 * - a solid part (a filler or riser) is one box, eroded by the shell on all six faces;
 * - a hollow tray's walls, dividers, floor and lip are all counted solid;
 * - the only sparse region of a hollow tray is the slab under each compartment (its raised floor
 *   plus the floor): a box of the compartment's footprint and `floorZ` height, eroded by the
 *   shell on all faces, though the walls beside it would let the core run wider;
 * - a merged part (mergeParts) is its members as they print alone, plus its solid bridges;
 * - a spacer follows the `leftover` style like a riser (openSpacers): an open box, or solid where
 *   the style says so or it is too small to open. It is judged as the one block it is stored as;
 *   with `separators` above 1 it is printed as plates, each judged on its own size (thin ones are
 *   solid), so the estimate can be light by the walls of the extra plates.
 */
function partVolumes(
  t: TraySpec,
  lip: LayoutInput["settings"]["lip"],
  shell: { side: number; vertical: number },
  infill: number,
): { solid: number; atInfill: number } {
  if (t.merged) {
    // The members as they print on their own, and the solid bridges between them.
    let solid = 0;
    let atInfill = 0;
    for (const m of t.merged.members) {
      const v = partVolumes(m, lip, shell, infill);
      solid += v.solid;
      atInfill += v.atInfill;
    }
    // A bridge reaches into the members it joins: only the part of it outside them is new plastic.
    for (const b of t.merged.bridges) {
      const inside = t.merged.members.reduce((sum, m) => sum + overlapMm3(b, m), 0);
      const added = Math.max(0, b.w * b.d * b.h - inside);
      solid += added;
      atInfill += added;
    }
    return { solid, atInfill };
  }
  const outer = t.w * t.d * t.h;
  if (t.solid) {
    const core = t.part === "spacer" || t.part === "divider" ? 0 : coreVolume(t.w, t.d, t.h, shell);
    return { solid: outer, atInfill: outer - core * (1 - infill) };
  }
  const hollow = t.compartments.reduce((s, c) => s + c.w * c.d * Math.max(0, t.h - c.floorZ), 0);
  const ring = t.lip
    ? (t.w * t.d - Math.max(0, t.w - 2 * lip.thickness) * Math.max(0, t.d - 2 * lip.thickness)) *
      lip.height
    : 0;
  const solid = outer - hollow + ring;
  const core = t.compartments.reduce((s, c) => s + coreVolume(c.w, c.d, c.floorZ, shell), 0);
  return { solid, atInfill: solid - core * (1 - infill) };
}

/** Print time (minutes) for `mm3` of extruded plastic at the nominal flow, to a tenth of a minute. */
export function printMinutes(mm3: number): number {
  return round(mm3 / PRINT_FLOW_MM3_PER_S / 60, 1);
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
  const shell = shellThickness(input.printer.layerHeight);
  const infill = Math.min(100, Math.max(0, settings.infill)) / 100;
  let filament = 0;
  let filamentAtInfill = 0;
  let longestPart = 0;
  // Filament follows what is printed: each stack's raised floor comes out as a riser part, open
  // (mostly air) or solid per `leftover`. Counts and fill stay on the stored trays: the split moves
  // height between a tray and its riser without changing the space filled. A spacer is
  // an open box like a riser; its separator plates are not split out here (see partVolumes).
  const parts = mergeParts(
    openSpacers(
      splitDividers(splitRisers(trays, { settings, printer: input.printer, locks: input.locks })),
      { settings },
    ),
    { settings, printer: input.printer },
  );
  for (const t of parts) {
    const v = partVolumes(t, settings.lip, shell, infill);
    filament += v.solid;
    filamentAtInfill += v.atInfill;
    longestPart = Math.max(longestPart, v.atInfill);
  }
  const bottoms: Rect[] = printed
    .filter((t) => t.level === 0)
    .map((t) => ({ x: toU(t.x), y: toU(t.y), w: toU(t.w), d: toU(t.d) }));
  const play = (crossed: number): number =>
    toMm(nominalPlayU(toU(eff.boxClearance), toU(eff.trayGap), crossed));
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
    filamentAtInfillG: round(filamentAtInfill * PLA_G_PER_MM3, 1),
    infillPct: settings.infill,
    printMinutes: printMinutes(filamentAtInfill),
    longestPartMinutes: printMinutes(longestPart),
    playLimit: settings.playLimit,
    playX: play(crossX),
    playY: play(crossY),
    crossX,
    crossY,
  };
}
