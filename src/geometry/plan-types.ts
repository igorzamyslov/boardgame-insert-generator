import type { Groove, Step } from "../model/lip";
import type { Side } from "../model/types";

// Constants and result types of tray planning (plan.ts). A TrayPlan holds
// every number tray.ts needs to build the solid. The limits shared with sizing
// (MIN_FEATURE_MM, UPPER_MIN_CHAMFER, SPEC_TOLERANCE, CORNER_MARGIN)
// live in ../model/settings (spec §6.1, roadmap §4.6) and are not defined here.

export const MIN_RELIEF_RADIUS = 0.3; // smaller corner reliefs are dropped
// Radius of the wells' inner vertical corners (spec §6.1: at most 0.5). buildTray cuts a top
// fillet this far (and EPS) on into the compartments at its strip's ends: a 3 mm fillet beside a
// 3 mm post reaches a well's rounded corner, and must leave no sliver of it.
export const INNER_CORNER_RADIUS_MM = 0.5;
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

// A divider's slot (FeatureSpec "dividerSlot"): a box cut `bottomZ`…floorZ into the compartment's
// floor, across the whole compartment along its length (the footprint x0..y1 is within the
// compartment's rectangle). Open at the top, so it prints without support.
export interface SlotPlan extends Rect {
  bottomZ: number;
}

// A finger dip (FeatureSpec "fingerDip", model/finger-dip.ts): the U cut from the top of a solid
// filler, running in from its face `side` (the footprint x0..y1 is within the part), or across the
// whole part when `through`, open on the opposite face too. The round bottom (`radius`) is a
// half-cylinder along the cut, lowest at `bottomZ`. Open at the top, so it prints without support.
export interface DipPlan extends Rect {
  side: Side;
  through: boolean;
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
  rect: Rect; // the CompartmentSpec rectangle, cut down to floorZ
  floorZ: number;
  cuts: CutPlan[];
  slots: SlotPlan[];
  scoops: ScoopPlan[];
  reliefs: ReliefPlan[];
}

// The lip ring (model/lip.ts lipShape): `thickness` wide at its foot, `height` high at the outer
// face with a `flat` top, then a 45° ramp down to `zIn` at the inner face.
export interface LipPlan {
  height: number;
  thickness: number;
  flat: number;
  zIn: number;
}

export interface SocketPlan {
  wall: number;
  depth: number;
  radius: number;
}

export interface TrayPlan {
  w: number;
  d: number;
  h: number;
  topZ: number; // h + lip height
  chamfer: number; // outer bottom edge, 45°; with a groove, the chamfer on the groove's foot edge
  cornerRadius: number; // effective outer vertical corner radius
  outerWall: number; // compartments keep at least this distance to the outer faces
  lip: LipPlan | null;
  // The groove under a tray that stands on a lipped tray (model/lip.ts grooveOf): replaces the
  // outer bottom chamfer, which the groove runs along the whole outer edge instead of.
  groove: Groove | null;
  // The stepped base under a part that stands on a socketed one (model/lip.ts stepOf): the slab
  // hangs `height` below z = 0, the seam, and the 45° step replaces the bottom chamfer. `foot` is
  // the slab's bed chamfer as planned (at most the corner radius less the inset).
  step: Step | null;
  // The socket a part with one stacked on it has (the stepped base, socketOf): everything more than
  // `wall` in from the outer faces stops `depth` under the rim; its corners have `radius`.
  socket: SocketPlan | null;
  compartments: CompartmentPlan[];
  notch: CutPlan | null; // a card spacer's notch: its channel running on through it (plan-cuts.ts)
  dips: DipPlan[]; // a filler's finger dips (plan-dips.ts)
}
