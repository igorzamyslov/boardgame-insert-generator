import { MIN_POCKET_CONTENT, effective } from "../model/settings";
import type { Component, Notice, Settings, Side } from "../model/types";
import { validateComponent } from "../model/validate";
import type { CompartmentReq, FeatureReq } from "./types";
import { ceilU, fromU, toU } from "./units";

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
  return c.kind === "cards" ? e.cardClearance : e.pieceClearance;
}

/** The sides that carry a finger pocket, each once, in feature order. */
export function pocketSides(features: readonly FeatureReq[]): Side[] {
  const sides: Side[] = [];
  for (const f of features) {
    if (f.type === "fingerPocket" && f.side !== undefined && !sides.includes(f.side)) {
      sides.push(f.side);
    }
  }
  return sides;
}

/** The finger-reach band in whole 0.01 mm units: the setting rounded up. */
export function reachU(s: Settings): number {
  return ceilU(s.fingerPocket.reach);
}

export function fingerPocket(side: Side, depthFraction: number, perItem: boolean): FeatureReq {
  return { type: "fingerPocket", side, depthFraction, perItem };
}

export function cornerRelief(): FeatureReq {
  return { type: "cornerRelief" };
}

export interface CompartmentInput {
  componentId: string;
  contents: string;
  kind: CompartmentReq["kind"];
  w: number; // content size including clearance, finger reach NOT included
  d: number;
  h: number;
  elastic?: Partial<CompartmentReq["elastic"]>;
  features: FeatureReq[];
  spacerAxis?: "w" | "d";
  minVolume?: number;
  maxHRatio?: number;
}

/**
 * Builds a CompartmentReq; adds fingerPocket.reach to minW/minD once per pocket side, however many
 * pockets share it (spec §6.1). Content rounds up to whole 0.01 mm and the reach is added as the
 * whole-unit band realizeTray subtracts again, so the well is never narrower than the content.
 * minW, minD and minH are therefore whole 0.01 mm (layout still rounds them up, for hand-built
 * requirements). A compartment with a finger pocket keeps at least MIN_POCKET_CONTENT of content
 * on both axes, which is what the geometry checks (its content rectangle is the compartment minus
 * the reach bands).
 */
export function compartment(input: CompartmentInput, s: Settings): CompartmentReq {
  const reach = reachU(s);
  const sides = pocketSides(input.features);
  const xSides = Number(sides.includes("left")) + Number(sides.includes("right"));
  const ySides = Number(sides.includes("front")) + Number(sides.includes("back"));
  const least = sides.length > 0 ? toU(MIN_POCKET_CONTENT) : 0;
  const req: CompartmentReq = {
    componentId: input.componentId,
    contents: input.contents,
    kind: input.kind,
    minW: fromU(Math.max(ceilU(input.w), least) + xSides * reach),
    minD: fromU(Math.max(ceilU(input.d), least) + ySides * reach),
    minH: fromU(ceilU(input.h)),
    elastic: {
      w: input.elastic?.w ?? false,
      d: input.elastic?.d ?? false,
      h: input.elastic?.h ?? false,
    },
    features: input.features,
  };
  if (input.minVolume !== undefined) {
    req.minVolume = input.minVolume;
  }
  if (input.maxHRatio !== undefined) {
    req.maxHRatio = input.maxHRatio;
  }
  if (input.spacerAxis !== undefined) {
    req.spacerAxis = input.spacerAxis;
  }
  return req;
}
