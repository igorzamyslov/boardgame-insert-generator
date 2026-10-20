import { OPPOSITE } from "../model/cut-rules";
import { MIN_CUT_MM, MIN_FEATURE_MM, effectiveBottomChamfer } from "../model/settings";
import type { RectMm } from "../model/cut-rules";
import type { CompartmentSpec, FeatureSpec, Settings, Side, TraySpec } from "../model/types";
import {
  BIN_FREEBOARD,
  CORNER_RELIEF_D,
  MIN_SPACER,
  MIN_FLAT_FLOOR,
  SCOOP_REACH,
  DIVIDER_GROOVE,
  SPACER_TOP_GAP,
} from "./constants";
import { sectionSpans, slotCentres, slotWidthU } from "./dividers";
import { cutoutSides } from "./common";
import { placeCutouts } from "./cutouts";
import type { CutAsk, CutPlacement, PlacedCut } from "./cutouts";
import { chamferMinimumsU, minLayoutU, requestedWalls, wallFor } from "./outer";
import type { CutWalls, MinLayout } from "./outer";
import { CutFitError } from "./errors";
import { UNBOUNDED_U, columnWide, columnWidthCapU, growthCapU, rowDepthCapU } from "./growth";
import type { CompartmentReq, OuterSize, RealizeOptions, RealizedTray, TrayPartReq } from "./types";
import { ceilU, fillCapped, floorU, fromU, sum, toU } from "./units";

// Everything below is in integer 0.01 mm units until converted with fromU.

interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

interface Placed {
  req: CompartmentReq;
  alloc: Rect; // the CompartmentSpec rectangle, the well (content + clearance)
  spacer: number; // spacer length at the well's +X end, 0 = none
}

/** A compartment's placed wall cutouts by side, along the side: one each, but a sectioned well's. */
type CutsBySide = ReadonlyMap<Side, readonly CutPlacement[]>;

interface FeatureContext {
  settings: Settings;
  cuts: CutsBySide; // this compartment's wall cutouts (placeCutouts)
}

function lastIndex<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && test(item)) {
      return i;
    }
  }
  return -1;
}

/**
 * Content depth: fixed for contents that may not grow in height (the rest is a raised floor, which
 * a riser takes at print time); otherwise as much deeper as its growth setting allows (spec
 * §5), and for bulk up to maxHRatio.
 */
function contentDepth(req: CompartmentReq, well: Rect, H: number, floor: number): number {
  const need = ceilU(req.minH);
  if (!req.elastic.h) {
    return need;
  }
  const grown = need + growthCapU(req, "h");
  const cap =
    req.maxHRatio === undefined ? H - floor : Math.floor(req.maxHRatio * Math.min(well.w, well.d));
  // A bin with a curved floor stops where a hand can still reach the ramp, and takes only a
  // little empty wall above the pile rather than every millimetre going spare — a deeper well
  // would just be a pit with a ramp at the bottom. The height it leaves goes to the tray above,
  // or is reported as unused. Everything else still grows to fill the tray.
  const scooped = req.features.some((f) => f.type === "scoop");
  const reach = scooped
    ? Math.min(toU(SCOOP_REACH), need + toU(BIN_FREEBOARD))
    : Number.POSITIVE_INFINITY;
  return Math.max(need, Math.min(H - floor, cap, reach, grown));
}

const SIDES: readonly Side[] = ["front", "back", "left", "right"];

/**
 * The scoop ramps of a compartment (spec §6.1). A side is chosen once the cuts are placed: a side
 * with a cut is never scooped, and the ramp goes on the longer wall, so it runs across the shorter
 * dimension (front, back, left, right break a tie). The opposite wall gets a second ramp when it
 * is free and the two leave MIN_FLAT_FLOOR of flat floor between them. A radius is never shrunk
 * for it. A request with a `side` is kept as it is.
 */
function scoopSpecs(
  asked: Side | undefined,
  well: Rect,
  depth: number,
  ctx: FeatureContext,
): FeatureSpec[] {
  // The dimension a ramp on `side` runs across (plan.ts clamps its radius by the same).
  const across = (side: Side): number => (side === "front" || side === "back" ? well.d : well.w);
  const full = Math.min(floorU(ctx.settings.scoopRadius), depth);
  // Never more than half the way across, so a ramp leaves a flat floor beside it.
  const spec = (side: Side): FeatureSpec => ({
    type: "scoop",
    side,
    r: fromU(Math.min(full, Math.floor(across(side) / 2))),
  });
  if (asked !== undefined) {
    return [spec(asked)];
  }
  const free = SIDES.filter((s) => !ctx.cuts.has(s)).sort((a, b) => across(a) - across(b));
  const side = free[0];
  if (side === undefined) {
    return [];
  }
  const opposite = OPPOSITE[side];
  const r = Math.min(full, Math.floor(across(side) / 2));
  return free.includes(opposite) && 2 * r + toU(MIN_FLAT_FLOOR) <= across(side)
    ? [spec(side), spec(opposite)]
    : [spec(side)];
}

function featureSpecs(
  req: CompartmentReq,
  well: Rect,
  depth: number,
  ctx: FeatureContext,
): FeatureSpec[] {
  return req.features.flatMap((f): FeatureSpec[] => {
    if (f.type === "cornerRelief") {
      return [{ type: "cornerRelief", d: CORNER_RELIEF_D }];
    }
    if (f.type === "scoop") {
      return scoopSpecs(f.side, well, depth, ctx);
    }
    // Every cut at the first request: no cut where a side faces bits, minis or a custom well, and
    // the other sides' where none of the requested sides got one (placeCutouts).
    if (f !== req.features.find((g) => g.type === "wallCutout")) {
      return [];
    }
    const asked = cutoutSides(req.features);
    const sides = [...asked, ...SIDES.filter((other) => !asked.includes(other))];
    return sides.flatMap((s): FeatureSpec[] =>
      (ctx.cuts.get(s) ?? []).map((cut): FeatureSpec => ({
        type: "wallCutout",
        side: s,
        at: fromU(cut.at),
        width: fromU(cut.width),
        depth: fromU(cut.depth),
        floorNotch: fromU(cut.notch),
      })),
    );
  });
}

/**
 * The notch a spacer standing in `well` needs so the well's finger channel (its left or right wall
 * cutout) runs on through it (spec §6.2): the same centre and bottom, at least the channel's width.
 * In the spacer's frame: along x, centred on the channel's y less the well's, as deep below the
 * spacer's top as the channel is below the rim less SPACER_TOP_GAP. Where its sides would leave
 * less than chamfer + MIN_FEATURE_MM of spacer beside it (the spacer's corner arc, at least the
 * chamfer, ends MIN_FEATURE_MM before its sides), the notch widens to cut the spacer
 * across: a wider U with the same bottom still holds the channel's. None when the channel stays
 * above the spacer. (Its bottom stands at least half the well deep, so above the spacer's chamfer.)
 * A notch past both faces takes the spacer's whole top: the spacer (`height`, units) then ends
 * where the U meets the face farther from its centre, and the notch is that much shallower.
 */
function spacerNotch(
  well: Rect,
  cuts: CutsBySide,
  height: number,
  settings: Settings,
): { features: FeatureSpec[]; height: number } {
  const cut = cuts.get("right")?.[0] ?? cuts.get("left")?.[0];
  const depth = cut === undefined ? 0 : cut.depth - toU(SPACER_TOP_GAP);
  if (cut === undefined || depth < 1) {
    return { features: [], height };
  }
  const at = cut.at - well.y;
  const half = cut.width / 2;
  const keep = ceilU(effectiveBottomChamfer(settings, 0) + MIN_FEATURE_MM);
  const thin = (beside: number): boolean => beside > 0 && beside < keep;
  const width =
    thin(at - half) || thin(well.d - at - half) ? 2 * Math.max(at, well.d - at) : cut.width;
  const r = width / 2;
  const far = Math.max(at, well.d - at);
  const bottom = height - depth;
  const top =
    at - r <= 0 && at + r >= well.d
      ? Math.min(height, Math.floor(bottom + r - Math.sqrt(r * r - far * far)))
      : height;
  const notch: FeatureSpec = {
    type: "spacerNotch",
    axis: "x",
    at: fromU(at),
    width: fromU(width),
    depth: fromU(top - bottom),
  };
  return { features: [notch], height: top };
}

/**
 * The slots in the floor of a divided well (spec §5): one per divider, as wide as a divider's slot
 * and DIVIDER_GROOVE deep, running along y (the well's depth) across the whole well, evenly
 * spaced along its width (slotCentres). In the tray's own frame, like everything here: a turned
 * tray has them turned with it (rotateRealized).
 */
function dividerSlots(req: CompartmentReq, well: Rect, settings: Settings): FeatureSpec[] {
  const count = req.dividers ?? 0;
  if (count <= 0) {
    return [];
  }
  const slot = slotWidthU(settings);
  return slotCentres(well.x, well.w, count, slot).map((at): FeatureSpec => ({
    type: "dividerSlot",
    axis: "y",
    at: fromU(at),
    width: fromU(slot),
    depth: DIVIDER_GROOVE,
  }));
}

function spacerSpec(
  trayKey: string,
  well: Rect,
  length: number,
  floorZ: number,
  notch: { features: FeatureSpec[]; height: number },
): TraySpec {
  const { features, height } = notch;
  return {
    key: `${trayKey}:spacer`,
    part: "spacer",
    path: "",
    stack: 0,
    level: 0,
    x: fromU(well.x + well.w - length),
    y: fromU(well.y),
    z: fromU(floorZ),
    w: fromU(length),
    d: fromU(well.d),
    h: fromU(height),
    rotated: false,
    wall: 0,
    floor: 0,
    lip: false,
    solid: true,
    compartments: [],
    ...(features.length > 0 ? { features } : {}),
  };
}

/**
 * Whether the spare stack length `length` of `req` becomes a spacer: at least MIN_SPACER long and
 * tall (content depth − SPACER_TOP_GAP), and big enough for the spacer's own bottom chamfer.
 */
function spacerFits(req: CompartmentReq, length: number, settings: Settings): boolean {
  const chamfer = chamferMinimumsU(settings, 0);
  const depth = ceilU(req.minD); // the well's depth, which the spacer spans
  const height = ceilU(req.minH) - toU(SPACER_TOP_GAP);
  return (
    length >= Math.max(toU(MIN_SPACER), chamfer.side) &&
    depth >= chamfer.side &&
    height >= Math.max(toU(MIN_SPACER), chamfer.h)
  );
}

function rectSpec(r: Rect): Pick<CompartmentSpec, "x" | "y" | "w" | "d"> {
  return { x: fromU(r.x), y: fromU(r.y), w: fromU(r.w), d: fromU(r.d) };
}

/** A rectangle by its corners. */
function corners(r: Rect): RectMm {
  return { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.d };
}

/** Whether `req` is a divided well whose cuts are placed per section (FeatureReq.perSection). */
function isSectioned(req: CompartmentReq | undefined): boolean {
  return (
    req !== undefined &&
    (req.dividers ?? 0) > 0 &&
    req.features.some((f) => f.type === "wallCutout" && f.perSection === true)
  );
}

/** Whether a cut on `side` runs along y, through the left or right wall. */
function throughEnd(side: Side): boolean {
  return side === "left" || side === "right";
}

/**
 * The sections of `alloc` a divided well's cuts are placed in: one rectangle per deck where the
 * well asks for a cut `perSection` (flat decks sharing one well: the sections are those between
 * its slots), else the well itself. Only the cut placement sees them; the tray has one well.
 */
function sectionsOf(req: CompartmentReq, alloc: Rect, settings: Settings): Rect[] {
  const count = req.dividers ?? 0;
  if (!isSectioned(req)) {
    return [alloc];
  }
  return sectionSpans(alloc.x, alloc.w, count, slotWidthU(settings)).map(([x0, x1]): Rect => ({
    ...alloc,
    x: x0,
    w: x1 - x0,
  }));
}

/**
 * The wall cutouts of every placed compartment (placeCutouts), per compartment and side. A well
 * with `perSection` cuts is placed as its sections, one compartment each (so a cut centres on
 * its section and keeps its posts there, as it would for separate wells), and its cuts come back
 * as the one well's, in order along the side. A section that gets no cut refuses the tray, as a
 * well does.
 */
function wallCutouts(
  items: readonly { req: CompartmentReq; alloc: Rect; spacer: number; depth: number }[],
  frame: {
    trayKey: string;
    W: number;
    D: number;
    H: number;
    min: MinLayout;
    settings: Settings;
  },
): { byOwner: Map<Side, CutPlacement[]>[]; placed: PlacedCut[] } {
  const { W, D, H, min, settings } = frame;
  // The compartments the cuts are placed in, each with the item it belongs to.
  const cells = items.flatMap((item, owner) => {
    const sections = sectionsOf(item.req, item.alloc, settings);
    return sections.map((alloc) => ({
      owner,
      alloc,
      spacer: sections.length > 1 ? 0 : item.spacer,
    }));
  });
  const requests: CutAsk[] = cells.flatMap(({ owner }, cell) => {
    const req = items[owner]?.req;
    return req === undefined
      ? []
      : cutoutSides(req.features).map((side): CutAsk => {
          const asks = req.features.filter((f) => f.type === "wallCutout" && f.side === side);
          return {
            owner: cell,
            side,
            fraction: Math.min(...asks.map((f) => f.depthFraction ?? 1)),
            notch: asks.some((f) => f.floorNotch === true),
          };
        });
  });
  const placedAll = placeCutouts(requests, {
    rects: cells.map((cell) => corners(cell.alloc)),
    spacers: cells.map(({ alloc, spacer }) =>
      spacer > 0
        ? {
            x0: alloc.x + alloc.w - spacer,
            y0: alloc.y,
            x1: alloc.x + alloc.w,
            y1: alloc.y + alloc.d,
          }
        : null,
    ),
    depths: cells.map(({ owner }) => items[owner]?.depth ?? 0),
    span: { x: W, y: D },
    H,
    chamfer: min.chamfer,
    edge: min.edge,
    width: ceilU(settings.fingerPocket.width),
    notch: ceilU(settings.fingerPocket.floorNotch),
  });
  // A section is cut through the front or back wall only: placeCutouts' last retry asks for the
  // left and right of a cell that got neither, and neighbouring sections would chain one channel
  // through every section, which the loose plates between them stop. Such a cut is no cut, so the
  // section counts as uncut and the tray is refused (R21: never a silent side channel).
  const sectioned = cells.map(({ owner }) => isSectioned(items[owner]?.req));
  const placedCells = placedAll.filter((p) => !(sectioned[p.owner] === true && throughEnd(p.side)));
  const uncut = cells.flatMap((cell, c) =>
    requests.some((q) => q.owner === c) && !placedCells.some((p) => p.owner === c) ? [cell] : [],
  );
  if (uncut.length > 0) {
    // Finger access is never left out silently (review 1, I2): a well too small for a cut of
    // MIN_CUT_MM with POST_MM posts on every side refuses the tray.
    const reqs = uncut.flatMap(({ owner }) => items[owner]?.req ?? []);
    const contents = [...new Set(reqs.map((req) => req.contents))];
    const least = Math.min(MIN_CUT_MM, settings.fingerPocket.width);
    throw new CutFitError(
      `Tray ${frame.trayKey}: no wall cutout of at least ${least} mm fits for ${contents.join(", ")}`,
      least,
      [...new Set(reqs.map((req) => req.componentId))],
      contents,
    );
  }
  const placed = placedCells.map((p) => ({ ...p, owner: cells[p.owner]?.owner ?? p.owner }));
  const byOwner = items.map(() => new Map<Side, CutPlacement[]>());
  for (const { owner, side, at, width, depth, notch } of placed) {
    const bySide = byOwner[owner];
    bySide?.set(side, [...(bySide.get(side) ?? []), { at, width, depth, notch }]);
  }
  for (const bySide of byOwner) {
    for (const cuts of bySide.values()) {
      cuts.sort((a, b) => a.at - b.at);
    }
  }
  return { byOwner, placed };
}

/**
 * The walls and dividers the placed cuts pass through (CutWalls), by the rows of `min` (the items
 * are its rows, in order): the end wall or the front or back a cut leaves through (and the dividers
 * between rows it crosses on the way), the divider between twins. Columns the same turned (spec
 * group-tray-fill §3 (b)): a column's front or back end wall, the left or right wall and the
 * dividers between columns crossed on the way.
 */
function cutWallsOf(placed: readonly PlacedCut[], min: MinLayout, columns: boolean): CutWalls {
  const rows = min.rows;
  const one = (): boolean[] => [false];
  const each = (): boolean[] => rows.map(() => false);
  const walls: CutWalls = {
    left: columns ? one() : each(),
    right: columns ? one() : each(),
    front: columns ? each() : one(),
    back: columns ? each() : one(),
    dividers: rows.map((row) => row.map(() => false)),
    rows: rows.slice(1).map(() => false),
  };
  const starts = rows.map((_, r) => sum(rows.slice(0, r).map((row) => row.length)));
  const cross = (from: number, to: number): void => {
    for (let r = from; r < to; r += 1) {
      walls.rows[r] = true;
    }
  };
  // Along a line: its start (left; a column's front) and end (right; back). Across: the sides past
  // the first and the last line (front and back; for columns left and right).
  const [start, end, before, after]: readonly [Side, Side, Side, Side] = columns
    ? ["front", "back", "left", "right"]
    : ["left", "right", "front", "back"];
  for (const cut of placed) {
    const r = starts.filter((s) => s <= cut.owner).length - 1;
    const i = cut.owner - (starts[r] ?? 0);
    const row = walls.dividers[r] ?? [];
    const through = cut.to !== "twin";
    switch (cut.side) {
      case start:
        if (through) {
          walls[start][columns ? r : r] = true;
        } else {
          row[i - 1] = true;
        }
        break;
      case end:
        if (through) {
          walls[end][r] = true;
        }
        // Into its twin, or out through the line's end wall (the last entry has no divider to
        // widen, but requestedWalls sets it the same way, so settleRoom's comparison stays exact).
        row[through ? row.length - 1 : i] = true;
        break;
      case before:
        if (through) {
          walls[before][0] = true;
          cross(0, r);
        } else {
          cross(r - 1, r);
        }
        break;
      case after:
        if (through) {
          walls[after][0] = true;
          cross(r, rows.length - 1);
        } else {
          cross(r, r + 1);
        }
        break;
    }
  }
  return walls;
}

/**
 * The room `caps` (units; 0: cannot grow) take in all when the stack asks `forced` of the tray on
 * top of them: their sum and the forced room, and nothing at all when none of them can grow.
 */
function withForced(caps: readonly number[], forced: number): { total: number } {
  const total = sum(caps);
  return { total: total > 0 ? Math.min(UNBOUNDED_U, total + forced) : 0 };
}

/**
 * Which of an axis's two walls takes the slack under `oneWall` (spec §6, "An escape hatch"):
 * "back" is the far wall (back, right), "front" the near one (front, left). The far wall unless a
 * finger cut goes through it; where only the near wall is free it takes it; where both have a cut
 * there is no wall to deepen, and the slack is split as without `oneWall` (null).
 */
export function oneWallOf(farCut: boolean, nearCut: boolean): "back" | "front" | null {
  if (!farCut) {
    return "back";
  }
  return nearCut ? null : "front";
}

/** What a placement pass is given: the outer, how much the stack forces, the walls to keep clear. */
interface Frame {
  W: number;
  D: number;
  forced: { w: number; d: number };
  cut: CutWalls | null;
}

/**
 * How much slack the walls and dividers may still take (thicker walls, not finger room). Growth
 * caps are maximums, so they round down; minimums (wall, divider, pocket) round up. With `oneWall`
 * the slack goes to one outer wall instead (oneWallOf), so nothing thickens twice.
 */
function wallAbsorbU(settings: Settings): number {
  return settings.oneWall ? 0 : Math.max(0, floorU(settings.wallAbsorb));
}

/**
 * Elastic lines (rows in depth, columns in width) take `slack` as far as their contents may grow
 * (`caps`, growth) beyond what the stack asks of the tray (`forced`): each line's share.
 */
function elasticShares(slack: number, caps: readonly number[], forced: number): number[] {
  return fillCapped(
    Math.min(slack, withForced(caps, forced).total),
    caps.map((cap) => (cap > 0 ? cap + forced : 0)),
  );
}

/**
 * Where the slack left for the outer walls along an axis goes in front of the first line (or the
 * left of the first compartment): half, or with `oneWall` all or none of it (oneWallOf; `far` and
 * `near` say whether a cut goes through the far and the near wall).
 */
function nearShare(slack: number, settings: Settings, far: boolean, near: boolean): number {
  const one = settings.oneWall ? oneWallOf(far, near) : null;
  return one === "back" ? 0 : one === "front" ? slack : Math.floor(slack / 2);
}

/** The rows' wells (strip, rows2), in order. */
function placeRows(min: MinLayout, frame: Frame, settings: Settings): Placed[] {
  const { W, D, forced, cut } = frame;
  const { wall, divider, rows, room } = min;
  const wallAbsorb = wallAbsorbU(settings);
  const dividerAbsorb = wallAbsorb;
  const innerW = W - 2 * wall;
  const innerD = D - 2 * wall;
  const roomFront = room.front[0] ?? 0;
  const roomBack = room.back[0] ?? 0;

  // Y: elastic rows → thicker walls/dividers (wallAbsorb) → the rest to the walls. Never an empty
  // pocket: slack that reaches no component's contents is not growth (spec §4).
  // The finger room of walls that wall cutouts leave through is taken first (minLayoutU).
  const rowDepths = min.rowDepths.slice();
  // Dividers between rows a finger cut passes through are thicker by the divider room too.
  const rowGapAfter = (i: number): number => min.rowGaps[i] ?? divider;
  let slackY = innerD - roomFront - roomBack - sum(rowDepths) - sum(min.rowGaps.slice(0, -1));
  // Elastic rows take it as far as their contents may grow (growth) beyond what the stack asks of
  // the tray, the rest goes on.
  const shares = elasticShares(
    slackY,
    rows.map((row) => rowDepthCapU(row)),
    forced.d,
  );
  rowDepths.forEach((_, r) => {
    rowDepths[r] = (rowDepths[r] ?? 0) + (shares[r] ?? 0);
  });
  slackY -= sum(shares);
  const yExtra = fillCapped(slackY, [
    wallAbsorb,
    ...rows.slice(1).map(() => dividerAbsorb),
    wallAbsorb,
  ]);
  slackY -= sum(yExtra);
  // One wall takes all of it: the back one unless a cut goes through it, else the front.
  const frontY = nearShare(slackY, settings, cut?.back[0] === true, cut?.front[0] === true);
  const rowYs: number[] = [];
  let y = wall + roomFront + (yExtra[0] ?? 0) + frontY;
  rows.forEach((_, i) => {
    rowYs.push(y);
    y += rowDepths[i] ?? 0;
    if (i < rows.length - 1) {
      y += rowGapAfter(i) + (yExtra[i + 1] ?? 0);
    }
  });

  // X, per row: elastic bulk → else one card/tile spacer per tray → thicker walls/dividers
  // (wallAbsorb) → the rest to the side walls.
  const placed: Placed[] = [];
  let spacerUsed = false;
  rows.forEach((row, r) => {
    const rowY = rowYs[r] ?? wall;
    const rowDepth = rowDepths[r] ?? 0;
    const widths = min.widths[r] ?? [];
    const growth = row.map(() => 0);
    const roomLeft = room.left[r] ?? 0;
    const roomRight = room.right[r] ?? 0;
    // Dividers a finger cut passes through are thicker by the divider room (minLayoutU).
    const gaps = min.gaps[r] ?? [];
    const gapAfter = (i: number): number => gaps[i] ?? divider;
    let slack = innerW - roomLeft - roomRight - sum(widths) - sum(gaps.slice(0, -1));
    let spacerAt = -1;
    const elastic = row.flatMap((c, i) => (c.elastic.w && c.spacerAxis !== "w" ? [i] : []));
    if (elastic.length > 0) {
      const shares = elasticShares(
        slack,
        elastic.map((i) => growthCapU(row[i] as CompartmentReq, "w")),
        forced.w,
      );
      elastic.forEach((i, k) => {
        growth[i] = shares[k] ?? 0;
      });
      slack -= sum(shares);
    } else {
      const candidate = lastIndex(row, (c) => c.spacerAxis === "w");
      const req = row[candidate];
      // The spare length of a deck or stack of tiles is the one slack that can be put to use: a
      // spacer (or the `separators` plates) keeps the deck snug and is taken out as the
      // collection grows. However long it is, it never becomes an empty pocket (spec §4).
      // It takes no more than the deck may grow (growth: retention bounds it), the rest going on.
      const cap = req === undefined ? 0 : growthCapU(req, "w");
      const take = Math.min(slack, cap > 0 ? cap + forced.w : 0);
      if (!spacerUsed && req !== undefined && spacerFits(req, take, settings)) {
        growth[candidate] = take;
        spacerAt = candidate;
        spacerUsed = true;
        slack -= take;
      }
    }
    // Wells filling in width (group Max, spec §2) take what would otherwise go to the walls,
    // evenly. The row's width was decided without them, so this is slack the tray already has.
    const filling = row.flatMap((c, i) => (c.fill?.w === true ? [i] : []));
    if (filling.length > 0 && slack > 0) {
      const shares = fillCapped(
        slack,
        filling.map(() => slack),
      );
      filling.forEach((i, k) => {
        growth[i] = (growth[i] ?? 0) + (shares[k] ?? 0);
      });
      slack -= sum(shares);
    }
    const xExtra = fillCapped(slack, [
      wallAbsorb,
      ...row.slice(1).map(() => dividerAbsorb),
      wallAbsorb,
    ]);
    slack -= sum(xExtra);
    // One wall takes all of it: the right one unless a cut goes through it, else the left.
    const leftX = nearShare(slack, settings, cut?.right[r] === true, cut?.left[r] === true);
    let x = wall + roomLeft + (xExtra[0] ?? 0) + leftX;
    row.forEach((req, i) => {
      const w = (widths[i] ?? 0) + (growth[i] ?? 0);
      // A well filling in depth (group Max, spec §2) is as deep as its row from the row's top, as an
      // elastic one is; the row's depth was decided without it.
      const deep = req.elastic.d || req.fill?.d === true;
      const d = deep ? rowDepth : ceilU(req.minD);
      const top = deep ? rowY : rowY + Math.floor((rowDepth - d) / 2);
      placed.push({
        req,
        alloc: { x, y: top, w, d },
        spacer: i === spacerAt ? (growth[i] ?? 0) : 0,
      });
      x += w;
      if (i < row.length - 1) {
        x += gapAfter(i) + (xExtra[i + 1] ?? 0);
      }
    });
  });
  return placed;
}

/**
 * The columns' wells (group-tray-fill spec §3 (b)), column after column from the left, each front to
 * back: the rows' pass with the axes swapped per line, sharing its steps rather than turning the
 * part (its cut and scoop sides and spacer axis would all have to turn and back).
 * X: elastic columns (columnWidthCapU) → columns with a well filling in width, evenly → thicker
 * walls/dividers (wallAbsorb) → the rest to the side walls. A well that grows loose in width or
 * fills it takes its column's width; any other is centred in it, the spare beside it wall.
 * Y, per column: elastic wells → wells filling in depth, evenly → thicker walls/dividers → the
 * rest to the front and back walls. No spacer: a deck's spare width in a column stays wall.
 */
function placeColumns(min: MinLayout, frame: Frame, settings: Settings): Placed[] {
  const { W, D, forced, cut } = frame;
  const { wall, divider, rows: columns, room } = min;
  const wallAbsorb = wallAbsorbU(settings);
  const dividerAbsorb = wallAbsorb;
  const innerW = W - 2 * wall;
  const innerD = D - 2 * wall;
  const roomLeft = room.left[0] ?? 0;
  const roomRight = room.right[0] ?? 0;

  const columnWidths = min.columnWidths.slice();
  const columnGapAfter = (k: number): number => min.rowGaps[k] ?? divider;
  let slackX = innerW - roomLeft - roomRight - sum(columnWidths) - sum(min.rowGaps.slice(0, -1));
  const shares = elasticShares(
    slackX,
    columns.map((column) => columnWidthCapU(column)),
    forced.w,
  );
  slackX -= sum(shares);
  // Columns with a well filling in width (group Max, spec §2) take what would otherwise go to the
  // walls, evenly: slack the tray already has.
  const filling = columns.flatMap((column, k) =>
    column.some((c) => c.fill?.w === true) ? [k] : [],
  );
  const fills =
    filling.length > 0 && slackX > 0
      ? fillCapped(
          slackX,
          filling.map(() => slackX),
        )
      : [];
  slackX -= sum(fills);
  columnWidths.forEach((_, k) => {
    const filled = filling.indexOf(k);
    columnWidths[k] =
      (columnWidths[k] ?? 0) + (shares[k] ?? 0) + (filled < 0 ? 0 : (fills[filled] ?? 0));
  });
  const xExtra = fillCapped(slackX, [
    wallAbsorb,
    ...columns.slice(1).map(() => dividerAbsorb),
    wallAbsorb,
  ]);
  slackX -= sum(xExtra);
  // One wall takes all of it: the right one unless a cut goes through it, else the left.
  const leftX = nearShare(slackX, settings, cut?.right[0] === true, cut?.left[0] === true);
  const columnXs: number[] = [];
  let x = wall + roomLeft + (xExtra[0] ?? 0) + leftX;
  columns.forEach((_, k) => {
    columnXs.push(x);
    x += columnWidths[k] ?? 0;
    if (k < columns.length - 1) {
      x += columnGapAfter(k) + (xExtra[k + 1] ?? 0);
    }
  });

  const placed: Placed[] = [];
  columns.forEach((column, k) => {
    const columnX = columnXs[k] ?? wall;
    const columnWidth = columnWidths[k] ?? 0;
    const depths = min.depths[k] ?? [];
    const growth = column.map(() => 0);
    const roomFront = room.front[k] ?? 0;
    const roomBack = room.back[k] ?? 0;
    // Dividers a finger cut passes through are thicker by the divider room (minLayoutU).
    const gaps = min.gaps[k] ?? [];
    const gapAfter = (i: number): number => gaps[i] ?? divider;
    let slack = innerD - roomFront - roomBack - sum(depths) - sum(gaps.slice(0, -1));
    const elastic = column.flatMap((c, i) => (c.elastic.d ? [i] : []));
    const grown = elasticShares(
      slack,
      elastic.map((i) => growthCapU(column[i] as CompartmentReq, "d")),
      forced.d,
    );
    elastic.forEach((i, j) => {
      growth[i] = grown[j] ?? 0;
    });
    slack -= sum(grown);
    // Wells filling in depth take the column's spare depth, evenly (group Max, spec §2).
    const deep = column.flatMap((c, i) => (c.fill?.d === true ? [i] : []));
    if (deep.length > 0 && slack > 0) {
      const more = fillCapped(
        slack,
        deep.map(() => slack),
      );
      deep.forEach((i, j) => {
        growth[i] = (growth[i] ?? 0) + (more[j] ?? 0);
      });
      slack -= sum(more);
    }
    const yExtra = fillCapped(slack, [
      wallAbsorb,
      ...column.slice(1).map(() => dividerAbsorb),
      wallAbsorb,
    ]);
    slack -= sum(yExtra);
    // One wall takes all of it: the back one unless a cut goes through it, else the front.
    const frontY = nearShare(slack, settings, cut?.back[k] === true, cut?.front[k] === true);
    let y = wall + roomFront + (yExtra[0] ?? 0) + frontY;
    column.forEach((req, i) => {
      const d = (depths[i] ?? 0) + (growth[i] ?? 0);
      const wide = columnWide(req);
      const w = wide ? columnWidth : ceilU(req.minW);
      const left = wide ? columnX : columnX + Math.floor((columnWidth - w) / 2);
      placed.push({ req, alloc: { x: left, y, w, d }, spacer: 0 });
      y += d;
      if (i < column.length - 1) {
        y += gapAfter(i) + (yExtra[i + 1] ?? 0);
      }
    });
  });
  return placed;
}

/**
 * Realizes `part` in an outer of W × D × H units (at least `min`), with the walls and dividers its
 * cuts pass through. Throws CutFitError when a compartment gets no wall cutout.
 */
function layoutAt(
  part: TrayPartReq,
  min: MinLayout,
  [W, D, H]: readonly [number, number, number],
  settings: Settings,
  // How much of the room the stack asks for (opts.stackMin) the contents take beyond their cap.
  forced: { w: number; d: number } = { w: 0, d: 0 },
  // `oneWall` only: the walls a finger cut passes through (or may), which must not take the slack.
  cut: CutWalls | null = null,
): { tray: RealizedTray; walls: CutWalls } {
  const { floor } = min;
  const columns = part.arrangement === "columns";
  const frame: Frame = { W, D, forced, cut };
  const placed = columns ? placeColumns(min, frame, settings) : placeRows(min, frame, settings);

  const sized = placed.map((p) => ({ ...p, depth: contentDepth(p.req, p.alloc, H, floor) }));
  // A well filling in height (group Max, spec §2) goes down to the tray's deepest floor: the least
  // floorZ of the wells that do not fill. Never shallower than its own content depth. The tray's
  // height was decided without it, so this is depth the tray already has.
  const deepest = Math.max(0, ...sized.filter((p) => p.req.fill?.h !== true).map((p) => p.depth));
  const items = sized.map((p) =>
    p.req.fill?.h === true ? { ...p, depth: Math.max(p.depth, deepest) } : p,
  );
  const { byOwner: cuts, placed: cutsPlaced } = wallCutouts(items, {
    trayKey: part.trayKey,
    W,
    D,
    H,
    min,
    settings,
  });

  const spacers: TraySpec[] = [];
  const compartments: CompartmentSpec[] = items.map(({ req, alloc, spacer, depth }, i) => {
    const floorZ = H - depth;
    if (spacer > 0) {
      const height = depth - toU(SPACER_TOP_GAP);
      const notch = spacerNotch(alloc, cuts[i] ?? new Map(), height, settings);
      spacers.push(spacerSpec(part.trayKey, alloc, spacer, floorZ, notch));
    }
    return {
      ...rectSpec(alloc),
      floorZ: fromU(floorZ),
      kind: req.kind,
      contents: req.contents,
      componentId: req.componentId,
      features: [
        ...featureSpecs(req, alloc, depth, { settings, cuts: cuts[i] ?? new Map() }),
        ...dividerSlots(req, alloc, settings),
      ],
    };
  });
  // The base (unlipped) wall, rounded up to 0.01 mm like every other TraySpec length.
  const tray = { wall: fromU(ceilU(wallFor(settings, false))), compartments, spacers };
  return { tray, walls: cutWallsOf(cutsPlaced, min, columns) };
}

const layouts = new WeakMap<TrayPartReq, WeakMap<Settings, Map<string, MinLayout>>>();

/**
 * The part's minimum layout (minLayoutU) with its finger room where its cuts go (settleRoom),
 * memoized per part, settings and options (they are never mutated).
 */
function minLayoutOf(part: TrayPartReq, settings: Settings, opts: RealizeOptions): MinLayout {
  let bySettings = layouts.get(part);
  if (bySettings === undefined) {
    bySettings = new WeakMap();
    layouts.set(part, bySettings);
  }
  let byOpts = bySettings.get(settings);
  if (byOpts === undefined) {
    byOpts = new Map();
    bySettings.set(settings, byOpts);
  }
  const key = `${opts.lipped}|${opts.level}`;
  const cached = byOpts.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const min = settleRoom(part, settings, opts);
  byOpts.set(key, min);
  return min;
}

/** Rounds settleRoom follows the placed cuts before it falls back to their union. */
const ROOM_ROUNDS = 4;

/** Every wall and divider either set names. */
function unionOf(a: CutWalls, b: CutWalls): CutWalls {
  const or = (p: readonly boolean[], q: readonly boolean[]): boolean[] =>
    p.map((v, i) => v || q[i] === true);
  return {
    left: or(a.left, b.left),
    right: or(a.right, b.right),
    front: or(a.front, b.front),
    back: or(a.back, b.back),
    dividers: a.dividers.map((row, r) => or(row, b.dividers[r] ?? [])),
    rows: or(a.rows, b.rows),
  };
}

/**
 * The minimum layout whose finger room lies on the walls and dividers its cuts actually pass
 * through (spec §6.1): first where they are asked for (requestedWalls), then, while they differ,
 * where the layout at that minimum places them. A cut on another side (placeCutouts' later tries)
 * gets the room, a side asked for but left without a cut does not. Where the room moves the cuts
 * back and forth (it can shift a row so that a cut changes side), after ROOM_ROUNDS rounds every
 * wall and divider any of those layouts cut gets it: then a wall may keep room it has no cut in.
 * A part without a cut somewhere keeps the room it has: realizeTray refuses it anyway
 * (CutFitError).
 */
function settleRoom(part: TrayPartReq, settings: Settings, opts: RealizeOptions): MinLayout {
  const roomless = settings.fingerPocket.wallRoom <= 0 && settings.fingerPocket.dividerRoom <= 0;
  let walls = requestedWalls(part);
  let seen: CutWalls | null = null;
  for (let round = 1; ; round += 1) {
    const min = minLayoutU(part, settings, opts, walls);
    if (roomless) {
      return min;
    }
    let placed: CutWalls;
    try {
      placed = layoutAt(part, min, [min.w, min.d, min.h], settings).walls;
    } catch (error) {
      if (error instanceof CutFitError) {
        return min;
      }
      throw error;
    }
    if (JSON.stringify(placed) === JSON.stringify(walls)) {
      return min;
    }
    seen = seen === null ? placed : unionOf(seen, placed);
    if (round >= ROOM_ROUNDS) {
      const all = unionOf(seen, walls);
      return JSON.stringify(all) === JSON.stringify(walls)
        ? min
        : minLayoutU(part, settings, opts, all);
    }
    walls = placed;
  }
}

/** Smallest outer box (tray's own frame, lip excluded) that holds the part (roadmap §4.2). */
export function minOuter(part: TrayPartReq, settings: Settings, opts: RealizeOptions): OuterSize {
  const min = minLayoutOf(part, settings, opts);
  return { w: fromU(min.w), d: fromU(min.d), h: fromU(min.h) };
}

/** The outer walls of a part, in its own frame, that a finger cut passes through. */
export interface OuterCutSides {
  readonly left: boolean;
  readonly right: boolean;
  readonly front: boolean;
  readonly back: boolean;
}

/**
 * Which outer walls the part's wall cutouts pass through, where realizeTray places them at its
 * minimum size (the first row's left wall counts as left, and so on: any row). Cuts are placed
 * from the compartments alone, so this is the same at a larger outer in all but contrived cases;
 * where the cuts cannot be placed (a hand-built part) it falls back to the cuts asked for.
 * The layout uses it to keep fillers off the walls a person reaches through (spec: stack order).
 */
export function outerCutSides(
  part: TrayPartReq,
  settings: Settings,
  opts: RealizeOptions,
): OuterCutSides {
  let walls: CutWalls;
  try {
    const min = minLayoutOf(part, settings, opts);
    walls = layoutAt(part, min, [min.w, min.d, min.h], settings).walls;
  } catch {
    walls = requestedWalls(part);
  }
  return {
    left: walls.left.some(Boolean),
    right: walls.right.some(Boolean),
    front: walls.front.some(Boolean),
    back: walls.back.some(Boolean),
  };
}

/**
 * Realizes `part` in `outer` (roadmap §4.2, §4.7). Throws RangeError when `outer` is smaller than
 * minOuter, and CutFitError (sizing-internal) when a card, tile, minis or custom compartment gets
 * no wall cutout: that depends on the part's compartments and their order only, so size() leaves
 * such variants out, and every part it returns realizes at every outer and option.
 */
export function realizeTray(
  part: TrayPartReq,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): RealizedTray {
  const min = minLayoutOf(part, settings, opts);
  // Round an off-grid outer down, so one a hair under minOuter is rejected, not accepted.
  const W = floorU(outer.w);
  const D = floorU(outer.d);
  const H = floorU(outer.h);
  if (W < min.w || D < min.d || H < min.h) {
    throw new RangeError(
      `Tray ${part.trayKey}: outer ${outer.w}×${outer.d}×${outer.h} mm is smaller than its minimum ${fromU(min.w)}×${fromU(min.d)}×${fromU(min.h)} mm`,
    );
  }
  const forced = {
    w: Math.max(0, ceilU(opts.stackMin?.w ?? 0) - min.w),
    d: Math.max(0, ceilU(opts.stackMin?.d ?? 0) - min.d),
  };
  const first = layoutAt(part, min, [W, D, H], settings, forced);
  if (!settings.oneWall) {
    return first.tray;
  }
  // The walls the cuts go through are only known once they are placed: where the first layout put
  // the slack against one of them, lay it out again with those walls kept clear.
  let avoid = unionOf(requestedWalls(part), first.walls);
  let result = layoutAt(part, min, [W, D, H], settings, forced, avoid);
  for (let round = 0; round < ROOM_ROUNDS; round += 1) {
    const next = unionOf(avoid, result.walls);
    if (JSON.stringify(next) === JSON.stringify(avoid)) {
      break;
    }
    avoid = next;
    result = layoutAt(part, min, [W, D, H], settings, forced, avoid);
  }
  return result.tray;
}
