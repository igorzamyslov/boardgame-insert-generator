// Cross-plan contract: roadmap §4.2. Do not rename or change these types.
// (The roadmap's import line also names `Settings`; it is unused here and would
// fail `noUnusedLocals`, so it is left out.)
// 0.7.0 added the optional FeatureReq.perSection (flat decks sharing one well), approved by the
// controller; nothing else here changed.
import type { Access, CompartmentSpec, Side, TraySpec } from "../model/types";

export interface FeatureReq {
  type: "wallCutout" | "scoop" | "cornerRelief";
  side?: Side; // wallCutout, scoop
  depthFraction?: number; // wallCutout: 1/2 (of the shallowest well) or 1 (to its floor)
  floorNotch?: boolean; // wallCutout: notch the floor (flat cards and tiles)
  // wallCutout: a divided well (`dividers`) is cut once per section, each centred on its section
  // (flat decks sharing one well), not once centred on the whole well
  perSection?: boolean;
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
  // A group member's axis on Max (group-tray-fill spec §2): the well takes the slack its group tray
  // already has on that axis and never makes the tray bigger. Such an axis is NOT elastic and has no
  // cap, so the layout sees no growth room from it and the outer size is as with the axis Off; only
  // realize (layoutAt) draws the well bigger: d as deep as its row, w with the slack the walls would
  // take, h down to the tray's deepest floor.
  fill?: { w?: true; d?: true; h?: true };
  minVolume?: number; // mm³; bulk: w·d·h must stay ≥ this
  maxHRatio?: number; // bulk: h ≤ maxHRatio × min(w, d)
  features: FeatureReq[];
  spacerAxis?: "w" | "d"; // upright cards/tiles with `separators` set: spare length on this axis → spacer (≥ 5 mm); never otherwise
  dividers?: number; // upright cards/tiles: dividers in the well's floor slots (splitDividers); no spacer then
  floorExtra?: number; // mm the floor under this compartment is thicker than the tray's, for the slots
  separators?: number; // with spacerAxis (above 1): plates the user wants the spacer printed as (splitSeparators); the layout is the same for any count
}

export interface TrayPartReq {
  trayKey: string; // "<group id ?? component id>:p<copy>:<part>" ("p0" without copies); part counts from 0 in each copy
  arrangement: "strip" | "rows2";
  compartments: CompartmentReq[]; // strip order; rows2: the first `rowBreak` in row 0, the rest in row 1; inside one
  // member the compartments asking for a left or right cutout come first (cutsFirst)
  rowBreak?: number; // rows2 only: how many compartments the front row holds (1..n-1); absent = ceil(n/2)
  rotatable: boolean;
}

export interface TrayVariant {
  id: string; // stable, e.g. "upright-long|strip|split1"
  parts: TrayPartReq[]; // > 1 when the variant splits across trays
}

export interface TrayRequirement {
  key: string; // "<group id ?? component id>". One requirement per component or group; copies and
  // splits are expressed as variants with several parts: C copies of the same 1–3 parts, keyed
  // "<key>:p<copy>:<part>". Layout places exactly one variant per requirement, and every part of it.
  componentIds: string[];
  access: Access; // the group's, or the item's own
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
