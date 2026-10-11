import { effective } from "../model/settings";
import type { Component, Notice, Settings, Side } from "../model/types";
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

export function displayName(c: Component): string {
  return c.name.trim() !== "" ? c.name : c.id;
}

export function label(name: string, fallback: string): string {
  return name.trim() !== "" ? name : fallback;
}

export function isPos(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

export function isCount(x: number): boolean {
  return Number.isInteger(x) && x >= 1;
}

export function invalid(index: number, c: Component, field: string): Notice {
  return {
    level: "error",
    code: "sizing.invalid",
    message: `${displayName(c)}: ${field} is out of range, so this component is not laid out.`,
    path: `/components/${index}/${field}`,
  };
}

export function emptyNotice(index: number, c: Component, field: string): Notice {
  return {
    level: "warning",
    code: "sizing.empty",
    message: `${displayName(c)}: nothing to store (${field} is empty), so this component is not laid out.`,
    path: `/components/${index}/${field}`,
  };
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

/** Builds a CompartmentReq; adds fingerPocket.reach to minW/minD once per pocket side (spec §6.1). */
export function compartment(input: CompartmentInput, s: Settings): CompartmentReq {
  const reach = s.fingerPocket.reach;
  const sides = input.features.flatMap((f) =>
    f.type === "fingerPocket" && f.side !== undefined ? [f.side] : [],
  );
  const xSides = sides.filter((side) => side === "left" || side === "right").length;
  const ySides = sides.filter((side) => side === "front" || side === "back").length;
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
