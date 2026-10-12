import type { Side } from "../model/types";

// Constants and result types of tray planning (plan.ts). A TrayPlan holds
// every number tray.ts needs to build the solid. The limits shared with sizing
// (MIN_FEATURE_MM, UPPER_MIN_CHAMFER, SPEC_TOLERANCE, CORNER_MARGIN) live in
// ../model/settings (spec §6.1, roadmap §4.6) and are not defined here.

export const INNER_CORNER_RADIUS = 0.5; // spec §6.1: wells' inner vertical corners ≤ 0.5
export const LIP_CHAMFER = 0.6; // spec §6.1: 0.6 × 45° on the lip's inner top edge…
export const LIP_FLAT = 0.6; // …less on a thin lip, so its flat top stays at least this wide
export const MIN_RELIEF_RADIUS = 0.3; // smaller corner reliefs are dropped
export const MIN_SCOOP_RADIUS = 0.5; // smaller scoop fillets are dropped
export const RELIEF_CUT = 1 - Math.SQRT1_2; // wall depth a relief through the corner cuts, per mm of radius
// Finger cuts (wall cutouts, channels, spacer notches) round the vertical edges where their sides
// meet a wall or divider face with this radius, less where the material beside it is thinner
// (plan-cuts.ts planFillets); fillets under MIN_FILLET are left out.
export const FINGER_FILLET_MM = 1.5;
export const MIN_FILLET = 0.2;

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

// Wall cutout (spec §6.1): a U cut, from the rim down, through the wall or divider on `side` of
// its compartment. The footprint x0..y1 runs from the compartment's face to the facing face of the
// next compartment across (`into`, its index), or out through the outer face (`into` null); along
// the side it is the cut's width. The round bottom (radius) is a half-cylinder along the cut, lowest at bottomZ. A floor
// notch of radius `notch` (0 = none) cuts a half-disc centred on the cut into the compartment's
// floor and the cut's middle 2·notch down through the bottom, so a fingertip gets under the stack.
export interface CutPlan extends SlotPlan {
  into: number | null;
  notch: number;
  fillets: FilletPlan[];
}

// A rounded vertical edge of a finger cut: the solid corner at (x, y), the material lying toward
// (sx, sy), is rounded with radius r from height z0 up. The cut takes the square from the corner to
// (x + sx·r, y + sy·r) less the disc of radius r around its far corner.
export interface FilletPlan {
  x: number;
  y: number;
  sx: 1 | -1;
  sy: 1 | -1;
  r: number;
  z0: number;
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
  cuts: CutPlan[];
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
  notch: CutPlan | null; // a card spacer's notch: its channel running on through it (plan-cuts.ts)
}
