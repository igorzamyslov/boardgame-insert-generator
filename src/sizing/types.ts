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
  // Axes the contents may be given more room on (minimal-trays spec §5)
  elastic: { w: boolean; d: boolean; h: boolean };
  // How much more (mm) on each elastic axis: absent means as much as there is. Never Infinity, so a
  // requirement survives JSON; `max` is the absence of a cap.
  growth?: { w?: number; d?: number; h?: number };
  minVolume?: number; // mm³; bulk: w·d·h must stay ≥ this
  maxHRatio?: number; // bulk: h ≤ maxHRatio × min(w, d)
  features: FeatureReq[];
  spacerAxis?: "w" | "d"; // upright cards/tiles with `separators` set: spare length on this axis → spacer (≥ 5 mm); never otherwise
  dividers?: number; // upright cards/tiles: dividers in the well's floor slots (splitDividers); no spacer then
  floorExtra?: number; // mm the floor under this compartment is thicker than the tray's, for the slots
  separators?: number; // with spacerAxis (above 1): plates the user wants the spacer printed as (splitSeparators); the layout is the same for any count
}

export interface TrayPartReq {
  trayKey: string; // "<group id ?? component id>:p<copy>:<part>" ("p0" without copies, "pall" for combined)
  arrangement: "strip" | "rows2";
  compartments: CompartmentReq[]; // strip order; rows2: first half row 0, rest row 1; in each row
  // the compartments asking for a left or right cutout come first (cutsFirst)
  rotatable: boolean;
}

export interface TrayVariant {
  id: string; // stable, e.g. "upright-long|strip|split1"
  parts: TrayPartReq[]; // > 1 when the variant splits across trays
}

export interface TrayRequirement {
  key: string; // "<group id ?? component id>". One requirement per component or group; copies and
  // splits are expressed as variants with several parts (e.g. "separate": parts p0..pN-1;
  // "combined": one part keyed "<key>:pall:0" with one compartment per player).
  // Layout places exactly one variant per requirement, and every part of it.
  componentIds: string[];
  access: Access; // most frequent of its members
  loose: boolean; // contains bulk, minis-bulk, tiles or a member in its bulk fallback (coverage rule)
  variants: TrayVariant[]; // 1..8 per storage option, preferred first, fixed order
}

export interface OuterSize {
  w: number;
  d: number;
  h: number;
}

export interface RealizeOptions {
  lipped: boolean; // this tray carries a lip (has a tray stacked on it)
  level: number;
  /**
   * The smallest outer size (mm, the tray's own frame) its place in a stack asks of it: a tray
   * under others is at least as big as what stands on it. Contents that may grow take that much
   * more room without it counting against their growth setting (spec §5), which bounds the room
   * given beyond it. Absent: the part's own minimum.
   */
  stackMin?: { w: number; d: number };
}

export interface RealizedTray {
  wall: number; // base wall used: wallFor(settings, false) rounded up to 0.01 mm
  compartments: CompartmentSpec[];
  spacers: TraySpec[]; // positioned in tray-local coords (x, y, z relative to tray min corner); layout translates them
}
