import type { Side } from "../model/types";

// Constants and result types of tray planning (plan.ts). A TrayPlan holds
// every number tray.ts needs to build the solid. The limits shared with sizing
// (MIN_FEATURE_MM, UPPER_MIN_CHAMFER, SPEC_TOLERANCE, CORNER_MARGIN, INNER_CORNER_RADIUS_MM)
// live in ../model/settings (spec §6.1, roadmap §4.6) and are not defined here.

export const LIP_CHAMFER = 0.6; // spec §6.1: 0.6 × 45° on the lip's inner top edge…
export const LIP_FLAT = 0.6; // …less on a thin lip, so its flat top stays at least this wide
export const MIN_RELIEF_RADIUS = 0.3; // smaller corner reliefs are dropped
export const MIN_SCOOP_RADIUS = 0.5; // smaller scoop fillets are dropped
export const RELIEF_CUT = 1 - Math.SQRT1_2; // wall depth a relief through the corner cuts, per mm of radius
// Finger cuts (wall cutouts, channels, spacer notches) round the two top corners of their U, where
// a side meets the top of the wall, divider or spacer, with this radius, less where the material
// beside it is shorter (plan-cuts.ts planTopFillets); fillets under MIN_FILLET are left out.
export const FINGER_FILLET_MM = 3;
export const MIN_FILLET = 0.2;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Wall cutout (spec §6.1): a U cut, from the rim down, through the wall or divider on `side` of
// its compartment. The footprint x0..y1 runs from the compartment's face to the facing face of the
// next compartment across (`into`, its index), or out through the outer face (`into` null); along
// the side it is the cut's width. The round bottom (`radius`) is a half-cylinder along the cut,
// lowest at `bottomZ`. With a floor notch (`notch` > 0, how far it reaches into the floor) the cut
// instead goes down through the bottom at its full width and on into the compartment's floor, its
// far corners rounded, so a fingertip gets under the stack. `topFillets` are the radii of its two
// top corners (at u0 and u1 along the side; 0 = square), rounded across the whole strip.
export interface CutPlan extends Rect {
  side: Side;
  bottomZ: number;
  radius: number;
  into: number | null;
  notch: number;
  topFillets: readonly [number, number];
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
  rect: Rect; // the CompartmentSpec rectangle, cut down to floorZ
  floorZ: number;
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
