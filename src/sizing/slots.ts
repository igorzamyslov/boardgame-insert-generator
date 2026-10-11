import { MIN_FEATURE_MM, SLOT_CONTENT_OVERLAP, maxChannelSpacing } from "../model/settings";
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

/** How far apart two rectangles are along the axis that separates them most (< 0: overlap). */
export function separation(a: Rect2, b: Rect2): number {
  return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
}

export function doubled(r: RectU): Rect2 {
  return { x0: 2 * r.x, y0: 2 * r.y, x1: 2 * (r.x + r.w), y1: 2 * (r.y + r.d) };
}

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
 *   the channel); otherwise the run's width shrinks until they keep apart.
 */
export function placeSlots(requests: readonly SlotRequest[], ctx: SlotContext): SlotPlacement[] {
  const placed: (SlotPlacement | undefined)[] = requests.map(() => undefined);
  const lines = new Map<string, number[]>();
  requests.forEach((q, i) => {
    const key = `${q.side}:${across(rectOf(ctx, q), q.side, ctx.reach).line}`;
    lines.set(key, [...(lines.get(key) ?? []), i]);
  });
  for (const twins of lines.values()) {
    for (const run of runsOf(requests, twins, ctx)) {
      placeRun(requests, run, ctx).forEach((slot, k) => {
        placed[run.members[k] ?? -1] = slot;
      });
    }
  }
  return placed.map((slot) => {
    if (slot === undefined) {
      throw new RangeError("internal: unplaced finger slot");
    }
    return slot;
  });
}

function rectOf(ctx: SlotContext, q: SlotRequest | undefined): RectU {
  const rect = q === undefined ? undefined : ctx.rects[q.owner];
  if (rect === undefined) {
    throw new RangeError("internal: finger slot without a compartment");
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

/** Whether two slots of width w centred `spacing` apart merge into one channel (units). */
function merges(spacing: number, width: number): boolean {
  return fromU(spacing) <= maxChannelSpacing(fromU(width) / 2);
}

function placeRun(requests: readonly SlotRequest[], run: Run, ctx: SlotContext): SlotPlacement[] {
  const { members, lo2, hi2 } = run;
  const minGap = ceilU(MIN_FEATURE_MM);
  let width = Math.min(ctx.width, Math.floor((hi2 - lo2) / 2));
  for (;;) {
    if (width < 1) {
      throw new RangeError("internal: no room for a finger slot");
    }
    const least = Math.ceil((lo2 + width) / 2);
    const most = Math.floor((hi2 - width) / 2);
    if (least > most) {
      width -= 1;
      continue;
    }
    const ats = members.map((i) => Math.min(Math.max(requests[i]?.centre ?? 0, least), most));
    const order = members.map((_, k) => k).sort((a, b) => (ats[a] ?? 0) - (ats[b] ?? 0));
    let narrower = width;
    const chain = members.map((_, k) => k); // union-find over overlapping neighbours
    const root = (k: number): number => {
      let r = k;
      while (chain[r] !== r) {
        r = chain[r] ?? r;
      }
      return r;
    };
    for (let n = 1; n < order.length; n++) {
      const a = order[n - 1] ?? 0;
      const b = order[n] ?? 0;
      const spacing = (ats[b] ?? 0) - (ats[a] ?? 0);
      if (spacing - width >= minGap) {
        continue;
      }
      if (merges(spacing, width)) {
        chain[root(b)] = root(a);
      } else {
        narrower = Math.min(narrower, width - 1, spacing - minGap);
      }
    }
    if (narrower < width) {
      width = narrower;
      continue;
    }
    const depth = new Map<number, number>();
    members.forEach((i, k) => {
      const r = root(k);
      depth.set(r, Math.min(depth.get(r) ?? Number.POSITIVE_INFINITY, requests[i]?.depth ?? 1));
    });
    return members.map((_, k) => ({
      at: ats[k] ?? 0,
      width,
      depth: depth.get(root(k)) ?? 1,
    }));
  }
}
