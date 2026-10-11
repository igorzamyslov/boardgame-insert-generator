import type { Side } from "../model/types";

// Constants and result types of tray planning (plan.ts). A TrayPlan holds
// every number tray.ts needs to build the solid. The minimum feature width
// (MIN_FEATURE_MM) and the upper trays' minimum bottom chamfer (UPPER_MIN_CHAMFER)
// come from ../model/settings (see the note above) and are not defined here.

export const INNER_CORNER_RADIUS = 0.5; // spec §6.1: wells' inner vertical corners ≤ 0.5
export const LIP_CHAMFER = 0.6; // spec §6.1: 0.6 × 45° on the lip's inner top edge
export const MIN_RELIEF_RADIUS = 0.3; // smaller corner reliefs are dropped
export const MIN_SCOOP_RADIUS = 0.5; // smaller scoop fillets are dropped
export const SPEC_TOLERANCE = 0.005; // TraySpec numbers are rounded to 0.01 mm
export const CORNER_MARGIN = 0.1; // the outer arc polygon lies up to 0.08 mm inside the true arc
export const RELIEF_CUT = 1 - Math.SQRT1_2; // wall depth a relief through the corner cuts, per mm of radius

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// U-slot cut down from the top. Footprint x0..x1 × y0..y1; its round bottom
// (radius) is a half-cylinder whose axis runs across the side's wall (along
// Y for front/back, along X for left/right); its lowest line is bottomZ.
export interface SlotPlan extends Rect {
  side: Side;
  bottomZ: number;
  radius: number;
}

export interface ScoopPlan {
  side: Side;
  r: number;
}

// Vertical cylinder from the compartment floor up; its circle passes through
// the content corner.
export interface ReliefPlan {
  cx: number;
  cy: number;
  r: number;
}

export interface CompartmentPlan {
  index: number;
  rect: Rect; // the CompartmentSpec rectangle
  content: Rect; // rect minus finger-pocket reach bands; cut down to floorZ
  floorZ: number;
  slots: SlotPlan[];
  scoops: ScoopPlan[];
  reliefs: ReliefPlan[];
}

export interface LipPlan {
  height: number;
  thickness: number;
  chamfer: number;
}

export interface TrayPlan {
  w: number;
  d: number;
  h: number;
  topZ: number; // h + lip height
  chamfer: number; // outer bottom edge, 45°
  cornerRadius: number; // effective outer vertical corner radius
  outerWall: number; // compartments keep at least this distance to the outer faces
  lip: LipPlan | null;
  compartments: CompartmentPlan[];
}
