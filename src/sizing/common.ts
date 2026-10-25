import { effective } from "../model/settings";
import type { Component, Notice, Settings, Side } from "../model/types";
import type { Toggles } from "../model/defaults";
import { validateComponent } from "../model/validate";
import { SHORT_PIECE_H } from "./constants";
import type { CompartmentReq, FeatureReq } from "./types";
import { ceilU, fromU } from "./units";

/** One way to store a component. Blocks are compartment groups a split never separates. */
export interface StorageOption {
  id: string;
  blocks: CompartmentReq[][];
}

export interface OptionsResult {
  options: StorageOption[];
  notices: Notice[];
}

export function label(name: string, fallback: string): string {
  return name.trim() !== "" ? name : fallback;
}

export function displayName(c: Component): string {
  return label(c.name, c.id);
}

/**
 * What a compartment holding `itemName` of component `c` is called: "Starter deck — Deck 1", so
 * several trays of one component read as a group. No prefix when the item has no name of its own
 * (it already falls back to the component's), when it is called the same as the component, or when
 * the component has no name (its id is a fallback, not something to show).
 */
export function itemLabel(c: Component, itemName: string): string {
  const own = displayName(c);
  const item = label(itemName, own);
  return item === own || c.name.trim() === "" ? item : `${own} — ${item}`;
}

/**
 * Sizing precondition: size() is only meaningful for a project without error-level notices
 * (plans 4 and 5 never optimize otherwise), and the UI already shows validateProject's notices.
 * componentOptions calls this once, defensively, and when it is false returns no options and no
 * notices, so sizing never repeats validation.
 */
export function componentIsValid(c: Component, index: number): boolean {
  return !validateComponent(c, index).some((n) => n.level === "error");
}

/**
 * The component's main clearance (total): cardClearance for cards, pieceClearance otherwise,
 * both × fit. `component.clearance` replaces it as an absolute total, not scaled by fit.
 */
export function mainClearance(c: Component, s: Settings): number {
  if (c.clearance !== undefined) {
    return c.clearance;
  }
  const e = effective(s);
  if (c.kind === "minis" && c.storage !== "bulk") {
    return e.miniClearance;
  }
  return c.kind === "cards" ? e.cardClearance : e.pieceClearance;
}

/**
 * A finger cutout through the wall or divider on `side` (roadmap §4.6): `depthFraction` 1 runs down
 * to the compartment's floor (flat cards and tiles, with a floor notch; short custom items and
 * minis, `pieceCutout`), less is that fraction of the shallowest well its channel crosses (upright
 * cards and tiles, taller minis pockets and custom wells: half).
 */
export function wallCutout(side: Side, depthFraction: number, floorNotch: boolean): FeatureReq {
  return { type: "wallCutout", side, depthFraction, floorNotch };
}

/**
 * The finger cutout through `side` for a piece `h` mm tall (custom items, minis): a short piece
 * (under SHORT_PIECE_H) asks for the full-depth cut with a floor notch, as flat cards and tiles do,
 * so a fingertip gets under it; a taller one the half-deep plain cut, lifted by its top.
 */
export function pieceCutout(side: Side, h: number): FeatureReq {
  return h < SHORT_PIECE_H ? wallCutout(side, 1, true) : wallCutout(side, 0.5, false);
}

/**
 * A full-depth cutout through `side` of a well divided by loose dividers (flat decks sharing one
 * well): one cut for each section, centred on it, so every deck is reachable (realize expands it).
 */
export function sectionCutouts(side: Side): FeatureReq {
  return { type: "wallCutout", side, depthFraction: 1, floorNotch: true, perSection: true };
}

/** The sides that ask for a wall cutout, each once, in feature order. */
export function cutoutSides(features: readonly FeatureReq[]): Side[] {
  const sides: Side[] = [];
  for (const f of features) {
    if (f.type === "wallCutout" && f.side !== undefined && !sides.includes(f.side)) {
      sides.push(f.side);
    }
  }
  return sides;
}

export function cornerRelief(): FeatureReq {
  return { type: "cornerRelief" };
}

/**
 * The features of a compartment with the toggles `on` (spec §5, §6.1; togglesOf): its `cuts` when
 * finger cuts are on; the scoop ramp when the curved floor is, with no side yet (realize picks
 * the walls once the size and the cuts are final); and corner reliefs when they are on. All
 * three off give a plain box.
 */
export function featuresOf(on: Toggles, cuts: readonly FeatureReq[]): FeatureReq[] {
  const kept = on.fingerCuts ? cuts : [];
  return [
    ...kept,
    ...(on.curvedFloor ? [{ type: "scoop" as const }] : []),
    ...(on.cornerReliefs ? [cornerRelief()] : []),
  ];
}

export interface CompartmentInput {
  componentId: string;
  contents: string;
  kind: CompartmentReq["kind"];
  w: number; // content size including clearance
  d: number;
  h: number;
  elastic?: Partial<CompartmentReq["elastic"]>;
  /**
   * How much more room (mm, Infinity: no limit) the contents get on an axis (growthMm). It decides
   * `elastic` for the axes it names (more than 0 grows); the axes it leaves out follow `elastic`.
   */
  grow?: { w?: number; d?: number; h?: number };
  features: FeatureReq[];
  spacerAxis?: "w" | "d";
  /** With `spacerAxis`: the part of `w` that is room the spacer fills (an item's "some" room), mm. */
  spacerRoom?: number;
  separators?: number;
  dividers?: number;
  plates?: number;
  floorExtra?: number;
  minVolume?: number;
  maxHRatio?: number;
}

/**
 * Builds a CompartmentReq: the content rounded up to whole 0.01 mm (layout still rounds the
 * minimums up, for hand-built requirements).
 */
export function compartment(input: CompartmentInput): CompartmentReq {
  const req: CompartmentReq = {
    componentId: input.componentId,
    contents: input.contents,
    kind: input.kind,
    minW: fromU(ceilU(input.w)),
    minD: fromU(ceilU(input.d)),
    minH: fromU(ceilU(input.h)),
    elastic: {
      w: input.grow?.w !== undefined ? input.grow.w > 0 : (input.elastic?.w ?? false),
      d: input.grow?.d !== undefined ? input.grow.d > 0 : (input.elastic?.d ?? false),
      h: input.grow?.h !== undefined ? input.grow.h > 0 : (input.elastic?.h ?? false),
    },
    features: input.features,
  };
  const caps: NonNullable<CompartmentReq["growth"]> = {};
  for (const axis of ["w", "d", "h"] as const) {
    const cap = input.grow?.[axis];
    if (cap !== undefined && cap > 0 && Number.isFinite(cap)) {
      caps[axis] = cap;
    }
  }
  if (Object.keys(caps).length > 0) {
    req.growth = caps;
  }
  if (input.minVolume !== undefined) {
    req.minVolume = input.minVolume;
  }
  if (input.maxHRatio !== undefined) {
    req.maxHRatio = input.maxHRatio;
  }
  if (input.spacerAxis !== undefined) {
    req.spacerAxis = input.spacerAxis;
    if (input.spacerRoom !== undefined && input.spacerRoom > 0) {
      req.spacerRoom = fromU(ceilU(input.spacerRoom));
    }
  }
  if (input.dividers !== undefined && input.dividers > 0) {
    req.dividers = input.dividers;
  }
  if (input.plates !== undefined && input.plates > 0) {
    req.plates = input.plates;
  }
  if (input.floorExtra !== undefined && input.floorExtra > 0) {
    req.floorExtra = input.floorExtra;
  }
  if (input.separators !== undefined && input.separators > 1) {
    req.separators = input.separators;
  }
  return req;
}
