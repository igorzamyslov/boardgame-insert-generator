import {
  MIN_FEATURE_MM,
  MIN_SLOT_WIDTH,
  SLOT_CONTENT_OVERLAP,
  maxChannelSpacing,
} from "../model/settings";
import { slotsApart, slotsMerge, wellFaceHolds } from "../model/slot-rules";
import type { RectMm } from "../model/slot-rules";
import type { Side } from "../model/types";
import { ceilU, fromU, toU } from "./units";

// Finger slot placement (roadmap §4.6 finger slot clearance, §4.7). Everything is in integer
// 0.01 mm units; slot edges sit on half units when the width is odd, so edges are handled
// doubled ("2·u") here.

export interface RectU {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** One finger slot a compartment asks for on one side. */
export interface SlotRequest {
  owner: number; // index of the compartment in `rects`
  side: Side;
  centre: number; // where the slot wants to be centred along the side (its contents' centre)
  depth: number; // wanted depth below the rim, ≥ 1
}

export interface SlotPlacement {
  at: number;
  width: number;
  depth: number;
}

export interface SlotContext {
  rects: readonly RectU[]; // every compartment rectangle of the tray (spares excluded)
  contents: readonly RectU[]; // the same compartments minus their reach bands (the wells)
  span: { x: number; y: number }; // outer size along x and y
  wall: number; // outer wall: slots stay inside it
  reach: number; // finger-reach band
  width: number; // wanted slot width (the setting, rounded up)
}

/** A rectangle in doubled units. */
export interface Rect2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const MIN2 = 2 * ceilU(MIN_FEATURE_MM);
const OVERLAP = toU(SLOT_CONTENT_OVERLAP);

function alongX(side: Side): boolean {
  return side === "front" || side === "back";
}

/** The rectangle's extent along the side (u) and across it (v), in doubled units. */
function axes(r: RectU, side: Side): { u0: number; u1: number; v0: number; v1: number } {
  return alongX(side)
    ? { u0: 2 * r.x, u1: 2 * (r.x + r.w), v0: 2 * r.y, v1: 2 * (r.y + r.d) }
    : { u0: 2 * r.y, u1: 2 * (r.y + r.d), v0: 2 * r.x, v1: 2 * (r.x + r.w) };
}

/** The band edge a slot starts from (its line), and how far across the band it runs, doubled. */
function across(r: RectU, side: Side, reach: number): { line: number; v0: number; v1: number } {
  const run = 2 * (reach + OVERLAP);
  switch (side) {
    case "front":
      return { line: r.y, v0: 2 * r.y, v1: 2 * r.y + run };
    case "back":
      return { line: r.y + r.d, v0: 2 * (r.y + r.d) - run, v1: 2 * (r.y + r.d) };
    case "left":
      return { line: r.x, v0: 2 * r.x, v1: 2 * r.x + run };
    case "right":
      return { line: r.x + r.w, v0: 2 * (r.x + r.w) - run, v1: 2 * (r.x + r.w) };
  }
}

/** The slot's footprint in tray coordinates, doubled: what planTray cuts (at most). */
export function slotFootprint(rect: RectU, side: Side, slot: SlotPlacement, reach: number): Rect2 {
  const { v0, v1 } = across(rect, side, reach);
  const u0 = 2 * slot.at - slot.width;
  const u1 = 2 * slot.at + slot.width;
  return alongX(side) ? { x0: u0, x1: u1, y0: v0, y1: v1 } : { x0: v0, x1: v1, y0: u0, y1: u1 };
}

export function doubled(r: RectU): Rect2 {
  return { x0: 2 * r.x, y0: 2 * r.y, x1: 2 * (r.x + r.w), y1: 2 * (r.y + r.d) };
}

/** A doubled-unit rectangle in mm, for the shared slot rules (model/slot-rules). */
export function rectMm(r: Rect2): RectMm {
  return { x0: r.x0 / 200, y0: r.y0 / 200, x1: r.x1 / 200, y1: r.y1 / 200 };
}

/** Every slot placed, or the requests of a run that has no room for slots ≥ the minimum width. */
export type SlotOutcome = { placements: SlotPlacement[] } | { stuck: number[] };

/**
 * Places every requested finger slot so that it satisfies the finger slot clearance rule
 * (roadmap §4.6):
 * - Requests on one side whose compartments share the band edge are twins: their slots cut the
 *   same band and may merge into one channel. Every other compartment within MIN_FEATURE_MM of
 *   that band blocks them.
 * - Twins between two blockers form a run. Its slots stay inside the outer walls and reach at most
 *   half way into the gap to a blocker, less MIN_FEATURE_MM / 2, so they keep MIN_FEATURE_MM from
 *   the blocker and from any slot the blocker's own twins reach toward them.
 * - A run's slots share one width, at most the setting. Each is centred on its contents as far as
 *   the run's room allows. Neighbouring slots either keep MIN_FEATURE_MM apart or overlap with
 *   centres at most maxChannelSpacing apart (one channel, every member at the smallest depth of
 *   the channel), and every well face of the run's contents that a slot crosses lies at most
 *   maxWellFaceOffset from the centre of the nearest covering slot, or keeps MIN_FEATURE_MM from
 *   the slots' ends. Otherwise the run's width shrinks, never below min(MIN_SLOT_WIDTH, setting):
 *   a run that cannot keep that is stuck.
 */
export function placeSlots(requests: readonly SlotRequest[], ctx: SlotContext): SlotOutcome {
  const placed: (SlotPlacement | undefined)[] = requests.map(() => undefined);
  const lines = new Map<string, number[]>();
  requests.forEach((q, i) => {
    const key = `${q.side}:${across(rectOf(ctx, q), q.side, ctx.reach).line}`;
    lines.set(key, [...(lines.get(key) ?? []), i]);
  });
  for (const twins of lines.values()) {
    for (const run of runsOf(requests, twins, ctx)) {
      const slots = placeRun(requests, run, ctx);
      if (slots === null) {
        return { stuck: run.members };
      }
      slots.forEach((slot, k) => {
        placed[run.members[k] ?? -1] = slot;
      });
    }
  }
  return {
    placements: placed.map((slot) => {
      if (slot === undefined) {
        throw new Error("internal: unplaced finger slot");
      }
      return slot;
    }),
  };
}

function rectOf(ctx: SlotContext, q: SlotRequest | undefined): RectU {
  const rect = q === undefined ? undefined : ctx.rects[q.owner];
  if (rect === undefined) {
    throw new Error("internal: finger slot without a compartment");
  }
  return rect;
}

interface Run {
  members: number[]; // request indices, in order along the side
  lo2: number; // room for the slots' edges, doubled
  hi2: number;
}

/** Splits the twins of one band line into runs between blockers, each with its room. */
function runsOf(
  requests: readonly SlotRequest[],
  twins: readonly number[],
  ctx: SlotContext,
): Run[] {
  const first = requests[twins[0] ?? -1];
  if (first === undefined) {
    return [];
  }
  const side = first.side;
  const span = (i: number) => axes(rectOf(ctx, requests[i]), side);
  const band = across(rectOf(ctx, first), side, ctx.reach);
  const owners = new Set(twins.map((i) => requests[i]?.owner));
  const blockers = ctx.rects.flatMap((r, owner) => {
    if (owners.has(owner)) {
      return [];
    }
    const a = axes(r, side);
    return Math.max(a.v0 - band.v1, band.v0 - a.v1) < MIN2 ? [a] : [];
  });
  const sorted = [...twins].sort((a, b) => span(a).u0 - span(b).u0);
  const groups: number[][] = [];
  for (const i of sorted) {
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    if (
      group === undefined ||
      last === undefined ||
      blockers.some((b) => b.u0 >= span(last).u1 && b.u1 <= span(i).u0)
    ) {
      groups.push([i]);
    } else {
      group.push(i);
    }
  }
  const end2 = 2 * ((alongX(side) ? ctx.span.x : ctx.span.y) - ctx.wall);
  return groups.map((members) => {
    const start = Math.min(...members.map((i) => span(i).u0));
    const end = Math.max(...members.map((i) => span(i).u1));
    // Half way into the gap to the nearest blocker on each side, less MIN_FEATURE_MM / 2.
    let lo2 = 2 * ctx.wall;
    let hi2 = end2;
    for (const b of blockers) {
      if (b.u1 <= start) {
        lo2 = Math.max(lo2, Math.ceil((b.u1 + start + MIN2) / 2));
      } else if (b.u0 >= end) {
        hi2 = Math.min(hi2, Math.floor((end + b.u0 - MIN2) / 2));
      }
    }
    return { members, lo2, hi2 };
  });
}

interface Face {
  at: number; // doubled
  solid: -1 | 1; // the side its solid material lies on
}

/** A slot move that may fix a pair or a well face: slot k centred on `at`. */
interface Move {
  k: number;
  at: number;
}

/**
 * Whether a well face holds against the slots of width `width` centred on `ats` (wellFaceHolds,
 * the rule planTray checks, with no tolerance).
 */
function faceHolds({ at, solid }: Face, ats: readonly number[], width: number): boolean {
  return wellFaceHolds({ at: at / 200, solid }, ats.map(fromU), fromU(width) / 2, 0);
}

/**
 * The farthest a slot moves to fix a well face, the step the search for that move takes beyond
 * its first SCAN_STEP units, and the step a run narrows by when no move fixes the face (units).
 */
const MAX_MOVE = 500;
const NARROW_STEP = 10;
const SCAN_STEP = 10;

/**
 * The first well face that does not hold, as the smallest move of a nearby slot (toward or away
 * from the face, at most MAX_MOVE) that makes it hold and that `fits`; [] when no such move exists.
 * Null when every face holds.
 */
function faultyFace(
  faces: readonly Face[],
  ats: readonly number[],
  width: number,
  fits: (k: number, at: number) => boolean,
): Move[] | null {
  for (const face of faces) {
    if (faceHolds(face, ats, width)) {
      continue;
    }
    const near = ats.flatMap((a, k) => (Math.abs(2 * a - face.at) <= 3 * width + MIN2 ? [k] : []));
    const moved = ats.slice();
    const holdsAt = (k: number, at: number): boolean => {
      if (!fits(k, at)) {
        return false;
      }
      const a = moved[k] ?? 0;
      moved[k] = at;
      const holds = faceHolds(face, moved, width);
      moved[k] = a;
      return holds;
    };
    // Every shift up to SCAN_STEP, then every SCAN_STEP-th, refined back to the smallest.
    for (let shift = 1; shift <= MAX_MOVE; shift += shift < SCAN_STEP ? 1 : SCAN_STEP) {
      for (const k of near) {
        const a = ats[k] ?? 0;
        for (const direction of [-1, 1]) {
          if (holdsAt(k, a + direction * shift)) {
            let best = shift;
            for (let finer = shift - 1; finer > shift - SCAN_STEP && finer > 0; finer--) {
              if (holdsAt(k, a + direction * finer)) {
                best = finer;
              }
            }
            return [{ k, at: a + direction * best }];
          }
        }
      }
    }
    return [];
  }
  return null;
}

interface Pairs {
  moves: Move[]; // empty when every pair holds, else ways to fix the first one that does not
  narrower: number; // the width that keeps that pair apart without moving it
  root: (k: number) => number; // the channel each slot belongs to
}

/**
 * Neighbouring slots either keep MIN_FEATURE_MM apart or merge into one channel. For the first
 * pair that does neither, the moves that would merge it (centres maxChannelSpacing apart) or keep
 * it apart.
 */
function checkPairs(ats: readonly number[], width: number): Pairs {
  const minGap = ceilU(MIN_FEATURE_MM);
  const order = ats.map((_, k) => k).sort((a, b) => (ats[a] ?? 0) - (ats[b] ?? 0));
  const chain = ats.map((_, k) => k); // union-find over overlapping neighbours
  const root = (k: number): number => {
    let r = k;
    while (chain[r] !== r) {
      r = chain[r] ?? r;
    }
    return r;
  };
  const merge = Math.floor(maxChannelSpacing(fromU(width) / 2) * 100);
  for (let n = 1; n < order.length; n++) {
    const a = order[n - 1] ?? 0;
    const b = order[n] ?? 0;
    const atA = ats[a] ?? 0;
    const atB = ats[b] ?? 0;
    const spacing = atB - atA;
    if (slotsApart(fromU(spacing), fromU(width) / 2, 0)) {
      continue;
    }
    if (slotsMerge(fromU(spacing), fromU(width) / 2, 0)) {
      chain[root(b)] = root(a);
      continue;
    }
    const apart = width + minGap;
    return {
      moves: [
        { k: b, at: atA + merge },
        { k: a, at: atB - merge },
        { k: b, at: atA + apart },
        { k: a, at: atB - apart },
      ],
      narrower: Math.min(width - 1, spacing - minGap),
      root,
    };
  }
  return { moves: [], narrower: width, root };
}

function placeRun(
  requests: readonly SlotRequest[],
  run: Run,
  ctx: SlotContext,
): SlotPlacement[] | null {
  const { members, lo2, hi2 } = run;
  const floor = Math.min(toU(MIN_SLOT_WIDTH), ctx.width);
  const side = requests[members[0] ?? -1]?.side ?? "front";
  const centres = members.map((i) => requests[i]?.centre ?? 0);
  const owners = [...new Set(members.map((i) => requests[i]?.owner ?? -1))];
  const faces: Face[] = owners.flatMap((owner) => {
    const content = ctx.contents[owner];
    if (content === undefined) {
      throw new Error("internal: finger slot without contents");
    }
    const a = axes(content, side);
    return [
      { at: a.u0, solid: -1 },
      { at: a.u1, solid: 1 },
    ];
  });
  let width = Math.min(ctx.width, Math.floor((hi2 - lo2) / 2));
  for (; width >= floor; width--) {
    const least = Math.ceil((lo2 + width) / 2);
    const most = Math.floor((hi2 - width) / 2);
    if (least > most) {
      continue;
    }
    // Each slot centred on its contents as far as the room allows; a well face may move a slot,
    // as long as the slot stays in the room and still covers the centre of its contents.
    const ats = centres.map((c) => Math.min(Math.max(c, least), most));
    const fits = (k: number, at: number): boolean =>
      at >= least && at <= most && 2 * Math.abs(at - (centres[k] ?? 0)) < width;
    // Narrower next time: straight to the width that keeps a failing pair apart, else by
    // NARROW_STEP (at most 0.1 mm narrower than the widest that would do).
    let next = width - NARROW_STEP;
    for (let moves = 0; moves <= 4 * members.length; moves++) {
      const pairs = checkPairs(ats, width);
      const fix = pairs.moves.length > 0 ? pairs.moves : faultyFace(faces, ats, width, fits);
      if (fix === null) {
        const depth = new Map<number, number>();
        members.forEach((i, k) => {
          const r = pairs.root(k);
          depth.set(r, Math.min(depth.get(r) ?? Number.POSITIVE_INFINITY, requests[i]?.depth ?? 1));
        });
        return ats.map((at, k) => ({ at, width, depth: depth.get(pairs.root(k)) ?? 1 }));
      }
      const move = fix.find((m) => m.at !== ats[m.k] && fits(m.k, m.at));
      if (move === undefined) {
        if (pairs.moves.length > 0) {
          next = pairs.narrower;
        }
        break;
      }
      ats[move.k] = move.at;
    }
    width = Math.max(next, floor - 1) + 1; // the loop's decrement lands on it
  }
  return null;
}
