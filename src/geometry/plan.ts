import type { CompartmentSpec, Settings, Side, TraySpec } from "../model/types";
import {
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  SPEC_TOLERANCE as TOL,
  narrowestCutMm,
  effectiveBottomChamfer,
} from "../model/settings";
import {
  LIP_INNER_MIN,
  bottomMinimums,
  builtLevel,
  grooveEdge,
  grooveOf,
  grooveWall,
  lipShape,
  plainEdge,
  rimOn,
  socketCornerCap,
  socketOf,
  stepEdge,
  stepOf,
} from "../model/lip";
import type { BottomEdge } from "../model/lip";
import { keepsApart } from "../model/cut-rules";
import { ownFeatures } from "../model/top-chamfer";
import { TraySpecError, UnsupportedFeatureError } from "./errors";
import { planCornerRadius, planReliefs, thinCorner } from "./plan-corners";
import {
  checkCutClearance,
  checkNotches,
  notchEdges,
  planCut,
  planNotchFillets,
  planTopFillets,
  planSpacerNotch,
} from "./plan-cuts";
import type { CutRequest } from "./plan-cuts";
import { planTopChamfers } from "./plan-chamfers";
import { checkSlots, planSlot } from "./plan-slots";
import type { SlotRequest } from "./plan-slots";
import { MIN_SCOOP_RADIUS } from "./plan-types";
import type { CompartmentPlan, LipPlan, Rect, ScoopPlan, TrayPlan } from "./plan-types";
import { KNOWN_COMPARTMENT_KINDS, KNOWN_FEATURE_TYPES, KNOWN_PARTS } from "./types";

// Pure geometry planning: validates a TraySpec and turns it into exact
// numbers (chamfer, corner radius, lip, per-compartment cut regions).
// tray.ts only turns a TrayPlan into solids, so every rule lives here and is
// tested without WASM.

const SIDES: readonly Side[] = ["front", "back", "left", "right"];

function fail(spec: TraySpec, message: string): never {
  throw new TraySpecError(`Tray ${spec.key}: ${message}`);
}

function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function planLip(spec: TraySpec, settings: Settings): LipPlan | null {
  // With the stepped base a lipped part has a socket instead (planTray).
  if (!spec.lip || !rimOn(settings)) {
    return null;
  }
  const { height, thickness, ledge } = settings.lip;
  if (!Number.isFinite(ledge)) {
    fail(spec, `lip ledge ${ledge} mm is not a number`);
  }
  // The lip ring between two concentric polygons is thinner at its corner facets, so it keeps
  // the CORNER_MARGIN the wall has (MIN_WALL_MM).
  if (!Number.isFinite(thickness) || !(thickness >= MIN_WALL_MM - TOL)) {
    fail(spec, `lip thickness ${thickness} mm is below ${MIN_WALL_MM} mm`);
  }
  if (!Number.isFinite(height) || !(height >= LIP_INNER_MIN)) {
    fail(spec, `lip height ${height} mm is below ${LIP_INNER_MIN} mm`);
  }
  const { flat, zIn } = lipShape(height, thickness);
  return { height, thickness, flat, zIn };
}

function isKnown(known: readonly string[], value: unknown): boolean {
  return typeof value === "string" && known.includes(value);
}

// Values from a newer-minor file that this version can't build (spec §9).
function checkKnown(spec: TraySpec): void {
  if (!isKnown(KNOWN_PARTS, spec.part)) {
    throw new UnsupportedFeatureError(`part:${String(spec.part)}`);
  }
  for (const f of spec.features ?? []) {
    if (!isKnown(KNOWN_FEATURE_TYPES, f.type)) {
      throw new UnsupportedFeatureError(String((f as { type: unknown }).type));
    }
  }
  for (const c of spec.compartments) {
    if (!isKnown(KNOWN_COMPARTMENT_KINDS, c.kind)) {
      throw new UnsupportedFeatureError(`kind:${String(c.kind)}`);
    }
    for (const f of c.features) {
      if (!isKnown(KNOWN_FEATURE_TYPES, f.type)) {
        throw new UnsupportedFeatureError(String((f as { type: unknown }).type));
      }
    }
  }
}

function sideOf(spec: TraySpec, side: unknown): Side {
  if (typeof side === "string" && (SIDES as readonly string[]).includes(side)) {
    return side as Side;
  }
  return fail(spec, `unknown side "${String(side)}"`);
}

function checkRect(
  spec: TraySpec,
  index: number,
  c: CompartmentSpec,
  outerWall: number,
  edge: BottomEdge,
): Rect {
  if (![c.x, c.y].every(Number.isFinite) || !isPositive(c.w) || !isPositive(c.d)) {
    fail(spec, `compartment ${index} has an invalid size or position`);
  }
  if (!(c.floorZ > 0) || !(c.floorZ < spec.h)) {
    fail(spec, `compartment ${index} floor ${c.floorZ} mm is outside 0…${spec.h} mm`);
  }
  const rect: Rect = { x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.d };
  if (
    rect.x0 < outerWall - TOL ||
    rect.y0 < outerWall - TOL ||
    rect.x1 > spec.w - outerWall + TOL ||
    rect.y1 > spec.d - outerWall + TOL
  ) {
    fail(spec, `compartment ${index} cuts into the ${outerWall} mm outer wall`);
  }
  // The 45° chamfer (or the groove) cuts into the wall and floor under the well's bottom corner.
  const wall = Math.min(rect.x0, rect.y0, spec.w - rect.x1, spec.d - rect.y1);
  if (wall + c.floorZ - edge.at(c.floorZ) < MIN_FEATURE_MM - TOL) {
    fail(
      spec,
      `compartment ${index}: ${
        edge.top === edge.reach
          ? `a ${edge.top} mm bottom chamfer`
          : `the bottom groove, ${edge.reach} mm deep at the bed,`
      } leaves less than ${MIN_FEATURE_MM} mm of wall and floor`,
    );
  }
  return rect;
}

// Compartments keep MIN_FEATURE_MM of divider between them (along x or y, so at every height).
function checkSeparated(spec: TraySpec, rects: Rect[]): void {
  rects.forEach((a, i) => {
    rects.forEach((b, j) => {
      if (j > i && !keepsApart(a, b, TOL)) {
        fail(spec, `compartments ${i} and ${j} are less than ${MIN_FEATURE_MM} mm apart`);
      }
    });
  });
}

function planCompartment(
  spec: TraySpec,
  index: number,
  c: CompartmentSpec,
  rect: Rect,
  frame: { w: number; d: number },
  edge: BottomEdge,
): { plan: CompartmentPlan; reliefDiameter: number; cutRequests: CutRequest[] } {
  const scoopRequests: ScoopPlan[] = [];
  const cutRequests: CutRequest[] = [];
  const slotRequests: SlotRequest[] = [];
  let reliefDiameter = 0;
  for (const feature of c.features) {
    if (feature.type === "wallCutout") {
      const { at, width, depth, floorNotch } = feature;
      if (
        ![width, depth].every(isPositive) ||
        !Number.isFinite(at) ||
        !Number.isFinite(floorNotch) ||
        !(floorNotch >= 0)
      ) {
        fail(spec, `compartment ${index} has an invalid wall cutout`);
      }
      cutRequests.push({ side: sideOf(spec, feature.side), at, width, depth, floorNotch });
    } else if (feature.type === "dividerSlot") {
      slotRequests.push({
        axis: feature.axis,
        at: feature.at,
        width: feature.width,
        depth: feature.depth,
      });
    } else if (feature.type === "separatorPlate") {
      // A loose plate in the well, printed on its own (splitDividers): nothing to cut in the tray.
      if (!isPositive(feature.thickness) || !(Number.isFinite(feature.at) && feature.at >= 0)) {
        fail(spec, `compartment ${index} has an invalid separator plate`);
      }
    } else if (feature.type === "scoop") {
      scoopRequests.push({ side: sideOf(spec, feature.side), r: feature.r });
    } else if (feature.type === "cornerRelief") {
      reliefDiameter = Math.max(reliefDiameter, feature.d);
    } else {
      fail(
        spec,
        `a ${feature.type === "topChamfer" ? "top chamfer" : "spacer notch"} in compartment ${index}: it is no compartment feature`,
      );
    }
  }

  // A cut through a wall would leave a scoop's fillet standing free.
  for (const q of cutRequests) {
    if (scoopRequests.some((f) => f.side === q.side)) {
      fail(spec, `compartment ${index} has a wall cutout and a scoop on its ${q.side} side`);
    }
  }

  // Scoop radius: never deeper than the compartment or wider than it is across.
  const scoops: ScoopPlan[] = [];
  for (const s of scoopRequests) {
    const across = s.side === "front" || s.side === "back" ? rect.y1 - rect.y0 : rect.x1 - rect.x0;
    const r = Math.min(s.r, spec.h - c.floorZ, across);
    if (r >= MIN_SCOOP_RADIUS) {
      scoops.push({ side: s.side, r });
    }
  }
  const failWith = (message: string): never => fail(spec, message);
  const slots = slotRequests.map((q) => planSlot(q, index, rect, c.floorZ, frame, edge, failWith));
  checkSlots(slots, index, failWith);
  return {
    plan: { index, rect, floorZ: c.floorZ, cuts: [], slots, scoops, reliefs: [] },
    reliefDiameter,
    cutRequests,
  };
}

// Validates `spec` and computes everything buildTray needs.
// Throws UnsupportedFeatureError for an unknown part, compartment kind or
// feature type (a newer-minor file) and TraySpecError (a RangeError) for a spec that can't be
// built safely (roadmap §4.6): non-positive sizes, a wall or lip under MIN_WALL_MM, a floor
// outside the tray, compartments less than MIN_FEATURE_MM apart or closer to an outer face than
// the (lipped) outer wall, wall cutouts that break their own rules (plan-cuts.ts), and a bottom
// chamfer the tray, its walls, floors or corners cannot take.
export function planTray(spec: TraySpec, settings: Settings): TrayPlan {
  checkKnown(spec);
  if (![spec.w, spec.d, spec.h].every(isPositive)) {
    fail(spec, "outer size must be positive");
  }
  for (const [name, value] of [
    ["bottom chamfer", settings.bottomChamfer],
    ["corner radius", settings.cornerRadius],
  ] as const) {
    if (!Number.isFinite(value)) {
      fail(spec, `${name} ${value} mm is not a number`);
    }
  }
  // Spacers and dividers are always built with the level 0 chamfer. A tray on a riser that carries
  // the lip is built as one above level 0 is: with the groove (`onRiser`, set by splitRisers).
  const level = builtLevel(spec);
  const chamfer = effectiveBottomChamfer(settings, level);
  // With the rim on, a tray above level 0 has a groove along its outer bottom edge instead of the
  // plain chamfer (its foot edge keeps the chamfer, at most as high as the groove's inner wall);
  // with the stepped base it has the step and the slab under it (model/lip.ts stepOf).
  const groove = grooveOf(settings, level);
  const step = stepOf(settings, level);
  const edge = groove ? grooveEdge(groove) : step ? stepEdge(step) : plainEdge(chamfer);
  // The step starts the play under the seam: the slab keeps MIN_FEATURE_MM of side below that.
  if (step !== null && !(step.height - step.play >= MIN_FEATURE_MM - TOL)) {
    fail(
      spec,
      `a ${step.height} mm step leaves less than ${MIN_FEATURE_MM} mm of slab under its ${step.play} mm play`,
    );
  }
  // A part with another stacked on it has, with the stepped base, the socket the slab drops into.
  const socket =
    spec.part === "spacer" || spec.part === "divider" ? null : socketOf(settings, spec.lip);
  if (socket !== null && !(spec.h - socket.depth >= MIN_FEATURE_MM - TOL)) {
    fail(spec, `height ${spec.h} mm leaves no floor under the ${socket.depth} mm socket`);
  }
  const min = bottomMinimums(settings, level);
  // With TOL, like every limit here: 2.27 + 0.8 = 3.0700000000000003 must accept h = 3.07.
  if (Math.min(spec.w, spec.d) < min.side - TOL || spec.h < min.h - TOL) {
    fail(spec, `outer size ${spec.w} × ${spec.d} × ${spec.h} mm is too small`);
  }
  const lip = planLip(spec, settings);
  // A spacer is solid unless its spec says otherwise: a stored spacer is always one solid block, and
  // the printed one may be an open walled box (openSpacers, geometry 0.5.2).
  const solid = spec.solid;
  if (!solid && !(spec.wall >= MIN_WALL_MM - TOL)) {
    fail(spec, `wall ${spec.wall} mm is below ${MIN_WALL_MM} mm`);
  }
  const outerWall = Math.max(
    lip ? Math.max(spec.wall, lip.thickness + settings.lip.ledge) : spec.wall,
    grooveWall(settings, level),
  );

  const specs = solid ? [] : spec.compartments;
  const rects = specs.map((c, i) => checkRect(spec, i, c, outerWall, edge));
  checkSeparated(spec, rects);
  const planned = specs.map((c, i) =>
    planCompartment(spec, i, c, rects[i] ?? fail(spec, "internal: missing rect"), spec, edge),
  );
  const minCut = narrowestCutMm(settings.fingerPocket.width);
  const frame = { w: spec.w, d: spec.d, h: spec.h, chamfer, edge, minCut };
  const failWith = (message: string): never => fail(spec, message);
  const uncut = planned.map((p) => p.plan);
  const plans = planned.map(({ plan, cutRequests }) => ({
    ...plan,
    cuts: cutRequests.map((q) => planCut(q, plan.index, uncut, frame, failWith)),
  }));
  plans.forEach((plan) => {
    checkNotches(plan, failWith);
  });
  checkCutClearance(plans, failWith);
  const compartments = plans.map((plan, i) => ({
    ...plan,
    reliefs: planReliefs(spec, plans, plan, planned[i]?.reliefDiameter ?? 0, edge),
  }));

  const notch = planSpacerNotch(spec, ownFeatures(spec.features), chamfer, failWith);
  const chamfers = planTopChamfers(spec, spec.features ?? [], frame, lip !== null, failWith);
  const edges = notchEdges(spec, notch);
  // A socketed part's corners stay no rounder than its wall beside the socket allows.
  const asked = socket
    ? Math.min(settings.cornerRadius, socketCornerCap(socket))
    : settings.cornerRadius;
  const cornerRadius = planCornerRadius(spec, asked, edge, compartments, edges);
  const thin = thinCorner(spec, cornerRadius, edge, compartments, edges);
  if (thin !== null) {
    fail(
      spec,
      `the ${edge.reach} mm bottom ${groove ? "groove" : step ? "step" : "chamfer"} forces an outer corner radius of ${cornerRadius} mm, and ${thin}`,
    );
  }
  // The slab's foot chamfer, at most what the corner leaves outside the step's inset ring: its
  // rings stay exact offsets of a corner as round as the foot, and inside the step's bottom ring.
  const stepPlan = step
    ? (() => {
        const foot = Math.max(0, Math.min(step.foot, cornerRadius - step.inset));
        return { ...step, foot, reach: step.inset + foot };
      })()
    : null;
  // The socket's corner: as round as the part's, at most the slab's inset (socketOf), less its wall.
  const socketPlan = socket
    ? {
        wall: socket.wall,
        depth: socket.depth,
        radius: Math.max(0, Math.min(cornerRadius, socket.round) - socket.wall),
      }
    : null;

  return {
    w: spec.w,
    d: spec.d,
    h: spec.h,
    topZ: spec.h + (lip ? lip.height : 0),
    chamfer: groove ? groove.foot : stepPlan ? stepPlan.foot : chamfer,
    cornerRadius,
    outerWall,
    lip,
    groove,
    step: stepPlan,
    socket: socketPlan,
    compartments: planTopFillets(compartments, spec, cornerRadius, lip, socketPlan),
    notch: planNotchFillets(notch, spec, cornerRadius),
    chamfers,
  };
}
