// src/instructions/lift.ts
// How a printed part comes back out of the box (the packing guide's "Lift" column), and which
// parts are next to which. Nothing on a tray's outside can be gripped: neighbours stand 0.2 mm
// away and the box wall 0.5 mm, so a whole tray comes out by something it has of its own (a finger
// cut, a scoop, an open pocket), a finger dip in the filler beside it, or its contents, and a solid
// block with none comes out only after a neighbour has. DESIGN §7 ("The packing guide says how to
// take each…").
//
// To teach the guide a new way to lift a part (a finger dip in a filler, say), add ONE entry to
// GRIP_RULES, with its line and the test for the feature, and a case to lift.test.ts. Nothing
// else reads the features: the order of the rows, the "No grip of its own" flag and the page's
// summary all go by what `gripOf` says.
import { dipBox, fingerDipsOf } from "../model/finger-dip";
import type { FeatureSpec, TraySpec } from "../model/types";
import { MIN_SPACER } from "../sizing/constants";

/** What a part is lifted by. `contents` and `none` are the two without a grip of their own. */
export type GripKind =
  "finger-cut" | "dip-beside" | "dip" | "scoop" | "pocket" | "edge" | "contents" | "none";

export interface Grip {
  kind: GripKind;
  /** The part has something of its own to hold. False: it comes out by its contents or a neighbour. */
  own: boolean;
}

interface GripRule {
  kind: Exclude<GripKind, "none">;
  own: boolean;
  /**
   * Whether the part, or a member of a merged part, has the feature. `facing` is the keys of the
   * trays with a finger dip of another part open on a side (`dipsFacingTrays`), for a rule that
   * is about what stands beside the part.
   */
  applies: (t: TraySpec, facing: ReadonlySet<string>) => boolean;
}

/** The words of every way out. One source: the page prints them, the rulings list them. */
export const LIFT_LINES = {
  "finger-cut": "Lift it by the finger cut",
  dip: "Lift it by the finger dip",
  /** A tray with no grip of its own, and a dip cut in the filler beside it. */
  "dip-beside": "Lift it by the finger dip beside it",
  scoop: "Tip the pieces out, then lift it by the scoop",
  pocket: "Reach into its open pocket",
  edge: "Empty one side first, then pinch its top edge",
  contents: "Empty it first, then lift it from inside",
  /** A solid block with no neighbour to wait for. */
  alone: "Tip it out of the box",
} as const;

/** "Take out <name> first, then tip it out", for a part with nothing to hold; {name} is a tray or spacer. */
export const takeOutFirst = (name: string): string => `Take out ${name} first, then tip it out`;
/** The same for a spacer or divider: it stands in a tray whose contents hold it. */
export const takeOutWhatHolds = (tray: string): string =>
  `Take out what ${tray} holds first, then tip it out`;

/** The rulings' templates of the two lines that carry a name. */
export const LIFT_TEMPLATES = [
  "Take out {name} first, then tip it out",
  "Take out what {name} holds first, then tip it out",
] as const;

/** The guide's heading word for taking the parts out, and its one instruction (DESIGN §7). */
export const TAKE_OUT_HEADING = "Taking it out.";
export const TAKE_OUT_NOTE =
  "Start with the top layer. Read its table from the last row up, then do the same for the layer below.";
/** What a row says, and the note names, of a part with nothing of its own to hold. */
export const NO_GRIP_TAG = "No grip of its own";
export const noGripNote = (names: readonly string[]): string =>
  `${names.join(", ")}. Each needs something else out first.`;
export const NO_GRIP_TEMPLATE = `${NO_GRIP_TAG}: {name}. Each needs something else out first.`;

const features = (t: TraySpec): FeatureSpec[] => [
  ...(t.features ?? []),
  ...t.compartments.flatMap((c) => c.features),
];

const hasFingerCut = (t: TraySpec): boolean =>
  features(t).some((f) => f.type === "wallCutout" || f.type === "spacerNotch");

/**
 * A finger dip cut across a thin strip (layout/dips.ts, `dipRun`): open on both faces of a filler
 * under 18 mm, so a finger and thumb pinch the strip at the slot, a grip of its own. A dip that
 * runs only 15 mm into a thick filler is no grip of the filler: it ends in the filler's own wall,
 * a U with vertical sides has nothing to pull on, and the filler's other face stands against the
 * next tray or the box wall, so no thumb reaches it. Such a dip is for the tray it faces
 * (`dip-beside`), and the block waits for that tray like any block with nothing to hold.
 */
const hasThroughDip = (t: TraySpec): boolean =>
  fingerDipsOf(t).some(({ part, dip }) => dipBox(dip, part).through);

/** A tray with a finger dip of the filler beside it open on one of its sides: gripped without being emptied. */
const hasDipBeside = (t: TraySpec, facing: ReadonlySet<string>): boolean =>
  t.part === "tray" && facing.has(t.key);

const hasScoop = (t: TraySpec): boolean =>
  t.compartments.some((c) => c.kind === "scoop") || features(t).some((f) => f.type === "scoop");

/**
 * An open box a hand fits into: a spare, riser or spacer printed with a pocket at least
 * MIN_SPACER deep (the depth under which the builders print it solid anyway). A tray's own pockets
 * are what it holds, not a grip.
 */
const hasOpenPocket = (t: TraySpec): boolean =>
  t.part !== "tray" && !t.solid && t.compartments.some((c) => t.h - c.floorZ >= MIN_SPACER);

/**
 * The ways to lift a part, best first: the first rule a part meets decides. A merged part meets a
 * rule when any of its members does.
 */
const GRIP_RULES: readonly GripRule[] = [
  { kind: "finger-cut", own: true, applies: hasFingerCut },
  // Behind the tray's own finger cut, ahead of the scoop: a dip lifts the tray full, a scoop only
  // once its pieces are tipped out.
  { kind: "dip-beside", own: true, applies: hasDipBeside },
  { kind: "scoop", own: true, applies: hasScoop },
  { kind: "pocket", own: true, applies: hasOpenPocket },
  // After the pocket: a merged part with an open member is easier to reach into than to pinch.
  { kind: "dip", own: true, applies: hasThroughDip },
  { kind: "edge", own: true, applies: (t) => t.part === "divider" },
  // A tray with nothing else to hold: only what is in it gives a hand a way in.
  { kind: "contents", own: false, applies: (t) => t.part === "tray" },
];

const NO_DIPS: ReadonlySet<string> = new Set();

/**
 * What `spec` is lifted by. `facing` holds the keys of the trays that have a finger dip beside
 * them (`dipsFacingTrays`, from the printed parts); without it a tray has none.
 */
export function gripOf(spec: TraySpec, facing: ReadonlySet<string> = NO_DIPS): Grip {
  const targets = spec.merged === undefined ? [spec] : spec.merged.members;
  const rule = GRIP_RULES.find((r) => targets.some((t) => r.applies(t, facing)));
  return rule === undefined ? { kind: "none", own: false } : { kind: rule.kind, own: rule.own };
}

/** What a line needs besides the part: the name it points at. */
export interface LiftContext {
  /** The neighbour to take out first (a solid block); null: none to wait for. */
  neighbour: string | null;
  /** The tray a spacer or divider goes into, or a riser carries. */
  tray: string | null;
}

/** The one short line that says how to lift a part out. */
export function liftLine(spec: TraySpec, grip: Grip, ctx: LiftContext): string {
  if (grip.kind !== "none") {
    return LIFT_LINES[grip.kind];
  }
  if (spec.part === "riser") {
    return ctx.tray === null ? LIFT_LINES.alone : takeOutFirst(ctx.tray);
  }
  if (spec.part === "spacer") {
    return ctx.tray === null ? LIFT_LINES.alone : takeOutWhatHolds(ctx.tray);
  }
  return ctx.neighbour === null ? LIFT_LINES.alone : takeOutFirst(ctx.neighbour);
}

/** A box in box coordinates, from its least to its greatest corner, mm. */
export interface Extent {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** The boxes a part fills: its own, or its members' when several are printed as one. */
export function extentsOf(spec: TraySpec): Extent[] {
  return (spec.merged === undefined ? [spec] : spec.merged.members).map((t) => ({
    x0: t.x,
    x1: t.x + t.w,
    y0: t.y,
    y1: t.y + t.d,
    z0: t.z,
    z1: t.z + t.h,
  }));
}

/** Two faces within this of each other touch (the grid is 0.01 mm). */
const MEET = 0.05;
/** Parts this close, side by side, are neighbours: a tray gap is 0.2 mm, the box wall 0.5 mm. */
const BESIDE_MM = 1;
/** The least two parts must share, along their meeting edge and in height, to count as touching. */
const SHARED_MM = 1;

const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.min(a1, b1) - Math.max(a0, b0);

/**
 * How much two boxes face each other side by side, mm²: the stretch they share along the edge
 * where they meet times the height they share, or 0 when they are apart, or one stands over the
 * other.
 */
export function contact(a: Extent, b: Extent): number {
  const ox = overlap(a.x0, a.x1, b.x0, b.x1);
  const oy = overlap(a.y0, a.y1, b.y0, b.y1);
  const oz = overlap(a.z0, a.z1, b.z0, b.z1);
  if (oz < SHARED_MM) {
    return 0;
  }
  // A gap is minus an overlap: a hair of overlap is rounding, a real one is one box on the other.
  if (ox >= SHARED_MM && -oy >= -MEET && -oy <= BESIDE_MM) {
    return ox * oz;
  }
  if (oy >= SHARED_MM && -ox >= -MEET && -ox <= BESIDE_MM) {
    return oy * oz;
  }
  return 0;
}

/** How much of `a` side by side with `b`, over all the boxes of each. */
export function contactOf(a: readonly Extent[], b: readonly Extent[]): number {
  return a.reduce((sum, p) => sum + b.reduce((s, q) => s + contact(p, q), 0), 0);
}

/** Whether a box stands on another: its floor is the other's top and they overlap in plan. */
export function standsOn(upper: Extent, lower: Extent): boolean {
  return (
    Math.abs(upper.z0 - lower.z1) <= MEET &&
    overlap(upper.x0, upper.x1, lower.x0, lower.x1) >= SHARED_MM &&
    overlap(upper.y0, upper.y1, lower.y0, lower.y1) >= SHARED_MM
  );
}

/** Whether any box of `upper` stands on a box of `lower`. */
export function carriedBy(upper: readonly Extent[], lower: readonly Extent[]): boolean {
  return upper.some((u) => lower.some((l) => standsOn(u, l)));
}
