import { dividersOf, flatDecksOffered, growthOf, separatorsOf, togglesOf } from "../model/defaults";
import { SLEEVES } from "../model/presets";
import { roomOf } from "../model/room";
import { SLEEVED_STACK_SPRING, effective } from "../model/settings";
import type { CardsComponent, Notice, Settings } from "../model/types";
import {
  compartment,
  displayName,
  featuresOf,
  itemLabel,
  label,
  mainClearance,
  sectionCutouts,
  wallCutout,
  type OptionsResult,
} from "./common";
import { CHANNEL_DEPTH, DIVIDER_GROOVE, MIN_MEASURED_CARD_T } from "./constants";
import { dividedWidth, dividerSlotWidth, dividerThickness } from "./dividers";
import { growthMm, stackGrowthMm } from "./growth";
import type { CompartmentReq } from "./types";
import { ceilU, fromU, toU } from "./units";

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

/**
 * Stack width of one deck: n·t·(1 + spring·fit) + cardStackClearance·fit (spec §7.1). The spring is
 * SLEEVED_STACK_SPRING for sleeved cards (any sleeve but none, a custom one too), else the
 * setting's fraction. A measured deck is pressed together, so it takes the same spring.
 */
export function stackWidth(n: number, t: number, s: Settings, sleeved = false): number {
  const base = s.cardStackClearancePct;
  const pct = (sleeved ? Math.max(base, SLEEVED_STACK_SPRING) : base) * s.fit;
  return n * t * (1 + pct) + effective(s).cardStackClearance;
}

/** Whether the deck is in sleeves (a custom size counts). */
function isSleeved(c: CardsComponent): boolean {
  return c.sleeve !== "none";
}

/** How many more cards each deck's well is planned for: the item's "some" room, else none. */
function moreCards(c: CardsComponent): number {
  const room = roomOf(c);
  return room.mode === "some" ? room.amount : 0;
}

function deckCompartment(
  c: CardsComponent,
  deck: { name: string; count: number },
  storage: CardStorage,
  dims: CardDims,
  s: Settings,
): CompartmentReq {
  const clearance = mainClearance(c, s);
  // As built (compartment rounds it up the same way), so growth is measured on the real stack. An
  // item's "some" room is more cards in the well, part of the size the layout plans on.
  const more = moreCards(c);
  const natural = fromU(ceilU(stackWidth(deck.count, dims.t, s, isSleeved(c))));
  const stack =
    more > 0 ? fromU(ceilU(stackWidth(deck.count + more, dims.t, s, isSleeved(c)))) : natural;
  const base = {
    componentId: c.id,
    contents: `${itemLabel(c, deck.name)} ×${deck.count}`,
    kind: "well" as const,
  };
  // Flat: the long side along Y, half-round cutouts through both long walls, notching the floor.
  if (storage === "flat") {
    // Dividers of a flat deck are loose plates lying between groups of the stack, so the well is a
    // plate taller for each (realize puts them at the groups' boundaries, splitDividers prints them).
    const plates = dividersOf(c);
    return compartment({
      ...base,
      w: dims.S + clearance,
      d: dims.L + clearance,
      h: stack + plates * dividerThickness(s),
      ...(plates > 0 ? { plates } : {}),
      // As much as fits (or bigger wells) means more cards in the stack, after the layout is chosen:
      // never otherwise, the spare height is a riser's.
      grow: { h: growthMm(growthOf(c, "stack", true, s.biggerWells), stack) },
      features: featuresOf(togglesOf(c), [
        wallCutout("left", 1, true),
        wallCutout("right", 1, true),
      ]),
    });
  }
  const onLongEdge = storage === "upright-long";
  // Along the stack, bounded by retention and reachability (stackGrowthMm). Nothing is printed to
  // fill the room unless `separators` is set (then a spacer, or those plates, fills it and pins the
  // deck); otherwise the well simply grows and the deck stands in it, so growth stops where it
  // would topple or slide out from under its finger cut. With dividers the well itself grows
  // instead, and its sections hold the room; the two do not combine (a spacer would sit behind the
  // last section only).
  const dividers = dividersOf(c);
  const plates = separatorsOf(c);
  const grow = stackGrowthMm(
    growthOf(c, "stack", false, s.biggerWells),
    stack,
    dividers === 0 && plates > 0,
    dividers,
    togglesOf(c).fingerCuts ? s.fingerPocket.width : undefined,
  );
  // The planned room is a spacer's when plates are asked for: it pins the deck and comes out as the
  // collection grows. The spacer is as wide as the room, and takes what the well gains on top.
  const planned = stack - natural;
  const spacer = dividers === 0 && plates > 0 && (grow > 0 || planned > 0);
  return compartment({
    ...base,
    w: dividers > 0 ? dividedWidth(stack, dividers, s) : stack,
    d: (onLongEdge ? dims.L : dims.S) + clearance,
    h: (onLongEdge ? dims.S : dims.L) + clearance,
    ...(dividers > 0
      ? { grow: { w: grow }, dividers, floorExtra: DIVIDER_GROOVE }
      : spacer
        ? {
            grow: { w: grow },
            spacerAxis: "w" as const,
            separators: plates,
            ...(planned > 0 ? { spacerRoom: planned } : {}),
          }
        : grow > 0
          ? { grow: { w: grow } }
          : {}),
    // One channel through the walls and dividers the card faces touch.
    features: featuresOf(togglesOf(c), [
      wallCutout("left", CHANNEL_DEPTH, false),
      wallCutout("right", CHANNEL_DEPTH, false),
    ]),
  });
}

/**
 * The decks of a flat item in ONE well with removable dividers between them (`flatDecks:
 * "dividers"`, spec: groups and copies R7). One cards item has one card size, so the decks differ
 * only in count: the well is as deep as a card is long and as high as the tallest deck's stack,
 * and as wide as every deck's section (a card's short side with its clearance) with a divider's
 * slot between neighbours. The slots are in the floor (floorExtra, `dividers`: realize puts them
 * evenly, so each deck's section is one card wide). Finger access is one cut through the front
 * wall per section (R21): the dividers are loose solid plates, so a channel along the row would
 * stop at the first.
 */
function sharedWell(c: CardsComponent, dims: CardDims, s: Settings): CompartmentReq {
  const clearance = mainClearance(c, s);
  const more = moreCards(c);
  const stack = Math.max(
    ...c.decks.map((deck) => fromU(ceilU(stackWidth(deck.count + more, dims.t, s, isSleeved(c))))),
  );
  const slots = c.decks.length - 1;
  const own = displayName(c);
  const parts = c.decks.map((deck, i) => `${label(deck.name, `Deck ${i + 1}`)} ×${deck.count}`);
  return compartment({
    componentId: c.id,
    contents: c.name.trim() === "" ? parts.join(" + ") : `${own} — ${parts.join(" + ")}`,
    kind: "well",
    w: fromU(c.decks.length * ceilU(dims.S + clearance) + slots * toU(dividerSlotWidth(s))),
    d: dims.L + clearance,
    h: stack,
    grow: { h: growthMm(growthOf(c, "stack", true, s.biggerWells), stack) },
    dividers: slots,
    floorExtra: DIVIDER_GROOVE,
    features: featuresOf(togglesOf(c), [sectionCutouts("front")]),
  });
}

/** Storage options for a cards component. Precondition: it passes validateComponent. */
export function cardOptions(c: CardsComponent, s: Settings, index: number): OptionsResult {
  const { dims, notices } = cardDims(c, s, index);
  const storages = c.storage === "auto" ? CARD_STORAGES : [c.storage];
  return {
    options: storages.map((storage) => ({
      id: storage,
      blocks:
        storage === "flat" && c.flatDecks === "dividers" && flatDecksOffered(c)
          ? [[sharedWell(c, dims, s)]]
          : c.decks.map((deck) => [deckCompartment(c, deck, storage, dims, s)]),
    })),
    notices,
  };
}
