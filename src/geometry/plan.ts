import type { CompartmentSpec, Settings, Side, TraySpec } from "../model/types";
import {
  MIN_CUT_MM,
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  SPEC_TOLERANCE as TOL,
  chamferMinimums,
  effectiveBottomChamfer,
} from "../model/settings";
import { keepsApart } from "../model/cut-rules";
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
import { LIP_CHAMFER, LIP_FLAT, MIN_SCOOP_RADIUS } from "./plan-types";
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
  if (!spec.lip) {
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
  const chamfer = Math.min(LIP_CHAMFER, thickness - LIP_FLAT);
  if (!Number.isFinite(height) || !(height > chamfer)) {
    fail(spec, `lip height ${height} mm must exceed its ${chamfer} mm chamfer`);
  }
  return { height, thickness, chamfer };
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
  chamfer: number,
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
  // The 45° chamfer cuts into the wall and floor under the well's bottom corner.
  const wall = Math.min(rect.x0, rect.y0, spec.w - rect.x1, spec.d - rect.y1);
  if (wall + c.floorZ - chamfer < MIN_FEATURE_MM - TOL) {
    fail(
      spec,
      `compartment ${index}: a ${chamfer} mm bottom chamfer leaves less than ${MIN_FEATURE_MM} mm of wall and floor`,
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
): { plan: CompartmentPlan; reliefDiameter: number; cutRequests: CutRequest[] } {
  const scoopRequests: ScoopPlan[] = [];
  const cutRequests: CutRequest[] = [];
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
    } else if (feature.type === "scoop") {
      scoopRequests.push({ side: sideOf(spec, feature.side), r: feature.r });
    } else if (feature.type === "cornerRelief") {
      reliefDiameter = Math.max(reliefDiameter, feature.d);
    } else {
      fail(spec, `a spacer notch in compartment ${index}: only a spacer has a notch`);
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
  return {
    plan: { index, rect, floorZ: c.floorZ, cuts: [], scoops, reliefs: [] },
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
  // Spacers are always built with the level 0 chamfer.
  const level = spec.part === "spacer" ? 0 : spec.level;
  const chamfer = effectiveBottomChamfer(settings, level);
  const min = chamferMinimums(settings, level);
  // With TOL, like every limit here: 2.27 + 0.8 = 3.0700000000000003 must accept h = 3.07.
  if (Math.min(spec.w, spec.d) < min.side - TOL || spec.h < min.h - TOL) {
    fail(spec, `outer size ${spec.w} × ${spec.d} × ${spec.h} mm is too small`);
  }
  const lip = planLip(spec, settings);
  const solid = spec.solid || spec.part === "spacer";
  if (!solid && !(spec.wall >= MIN_WALL_MM - TOL)) {
    fail(spec, `wall ${spec.wall} mm is below ${MIN_WALL_MM} mm`);
  }
  const outerWall = lip ? Math.max(spec.wall, lip.thickness + settings.lip.ledge) : spec.wall;

  const specs = solid ? [] : spec.compartments;
  const rects = specs.map((c, i) => checkRect(spec, i, c, outerWall, chamfer));
  checkSeparated(spec, rects);
  const planned = specs.map((c, i) =>
    planCompartment(spec, i, c, rects[i] ?? fail(spec, "internal: missing rect")),
  );
  const minCut = Math.min(MIN_CUT_MM, settings.fingerPocket.width);
  const frame = { w: spec.w, d: spec.d, h: spec.h, chamfer, minCut };
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
    reliefs: planReliefs(spec, plans, plan, planned[i]?.reliefDiameter ?? 0, chamfer),
  }));

  const notch = planSpacerNotch(spec, spec.features ?? [], chamfer, failWith);
  const edges = notchEdges(spec, notch);
  const cornerRadius = planCornerRadius(spec, settings.cornerRadius, chamfer, compartments, edges);
  const thin = thinCorner(spec, cornerRadius, chamfer, compartments, edges);
  if (thin !== null) {
    fail(
      spec,
      `the ${chamfer} mm bottom chamfer forces an outer corner radius of ${cornerRadius} mm, and ${thin}`,
    );
  }

  return {
    w: spec.w,
    d: spec.d,
    h: spec.h,
    topZ: spec.h + (lip ? lip.height : 0),
    chamfer,
    cornerRadius,
    outerWall,
    lip,
    compartments: planTopFillets(compartments, spec, cornerRadius, lip),
    notch: planNotchFillets(notch, spec, cornerRadius),
  };
}
