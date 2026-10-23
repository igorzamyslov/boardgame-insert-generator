import type { CompartmentSpec, FeatureSpec, Settings, TraySpec } from "../model/types";

// The part, compartment kind and feature values this geometry version can build. A stored
// tray using anything else (a newer-minor file, spec §9) is refused with
// UnsupportedFeatureError; the UI checks the same lists before calling the worker.
export const KNOWN_PARTS: readonly TraySpec["part"][] = Object.freeze([
  "tray",
  "leftover",
  "spacer",
  "riser",
  "divider",
]);
export const KNOWN_COMPARTMENT_KINDS: readonly CompartmentSpec["kind"][] = Object.freeze([
  "well",
  "scoop",
  "pocket",
  "spare",
]);
export const KNOWN_FEATURE_TYPES: readonly FeatureSpec["type"][] = Object.freeze([
  "wallCutout",
  "spacerNotch",
  "dividerSlot",
  "scoop",
  "cornerRelief",
  "fingerDip",
]);

export interface Mesh {
  positions: Float32Array; // xyz per vertex, mm
  indices: Uint32Array; // 3 per triangle, CCW seen from outside
}

export interface PrintabilityReport {
  ok: boolean;
  overhangTriangles: number; // normal.z < −0.71 and not at z = 0
  minFeatureMm: number; // estimated thinnest wall/lip
  problems: string[];
}

export type GeometryRequest =
  | { type: "build"; requestId: number; spec: TraySpec; settings: Settings }
  | { type: "cancel"; requestId: number };

export type GeometryResponse =
  | { type: "built"; requestId: number; key: string; mesh: Mesh; volumeMm3: number }
  | {
      type: "error";
      requestId: number;
      key: string;
      message: string;
      name?: string; // the thrown error's name ("TraySpecError", "AbortError", ...); absent for non-Error throws
      feature?: string; // the unsupported feature, when name is "UnsupportedFeatureError"
    };
