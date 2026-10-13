import { MIN_CUT_MM, MIN_FEATURE_MM, effectiveBottomChamfer } from "../model/settings";
import type { RectMm } from "../model/cut-rules";
import type { CompartmentSpec, FeatureSpec, Settings, Side, TraySpec } from "../model/types";
import {
  BIN_FREEBOARD,
  CORNER_RELIEF_D,
  MIN_SPACER,
  MIN_SPARE,
  SCOOP_REACH,
  SPACER_TOP_GAP,
  WALL_GROW_LIMIT,
} from "./constants";
import { cutoutSides } from "./common";
import { placeCutouts } from "./cutouts";
import type { CutAsk, CutPlacement, PlacedCut } from "./cutouts";
import { chamferMinimumsU, minLayoutU, requestedWalls, wallFor } from "./outer";
import type { CutWalls, MinLayout } from "./outer";
import { CutFitError } from "./errors";
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
  alloc: Rect; // the CompartmentSpec rectangle, the well (content + clearance)
  spacer: number; // spacer length at the well's +X end, 0 = none
}

interface FeatureContext {
  settings: Settings;
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

/** Content depth: fixed for non-elastic contents (raised floor); bulk grows up to maxHRatio. */
function contentDepth(req: CompartmentReq, well: Rect, H: number, floor: number): number {
  const need = ceilU(req.minH);
  if (!req.elastic.h) {
    return need;
  }
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
  return Math.max(need, Math.min(H - floor, cap, reach));
}

const SIDES: readonly Side[] = ["front", "back", "left", "right"];

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
      const r = Math.min(floorU(ctx.settings.scoopRadius), depth, Math.floor(well.w / 2));
      return [{ type: "scoop", side: f.side ?? "front", r: fromU(r) }];
    }
    // Every cut at the first request: no cut where a side faces bits, minis or a custom well, and
    // the other sides' where none of the requested sides got one (placeCutouts).
    if (f !== req.features.find((g) => g.type === "wallCutout")) {
      return [];
    }
    const asked = cutoutSides(req.features);
    const sides = [...asked, ...SIDES.filter((other) => !asked.includes(other))];
    return sides.flatMap((s): FeatureSpec[] => {
      const cut = ctx.cuts.get(s);
      return cut === undefined
        ? []
        : [
            {
              type: "wallCutout",
              side: s,
              at: fromU(cut.at),
              width: fromU(cut.width),
              depth: fromU(cut.depth),
              floorNotch: fromU(cut.notch),
            },
          ];
    });
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

/**
 * The wall cutouts of every placed compartment (placeCutouts), per compartment and side. They come
 * after the spares: a cutout may run into a spare.
 */
function wallCutouts(
  items: readonly { req: CompartmentReq; alloc: Rect; spacer: number; depth: number }[],
  spares: readonly Rect[],
  frame: {
    trayKey: string;
    W: number;
    D: number;
    H: number;
    min: MinLayout;
    settings: Settings;
  },
): { byOwner: Map<Side, CutPlacement>[]; placed: PlacedCut[] } {
  const { W, D, H, min, settings } = frame;
  const requests: CutAsk[] = items.flatMap(({ req }, owner) =>
    cutoutSides(req.features).map((side): CutAsk => {
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
    rects: [...items.map((item) => item.alloc), ...spares].map(corners),
    spare: (index) => index >= items.length,
    spacers: items.map(({ alloc, spacer }) =>
      spacer > 0
        ? {
            x0: alloc.x + alloc.w - spacer,
            y0: alloc.y,
            x1: alloc.x + alloc.w,
            y1: alloc.y + alloc.d,
          }
        : null,
    ),
    depths: items.map((item) => item.depth),
    scooped: items.map(({ req }) =>
      req.features.flatMap((f) => (f.type === "scoop" ? [f.side ?? "front"] : [])),
    ),
    span: { x: W, y: D },
    H,
    chamfer: min.chamfer,
    width: ceilU(settings.fingerPocket.width),
    notch: ceilU(settings.fingerPocket.floorNotch),
  });
  const byOwner = items.map(() => new Map<Side, CutPlacement>());
  for (const { owner, side, at, width, depth, notch } of placed) {
    byOwner[owner]?.set(side, { at, width, depth, notch });
  }
  const uncut = items.filter(
    (_, owner) => requests.some((q) => q.owner === owner) && byOwner[owner]?.size === 0,
  );
  if (uncut.length > 0) {
    // Finger access is never left out silently (review 1, I2): a well too small for a cut of
    // MIN_CUT_MM with POST_MM posts on every side refuses the tray.
    const contents = [...new Set(uncut.map(({ req }) => req.contents))];
    const least = Math.min(MIN_CUT_MM, settings.fingerPocket.width);
    throw new CutFitError(
      `Tray ${frame.trayKey}: no wall cutout of at least ${least} mm fits for ${contents.join(", ")}`,
      least,
      [...new Set(uncut.map(({ req }) => req.componentId))],
      contents,
    );
  }
  return { byOwner, placed };
}

/**
 * The walls and dividers the placed cuts pass through (CutWalls), by the rows of `min` (the items
 * are its rows, in order): the end wall or the front or back a cut leaves through or runs into a
 * spare past (and the dividers between rows it crosses on the way), the divider between twins.
 */
function cutWallsOf(placed: readonly PlacedCut[], min: MinLayout): CutWalls {
  const rows = min.rows;
  const walls: CutWalls = {
    left: rows.map(() => false),
    right: rows.map(() => false),
    front: false,
    back: false,
    dividers: rows.map((row) => row.map(() => false)),
    rows: rows.slice(1).map(() => false),
  };
  const starts = rows.map((_, r) => sum(rows.slice(0, r).map((row) => row.length)));
  const cross = (from: number, to: number): void => {
    for (let r = from; r < to; r += 1) {
      walls.rows[r] = true;
    }
  };
  for (const cut of placed) {
    const r = starts.filter((start) => start <= cut.owner).length - 1;
    const i = cut.owner - (starts[r] ?? 0);
    const row = walls.dividers[r] ?? [];
    const through = cut.to !== "twin";
    switch (cut.side) {
      case "left":
        if (through) {
          walls.left[r] = true;
        } else {
          row[i - 1] = true;
        }
        break;
      case "right":
        if (through) {
          walls.right[r] = true;
        }
        // Into its twin, or past the divider before a spare at the row end.
        row[through ? row.length - 1 : i] = true;
        break;
      case "front":
        if (through) {
          walls.front = true;
          cross(0, r);
        } else {
          cross(r - 1, r);
        }
        break;
      case "back":
        if (through) {
          walls.back = true;
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
 * Realizes `part` in an outer of W × D × H units (at least `min`), with the walls and dividers its
 * cuts pass through. Throws CutFitError when a compartment gets no wall cutout.
 */
function layoutAt(
  part: TrayPartReq,
  min: MinLayout,
  [W, D, H]: readonly [number, number, number],
  settings: Settings,
): { tray: RealizedTray; walls: CutWalls } {
  const { wall, divider, floor, rows, room } = min;
  // How much slack a wall or divider may still take (thicker walls, not finger room). Growth caps
  // are maximums, so they round down; minimums (wall, divider, pocket) round up.
  const wallGrow = Math.max(0, floorU(Math.min(2 * settings.wall, WALL_GROW_LIMIT)) - wall);
  const dividerGrow = Math.max(
    0,
    floorU(Math.min(2 * settings.divider, WALL_GROW_LIMIT)) - divider,
  );
  const innerW = W - 2 * wall;
  const innerD = D - 2 * wall;

  // Y: elastic rows → thicker walls/dividers → a spare row at the back → the rest to the walls.
  // The finger room of walls that wall cutouts leave through is taken first (minLayoutU).
  const rowDepths = min.rowDepths.slice();
  // Dividers between rows a finger cut passes through are thicker by the divider room too.
  const rowGapAfter = (i: number): number => min.rowGaps[i] ?? divider;
  const spareRowGap = rowGapAfter(rows.length - 1);
  let slackY = innerD - room.front - room.back - sum(rowDepths) - sum(min.rowGaps.slice(0, -1));
  const elasticRows = rows.flatMap((row, i) => (row.some((c) => c.elastic.d) ? [i] : []));
  if (elasticRows.length > 0) {
    const shares = splitEven(slackY, elasticRows.length);
    elasticRows.forEach((r, i) => {
      rowDepths[r] = (rowDepths[r] ?? 0) + (shares[i] ?? 0);
    });
    slackY = 0;
  }
  const yExtra = fillCapped(slackY, [wallGrow, ...rows.slice(1).map(() => dividerGrow), wallGrow]);
  slackY -= sum(yExtra);
  let spareRowDepth = 0;
  if (slackY >= toU(MIN_SPARE) + spareRowGap) {
    spareRowDepth = slackY - spareRowGap;
    slackY = 0;
  }
  const rowYs: number[] = [];
  let y = wall + room.front + (yExtra[0] ?? 0) + Math.floor(slackY / 2);
  rows.forEach((_, i) => {
    rowYs.push(y);
    y += rowDepths[i] ?? 0;
    if (i < rows.length - 1) {
      y += rowGapAfter(i) + (yExtra[i + 1] ?? 0);
    }
  });
  const rowsEnd = y;

  // X, per row: elastic bulk → else one card/tile spacer per tray → thicker walls/dividers →
  // a spare compartment at the row end → the rest to the side walls.
  const placed: Placed[] = [];
  const spares: Rect[] = [];
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
      // A divider and a spare pocket hold the deck in place by themselves, and are one part
      // fewer to print than a loose spacer block, so they win whenever the spare length is
      // long enough for both. The spacer only earns its place when it isn't: a short pocket
      // would cost a wall and still leave the cards loose. The pocket has to sit at the row's
      // end, next to the deck, or the wall wouldn't be between the two.
      const walled = candidate === row.length - 1 && slack >= toU(MIN_SPARE) + spareGap;
      if (!spacerUsed && req !== undefined && !walled && spacerFits(req, slack, settings)) {
        growth[candidate] = slack;
        spacerAt = candidate;
        spacerUsed = true;
        slack = 0;
      }
    }
    const xExtra = fillCapped(slack, [wallGrow, ...row.slice(1).map(() => dividerGrow), wallGrow]);
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
      spares.push({ x: x + spareGap, y: rowY, w: spareW + roomRight, d: rowDepth });
    }
  });
  if (spareRowDepth > 0) {
    const d = spareRowDepth + room.back;
    spares.push({ x: wall, y: rowsEnd + spareRowGap, w: innerW, d });
  }

  const items = placed.map((p) => ({ ...p, depth: contentDepth(p.req, p.alloc, H, floor) }));
  const { byOwner: cuts, placed: cutsPlaced } = wallCutouts(items, spares, {
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
      features: featureSpecs(req, alloc, depth, { settings, cuts: cuts[i] ?? new Map() }),
    };
  });
  for (const rect of spares) {
    compartments.push({
      ...rectSpec(rect),
      floorZ: fromU(floor),
      kind: "spare",
      contents: "spare",
      features: [],
    });
  }
  // The base (unlipped) wall, rounded up to 0.01 mm like every other TraySpec length.
  const tray = { wall: fromU(ceilU(wallFor(settings, false))), compartments, spacers };
  return { tray, walls: cutWallsOf(cutsPlaced, min) };
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
    front: a.front || b.front,
    back: a.back || b.back,
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
  return layoutAt(part, min, [W, D, H], settings).tray;
}
