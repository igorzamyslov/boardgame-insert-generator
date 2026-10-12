import { MIN_FEATURE_MM, MIN_SLOT_WIDTH, effectiveBottomChamfer } from "../model/settings";
import { keepsApart } from "../model/slot-rules";
import type { CompartmentSpec, FeatureSpec, Settings, Side, TraySpec } from "../model/types";
import {
  CORNER_RELIEF_D,
  MIN_SPACER,
  MIN_SPARE,
  SPACER_TOP_GAP,
  WALL_GROW_LIMIT,
} from "./constants";
import { cutoutSides, pocketSides, reachU } from "./common";
import { placeCutouts } from "./cutouts";
import type { CutPlacement, CutRequest } from "./cutouts";
import { chamferMinimumsU, minLayoutU, wallFor } from "./outer";
import type { MinLayout } from "./outer";
import { SlotFitError } from "./errors";
import { doubled, placeSlots, rectMm, slotFootprint } from "./slots";
import type { Rect2, SlotPlacement, SlotRequest } from "./slots";
import type { CompartmentReq, OuterSize, RealizeOptions, RealizedTray, TrayPartReq } from "./types";
import { ceilU, fillCapped, floorU, fromU, splitEven, sum, toU } from "./units";

// Everything below is in integer 0.01 mm units until converted with fromU.

interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

interface Placed {
  req: CompartmentReq;
  alloc: Rect; // the CompartmentSpec rectangle: well + solid finger-reach bands (roadmap §4.6)
  spacer: number; // spacer length at the well's +X end, 0 = none
}

interface FeatureContext {
  reach: number;
  settings: Settings;
  slots: ReadonlyMap<Side, SlotPlacement>; // this compartment's finger slots (placeSlots)
  cuts: ReadonlyMap<Side, CutPlacement>; // this compartment's wall cutouts (placeCutouts)
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

/** The well proper (contents): the allocation minus the finger-reach band on each pocket side. */
function wellOf(alloc: Rect, req: CompartmentReq, reach: number): Rect {
  const sides = pocketSides(req.features);
  const cut = (side: Side): number => (sides.includes(side) ? reach : 0);
  return {
    x: alloc.x + cut("left"),
    y: alloc.y + cut("front"),
    w: alloc.w - cut("left") - cut("right"),
    d: alloc.d - cut("front") - cut("back"),
  };
}

/** Content depth: fixed for non-elastic contents (raised floor); bulk grows up to maxHRatio. */
function contentDepth(req: CompartmentReq, well: Rect, H: number, floor: number): number {
  const need = ceilU(req.minH);
  if (!req.elastic.h) {
    return need;
  }
  const cap =
    req.maxHRatio === undefined ? H - floor : Math.floor(req.maxHRatio * Math.min(well.w, well.d));
  return Math.max(need, Math.min(H - floor, cap));
}

function featureSpecs(
  req: CompartmentReq,
  content: Rect,
  depth: number,
  ctx: FeatureContext,
): FeatureSpec[] {
  return req.features.flatMap((f): FeatureSpec[] => {
    if (f.type === "cornerRelief") {
      return [{ type: "cornerRelief", d: CORNER_RELIEF_D }];
    }
    const side = f.side ?? "front";
    if (f.type === "scoop") {
      const r = Math.min(floorU(ctx.settings.scoopRadius), depth, Math.floor(content.w / 2));
      return [{ type: "scoop", side, r: fromU(r) }];
    }
    if (f.type === "wallCutout") {
      // No cut where the side faces bits, minis or a custom well (placeCutouts).
      const cut = ctx.cuts.get(side);
      return cut === undefined
        ? []
        : [
            {
              type: "wallCutout",
              side,
              at: fromU(cut.at),
              width: fromU(cut.width),
              depth: fromU(cut.depth),
              floorNotch: fromU(cut.notch),
            },
          ];
    }
    const slot = ctx.slots.get(side);
    if (slot === undefined) {
      throw new Error(`internal: no finger slot placed on the ${side} side`);
    }
    return [
      {
        type: "fingerPocket",
        side,
        at: fromU(slot.at),
        width: fromU(slot.width),
        reach: fromU(ctx.reach),
        depth: fromU(slot.depth),
      },
    ];
  });
}

/** The depth a finger pocket asks for: at least one unit (the geometry rejects zero). */
function pocketDepth(depth: number, depthFraction: number | undefined): number {
  return Math.max(1, Math.round(depth * (depthFraction ?? 1)));
}

/**
 * Moves the start of a spare compartment (along `axis`) until it keeps MIN_FEATURE_MM from every
 * finger slot: spares take only room no slot needs (roadmap §4.7). Null when less than MIN_SPARE
 * is left.
 */
function clearOfSlots(spare: Rect, axis: "x" | "y", slots: readonly Rect2[]): Rect | null {
  const min = 2 * ceilU(MIN_FEATURE_MM);
  let r = spare;
  for (;;) {
    const at = rectMm(doubled(r));
    const hit = slots.find((f) => !keepsApart(rectMm(f), at, 0));
    if (hit === undefined) {
      return r;
    }
    if (axis === "x") {
      const x = Math.ceil((hit.x1 + min) / 2);
      r = { ...r, x, w: r.x + r.w - x };
      if (r.w < toU(MIN_SPARE)) {
        return null;
      }
    } else {
      const y = Math.ceil((hit.y1 + min) / 2);
      r = { ...r, y, d: r.y + r.d - y };
      if (r.d < toU(MIN_SPARE)) {
        return null;
      }
    }
  }
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
  cuts: ReadonlyMap<Side, CutPlacement>,
  height: number,
  settings: Settings,
): { features: FeatureSpec[]; height: number } {
  const cut = cuts.get("right") ?? cuts.get("left");
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
function spacerFits(
  req: CompartmentReq,
  length: number,
  reach: number,
  settings: Settings,
): boolean {
  const chamfer = chamferMinimumsU(settings, 0);
  const bands = pocketSides(req.features).filter((s) => s === "front" || s === "back").length;
  const depth = ceilU(req.minD) - bands * reach; // the well's depth, which the spacer spans
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

interface SlotFrame {
  trayKey: string;
  W: number;
  D: number;
  H: number;
  floor: number;
  wall: number;
  reach: number;
  settings: Settings;
}

/**
 * The finger slots of every placed compartment (placeSlots). A run of slots that cannot keep
 * min(MIN_SLOT_WIDTH, setting) means the tray cannot be realized in this frame (SlotFitError);
 * layout treats that part as infeasible at these options (roadmap §4.7).
 */
function fingerSlots(placed: readonly Placed[], frame: SlotFrame) {
  const { W, D, H, floor, wall, reach, settings } = frame;
  const items = placed.map((p) => {
    const well = wellOf(p.alloc, p.req, reach);
    const depth = contentDepth(p.req, well, H, floor);
    // The slot is centred on the contents, not on the spacer beside them.
    const content: Rect = { ...well, w: well.w - p.spacer };
    return { ...p, well, depth, content, slots: new Map<Side, SlotPlacement>() };
  });
  const requests: SlotRequest[] = items.flatMap(({ req, depth, content }, owner) =>
    pocketSides(req.features).map((side): SlotRequest => {
      const alongX = side === "front" || side === "back";
      const depths = req.features.flatMap((f) =>
        f.type === "fingerPocket" && f.side === side ? [pocketDepth(depth, f.depthFraction)] : [],
      );
      return {
        owner,
        side,
        centre: Math.round(alongX ? content.x + content.w / 2 : content.y + content.d / 2),
        depth: Math.min(...depths),
      };
    }),
  );
  const outcome = placeSlots(requests, {
    rects: items.map((item) => item.alloc),
    contents: items.map((item) => item.well),
    span: { x: W, y: D },
    wall,
    reach,
    width: ceilU(settings.fingerPocket.width),
  });
  if ("placements" in outcome) {
    return { items, requests, placements: outcome.placements };
  }
  const stuck = outcome.stuck.flatMap((k) => {
    const req = items[requests[k]?.owner ?? -1]?.req;
    return req === undefined ? [] : [req];
  });
  const contents = [...new Set(stuck.map((req) => req.contents))];
  const least = fromU(Math.min(toU(MIN_SLOT_WIDTH), ceilU(settings.fingerPocket.width)));
  throw new SlotFitError(
    `Tray ${frame.trayKey}: cannot fit a finger slot of at least ${least} mm for ${contents.join(", ")}`,
    least,
    [...new Set(stuck.map((req) => req.componentId))],
    contents,
  );
}

/**
 * The wall cutouts of every placed compartment (placeCutouts), per compartment and side. They come
 * after the finger slots and the spares: a cutout may run into a spare and keeps clear of slots.
 */
function wallCutouts(
  items: readonly { req: CompartmentReq; alloc: Rect; depth: number }[],
  spares: readonly Rect[],
  slots: readonly Rect2[],
  frame: { W: number; D: number; H: number; min: MinLayout; settings: Settings },
): Map<Side, CutPlacement>[] {
  const { W, D, H, min, settings } = frame;
  const requests: CutRequest[] = items.flatMap(({ req }, owner) =>
    cutoutSides(req.features).map((side): CutRequest => {
      const asks = req.features.filter((f) => f.type === "wallCutout" && f.side === side);
      return {
        owner,
        side,
        fraction: Math.min(...asks.map((f) => f.depthFraction ?? 1)),
        notch: asks.some((f) => f.floorNotch === true),
      };
    }),
  );
  const placed = placeCutouts(requests, {
    rects: [...items.map((item) => item.alloc), ...spares],
    spare: (index) => index >= items.length,
    depths: items.map((item) => item.depth),
    slots,
    span: { x: W, y: D },
    H,
    wall: min.wall,
    chamfer: min.chamfer,
    width: ceilU(settings.fingerPocket.width),
    notch: ceilU(settings.fingerPocket.floorNotch),
  });
  const byOwner = items.map(() => new Map<Side, CutPlacement>());
  requests.forEach((q, k) => {
    const cut = placed[k];
    if (cut) {
      byOwner[q.owner]?.set(q.side, cut);
    }
  });
  return byOwner;
}

/** The tray moved by dx, dy units: compartments, finger slot and cutout centres and spacers. */
function shifted(r: RealizedTray, dx: number, dy: number): RealizedTray {
  const move = <T extends { x: number; y: number }>(item: T): T => ({
    ...item,
    x: fromU(toU(item.x) + dx),
    y: fromU(toU(item.y) + dy),
  });
  const moveFeature = (f: FeatureSpec): FeatureSpec =>
    f.type === "fingerPocket" || f.type === "wallCutout"
      ? { ...f, at: fromU(toU(f.at) + (f.side === "front" || f.side === "back" ? dx : dy)) }
      : f;
  return {
    wall: r.wall,
    compartments: r.compartments.map((c) => ({
      ...move(c),
      features: c.features.map(moveFeature),
    })),
    spacers: r.spacers.map(move),
  };
}

/**
 * Realizes `part` in an outer of W × D × H units (at least `min`). Throws SlotFitError when its
 * finger slots do not fit.
 */
function layoutAt(
  part: TrayPartReq,
  min: MinLayout,
  [W, D, H]: readonly [number, number, number],
  settings: Settings,
): RealizedTray {
  const { wall, divider, floor, rows, room } = min;
  // The band realize reserves is the reach each pocket reports, rounded up to whole units.
  const reach = reachU(settings);
  // Growth caps are maximums, so they round down; minimums (wall, divider, pocket) round up.
  const wallRoom = Math.max(0, floorU(Math.min(2 * settings.wall, WALL_GROW_LIMIT)) - wall);
  const dividerRoom = Math.max(
    0,
    floorU(Math.min(2 * settings.divider, WALL_GROW_LIMIT)) - divider,
  );
  const spareMin = toU(MIN_SPARE) + divider;
  const innerW = W - 2 * wall;
  const innerD = D - 2 * wall;

  // Y: elastic rows → thicker walls/dividers → a spare row at the back → the rest to the walls.
  // The finger room of walls that wall cutouts leave through is taken first (minLayoutU).
  const rowDepths = min.rowDepths.slice();
  let slackY = innerD - room.front - room.back - sum(rowDepths) - (rows.length - 1) * divider;
  const elasticRows = rows.flatMap((row, i) => (row.some((c) => c.elastic.d) ? [i] : []));
  if (elasticRows.length > 0) {
    const shares = splitEven(slackY, elasticRows.length);
    elasticRows.forEach((r, i) => {
      rowDepths[r] = (rowDepths[r] ?? 0) + (shares[i] ?? 0);
    });
    slackY = 0;
  }
  const yExtra = fillCapped(slackY, [wallRoom, ...rows.slice(1).map(() => dividerRoom), wallRoom]);
  slackY -= sum(yExtra);
  let spareRowDepth = 0;
  if (slackY >= spareMin) {
    spareRowDepth = slackY - divider;
    slackY = 0;
  }
  const rowYs: number[] = [];
  let y = wall + room.front + (yExtra[0] ?? 0) + Math.floor(slackY / 2);
  rows.forEach((_, i) => {
    rowYs.push(y);
    y += rowDepths[i] ?? 0;
    if (i < rows.length - 1) {
      y += divider + (yExtra[i + 1] ?? 0);
    }
  });
  const rowsEnd = y;

  // X, per row: elastic bulk → else one card/tile spacer per tray → thicker walls/dividers →
  // a spare compartment at the row end → the rest to the side walls.
  const placed: Placed[] = [];
  const spares: [Rect, "x" | "y"][] = []; // and the axis along which a slot may push its start
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
    const spareGap = gapAfter(row.length - 1);
    let slack = innerW - roomLeft - roomRight - sum(widths) - sum(gaps.slice(0, -1));
    let spacerAt = -1;
    const elastic = row.flatMap((c, i) => (c.elastic.w && c.spacerAxis !== "w" ? [i] : []));
    if (elastic.length > 0) {
      const shares = splitEven(slack, elastic.length);
      elastic.forEach((i, k) => {
        growth[i] = shares[k] ?? 0;
      });
      slack = 0;
    } else {
      const candidate = lastIndex(row, (c) => c.spacerAxis === "w");
      const req = row[candidate];
      if (!spacerUsed && req !== undefined && spacerFits(req, slack, reach, settings)) {
        growth[candidate] = slack;
        spacerAt = candidate;
        spacerUsed = true;
        slack = 0;
      }
    }
    const xExtra = fillCapped(slack, [wallRoom, ...row.slice(1).map(() => dividerRoom), wallRoom]);
    slack -= sum(xExtra);
    let spareW = 0;
    if (slack >= toU(MIN_SPARE) + spareGap) {
      spareW = slack - spareGap;
      slack = 0;
    }
    let x = wall + roomLeft + (xExtra[0] ?? 0) + Math.floor(slack / 2);
    row.forEach((req, i) => {
      const w = (widths[i] ?? 0) + (growth[i] ?? 0);
      const d = req.elastic.d ? rowDepth : ceilU(req.minD);
      const top = req.elastic.d ? rowY : rowY + Math.floor((rowDepth - d) / 2);
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
    // A spare at the row end takes the finger room too: a cutout runs into it instead.
    if (spareW > 0) {
      spares.push([{ x: x + spareGap, y: rowY, w: spareW + roomRight, d: rowDepth }, "x"]);
    }
  });
  if (spareRowDepth > 0) {
    const d = spareRowDepth + room.back;
    spares.push([{ x: wall, y: rowsEnd + divider, w: innerW, d }, "y"]);
  }

  const { items, requests, placements } = fingerSlots(placed, {
    trayKey: part.trayKey,
    W,
    D,
    H,
    floor,
    wall,
    reach,
    settings,
  });
  const footprints: Rect2[] = [];
  requests.forEach((q, k) => {
    const slot = placements[k];
    const item = items[q.owner];
    if (slot === undefined || item === undefined) {
      throw new Error("internal: finger slot without a compartment");
    }
    item.slots.set(q.side, slot);
    footprints.push(slotFootprint(item.alloc, q.side, slot, reach));
  });

  const spareRects = spares.flatMap(([rect, axis]) => {
    const clear = clearOfSlots(rect, axis, footprints);
    return clear === null ? [] : [clear];
  });
  const cuts = wallCutouts(items, spareRects, footprints, { W, D, H, min, settings });

  const spacers: TraySpec[] = [];
  const compartments: CompartmentSpec[] = items.map(
    ({ req, alloc, spacer, well, depth, content, slots }, i) => {
      const floorZ = H - depth;
      if (spacer > 0) {
        const height = depth - toU(SPACER_TOP_GAP);
        const notch = spacerNotch(well, cuts[i] ?? new Map(), height, settings);
        spacers.push(spacerSpec(part.trayKey, well, spacer, floorZ, notch));
      }
      return {
        ...rectSpec(alloc),
        floorZ: fromU(floorZ),
        kind: req.kind,
        contents: req.contents,
        features: featureSpecs(req, content, depth, {
          reach,
          settings,
          slots,
          cuts: cuts[i] ?? new Map(),
        }),
      };
    },
  );
  for (const rect of spareRects) {
    compartments.push({
      ...rectSpec(rect),
      floorZ: fromU(floor),
      kind: "spare",
      contents: "spare",
      features: [],
    });
  }
  // The base (unlipped) wall, rounded up to 0.01 mm like every other TraySpec length.
  return { wall: fromU(ceilU(wallFor(settings, false))), compartments, spacers };
}

/** The footprint (units) at which a part's finger slots fit (slotFootprintU). */
interface SlotFootprint {
  min: MinLayout;
  w: number;
  d: number;
  // Why the slots fit at no footprint up to the cap (then w, d are min's), or null.
  error: SlotFitError | null;
}

const footprints = new WeakMap<TrayPartReq, WeakMap<Settings, Map<string, SlotFootprint>>>();

/** The coarse step of the footprint search (2 mm); the first fit is bisected to 0.01 mm. */
const SEARCH_STEP = 200;

function slotFitAt(
  part: TrayPartReq,
  min: MinLayout,
  [w, d]: readonly [number, number],
  settings: Settings,
): SlotFitError | null {
  try {
    layoutAt(part, min, [w, d, min.h], settings);
    return null;
  } catch (error) {
    if (error instanceof SlotFitError) {
      return error;
    }
    throw error;
  }
}

/**
 * The footprint at which the part's finger slots fit (roadmap §4.2): the minimum layout (walls,
 * dividers, contents, chamfer) as is, or widened along the axes that carry slots (x for front and
 * back pockets, y for left and right) by up to fingerPocket.width. Widening by e tries x alone, y
 * alone, then both. e runs in SEARCH_STEP units up to the cap, and the first fit is bisected,
 * in whole 0.01 mm units, against the last widening that did not fit (on 5544 card strip parts
 * this found the same smallest footprint as trying every 0.01 mm). Slot placement depends on the
 * footprint only, never on the height. Memoized per part, settings and options object (they are
 * never mutated).
 */
function slotFootprintU(
  part: TrayPartReq,
  settings: Settings,
  opts: RealizeOptions,
): SlotFootprint {
  let bySettings = footprints.get(part);
  if (bySettings === undefined) {
    bySettings = new WeakMap();
    footprints.set(part, bySettings);
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
  const min = minLayoutU(part, settings, opts);
  const found = searchFootprint(part, min, settings);
  byOpts.set(key, found);
  return found;
}

function searchFootprint(part: TrayPartReq, min: MinLayout, settings: Settings): SlotFootprint {
  const error = slotFitAt(part, min, [min.w, min.d], settings);
  if (error === null) {
    return { min, w: min.w, d: min.d, error: null };
  }
  const sides = new Set(part.compartments.flatMap((c) => pocketSides(c.features)));
  const alongX = sides.has("front") || sides.has("back");
  const alongY = sides.has("left") || sides.has("right");
  const widened = (e: number): [number, number][] => [
    ...(alongX ? [[min.w + e, min.d] as [number, number]] : []),
    ...(alongY ? [[min.w, min.d + e] as [number, number]] : []),
    ...(alongX && alongY ? [[min.w + e, min.d + e] as [number, number]] : []),
  ];
  const fits = (e: number): [number, number] | undefined =>
    widened(e).find((size) => slotFitAt(part, min, size, settings) === null);
  const cap = ceilU(settings.fingerPocket.width);
  let failed = 0; // the largest widening known not to fit
  for (let coarse = SEARCH_STEP; coarse < cap + SEARCH_STEP; coarse += SEARCH_STEP) {
    const e = Math.min(coarse, cap);
    let size = fits(e);
    if (size !== undefined) {
      // Bisect down to the smallest widening that fits between the last miss and this fit.
      let hi = e;
      while (hi - failed > 1) {
        const mid = Math.floor((failed + hi) / 2);
        const at = fits(mid);
        if (at === undefined) {
          failed = mid;
        } else {
          hi = mid;
          size = at;
        }
      }
      return { min, w: size[0], d: size[1], error: null };
    }
    failed = e;
  }
  return { min, w: min.w, d: min.d, error };
}

/**
 * Smallest outer box (tray's own frame, lip excluded) that holds the part with its finger slots
 * (roadmap §4.2): minLayoutU's minimum, wider where the slots need it (slotFootprintU).
 */
export function minOuter(part: TrayPartReq, settings: Settings, opts: RealizeOptions): OuterSize {
  const fp = slotFootprintU(part, settings, opts);
  return { w: fromU(fp.w), d: fromU(fp.d), h: fromU(fp.min.h) };
}

/**
 * Realizes `part` in `outer` (roadmap §4.2, §4.7). Throws RangeError when `outer` is smaller than
 * minOuter, and SlotFitError when the finger slots fit at no footprint the search tries
 * (slotFootprintU). Realizable at minOuter ⇔ realizable at all: minOuter is the footprint the
 * search found, and where the slack of a larger outer would leave the slots no room (a wider row
 * moving a slot against a well face, say), the tray keeps its minOuter arrangement, centred, and
 * the slack thickens the outer walls instead.
 */
export function realizeTray(
  part: TrayPartReq,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): RealizedTray {
  const fp = slotFootprintU(part, settings, opts);
  const { min } = fp;
  // Realizable at minOuter ⇔ realizable at all: a part whose slots fit nowhere is refused at
  // every outer, also where a larger outer happens to fit them.
  if (fp.error !== null) {
    throw fp.error;
  }
  // Round an off-grid outer down, so one a hair under minOuter is rejected, not accepted.
  const W = floorU(outer.w);
  const D = floorU(outer.d);
  const H = floorU(outer.h);
  if (W < fp.w || D < fp.d || H < min.h) {
    throw new RangeError(
      `Tray ${part.trayKey}: outer ${outer.w}×${outer.d}×${outer.h} mm is smaller than its minimum ${fromU(fp.w)}×${fromU(fp.d)}×${fromU(min.h)} mm`,
    );
  }
  try {
    return layoutAt(part, min, [W, D, H], settings);
  } catch (error) {
    if (!(error instanceof SlotFitError) || (W === fp.w && D === fp.d)) {
      throw error;
    }
  }
  const centred = layoutAt(part, min, [fp.w, fp.d, H], settings);
  return shifted(centred, Math.floor((W - fp.w) / 2), Math.floor((D - fp.d) / 2));
}
