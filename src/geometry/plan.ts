import type { CompartmentSpec, Settings, Side, TraySpec } from "../model/types";
import {
  MIN_FEATURE_MM,
  MIN_WALL_MM,
  SLOT_CONTENT_OVERLAP,
  SPEC_TOLERANCE as TOL,
  chamferMinimums,
  effectiveBottomChamfer,
  cutRidgeWidth,
  maxChannelSpacing,
  maxWellFaceOffset,
} from "../model/settings";
import { TraySpecError, UnsupportedFeatureError } from "./errors";
import { planCornerRadius, planReliefs, thinCorner } from "./plan-corners";
import { LIP_CHAMFER, MIN_SCOOP_RADIUS } from "./plan-types";
import type { CompartmentPlan, LipPlan, Rect, ScoopPlan, SlotPlan, TrayPlan } from "./plan-types";
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
  const chamfer = Math.min(LIP_CHAMFER, thickness / 2);
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

function checkSeparated(spec: TraySpec, rects: Rect[]): void {
  rects.forEach((a, i) => {
    rects.forEach((b, j) => {
      if (j <= i) {
        return;
      }
      const gapX = Math.max(b.x0 - a.x1, a.x0 - b.x1);
      const gapY = Math.max(b.y0 - a.y1, a.y0 - b.y1);
      if (gapX < TOL && gapY < TOL) {
        fail(spec, `compartments ${i} and ${j} overlap or touch`);
      }
    });
  });
}

interface Pocket {
  side: Side;
  at: number;
  width: number;
  reach: number;
  depth: number;
}

// Finger pocket (spec §6.1), as geometry reads FeatureSpec "fingerPocket":
// - the compartment rectangle includes a band `reach` deep along `side`;
//   the band stays solid up to the rim except for the slot;
// - the slot is `width` wide, centred on `at` (tray-local x for front/back,
//   y for left/right), runs across the band, and is cut down `depth` below
//   the rim (never below the compartment floor) with a round bottom;
// - along the side it may extend past the compartment through dividers,
//   but never into the outer wall (TraySpecError), and only as far as the
//   finger slot clearance rule allows (checkSlotClearance).
function planSlot(
  spec: TraySpec,
  p: Pocket,
  rect: Rect,
  content: Rect,
  floorZ: number,
  outerWall: number,
): SlotPlan {
  const half = p.width / 2;
  const lo = p.at - half;
  const hi = p.at + half;
  const alongX = p.side === "front" || p.side === "back";
  const limit = alongX ? spec.w : spec.d;
  if (lo < outerWall - TOL || hi > limit - outerWall + TOL) {
    fail(spec, `a finger pocket at ${p.at} mm would cut through the outer wall`);
  }
  const overlap = Math.min(
    SLOT_CONTENT_OVERLAP,
    (alongX ? content.y1 - content.y0 : content.x1 - content.x0) / 2,
  );
  const bottomZ = spec.h - Math.min(p.depth, spec.h - floorZ);
  const common = { side: p.side, bottomZ, radius: half };
  switch (p.side) {
    case "front":
      return { ...common, x0: lo, x1: hi, y0: rect.y0, y1: content.y0 + overlap };
    case "back":
      return { ...common, x0: lo, x1: hi, y0: content.y1 - overlap, y1: rect.y1 };
    case "left":
      return { ...common, x0: rect.x0, x1: content.x0 + overlap, y0: lo, y1: hi };
    case "right":
      return { ...common, x0: content.x1 - overlap, x1: rect.x1, y0: lo, y1: hi };
  }
}

// A finger slot must keep MIN_FEATURE_MM of material against the bottom chamfer, like a
// compartment (checkRect). Measured as distance + height − chamfer, where height is the slot's
// lowest line for the end facing the outer face it cuts through, and for a side end the height
// where the round bottom (radius r) first reaches it: min over the profile is
// bottomZ + (2 − √2)·r (the arc point 45° up from the bottom).
function checkSlotMaterial(
  spec: TraySpec,
  index: number,
  slot: SlotPlan,
  outerLimit: number,
  chamfer: number,
): void {
  const alongX = slot.side === "front" || slot.side === "back";
  const [lo, hi] = alongX ? [slot.x0, slot.x1] : [slot.y0, slot.y1];
  const through = {
    front: slot.y0,
    back: spec.d - slot.y1,
    left: slot.x0,
    right: spec.w - slot.x1,
  }[slot.side];
  const sideHeight = slot.bottomZ + (2 - Math.SQRT2) * slot.radius;
  const material = Math.min(through + slot.bottomZ, lo + sideHeight, outerLimit - hi + sideHeight);
  if (material - chamfer < MIN_FEATURE_MM - TOL) {
    fail(
      spec,
      `compartment ${index}: a finger pocket leaves less than ${MIN_FEATURE_MM} mm of wall and floor against the ${chamfer} mm bottom chamfer`,
    );
  }
}

// How far apart two rectangles are along the axis that separates them most (< 0: they overlap).
// At least MIN_FEATURE_MM along x or y keeps MIN_FEATURE_MM between them at any height.
function separation(a: Rect, b: Rect): number {
  return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
}

function slotCentre(slot: SlotPlan): number {
  return slot.side === "front" || slot.side === "back"
    ? (slot.x0 + slot.x1) / 2
    : (slot.y0 + slot.y1) / 2;
}

// Slots on one band line: same side, band (the extent across it), width and bottom.
function twins(a: SlotPlan, b: SlotPlan): boolean {
  const same = (p: number, q: number): boolean => Math.abs(p - q) <= TOL;
  const alongX = a.side === "front" || a.side === "back";
  return (
    a.side === b.side &&
    same(a.radius, b.radius) &&
    same(a.bottomZ, b.bottomZ) &&
    (alongX ? same(a.y0, b.y0) && same(a.y1, b.y1) : same(a.x0, b.x0) && same(a.x1, b.x1))
  );
}

// Whether `other` (another compartment's contents) reaches into `slot` only within the slot's
// overlap into its own `content`: it lies on the contents side of the reach band and does not stop
// short of the slot's end.
function onlyInOverlap(slot: SlotPlan, content: Rect, other: Rect): boolean {
  switch (slot.side) {
    case "front":
      return other.y0 >= content.y0 - TOL && other.y0 <= slot.y1 + TOL;
    case "back":
      return other.y1 <= content.y1 + TOL && other.y1 >= slot.y0 - TOL;
    case "left":
      return other.x0 >= content.x0 - TOL && other.x0 <= slot.x1 + TOL;
    case "right":
      return other.x1 <= content.x1 + TOL && other.x1 >= slot.x0 - TOL;
  }
}

function opposite(a: Side, b: Side): boolean {
  const pairs: Record<Side, Side> = { front: "back", back: "front", left: "right", right: "left" };
  return pairs[a] === b;
}

interface PlacedSlot {
  plan: CompartmentPlan;
  slot: SlotPlan;
}

// Finger slot clearance (roadmap §4.6). A slot keeps MIN_FEATURE_MM (along x or y) from
// - the contents of every other compartment, unless those reach into it only within its overlap
//   into its own contents (checkWellFaces judges their faces);
// - every other slot, except its twins (one band line: same side, band, width and bottom) and the
//   slot on the opposite side of its own compartment (only the contents lie between them): taken
//   in order along the side, neighbouring twins either keep apart or merge into one channel, their
//   centres at most maxChannelSpacing apart, so the ridge left between their round bottoms is
//   ≥ MIN_FEATURE_MM wide MIN_FEATURE_MM below its top. A twin further along is then either
//   further apart or cut away by the slots between.
function checkSlotClearance(spec: TraySpec, plans: CompartmentPlan[]): void {
  const slots: PlacedSlot[] = plans.flatMap((plan) => plan.slots.map((slot) => ({ plan, slot })));
  const min = MIN_FEATURE_MM - TOL;
  for (const { plan, slot } of slots) {
    const where = `compartment ${plan.index}: a finger pocket comes within ${MIN_FEATURE_MM} mm of`;
    for (const other of plans) {
      if (
        other !== plan &&
        !onlyInOverlap(slot, plan.content, other.content) &&
        separation(slot, other.content) < min
      ) {
        fail(spec, `${where} compartment ${other.index}`);
      }
    }
    for (const t of slots) {
      const across = t.plan === plan && opposite(slot.side, t.slot.side);
      if (t.slot !== slot && !across && !twins(slot, t.slot) && separation(slot, t.slot) < min) {
        fail(spec, `${where} a finger pocket of compartment ${t.plan.index}`);
      }
    }
    const centre = slotCentre(slot);
    const next = slots
      .filter((t) => twins(slot, t.slot) && slotCentre(t.slot) > centre + TOL)
      .sort((a, b) => slotCentre(a.slot) - slotCentre(b.slot))[0];
    if (next !== undefined) {
      const spacing = slotCentre(next.slot) - centre;
      const most = maxChannelSpacing(slot.radius);
      if (spacing > most + TOL && separation(slot, next.slot) < min) {
        fail(
          spec,
          `${where} a finger pocket of compartment ${next.plan.index} without merging into one channel (centres ${spacing.toFixed(2)} mm apart, at most ${most.toFixed(2)} mm)`,
        );
      }
    }
  }
  checkWellFaces(spec, plans, slots);
}

// The well faces a slot meets within its overlap into the contents (its own compartment's and
// those of compartments sharing its band line). Where a round bottom crosses such a face with the
// solid side toward its centre, it leaves a wedge between the two; the wedge is ≥ MIN_FEATURE_MM
// wide MIN_FEATURE_MM below its tip only while the face is at most maxWellFaceOffset from the
// centre. The lowest bottom at the face decides: that of the covering twin whose centre is
// nearest. A centre on the contents' side of the face leaves an obtuse edge, unless the next twin
// toward the solid side merges with that slot: then the face cuts their ridge on its solid side,
// and the half ridge it leaves must be ≥ MIN_FEATURE_MM wide MIN_FEATURE_MM below its peak
// (cutRidgeWidth). A face no slot covers keeps MIN_FEATURE_MM from the end of every slot on its
// solid side.
function checkWellFaces(spec: TraySpec, plans: CompartmentPlan[], slots: PlacedSlot[]): void {
  for (const { plan, slot } of slots) {
    const alongX = slot.side === "front" || slot.side === "back";
    const span = (t: SlotPlan): [number, number] => (alongX ? [t.x0, t.x1] : [t.y0, t.y1]);
    const [lo, hi] = span(slot);
    const line = slots.filter((t) => twins(slot, t.slot));
    for (const other of plans) {
      if (!onlyInOverlap(slot, plan.content, other.content)) {
        continue;
      }
      const c = other.content;
      // Each face, and the direction its solid side lies in.
      for (const [face, solid] of [
        [alongX ? c.x0 : c.y0, -1],
        [alongX ? c.x1 : c.y1, 1],
      ] as const) {
        const covering = line.filter((t) => {
          const [a, b] = span(t.slot);
          return a < face - TOL && b > face + TOL;
        });
        const at = `the well face of compartment ${other.index} at ${face.toFixed(2)} mm`;
        if (covering.length === 0) {
          const end = solid < 0 ? hi : lo;
          const short = solid * (end - face);
          if (short > -TOL && short < MIN_FEATURE_MM - TOL) {
            fail(
              spec,
              `compartment ${plan.index}: a finger pocket ends less than ${MIN_FEATURE_MM} mm short of ${at}`,
            );
          }
          continue;
        }
        // Nearest to the face; on a tie the one on the solid side, whose bottom is lower there.
        const rank = (t: PlacedSlot): number =>
          Math.abs(slotCentre(t.slot) - face) - (solid * (slotCentre(t.slot) - face) > 0 ? TOL : 0);
        const nearest = covering.reduce((best, t) => (rank(t) < rank(best) ? t : best));
        const r = nearest.slot.radius;
        const dx = solid * (slotCentre(nearest.slot) - face);
        const most = maxWellFaceOffset(r);
        if (dx > most + TOL) {
          fail(
            spec,
            `compartment ${nearest.plan.index}: a finger pocket crosses ${at} ${dx.toFixed(2)} mm from its centre (at most ${most.toFixed(2)} mm)`,
          );
        }
        if (dx > 0) {
          continue;
        }
        // The centre lies on the contents' side. If the next slot toward the solid side merges
        // with it, their ridge peaks on the face's solid side, and the face leaves half of it.
        const across = line
          .map((t) => solid * (slotCentre(t.slot) - face))
          .filter((d) => d > TOL && d - dx < 2 * r - TOL);
        if (across.length > 0) {
          const width = cutRidgeWidth(r, -dx, Math.min(...across));
          if (width < MIN_FEATURE_MM - TOL) {
            fail(
              spec,
              `${at} leaves half the ridge between two finger pockets ${width.toFixed(2)} mm wide ${MIN_FEATURE_MM} mm below its peak (at least ${MIN_FEATURE_MM} mm)`,
            );
          }
        }
      }
    }
  }
}

function planCompartment(
  spec: TraySpec,
  index: number,
  c: CompartmentSpec,
  rect: Rect,
  outerWall: number,
): { plan: CompartmentPlan; reliefDiameter: number } {
  const pockets: Pocket[] = [];
  const scoopRequests: ScoopPlan[] = [];
  let reliefDiameter = 0;
  for (const feature of c.features) {
    if (feature.type === "fingerPocket") {
      if (
        ![feature.width, feature.reach, feature.depth].every(isPositive) ||
        !Number.isFinite(feature.at)
      ) {
        fail(spec, `compartment ${index} has an invalid finger pocket`);
      }
      pockets.push({ ...feature, side: sideOf(spec, feature.side) });
    } else if (feature.type === "scoop") {
      scoopRequests.push({ side: sideOf(spec, feature.side), r: feature.r });
    } else {
      reliefDiameter = Math.max(reliefDiameter, feature.d);
    }
  }

  const band = (side: Side): number =>
    Math.max(0, ...pockets.filter((p) => p.side === side).map((p) => p.reach));
  const content: Rect = {
    x0: rect.x0 + band("left"),
    y0: rect.y0 + band("front"),
    x1: rect.x1 - band("right"),
    y1: rect.y1 - band("back"),
  };
  // TOL: TraySpec numbers are on the 0.01 mm grid, but their differences carry float noise
  // (8.29 − 7.29 = 0.9999999999999991), so a value exactly on a limit must pass.
  if (content.x1 - content.x0 < 1 - TOL || content.y1 - content.y0 < 1 - TOL) {
    fail(spec, `compartment ${index}: finger-pocket reach leaves no room for the contents`);
  }

  const slots = pockets.map((p) => planSlot(spec, p, rect, content, c.floorZ, outerWall));
  // Scoop radius: never deeper than the compartment or wider than it is across.
  const scoops: ScoopPlan[] = [];
  for (const s of scoopRequests) {
    const across =
      s.side === "front" || s.side === "back" ? content.y1 - content.y0 : content.x1 - content.x0;
    const r = Math.min(s.r, spec.h - c.floorZ, across);
    if (r >= MIN_SCOOP_RADIUS) {
      scoops.push({ side: s.side, r });
    }
  }
  return {
    plan: { index, rect, content, floorZ: c.floorZ, slots, scoops, reliefs: [] },
    reliefDiameter,
  };
}

// Validates `spec` and computes everything buildTray needs.
// Throws UnsupportedFeatureError for an unknown part, compartment kind or
// feature type (a newer-minor file) and TraySpecError (a RangeError) for a spec that can't be built safely:
// non-positive sizes, a floor outside the tray, compartments that overlap,
// touch, or come closer to an outer face than the (lipped) outer wall,
// finger pockets that would cut through an outer wall, and finger pockets that
// break the finger slot clearance rule.
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
    planCompartment(spec, i, c, rects[i] ?? fail(spec, "internal: missing rect"), outerWall),
  );
  const plans = planned.map((p) => p.plan);
  plans.forEach((plan) =>
    plan.slots.forEach((slot) =>
      checkSlotMaterial(
        spec,
        plan.index,
        slot,
        slot.side === "front" || slot.side === "back" ? spec.w : spec.d,
        chamfer,
      ),
    ),
  );
  checkSlotClearance(spec, plans);
  const compartments = planned.map(({ plan, reliefDiameter }) => ({
    ...plan,
    reliefs: planReliefs(spec, plans, plan, reliefDiameter, chamfer),
  }));

  const cornerRadius = planCornerRadius(spec, settings.cornerRadius, chamfer, compartments);
  const thin = thinCorner(spec, cornerRadius, chamfer, compartments);
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
    compartments,
  };
}
