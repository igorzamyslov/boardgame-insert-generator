import { effective } from "../model/settings";
import type { Component, Notice, Settings, Side } from "../model/types";
import type { Toggles } from "../model/defaults";
import { validateComponent } from "../model/validate";
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

/**
 * A finger cutout through the wall or divider on `side` (roadmap §4.6): `depthFraction` 1 runs down
 * to the compartment's floor (flat cards and tiles, with a floor notch), less is that fraction of
 * the shallowest well its channel crosses (upright cards and tiles, minis pockets and custom wells:
 * half).
 */
export function wallCutout(side: Side, depthFraction: number, floorNotch: boolean): FeatureReq {
  return { type: "wallCutout", side, depthFraction, floorNotch };
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
  features: FeatureReq[];
  spacerAxis?: "w" | "d";
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
