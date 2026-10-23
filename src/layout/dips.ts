// src/layout/dips.ts
import { keepsApart, nearestAcross, OPPOSITE } from "../model/cut-rules";
import {
  DIPS_PER_TRAY_SIDE,
  DIP_MIN_CONTACT_MM,
  DIP_MIN_DEPTH_MM,
  DIP_MIN_STRIP_MM,
  dipBox,
  dipDepth,
  dipMargin,
  dipRun,
  edgeTopOf,
  fingerDipsOf,
  ownFeatures,
  type FingerDip,
} from "../model/finger-dip";
import { builtLevel } from "../model/lip";
import { effective, SPEC_TOLERANCE } from "../model/settings";
import type { Settings, Side, TraySpec } from "../model/types";
import { compareCodeUnits } from "../util/compare";
import { roundMm } from "./units";

/** What addFingerDips reads from a project. */
export interface DipInputs {
  settings: Settings;
}

/** Tolerance when two faces count as touching or two boxes as apart, mm (the grid is 0.01). */
const EPS = 0.015;
/** How finely a dip's place along a face is tried, mm. */
const STEP_MM = 0.5;

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

/**
 * Where a tray's own walls are cut through on `side`, as ranges along that side in box
 * coordinates: the wall cutouts that leave through the outer face (a cut into the next compartment
 * stops at a divider). A filler standing against such a wall seals the cut.
 */
function cutsOn(tray: TraySpec, side: Side): [number, number][] {
  const rects = tray.compartments.map((c) => ({ x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.d }));
  const origin = alongX(side) ? tray.x : tray.y;
  const out: [number, number][] = [];
  tray.compartments.forEach((c, i) => {
    for (const f of c.features) {
      if (f.type === "wallCutout" && f.side === side) {
        if (nearestAcross(rects, i, side, f.at, SPEC_TOLERANCE) === -1) {
          out.push([origin + f.at - f.width / 2, origin + f.at + f.width / 2]);
        }
      }
    }
  });
  return out;
}

/** A tray a filler's face touches, and what a dip there can reach of it. */
interface Site {
  /** The filler's face. */
  side: Side;
  tray: TraySpec;
  /** The stretch of the filler's face the tray's side shares, and the middle of the tray's side. */
  lo: number;
  hi: number;
  centre: number;
  /** How far down the tray reaches below the top of the filler, mm: all a dip here can be deep. */
  room: number;
  /** Where the tray's own cuts leave through its side, along the filler's face. */
  cuts: [number, number][];
}

/** What a dip at this height reaches of a tray: how much of its side is within the dip's depth. */
function grip(tray: Box, top: number, depth: number): number {
  return Math.min(tray.z1, top) - Math.max(tray.z0, top - depth);
}

/** The trays against a part's face `side`, as sites. */
function sitesOn(
  part: Box,
  height: number,
  edgeTop: number,
  side: Side,
  trays: readonly TraySpec[],
  gap: number,
): Site[] {
  const top = part.z1;
  const [p0, p1] = spanOf(part, side);
  const sites: Site[] = [];
  for (const tray of trays) {
    const t = boxOf(tray);
    const apart = faceGap(part, t, side);
    if (apart < -EPS || apart > gap + EPS) {
      continue;
    }
    const [t0, t1] = spanOf(t, side);
    const [lo, hi] = [Math.max(p0, t0), Math.min(p1, t1)];
    if (hi - lo < DIP_MIN_CONTACT_MM - EPS) {
      continue;
    }
    const room = top - t.z0;
    const depth = dipDepth(height, edgeTop, room);
    if (depth === 0 || grip(t, top, depth) < DIP_MIN_DEPTH_MM - EPS) {
      continue;
    }
    sites.push({
      side,
      tray,
      lo,
      hi,
      centre: (t0 + t1) / 2,
      room,
      cuts: cutsOn(tray, OPPOSITE[side]),
    });
  }
  return sites;
}

/** A part that can carry dips: a solid filler, plain or a member of a merged part. */
interface Candidate {
  /** The printed part (the merged part, for a member). */
  owner: TraySpec;
  /** The spec the dips go on: the owner, or one of its members. */
  part: TraySpec;
  box: Box;
  /** What a dip must stay clear of: the bridges and the other members of a merged part. */
  obstacles: Box[];
  level: number;
}

function candidatesOf(trays: readonly TraySpec[]): Candidate[] {
  const out: Candidate[] = [];
  for (const t of trays) {
    if (t.merged !== undefined) {
      // Upside down on the bed, the top a dip is cut from would be the bed face.
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

/** A dip proposed for a part, with the tray sides it serves. */
interface Proposal {
  candidate: Candidate;
  dip: FingerDip;
  /** The dip's footprint and height range in box coordinates. */
  box: Box;
  served: { tray: TraySpec; side: Side }[];
  /** Whether it stays clear of every cut through the tray it faces. */
  clearOfCuts: boolean;
  /** How much of the main tray's side it faces, mm. */
  contact: number;
}

const overlapLength = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * The best place for a dip at the face `site.side` of `c`, as close to the middle of the tray's
 * side as there is room, or null when there is none. A place is good when the dip faces at least
 * DIP_MIN_CONTACT_MM of the tray's side, stays clear of the bridges and members of a merged part
 * (a bridge would fill it) and keeps its sides `dipMargin` from the part's ends; one clear of the
 * tray's own cuts through that side comes first, then the one nearest the middle.
 *
 * A dip cut across a strip serves the tray on each face, so its depth is what every one of them
 * allows (`dipDepth` for the least `room`): a tray that would not be gripped at that depth is not
 * served, and the dip is then as deep as the rest allow, until the set stops changing. The dip
 * never reaches below the foot of a tray it serves.
 */
function propose(
  c: Candidate,
  site: Site,
  all: readonly Site[],
  width: number,
  margin: number,
  edgeTop: number,
): Proposal | null {
  const { side } = site;
  const r = width / 2;
  const [p0, p1] = spanOf(c.box, side);
  const [first, last] = [p0 + margin + r, p1 - margin - r];
  if (first > last + 1e-9) {
    return null;
  }
  const origin = alongX(side) ? c.box.x0 : c.box.y0;
  const base = Math.min(last, Math.max(first, site.centre));
  const top = c.box.z1;
  const steps = Math.ceil((last - first) / STEP_MM) + 1;
  let fallback: Proposal | null = null;
  for (let k = 0; k <= steps; k += 1) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const pos = base + sign * k * STEP_MM;
      if (pos < first - 1e-9 || pos > last + 1e-9) {
        continue;
      }
      const at = origin + roundMm(pos - origin);
      const contact = overlapLength(at - r, at + r, site.lo, site.hi);
      if (contact < DIP_MIN_CONTACT_MM - EPS) {
        continue;
      }
      const shape = dipBox({ side, at: at - origin, width }, c.part);
      const faces = shape.through ? [side, OPPOSITE[side]] : [side];
      // The sites the dip reaches along its width; the least room among them sets its depth, and a
      // tray it is too shallow to grip drops out (its removal can only deepen the dip).
      let reached = all.filter((s) => {
        const [t0, t1] = spanOf(boxOf(s.tray), s.side);
        return (
          faces.includes(s.side) &&
          overlapLength(at - r, at + r, Math.max(t0, p0), Math.min(t1, p1)) >=
            DIP_MIN_CONTACT_MM - EPS
        );
      });
      let depth = 0;
      for (;;) {
        depth = dipDepth(c.part.h, edgeTop, Math.min(...reached.map((s) => s.room)));
        const gripped = reached.filter(
          (s) => grip(boxOf(s.tray), top, depth) >= DIP_MIN_DEPTH_MM - EPS,
        );
        if (gripped.length === reached.length) {
          break;
        }
        reached = gripped;
      }
      if (depth === 0 || !reached.includes(site)) {
        continue;
      }
      const dip: FingerDip = { type: "fingerDip", side, at: roundMm(at - origin), width, depth };
      const b = dipBox(dip, c.part);
      const foot: Box = {
        x0: c.box.x0 + b.x0,
        x1: c.box.x0 + b.x1,
        y0: c.box.y0 + b.y0,
        y1: c.box.y0 + b.y1,
        z0: top - depth,
        z1: top,
      };
      if (c.obstacles.some((o) => overlaps(foot, o))) {
        continue;
      }
      const clear = !site.cuts.some(([a, z]) => overlapLength(at - r, at + r, a, z) > EPS);
      const found: Proposal = {
        candidate: c,
        dip,
        box: foot,
        served: reached.map((s) => ({ tray: s.tray, side: OPPOSITE[s.side] })),
        clearOfCuts: clear,
        contact,
      };
      if (clear) {
        return found;
      }
      // Faces a cut the filler seals: the dip opens it to the finger. Kept as the last resort.
      fallback ??= found;
    }
  }
  return fallback;
}

/**
 * The finger dips of a printed layout (geometry 0.9.4, DESIGN §7 "lifting trays"), last pass after
 * the merge. Trays tile the box a tray gap apart, so nothing on a tray's outside can be gripped
 * and a filler wedged beside it has no grip either: each solid filler (plain, or a member of a
 * merged part) gets a U cut from its top where it touches a tray's outer face, `fingerPocket.width`
 * wide, so a fingertip reaches down that face, and dips on two opposite sides pinch a full tray.
 *
 * - **Where.** A face of the filler that stands a tray gap from a tray's side over at least
 *   DIP_MIN_CONTACT_MM; centred on that tray's side where the filler has room (its sides keep
 *   `dipMargin` from the filler's ends), else the nearest place that has; clear of the tray's own
 *   cuts through that side where there is room (if the filler seals the whole of one, the dip faces
 *   it and opens it); clear of the bridges and members of a merged part. At most DIPS_PER_TRAY_SIDE
 *   dips face one side of a tray, taken in order of how well they are placed; a dip across a strip
 *   needs room on every side it serves.
 * - **How deep.** About half the filler's height, at most DIP_MAX_DEPTH_MM, no deeper than the tray
 *   it faces (a dip across a strip: the shallower of its two trays), and its bottom MIN_FEATURE_MM
 *   above the groove or step at the filler's foot where it leaves through the face (`dipDepth`);
 *   under DIP_MIN_DEPTH_MM there is no dip.
 * - **Thin strips.** A filler thinner than a finger is cut across its whole thickness (`dipRun`):
 *   the dip is open on both faces and serves the tray on each. Strips under DIP_MIN_STRIP_MM, where
 *   no finger would go in, are left whole.
 * - **Not on:** a riser (a tray stands on it), an open spare tray (its pocket is a grip, and
 *   lifting it out frees the tray beside it), a merged part printed upside down (the top is the bed
 *   face), anything that is not a filler.
 *
 * Derived, never stored: the dips are on the printed parts' `features` (a merged part's on its
 * members), and the stored layout, its hash and a share link are the same with or without them.
 * Other parts are returned as they are.
 */
export function addFingerDips(trays: readonly TraySpec[], o: DipInputs): TraySpec[] {
  const { settings } = o;
  const width = settings.fingerPocket.width;
  if (!(width > 0) || !Number.isFinite(width)) {
    return [...trays];
  }
  const gap = effective(settings).trayGap;
  const margin = dipMargin(settings);
  const targets = trays.filter((t) => t.part === "tray");
  const proposals: Proposal[] = [];
  for (const c of candidatesOf(trays)) {
    const edgeTop = edgeTopOf(settings, c.level);
    const sizes = { w: c.part.w, d: c.part.d };
    const sides: Side[] = ["front", "back", "left", "right"];
    const sites = sides.map((side) => sitesOn(c.box, c.part.h, edgeTop, side, targets, gap));
    for (const [i, side] of sides.entries()) {
      const across = alongX(side) ? sizes.d : sizes.w;
      const { through } = dipRun(across);
      if (through && across < DIP_MIN_STRIP_MM - EPS) {
        continue;
      }
      // A dip cut across serves the sites of both faces.
      const mine = sites[i] ?? [];
      const theirs = through ? (sites[sides.indexOf(OPPOSITE[side])] ?? []) : [];
      for (const site of mine) {
        const p = propose(c, site, [...mine, ...theirs], width, margin, edgeTop);
        if (p !== null && p.served.length > 0) {
          proposals.push(p);
        }
      }
    }
  }
  proposals.sort(
    (a, b) =>
      Number(b.clearOfCuts) - Number(a.clearOfCuts) ||
      b.contact - a.contact ||
      compareCodeUnits(a.candidate.part.key, b.candidate.part.key) ||
      compareCodeUnits(a.dip.side, b.dip.side),
  );
  const count = new Map<string, number>();
  const sideKey = (s: { tray: TraySpec; side: Side }): string => `${s.tray.key}|${s.side}`;
  const placed = new Map<TraySpec, Proposal[]>();
  for (const p of proposals) {
    const mine = placed.get(p.candidate.part) ?? [];
    const clash = mine.some((q) => !keepsApart(flat(q.box), flat(p.box), SPEC_TOLERANCE));
    // A dip is counted on every side it serves, so it needs room on all of them.
    const room = p.served.every((s) => (count.get(sideKey(s)) ?? 0) < DIPS_PER_TRAY_SIDE);
    if (clash || !room) {
      continue;
    }
    placed.set(p.candidate.part, [...mine, p]);
    for (const s of p.served) {
      count.set(sideKey(s), (count.get(sideKey(s)) ?? 0) + 1);
    }
  }
  const withDips = (part: TraySpec): TraySpec => {
    const dips = (placed.get(part) ?? [])
      .map((p) => p.dip)
      .sort((a, b) => compareCodeUnits(a.side, b.side) || a.at - b.at);
    return dips.length === 0
      ? part
      : { ...part, features: [...ownFeatures(part.features), ...dips] };
  };
  return trays.map((t) => {
    if (t.merged !== undefined) {
      const members = t.merged.members.map(withDips);
      return members.some((m, i) => m !== t.merged?.members[i])
        ? { ...t, merged: { ...t.merged, members } }
        : t;
    }
    return withDips(t);
  });
}

const flat = (b: Box): { x0: number; y0: number; x1: number; y1: number } => ({
  x0: b.x0,
  y0: b.y0,
  x1: b.x1,
  y1: b.y1,
});

/** A tray side with a dip facing it, and the printed part that has the dip. */
export interface DipFacing {
  /** The printed part the dip is cut in (the merged part, for a member). */
  by: TraySpec;
  /** The tray's side the dip faces. */
  side: Side;
}

/** The trays a dip cut in `part` (a printed part or a merged part's member) opens on. */
export function traysOpenedBy(
  part: TraySpec,
  dip: FingerDip,
  trays: readonly TraySpec[],
  gap: number,
): { tray: TraySpec; side: Side }[] {
  const b = dipBox(dip, part);
  const at = (alongX(dip.side) ? part.x : part.y) + dip.at;
  const faces = b.through ? [dip.side, OPPOSITE[dip.side]] : [dip.side];
  const box = boxOf(part);
  return faces.flatMap((side) =>
    trays.flatMap((tray) => {
      const t = boxOf(tray);
      const apart = faceGap(box, t, side);
      const [t0, t1] = spanOf(t, side);
      return apart >= -EPS &&
        apart <= gap + EPS &&
        overlapLength(at - dip.width / 2, at + dip.width / 2, t0, t1) >= DIP_MIN_CONTACT_MM - EPS &&
        grip(t, box.z1, dip.depth) >= DIP_MIN_DEPTH_MM - EPS
        ? [{ tray, side: OPPOSITE[side] }]
        : [];
    }),
  );
}

/**
 * For each tray (by key) the dips that face it: the printed parts whose dips open on one of its
 * sides over at least DIP_MIN_CONTACT_MM, and which side. For "how to lift this part" lines: a
 * tray with an entry can be gripped from those dips. Read off the parts' `fingerDip` features, so
 * it needs the parts as printed (`printableParts`), not the stored layout.
 */
export function dipsFacingTrays(
  parts: readonly TraySpec[],
  o: DipInputs,
): Map<string, DipFacing[]> {
  const gap = effective(o.settings).trayGap;
  const trays = parts.filter((t) => t.part === "tray");
  const out = new Map<string, DipFacing[]>();
  for (const by of parts) {
    for (const { part, dip } of fingerDipsOf(by)) {
      for (const { tray, side } of traysOpenedBy(part, dip, trays, gap)) {
        out.set(tray.key, [...(out.get(tray.key) ?? []), { by, side }]);
      }
    }
  }
  return out;
}
