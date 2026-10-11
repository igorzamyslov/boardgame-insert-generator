import { MIN_FEATURE_MM, MIN_SLOT_WIDTH } from "../model/settings";
import type { CompartmentSpec, FeatureSpec, Settings, Side, TraySpec } from "../model/types";
import {
  CORNER_RELIEF_D,
  MIN_SPACER,
  MIN_SPARE,
  SPACER_TOP_GAP,
  WALL_GROW_LIMIT,
} from "./constants";
import { pocketSides, reachU } from "./common";
import { chamferMinimumsU, minLayoutU, wallFor } from "./outer";
import { SlotFitError } from "./errors";
import { doubled, placeSlots, separation, slotFootprint } from "./slots";
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
  return req.features.map((f): FeatureSpec => {
    if (f.type === "cornerRelief") {
      return { type: "cornerRelief", d: CORNER_RELIEF_D };
    }
    const side = f.side ?? "front";
    if (f.type === "scoop") {
      const r = Math.min(floorU(ctx.settings.scoopRadius), depth, Math.floor(content.w / 2));
      return { type: "scoop", side, r: fromU(r) };
    }
    const slot = ctx.slots.get(side);
    if (slot === undefined) {
      throw new Error(`internal: no finger slot placed on the ${side} side`);
    }
    return {
      type: "fingerPocket",
      side,
      at: fromU(slot.at),
      width: fromU(slot.width),
      reach: fromU(ctx.reach),
      depth: fromU(slot.depth),
    };
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
    const r2 = doubled(r);
    const hit = slots.find((f) => separation(f, r2) < min);
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

function spacerSpec(
  trayKey: string,
  well: Rect,
  length: number,
  floorZ: number,
  depth: number,
): TraySpec {
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
    h: fromU(depth - toU(SPACER_TOP_GAP)),
    rotated: false,
    wall: 0,
    floor: 0,
    lip: false,
    solid: true,
    compartments: [],
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
    [...new Set(stuck.map((req) => req.componentId))],
    contents,
  );
}

export function realizeTray(
  part: TrayPartReq,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): RealizedTray {
  const min = minLayoutU(part, settings, opts);
  // Round an off-grid outer down, so one a hair under minOuter is rejected, not accepted.
  const W = floorU(outer.w);
  const D = floorU(outer.d);
  const H = floorU(outer.h);
  if (W < min.w || D < min.d || H < min.h) {
    throw new RangeError(
      `Tray ${part.trayKey}: outer ${outer.w}×${outer.d}×${outer.h} mm is smaller than its minimum ${fromU(min.w)}×${fromU(min.d)}×${fromU(min.h)} mm`,
    );
  }
  const { wall, divider, floor, rows } = min;
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
  const rowDepths = min.rowDepths.slice();
  let slackY = innerD - sum(rowDepths) - (rows.length - 1) * divider;
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
  let y = wall + (yExtra[0] ?? 0) + Math.floor(slackY / 2);
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
    let slack = innerW - sum(widths) - (row.length - 1) * divider;
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
    if (slack >= spareMin) {
      spareW = slack - divider;
      slack = 0;
    }
    let x = wall + (xExtra[0] ?? 0) + Math.floor(slack / 2);
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
        x += divider + (xExtra[i + 1] ?? 0);
      }
    });
    if (spareW > 0) {
      spares.push([{ x: x + divider, y: rowY, w: spareW, d: rowDepth }, "x"]);
    }
  });
  if (spareRowDepth > 0) {
    spares.push([{ x: wall, y: rowsEnd + divider, w: innerW, d: spareRowDepth }, "y"]);
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

  const spacers: TraySpec[] = [];
  const compartments: CompartmentSpec[] = items.map(
    ({ req, alloc, spacer, well, depth, content, slots }) => {
      const floorZ = H - depth;
      if (spacer > 0) {
        spacers.push(spacerSpec(part.trayKey, well, spacer, floorZ, depth));
      }
      return {
        ...rectSpec(alloc),
        floorZ: fromU(floorZ),
        kind: req.kind,
        contents: req.contents,
        features: featureSpecs(req, content, depth, { reach, settings, slots }),
      };
    },
  );
  for (const [rect, axis] of spares) {
    const clear = clearOfSlots(rect, axis, footprints);
    if (clear === null) {
      continue;
    }
    compartments.push({
      ...rectSpec(clear),
      floorZ: fromU(floor),
      kind: "spare",
      contents: "spare",
      features: [],
    });
  }
  // The base (unlipped) wall, rounded up to 0.01 mm like every other TraySpec length.
  return { wall: fromU(ceilU(wallFor(settings, false))), compartments, spacers };
}
