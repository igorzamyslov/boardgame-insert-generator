import { effective } from "../model/settings";
import type { Component, Notice, Settings, Side } from "../model/types";
import { validateComponent } from "../model/validate";
import type { CompartmentReq, FeatureReq } from "./types";

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
 * Each component's options function calls this defensively and, when it is false, returns no
 * options and no notices, so sizing never repeats validation.
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

/** Builds a CompartmentReq; adds fingerPocket.reach to minW/minD once per pocket side, however many pockets share it (spec §6.1). */
export function compartment(input: CompartmentInput, s: Settings): CompartmentReq {
  const reach = s.fingerPocket.reach;
  const sides = new Set(
    input.features.flatMap((f) =>
      f.type === "fingerPocket" && f.side !== undefined ? [f.side] : [],
    ),
  );
  const xSides = Number(sides.has("left")) + Number(sides.has("right"));
  const ySides = Number(sides.has("front")) + Number(sides.has("back"));
  const req: CompartmentReq = {
    componentId: input.componentId,
    contents: input.contents,
    kind: input.kind,
    minW: input.w + xSides * reach,
    minD: input.d + ySides * reach,
    minH: input.h,
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
