// Cross-plan contract: roadmap §4.2. Do not rename or change these types.
// (The roadmap's import line also names `Settings`; it is unused here and would
// fail `noUnusedLocals`, so it is left out.)
import type { Access, CompartmentSpec, Side, TraySpec } from "../model/types";

export interface FeatureReq {
  type: "wallCutout" | "scoop" | "cornerRelief";
  side?: Side; // wallCutout, scoop
  depthFraction?: number; // wallCutout: 1/2 (of the shallowest well) or 1 (to its floor)
  floorNotch?: boolean; // wallCutout: notch the floor (flat cards and tiles)
}

export interface CompartmentReq {
  componentId: string;
  contents: string; // label, e.g. "Main deck ×52"
  kind: "well" | "scoop" | "pocket";
  minW: number; // inner, mm: content + clearance
  minD: number;
  minH: number; // content height (depth needed from the compartment floor)
  elastic: { w: boolean; d: boolean; h: boolean };
  minVolume?: number; // mm³; bulk: w·d·h must stay ≥ this
  maxHRatio?: number; // bulk: h ≤ maxHRatio × min(w, d)
  features: FeatureReq[];
  spacerAxis?: "w" | "d"; // upright cards/tiles: spare length on this axis → spacer (≥ 5 mm) or thicker dividers
}

export interface TrayPartReq {
  trayKey: string; // "<groupId ?? componentId>:p<player>:<part>" ("p0" without perPlayer, "pall" for combined)
  arrangement: "strip" | "rows2";
  compartments: CompartmentReq[]; // strip order; rows2: first half row 0, rest row 1
  rotatable: boolean;
}

export interface TrayVariant {
  id: string; // stable, e.g. "upright-long|strip|split1"
  parts: TrayPartReq[]; // > 1 when the variant splits across trays
}

export interface TrayRequirement {
  key: string; // "<groupId ?? componentId>". One requirement per component or group; perPlayer and
  // splits are expressed as variants with several parts (e.g. "separate": parts p0..pN-1;
  // "combined": one part keyed "<key>:pall:0" with one compartment per player).
  // Layout places exactly one variant per requirement, and every part of it.
  componentIds: string[];
  access: Access; // most frequent of its members
  loose: boolean; // contains bulk, minis-bulk or tiles (coverage rule)
  variants: TrayVariant[]; // 1..8, preferred first, fixed order
}

export interface OuterSize {
  w: number;
  d: number;
  h: number;
}

export interface RealizeOptions {
  lipped: boolean; // this tray carries a lip (has a tray stacked on it)
  level: number;
}

export interface RealizedTray {
  wall: number; // base wall used: wallFor(settings, false) rounded up to 0.01 mm
  compartments: CompartmentSpec[];
  spacers: TraySpec[]; // positioned in tray-local coords (x, y, z relative to tray min corner); layout translates them
}
