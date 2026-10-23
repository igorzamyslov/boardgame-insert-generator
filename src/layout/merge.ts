import { effective } from "../model/settings";
import type { BoxMm, Printer, Settings, TraySpec } from "../model/types";
import { fitsBed, type Bed } from "./bed";
import { roundMm, toMm, toU, toUFloor } from "./units";

/** What mergeParts reads from a project. */
export interface MergeInputs {
  settings: Settings;
  printer: Printer;
}

/** Tolerance when two faces count as touching or two heights as equal, mm (the grid is 0.01). */
const EPS = 0.015;
/**
 * The least two parts must share, along the touching edge and in height, to be one part. A
 * filler is at least the thinnest part the printer can make (about 2 mm), so this lets a thin
 * strip join, and keeps two parts that only meet at a corner apart.
 */
export const MIN_JOIN_MM = 2;

/** A part's box and what merging needs to know about it. */
interface Item {
  readonly spec: TraySpec;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
  /** Where the part's highest point is: z1, or the lip a riser carries above it. */
  readonly top: number;
  readonly volume: number;
}

function itemOf(spec: TraySpec, lipHeight: number): Item {
  return {
    spec,
    x0: spec.x,
    x1: spec.x + spec.w,
    y0: spec.y,
    y1: spec.y + spec.d,
    z0: spec.z,
    z1: spec.z + spec.h,
    top: spec.z + spec.h + (spec.lip ? lipHeight : 0),
    volume: spec.w * spec.d * spec.h,
  };
}

/** What the bridges need from the settings. */
interface BridgeFit {
  /** Tray gap: the widest gap two parts may be bridged across, mm. */
  readonly gap: number;
  /** The outer corner radius (an upper bound: sizing may use less), mm. */
  readonly radius: number;
}

/**
 * How far into a member a bridge reaches: as far as the member's rounded corner cuts away (the
 * corner radius), but not into an open member's pocket (past its wall) nor across a solid one
 * (past half its width).
 */
function reach(m: TraySpec, across: number, fit: BridgeFit): number {
  return roundMm(Math.max(0, Math.min(fit.radius, m.solid ? across / 2 : m.wall)));
}

interface Span {
  readonly lo: number;
  readonly hi: number;
}

/**
 * The solid that joins two parts standing side by side across a gap of at most `fit.gap` (0 for
 * parts of one leaf), or null when they do not touch like that: one box filling the gap over the
 * stretch the two share along it and in height, and reaching into both by `reach`. The reach is
 * what makes it printable. A bridge only a gap thick (0.1 to 0.2 mm) would not print, and the
 * members' rounded outer corners and bottom chamfers would leave its ends and its foot standing
 * in the notches between them as free-standing fins; a bridge that reaches as far into a member
 * as its corner cuts away closes those notches with it. It starts at the members' common floor, so
 * its underside is on the bed (or, for the part that prints upside down, its top).
 */
function bridgeBetween(a: Item, b: Item, fit: BridgeFit): BoxMm | null {
  const z0 = Math.max(a.z0, b.z0);
  const z1 = Math.min(a.z1, b.z1);
  if (z1 - z0 < MIN_JOIN_MM - EPS) {
    return null;
  }
  const rightOf = b.x0 - a.x1 >= -EPS;
  const alongX = rightOf ? b.x0 - a.x1 : a.x0 - b.x1;
  const y0 = Math.max(a.y0, b.y0);
  const y1 = Math.min(a.y1, b.y1);
  if (y1 - y0 >= MIN_JOIN_MM - EPS && alongX >= -EPS && alongX <= fit.gap + EPS) {
    const [left, right] = rightOf ? [a, b] : [b, a];
    const across: Span = {
      lo: left.x1 - reach(left.spec, left.spec.w, fit),
      hi: right.x0 + reach(right.spec, right.spec.w, fit),
    };
    return {
      x: roundMm(across.lo),
      y: roundMm(y0),
      z: roundMm(z0),
      w: roundMm(across.hi - across.lo),
      d: roundMm(y1 - y0),
      h: roundMm(z1 - z0),
    };
  }
  const x0 = Math.max(a.x0, b.x0);
  const x1 = Math.min(a.x1, b.x1);
  const above = b.y0 - a.y1 >= -EPS;
  const alongY = above ? b.y0 - a.y1 : a.y0 - b.y1;
  if (x1 - x0 >= MIN_JOIN_MM - EPS && alongY >= -EPS && alongY <= fit.gap + EPS) {
    const [front, back] = above ? [a, b] : [b, a];
    const across: Span = {
      lo: front.y1 - reach(front.spec, front.spec.d, fit),
      hi: back.y0 + reach(back.spec, back.spec.d, fit),
    };
    return {
      x: roundMm(x0),
      y: roundMm(across.lo),
      z: roundMm(z0),
      w: roundMm(x1 - x0),
      d: roundMm(across.hi - across.lo),
      h: roundMm(z1 - z0),
    };
  }
  return null;
}

/** A box in whole units (hundredths of a mm), for the slit search. */
interface UBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
}

const unitBox = (b: BoxMm): UBox => ({
  x0: toU(b.x),
  x1: toU(b.x + b.w),
  y0: toU(b.y),
  y1: toU(b.y + b.d),
  z0: toU(b.z),
  z1: toU(b.z + b.h),
});

/**
 * The solid that closes the slits left in a merged part: the air no wider than the tray gap that
 * the members and their pairwise bridges surround. A bridge joins two members across the gap
 * between them over the stretch they share, so where three or four members meet at a corner the
 * gap between them is a small square that no bridge covers (each stops at the edge of the member
 * it runs along): a slit through the part, a hole in a solid that should have none. The search
 * is in plan, at every height the boxes change at: the cells of the grid their edges make that no
 * box covers and that do not open to the outside are the air the part encloses; a pocket of air
 * that is thin all through (no wider than `gap` in x or in y at every cell) is a slit and is
 * filled, over the height it exists. Air that is wider at some cell is where a tray stands (a
 * ring of fillers round a tray keeps its opening) and stays.
 */
export function slitFills(
  members: readonly BoxMm[],
  bridges: readonly BoxMm[],
  gap: number,
): BoxMm[] {
  const boxes = [...members, ...bridges].map(unitBox);
  const limit = toU(gap) + 1;
  const axis = (lo: (b: UBox) => number, hi: (b: UBox) => number): number[] =>
    [...new Set(boxes.flatMap((b) => [lo(b), hi(b)]))].sort((a, b) => a - b);
  const xs = axis(
    (b) => b.x0,
    (b) => b.x1,
  );
  const ys = axis(
    (b) => b.y0,
    (b) => b.y1,
  );
  const zs = axis(
    (b) => b.z0,
    (b) => b.z1,
  );
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  // pending[rect] = the open fills of that rectangle, extended upwards band by band
  const open = new Map<string, { rect: UBox; z0: number; z1: number }>();
  const done: { rect: UBox; z0: number; z1: number }[] = [];
  for (let k = 0; k + 1 < zs.length; k++) {
    const zLo = zs[k] as number;
    const zHi = zs[k + 1] as number;
    // air[i][j]: the cell is not covered by any box standing across this band
    const air: boolean[][] = Array.from({ length: nx }, (_, i) =>
      Array.from({ length: ny }, (_, j) => {
        const [x0, x1] = [xs[i] as number, xs[i + 1] as number];
        const [y0, y1] = [ys[j] as number, ys[j + 1] as number];
        return !boxes.some(
          (b) => b.x0 <= x0 && x1 <= b.x1 && b.y0 <= y0 && y1 <= b.y1 && b.z0 <= zLo && zHi <= b.z1,
        );
      }),
    );
    // the air that reaches the edge of the grid is outside
    const outside = new Set<number>();
    const stack: [number, number][] = [];
    const reach = (i: number, j: number): void => {
      if (i >= 0 && j >= 0 && i < nx && j < ny && air[i]?.[j] && !outside.has(i * ny + j)) {
        outside.add(i * ny + j);
        stack.push([i, j]);
      }
    };
    for (let i = 0; i < nx; i++) {
      reach(i, 0);
      reach(i, ny - 1);
    }
    for (let j = 0; j < ny; j++) {
      reach(0, j);
      reach(nx - 1, j);
    }
    for (let at = stack.pop(); at; at = stack.pop()) {
      const [i, j] = at;
      reach(i + 1, j);
      reach(i - 1, j);
      reach(i, j + 1);
      reach(i, j - 1);
    }
    // enclosed air: its connected pockets
    const seen = new Set<number>();
    const rects: UBox[] = [];
    for (let i0 = 0; i0 < nx; i0++) {
      for (let j0 = 0; j0 < ny; j0++) {
        const id = i0 * ny + j0;
        if (!air[i0]?.[j0] || outside.has(id) || seen.has(id)) {
          continue;
        }
        const cells: [number, number][] = [];
        const pending: [number, number][] = [[i0, j0]];
        seen.add(id);
        for (let at = pending.pop(); at; at = pending.pop()) {
          cells.push(at);
          for (const [di, dj] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const i = at[0] + di;
            const j = at[1] + dj;
            if (air[i]?.[j] && !outside.has(i * ny + j) && !seen.has(i * ny + j)) {
              seen.add(i * ny + j);
              pending.push([i, j]);
            }
          }
        }
        const runX = (i: number, j: number): number => {
          let a = i;
          let b = i;
          while (air[a - 1]?.[j]) a--;
          while (air[b + 1]?.[j]) b++;
          return (xs[b + 1] as number) - (xs[a] as number);
        };
        const runY = (i: number, j: number): number => {
          let a = j;
          let b = j;
          while (air[i]?.[a - 1]) a--;
          while (air[i]?.[b + 1]) b++;
          return (ys[b + 1] as number) - (ys[a] as number);
        };
        if (cells.every(([i, j]) => Math.min(runX(i, j), runY(i, j)) <= limit)) {
          for (const [i, j] of cells) {
            rects.push({
              x0: xs[i] as number,
              x1: xs[i + 1] as number,
              y0: ys[j] as number,
              y1: ys[j + 1] as number,
              z0: zLo,
              z1: zHi,
            });
          }
        }
      }
    }
    // a cell filled in the band below goes on up; the rest start here
    const next = new Map<string, { rect: UBox; z0: number; z1: number }>();
    for (const rect of rects) {
      const key = `${rect.x0},${rect.x1},${rect.y0},${rect.y1}`;
      const below = open.get(key);
      next.set(key, below ? { ...below, z1: zHi } : { rect, z0: zLo, z1: zHi });
    }
    for (const [key, fill] of open) {
      if (!next.has(key)) {
        done.push(fill);
      }
    }
    open.clear();
    for (const [key, fill] of next) {
      open.set(key, fill);
    }
  }
  done.push(...open.values());
  return done.map(({ rect, z0, z1 }) => ({
    x: toMm(rect.x0),
    y: toMm(rect.y0),
    z: toMm(z0),
    w: toMm(rect.x1 - rect.x0),
    d: toMm(rect.y1 - rect.y0),
    h: toMm(z1 - z0),
  }));
}

interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  /** The highest point, the lip of a lipped part included. */
  top: number;
}

function boundsOf(items: readonly Item[]): Bounds {
  return {
    x0: Math.min(...items.map((i) => i.x0)),
    x1: Math.max(...items.map((i) => i.x1)),
    y0: Math.min(...items.map((i) => i.y0)),
    y1: Math.max(...items.map((i) => i.y1)),
    z0: Math.min(...items.map((i) => i.z0)),
    z1: Math.max(...items.map((i) => i.z1)),
    top: Math.max(...items.map((i) => i.top)),
  };
}

/**
 * Whether these parts can be one print, and whether it prints upside down.
 * - Its bounding box fits the bed in plan (either way round) and in height, the lip a riser
 *   carries standing above it included. A box, not the exact shape: a comb that only fits the bed
 *   on a diagonal is left as two parts.
 * - Every member stands on the same floor: then the part prints as it stands, and nothing hangs.
 *   Otherwise (a filler in a stack level, beside a ground one) the part prints without supports
 *   only upside down, every member running from the top plane down, and only when every member is
 *   solid (an open member's pocket would face the bed) and every top is level.
 */
function check(items: readonly Item[], bed: Bed): { ok: boolean; flipped: boolean } {
  const b = boundsOf(items);
  const fits = fitsBed(
    bed,
    toU(roundMm(b.x1 - b.x0)),
    toU(roundMm(b.y1 - b.y0)),
    toU(roundMm(b.top - b.z0)),
  );
  if (!fits) {
    return { ok: false, flipped: false };
  }
  const level = (pick: (i: Item) => number): boolean =>
    items.every((i) => Math.abs(pick(i) - pick(items[0] ?? i)) <= EPS);
  if (level((i) => i.z0)) {
    return { ok: true, flipped: false };
  }
  const flat = items.every((i) => i.spec.solid) && level((i) => i.z1);
  return { ok: flat, flipped: flat };
}

/** A grouping: parts by index, the groups in order. */
type Groups = number[][];

/**
 * Greedy growth of one group at a time, from the seeds in `order`: a group takes the touching
 * part (not yet used) that keeps it printable, preferring the largest, or with `tight` the one
 * that grows the footprint least, until nothing more fits.
 */
function grow(
  items: readonly Item[],
  links: readonly ReadonlySet<number>[],
  bed: Bed,
  order: readonly number[],
  tight: boolean,
): Groups {
  const used = new Set<number>();
  const groups: Groups = [];
  for (const seed of order) {
    if (used.has(seed)) {
      continue;
    }
    const group = [seed];
    used.add(seed);
    for (;;) {
      let best: { index: number; area: number } | null = null;
      for (const g of group) {
        for (const n of links[g] ?? []) {
          if (used.has(n)) {
            continue;
          }
          const members = [...group, n].map((i) => items[i] as Item);
          if (!check(members, bed).ok) {
            continue;
          }
          const b = boundsOf(members);
          const area = tight ? (b.x1 - b.x0) * (b.y1 - b.y0) : -(items[n]?.volume ?? 0);
          if (best === null || area < best.area || (area === best.area && n < best.index)) {
            best = { index: n, area };
          }
        }
      }
      if (best === null) {
        break;
      }
      group.push(best.index);
      used.add(best.index);
    }
    groups.push(group);
  }
  return groups;
}

/** The footprint area of all groups: the tie-break between groupings with as many parts. */
function footprint(items: readonly Item[], groups: Groups): number {
  return groups.reduce((sum, g) => {
    const b = boundsOf(g.map((i) => items[i] as Item));
    return sum + (b.x1 - b.x0) * (b.y1 - b.y0);
  }, 0);
}

/**
 * The fewest groups the greedy growth finds. One greedy pass can strand a part (its neighbour was
 * taken by a group that could have left it room), so each part is tried as the first seed, with
 * both ways of choosing what a group takes; the pass with the fewest groups wins (then the
 * smallest total footprint, then the first found, so the result is deterministic).
 */
function partition(
  items: readonly Item[],
  links: readonly ReadonlySet<number>[],
  bed: Bed,
): Groups {
  const bySize = items
    .map((_, i) => i)
    .sort((a, b) => (items[b]?.volume ?? 0) - (items[a]?.volume ?? 0) || a - b);
  let best: Groups | null = null;
  let bestArea = 0;
  for (let start = 0; start < bySize.length; start++) {
    const order = [...bySize.slice(start), ...bySize.slice(0, start)];
    for (const tight of [false, true]) {
      const groups = grow(items, links, bed, order, tight);
      const area = footprint(items, groups);
      if (
        best === null ||
        groups.length < best.length ||
        (groups.length === best.length && area < bestArea)
      ) {
        best = groups;
        bestArea = area;
      }
    }
  }
  return best ?? [];
}

function mergedSpec(
  key: string,
  items: readonly Item[],
  bridges: BoxMm[],
  flipped: boolean,
): TraySpec {
  const b = boundsOf(items);
  const first = (items[0] as Item).spec;
  return {
    key,
    part: "leftover",
    path: "",
    stack: Math.min(...items.map((i) => i.spec.stack)),
    level: Math.min(...items.map((i) => i.spec.level)),
    x: roundMm(b.x0),
    y: roundMm(b.y0),
    z: roundMm(b.z0),
    w: roundMm(b.x1 - b.x0),
    d: roundMm(b.y1 - b.y0),
    h: roundMm(b.z1 - b.z0),
    rotated: false,
    wall: first.wall,
    floor: first.floor,
    lip: false,
    solid: items.every((i) => i.spec.solid),
    compartments: [],
    merged: { members: items.map((i) => i.spec), bridges, flipped },
  };
}

/**
 * Merges connected filler parts into the fewest parts that fit the print bed (spec minimal-trays
 * §6, levers 1 and 1b), so there are fewer loose pieces to place by hand. Print-time only, run
 * after splitRisers, splitSeparators and openSpacers and derived from the stored layout, which
 * keeps its individual leftovers: like them, it is no part of the inputs hash.
 *
 * What merges: parts `leftover` (the fillers, including the ones beside a tray in a stack level,
 * which stand from that level's floor to the top of the stack; with the lip on, not those, which
 * have a groove for the lip below them), and with `mergeRisers` the risers
 * too (with the lip on a riser carries the lip, standing above the bridges, which stop at its
 * rim: the lip is built on the riser member, as a lipped part is, and counts for the bed's height). Two parts are connected when they stand side by side across a gap of at most `trayGap`
 * (the gap between leaves, or between a tray and its filler) over at least MIN_JOIN_MM of their
 * edge and height; the part absorbs the gap with a solid bridge, so it is a little larger than
 * the parts it joins. Only a connected set can be one part: two strips with a tray between them
 * stay two. A riser (low, under a tray) joined to a filler (full height, beside it) makes an L in
 * elevation, a shelf with a wall alongside; it prints as it stands. A filler in a stack level
 * joins a ground filler only when both are solid with level tops, and the part then prints upside
 * down (`merged.flipped`). Each part's bounding box must fit the bed, so a long strip, or a whole
 * comb, becomes as many parts as the bed needs, grown greedily, largest first.
 *
 * A part with one member is not merged and is returned as it is, as is everything that is not a
 * filler or riser. A merged part is a leftover with `merged` set: `key` is `merged:<n>`, and its
 * x, y, z, w, d, h are the bounding box of the union.
 */
export function mergeParts(trays: readonly TraySpec[], o: MergeInputs): TraySpec[] {
  const { settings, printer } = o;
  if (!settings.mergeFillers) {
    return [...trays];
  }
  // With the lip on a filler in a stack level has a groove along its outer edge for the lip of the
  // tray below, and the lip runs along that tray's outer edge, under the filler's. A bridge to a
  // part beside it would reach over the lip, so such a filler stays a part of its own.
  const candidate = (t: TraySpec): boolean =>
    t.merged === undefined &&
    !(settings.lip.enabled && t.level > 0) &&
    (t.part === "leftover" || (settings.mergeRisers && t.part === "riser"));
  const items = trays.filter(candidate).map((t) => itemOf(t, settings.lip.height));
  if (items.length < 2) {
    return [...trays];
  }
  const fit: BridgeFit = {
    gap: effective(settings).trayGap,
    radius: Math.max(0, settings.cornerRadius),
  };
  const bed: Bed = {
    w: toUFloor(printer.bedX - 2 * printer.bedMargin),
    d: toUFloor(printer.bedY - 2 * printer.bedMargin),
    z: toUFloor(printer.bedZ),
  };
  const bridges = new Map<string, BoxMm>();
  const links = items.map(() => new Set<number>());
  items.forEach((a, i) => {
    items.forEach((b, j) => {
      if (j <= i) {
        return;
      }
      const bridge = bridgeBetween(a, b, fit);
      if (bridge !== null) {
        bridges.set(`${i}:${j}`, bridge);
        links[i]?.add(j);
        links[j]?.add(i);
      }
    });
  });
  const groups = partition(items, links, bed).filter((g) => g.length > 1);
  if (groups.length === 0) {
    return [...trays];
  }
  const built = groups
    .map((g) => {
      const members = g.map((i) => items[i] as Item);
      const inside = new Set(g);
      const joint = [...bridges]
        .filter(([k]) => {
          const [i, j] = k.split(":").map(Number);
          return inside.has(i as number) && inside.has(j as number);
        })
        .map(([, b]) => b);
      // the slits where three or more members meet at a corner
      joint.push(
        ...slitFills(
          members.map((i) => ({
            x: i.x0,
            y: i.y0,
            z: i.z0,
            w: i.x1 - i.x0,
            d: i.y1 - i.y0,
            h: i.z1 - i.z0,
          })),
          joint,
          fit.gap,
        ),
      );
      return { members, joint, flipped: check(members, bed).flipped };
    })
    .sort((p, q) => {
      const a = boundsOf(p.members);
      const b = boundsOf(q.members);
      return a.x0 - b.x0 || a.y0 - b.y0 || a.z0 - b.z0;
    });
  const replaced = new Map<TraySpec, TraySpec | null>();
  built.forEach((g, n) => {
    const spec = mergedSpec(`merged:${n}`, g.members, g.joint, g.flipped);
    g.members.forEach((m, k) => {
      replaced.set(m.spec, k === 0 ? spec : null);
    });
  });
  return trays.flatMap((t) => {
    const r = replaced.get(t);
    return r === undefined ? [t] : r === null ? [] : [r];
  });
}
