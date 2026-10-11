import { SLEEVES } from "../model/presets";
import { effective } from "../model/settings";
import type { CardsComponent, Notice, Settings } from "../model/types";
import {
  compartment,
  displayName,
  emptyNotice,
  fingerPocket,
  invalid,
  isCount,
  isPos,
  label,
  mainClearance,
  type OptionsResult,
} from "./common";
import { MIN_MEASURED_CARD_T } from "./constants";
import type { CompartmentReq } from "./types";

export type CardStorage = "upright-long" | "upright-short" | "flat";
export const CARD_STORAGES: readonly CardStorage[] = ["upright-long", "upright-short", "flat"];

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

export function cardDims(
  c: CardsComponent,
  s: Settings,
  index: number,
): { dims: CardDims; notices: Notice[] } {
  const { S, L, tPreset } = sleeved(c, s);
  if (c.thickness.mode === "preset") {
    return { dims: { S, L, t: tPreset }, notices: [] };
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

export function deckCompartment(
  c: CardsComponent,
  deck: { name: string; count: number },
  storage: CardStorage,
  dims: CardDims,
  s: Settings,
): CompartmentReq {
  const clearance = mainClearance(c, s);
  const stack = stackWidth(deck.count, dims.t, s);
  const base = {
    componentId: c.id,
    contents: `${label(deck.name, c.name)} ×${deck.count}`,
    kind: "well" as const,
  };
  if (storage === "flat") {
    return compartment(
      {
        ...base,
        w: dims.S + clearance,
        d: dims.L + clearance,
        h: stack,
        features: [fingerPocket("front", 1, true), fingerPocket("back", 1, true)],
      },
      s,
    );
  }
  const onLongEdge = storage === "upright-long";
  return compartment(
    {
      ...base,
      w: stack,
      d: (onLongEdge ? dims.L : dims.S) + clearance,
      h: (onLongEdge ? dims.S : dims.L) + clearance,
      elastic: { w: true },
      spacerAxis: "w",
      features: [fingerPocket("front", 1 / 3, true), fingerPocket("back", 1 / 3, true)],
    },
    s,
  );
}

function validateCards(c: CardsComponent, index: number): Notice[] {
  const out: Notice[] = [];
  if (!isPos(c.shortSide)) {
    out.push(invalid(index, c, "shortSide"));
  }
  if (!isPos(c.longSide)) {
    out.push(invalid(index, c, "longSide"));
  }
  if (c.decks.length === 0) {
    out.push(emptyNotice(index, c, "decks"));
  }
  c.decks.forEach((deck, i) => {
    if (!isCount(deck.count)) {
      out.push(invalid(index, c, `decks/${i}/count`));
    }
  });
  if (typeof c.sleeve !== "string") {
    if (!isPos(c.sleeve.w)) {
      out.push(invalid(index, c, "sleeve/w"));
    }
    if (!isPos(c.sleeve.h)) {
      out.push(invalid(index, c, "sleeve/h"));
    }
    if (!(Number.isFinite(c.sleeve.thickness) && c.sleeve.thickness >= 0)) {
      out.push(invalid(index, c, "sleeve/thickness"));
    }
  }
  if (c.thickness.mode === "measured") {
    if (!isCount(c.thickness.cards)) {
      out.push(invalid(index, c, "thickness/cards"));
    }
    if (!isPos(c.thickness.stackMm)) {
      out.push(invalid(index, c, "thickness/stackMm"));
    }
  }
  return out;
}

export function cardOptions(c: CardsComponent, s: Settings, index: number): OptionsResult {
  const problems = validateCards(c, index);
  if (problems.length > 0) {
    return { options: [], notices: problems };
  }
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
