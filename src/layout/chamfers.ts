// src/layout/chamfers.ts
import { OPPOSITE } from "../model/cut-rules";
import {
  CHAMFER_MIN_CONTACT_MM,
  CHAMFER_MIN_GRIP_MM,
  CHAMFER_MM,
  CHAMFER_PINCH_MAX_MM,
  chamferSize,
  edgeTopOf,
  ownFeatures,
  topChamfersOf,
  type TopChamfer,
} from "../model/top-chamfer";
import { builtLevel } from "../model/lip";
import { effective } from "../model/settings";
import type { Settings, Side, TraySpec } from "../model/types";
import { compareCodeUnits } from "../util/compare";
import { roundMm } from "./units";

/** What addTopChamfers reads from a project. */
export interface ChamferInputs {
  settings: Settings;
}

/** Tolerance when two faces count as touching or two boxes as apart, mm (the grid is 0.01). */
const EPS = 0.015;

/** An axis-aligned box in box coordinates, mm. */
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

const boxOf = (t: Pick<TraySpec, "x" | "y" | "z" | "w" | "d" | "h">): Box => ({
  x0: t.x,
  x1: t.x + t.w,
  y0: t.y,
  y1: t.y + t.d,
  z0: t.z,
  z1: t.z + t.h,
});

const SIDES: readonly Side[] = ["front", "back", "left", "right"];

const alongX = (side: Side): boolean => side === "front" || side === "back";

/** A box's extent along a side (x for the front and back faces, y for the others). */
const spanOf = (b: Box, side: Side): [number, number] =>
  alongX(side) ? [b.x0, b.x1] : [b.y0, b.y1];

/** The gap from `part`'s face on `side` to `other`'s face across from it (< 0: they overlap). */
function faceGap(part: Box, other: Box, side: Side): number {
  switch (side) {
    case "front":
      return part.y0 - other.y1;
    case "back":
      return other.y0 - part.y1;
    case "left":
      return part.x0 - other.x1;
    case "right":
      return other.x0 - part.x1;
  }
}

/** Whether two boxes share volume (touching faces do not count). */
const overlaps = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 - EPS &&
  b.x0 < a.x1 - EPS &&
  a.y0 < b.y1 - EPS &&
  b.y0 < a.y1 - EPS &&
  a.z0 < b.z1 - EPS &&
  b.z0 < a.z1 - EPS;

/** A stretch along a face, in box coordinates. */
type Run = [number, number];

/** How much of a tray's side the groove reaches: its wall inside a chamfer `size` deep. */
function grip(tray: Box, top: number, size: number): number {
  return Math.min(tray.z1, top) - Math.max(tray.z0, top - size);
}

/** How much of the face `side` of `part` the side of `tray` shares, mm. */
function sharedLength(part: Box, tray: Box, side: Side): number {
  const [p0, p1] = spanOf(part, side);
  const [t0, t1] = spanOf(tray, side);
  return Math.min(p1, t1) - Math.max(p0, t0);
}

/** A part that can carry chamfers: a solid filler, plain or a member of a merged part. */
interface Candidate {
  /** The printed part (the merged part, for a member). */
  owner: TraySpec;
  /** The spec the chamfers go on: the owner, or one of its members. */
  part: TraySpec;
  box: Box;
  /** What a chamfer must stay clear of: the bridges and the other members of a merged part. */
  obstacles: Box[];
  level: number;
}

function candidatesOf(trays: readonly TraySpec[]): Candidate[] {
  const out: Candidate[] = [];
  for (const t of trays) {
    if (t.merged !== undefined) {
      // Upside down on the bed, the top a chamfer is cut on would be the bed face.
      if (t.merged.flipped) {
        continue;
      }
      for (const m of t.merged.members) {
        if (m.part === "leftover" && m.solid) {
          out.push({
            owner: t,
            part: m,
            box: boxOf(m),
            obstacles: [
              ...t.merged.bridges.map((b) => boxOf(b)),
              ...t.merged.members.filter((o) => o !== m).map((o) => boxOf(o)),
            ],
            level: builtLevel(m),
          });
        }
      }
    } else if (t.part === "leftover" && t.solid) {
      out.push({ owner: t, part: t, box: boxOf(t), obstacles: [], level: builtLevel(t) });
    }
  }
  return out;
}

/** The trays against the face `side` of `part`, over at least CHAMFER_MIN_CONTACT_MM of it. */
function traysOn(part: Box, side: Side, trays: readonly Box[], gap: number): Box[] {
  const [p0, p1] = spanOf(part, side);
  return trays.filter((tray) => {
    const apart = faceGap(part, tray, side);
    if (apart < -EPS || apart > gap + EPS) {
      return false;
    }
    const [t0, t1] = spanOf(tray, side);
    return Math.min(p1, t1) - Math.max(p0, t0) >= CHAMFER_MIN_CONTACT_MM - EPS;
  });
}

/** A run less the stretch `cut` of it. */
function without(run: Run, cut: Run): Run[] {
  const out: Run[] = [];
  if (cut[1] <= run[0] || cut[0] >= run[1]) {
    return [run];
  }
  if (cut[0] > run[0]) {
    out.push([run[0], cut[0]]);
  }
  if (cut[1] < run[1]) {
    out.push([cut[1], run[1]]);
  }
  return out;
}

/**
 * What of a chamfer along `run` on `side` of `c` a bridge or another member of a merged part
 * would fill: the band the chamfer cuts, from a tray gap outside the face to its size inside it,
 * takes none of it. The runs left, those still CHAMFER_MIN_CONTACT_MM long.
 */
function clearOf(c: Candidate, side: Side, size: number, gap: number, runs: Run[]): Run[] {
  const { box } = c;
  const band: Box = {
    ...box,
    z0: box.z1 - size,
    ...{
      front: { y0: box.y0 - gap, y1: box.y0 + size },
      back: { y0: box.y1 - size, y1: box.y1 + gap },
      left: { x0: box.x0 - gap, x1: box.x0 + size },
      right: { x0: box.x1 - size, x1: box.x1 + gap },
    }[side],
  };
  const blocked = c.obstacles.filter((o) => overlaps(band, o)).map((o) => spanOf(o, side));
  return runs
    .flatMap((run) => blocked.reduce<Run[]>((left, b) => left.flatMap((r) => without(r, b)), [run]))
    .filter(([lo, hi]) => hi - lo >= CHAMFER_MIN_CONTACT_MM - EPS);
}

/** The chamfers of one candidate, as part-local features. */
function chamfersOfCandidate(
  c: Candidate,
  trays: readonly Box[],
  settings: Settings,
  gap: number,
  cap: number,
): TopChamfer[] {
  const { box, part } = c;
  const top = box.z1;
  const edgeTop = edgeTopOf(settings, c.level);
  const beside = new Map<Side, Box[]>(SIDES.map((s) => [s, traysOn(box, s, trays, gap)]));
  const out: TopChamfer[] = [];
  for (const pair of [
    ["front", "back"],
    ["left", "right"],
  ] as const) {
    const across = alongX(pair[0]) ? part.d : part.w;
    const own = pair.filter((s) => (beside.get(s) ?? []).length > 0);
    // A strip a finger and thumb can pinch is chamfered along both long edges when one has a tray
    // beside it (and two chamfers are a grip): the far edge is chamfered like the near one.
    const pinch =
      own.length === 1 &&
      across < CHAMFER_PINCH_MAX_MM &&
      chamferSize(across, part.h, edgeTop, 2) > 0;
    // The sides that stay chamfered: a tray the groove would not reach drops out, which can leave
    // fewer faces, so a larger chamfer, until the set stops changing.
    let active: readonly Side[] = pinch ? pair : own;
    let size = 0;
    let runs = new Map<Side, Run[]>();
    // Whether a tray against the face stands in the groove at all: the face is chamfered. Whether
    // its wall is deep enough to grip is the lift guide's question (`traysOpenedBy`), not this one:
    // a spacer a little taller than the stack beside it is chamfered like its neighbours.
    const reached = (s: Side, depth: number): boolean =>
      (beside.get(s) ?? []).some((t) => grip(t, top, depth) > EPS);
    for (let round = 0; round < 4 && active.length > 0; round += 1) {
      size = chamferSize(across, part.h, edgeTop, active.length === 2 ? 2 : 1, cap);
      if (size === 0 && active.length === 2) {
        // Two chamfers would be under a grip: take the longer face, with all its room.
        const length = (s: Side): number =>
          (beside.get(s) ?? [])
            .filter((t) => grip(t, top, CHAMFER_MM) >= CHAMFER_MIN_GRIP_MM - EPS)
            .reduce((a, t) => a + sharedLength(box, t, s), 0);
        const best = length(pair[0]) >= length(pair[1]) ? pair[0] : pair[1];
        active = [best];
        size = chamferSize(across, part.h, edgeTop, 1, cap);
      }
      runs = new Map(
        active.map((s) => {
          const whole = reached(s, size) || (pinch && reached(OPPOSITE[s], size));
          // The face's whole top edge, end to end, less what a bridge or member would fill.
          return [s, whole ? clearOf(c, s, size, gap, [spanOf(box, s)]) : []];
        }),
      );
      const next = active.filter((s) => (runs.get(s) ?? []).length > 0);
      if (size === 0 || next.length === active.length) {
        if (size === 0) {
          active = [];
        }
        break;
      }
      active = next;
    }
    for (const side of active) {
      const origin = alongX(side) ? box.x0 : box.y0;
      for (const [lo, hi] of runs.get(side) ?? []) {
        out.push({
          type: "topChamfer",
          side,
          from: roundMm(lo - origin),
          to: roundMm(hi - origin),
          size,
        });
      }
    }
  }
  return out;
}

/**
 * The top chamfers of a printed layout (geometry 0.9.8, DESIGN §7 "lifting trays"), last pass
 * after the merge. Trays tile the box a tray gap apart, so nothing on a tray's outside can be
 * gripped and a filler wedged beside it has no grip either: each solid filler (plain, or a member
 * of a merged part) gets a 45° chamfer along its top edge on every face a tray stands against, so
 * a fingertip reaches down the tray's wall into the V the two make.
 *
 * - **Where.** The whole top edge of a face, end to end, when a tray's side stands a tray gap from
 *   it over at least CHAMFER_MIN_CONTACT_MM (geometry 0.9.10, owner 2026-10-24: "if spacer has any
 *   component on one of its sides, the edge of this side should be chamfered"; before it, only
 *   the stretch the tray shared, which left square steps between and beyond trays). A face no tray
 *   stands against stays square. Two chamfered faces that meet make a mitre. Not where a bridge or
 *   another member of a merged part would fill it: a member's chamfer runs the whole member, less
 *   that.
 * - **How large.** CHAMFER_MM, less on a strip (two chamfers on a strip's two long edges leave
 *   CHAMFER_LAND_MM of top; where each would be under CHAMFER_MIN_MM only the longer face gets
 *   one) and on a filler low over the groove or step at its foot (`chamferSize`). A tray whose
 *   wall reaches under CHAMFER_MIN_GRIP_MM into the groove is not served.
 * - **Not on:** a riser (a tray stands on it), a card spacer, an open spare tray (its pocket is
 *   a grip, and lifting it out frees the tray beside it), a merged part printed upside down (the
 *   top is the bed face), anything that is not a filler.
 *
 * Derived, never stored: the chamfers are on the printed parts' `features` (a merged part's on
 * its members), and the stored layout, its hash and a share link are the same with or without
 * them. Other parts are returned as they are.
 */
export function addTopChamfers(trays: readonly TraySpec[], o: ChamferInputs): TraySpec[] {
  const { settings } = o;
  const gap = effective(settings).trayGap;
  const targets = trays.filter((t) => t.part === "tray").map((t) => boxOf(t));
  const candidates = candidatesOf(trays);
  const place = (cap: number): Map<TraySpec, TopChamfer[]> => {
    const out = new Map<TraySpec, TopChamfer[]>();
    for (const c of candidates) {
      const found = chamfersOfCandidate(c, targets, settings, gap, cap);
      if (found.length > 0) {
        out.set(c.part, found);
      }
    }
    return out;
  };
  // Every chamfer of a layout is the same size, the smallest any spacer can take, so no spacer
  // looks cut differently from the one beside it.
  let placed = place(CHAMFER_MM);
  const smallest = Math.min(CHAMFER_MM, ...[...placed.values()].flat().map((c) => c.size));
  if (smallest < CHAMFER_MM) {
    placed = place(smallest);
  }
  const withChamfers = (part: TraySpec): TraySpec => {
    const chamfers = (placed.get(part) ?? []).sort(
      (a, b) => compareCodeUnits(a.side, b.side) || a.from - b.from,
    );
    return chamfers.length === 0
      ? part
      : { ...part, features: [...ownFeatures(part.features), ...chamfers] };
  };
  return trays.map((t) => {
    if (t.merged !== undefined) {
      const members = t.merged.members.map(withChamfers);
      return members.some((m, i) => m !== t.merged?.members[i])
        ? { ...t, merged: { ...t.merged, members } }
        : t;
    }
    return withChamfers(t);
  });
}

/** A tray side with a chamfer facing it, and the printed part that has the chamfer. */
export interface ChamferFacing {
  /** The printed part the chamfer is cut on (the merged part, for a member). */
  by: TraySpec;
  /** The tray's side the chamfer faces. */
  side: Side;
}

/** The trays a chamfer cut on `part` (a printed part or a merged part's member) opens on. */
export function traysOpenedBy(
  part: TraySpec,
  chamfer: TopChamfer,
  trays: readonly TraySpec[],
  gap: number,
): { tray: TraySpec; side: Side }[] {
  const box = boxOf(part);
  const at = alongX(chamfer.side) ? part.x : part.y;
  return trays.flatMap((tray) => {
    const t = boxOf(tray);
    const apart = faceGap(box, t, chamfer.side);
    const [t0, t1] = spanOf(t, chamfer.side);
    const shared = Math.min(at + chamfer.to, t1) - Math.max(at + chamfer.from, t0);
    return apart >= -EPS &&
      apart <= gap + EPS &&
      shared >= CHAMFER_MIN_CONTACT_MM - EPS &&
      grip(t, box.z1, chamfer.size) >= CHAMFER_MIN_GRIP_MM - EPS
      ? [{ tray, side: OPPOSITE[chamfer.side] }]
      : [];
  });
}

/**
 * For each tray (by key) the chamfers that face it: the printed parts whose chamfers open on one
 * of its sides over at least CHAMFER_MIN_CONTACT_MM, and which side. For "how to lift this part"
 * lines: a tray with an entry can be gripped from those chamfers. Read off the parts'
 * `topChamfer` features, so it needs the parts as printed (`printableParts`), not the stored
 * layout.
 */
export function chamfersFacingTrays(
  parts: readonly TraySpec[],
  o: ChamferInputs,
): Map<string, ChamferFacing[]> {
  const gap = effective(o.settings).trayGap;
  const trays = parts.filter((t) => t.part === "tray");
  const out = new Map<string, ChamferFacing[]>();
  for (const by of parts) {
    for (const { part, chamfer } of topChamfersOf(by)) {
      for (const { tray, side } of traysOpenedBy(part, chamfer, trays, gap)) {
        out.set(tray.key, [...(out.get(tray.key) ?? []), { by, side }]);
      }
    }
  }
  return out;
}
