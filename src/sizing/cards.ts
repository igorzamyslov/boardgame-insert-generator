import { growthOf, separatorsOf, togglesOf } from "../model/defaults";
import { SLEEVES } from "../model/presets";
import { effective } from "../model/settings";
import type { CardsComponent, Notice, Settings } from "../model/types";
import {
  compartment,
  displayName,
  featuresOf,
  itemLabel,
  mainClearance,
  wallCutout,
  type OptionsResult,
} from "./common";
import { CHANNEL_DEPTH, MIN_MEASURED_CARD_T } from "./constants";
import { growthMm, stackGrowthMm } from "./growth";
import type { CompartmentReq } from "./types";
import { ceilU, fromU } from "./units";

type CardStorage = "upright-long" | "upright-short" | "flat";
const CARD_STORAGES: readonly CardStorage[] = ["upright-long", "upright-short", "flat"];

/** S, L = sleeved short/long side; t = per-card thickness (spec §7.1). */
export interface CardDims {
  S: number;
  L: number;
  t: number;
}

function sleeved(c: CardsComponent, s: Settings): { S: number; L: number; tPreset: number } {
  const short = Math.min(c.shortSide, c.longSide);
  const long = Math.max(c.shortSide, c.longSide);
  if (typeof c.sleeve === "string") {
    const sleeve = SLEEVES[c.sleeve];
    return {
      S: short + sleeve.addSize,
      L: long + sleeve.addSize,
      tPreset: s.cardThickness + sleeve.addThickness,
    };
  }
  return {
    S: Math.min(c.sleeve.w, c.sleeve.h),
    L: Math.max(c.sleeve.w, c.sleeve.h),
    tPreset: s.cardThickness + c.sleeve.thickness,
  };
}

/**
 * Sleeved card size and per-card thickness. Precondition: `c` passes validateComponent, so a
 * measured thickness has a whole card count ≥ 1 and a stack height > 0 (componentOptions only
 * calls this for valid components). A measured value under MIN_MEASURED_CARD_T per card falls
 * back to the preset with a warning.
 */
export function cardDims(
  c: CardsComponent,
  s: Settings,
  index: number,
): { dims: CardDims; notices: Notice[] } {
  const { S, L, tPreset } = sleeved(c, s);
  if (c.thickness.mode === "preset") {
    // The correction scales the whole tabulated thickness (card plus sleeve), so the deck's
    // stack is n·t·scale; it never touches the clearances, which Fit and the stack fraction own.
    return { dims: { S, L, t: tPreset * (c.thickness.scale ?? 1) }, notices: [] };
  }
  const measured = c.thickness.stackMm / c.thickness.cards;
  if (measured >= MIN_MEASURED_CARD_T) {
    return { dims: { S, L, t: measured }, notices: [] };
  }
  const notice: Notice = {
    level: "warning",
    code: "sizing.measuredTooThin",
    message: `${displayName(c)}: ${c.thickness.stackMm} mm for ${c.thickness.cards} cards is under ${MIN_MEASURED_CARD_T} mm per card; using ${tPreset.toFixed(2)} mm per card instead.`,
    path: `/components/${index}/thickness/stackMm`,
  };
  return { dims: { S, L, t: tPreset }, notices: [notice] };
}

/** Stack width of one deck: n·t·(1 + pct·fit) + cardStackClearance·fit (spec §7.1). */
export function stackWidth(n: number, t: number, s: Settings): number {
  const pct = s.cardStackClearancePct * s.fit;
  return n * t * (1 + pct) + effective(s).cardStackClearance;
}

function deckCompartment(
  c: CardsComponent,
  deck: { name: string; count: number },
  storage: CardStorage,
  dims: CardDims,
  s: Settings,
): CompartmentReq {
  const clearance = mainClearance(c, s);
  // As built (compartment rounds it up the same way), so growth is measured on the real stack.
  const stack = fromU(ceilU(stackWidth(deck.count, dims.t, s)));
  const base = {
    componentId: c.id,
    contents: `${itemLabel(c, deck.name)} ×${deck.count}`,
    kind: "well" as const,
  };
  // Flat: the long side along Y, half-round cutouts through both long walls, notching the floor.
  if (storage === "flat") {
    return compartment({
      ...base,
      w: dims.S + clearance,
      d: dims.L + clearance,
      h: stack,
      // More room means more cards in the stack: only when asked, the spare height is a riser's.
      grow: { h: growthMm(growthOf(c, "stack", true), stack) },
      features: featuresOf(togglesOf(c), [
        wallCutout("left", 1, true),
        wallCutout("right", 1, true),
      ]),
    });
  }
  const onLongEdge = storage === "upright-long";
  // Along the stack: a spacer (or the `separators` plates) fills what the deck is given, and
  // retention bounds it (stackGrowthMm).
  const grow = stackGrowthMm(growthOf(c, "stack"), stack, separatorsOf(c) > 1);
  return compartment({
    ...base,
    w: stack,
    d: (onLongEdge ? dims.L : dims.S) + clearance,
    h: (onLongEdge ? dims.S : dims.L) + clearance,
    ...(grow > 0
      ? { grow: { w: grow }, spacerAxis: "w" as const, separators: separatorsOf(c) }
      : {}),
    // One channel through the walls and dividers the card faces touch.
    features: featuresOf(togglesOf(c), [
      wallCutout("left", CHANNEL_DEPTH, false),
      wallCutout("right", CHANNEL_DEPTH, false),
    ]),
  });
}

/** Storage options for a cards component. Precondition: it passes validateComponent. */
export function cardOptions(c: CardsComponent, s: Settings, index: number): OptionsResult {
  const { dims, notices } = cardDims(c, s, index);
  const storages = c.storage === "auto" ? CARD_STORAGES : [c.storage];
  return {
    options: storages.map((storage) => ({
      id: storage,
      blocks: c.decks.map((deck) => [deckCompartment(c, deck, storage, dims, s)]),
    })),
    notices,
  };
}
