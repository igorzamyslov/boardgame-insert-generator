// src/instructions/exploded.ts
// The assembly page's exploded picture: every part drawn as a block, spread apart the way the 3D
// view spreads them, seen from the front right above, with the tray names of the instructions.
//
// It is projected to SVG rather than rendered: the page is made to be printed, and an SVG is
// vector on paper at any size, a few kilobytes, and needs no WebGL (a canvas may not print, and an
// offscreen render would need a renderer the page does not have). It is the same kind of picture
// as the layer pictures beside it. The price is that a part is a block, not its real mesh: a
// tray's pockets are not drawn. The arrangement itself is the 3D view's (`trayPosition`).
import type { BoxMm, Project, StoredLayout, TraySpec } from "../model/types";
import { SPACER_COLOR } from "../ui/identity";
import { anchorOf, boxOutline, outlineCenter, trayPosition } from "../viewer/transform";
import { badgeSize } from "./labels";
import { trayNames } from "./naming";
import { numberParts, parentKey } from "./numbering";
import type { NumberedPart } from "./numbering";
import { escapeXml, INK, paperTintOf } from "./render";

/** How far apart the parts are drawn: all the way, the 3D view's slider at its end. */
export const EXPLODED_FACTOR = 1;

/** Where the picture is seen from: turned this far from the front toward the right, and this high. */
const AZIMUTH = (35 * Math.PI) / 180;
const ELEVATION = (30 * Math.PI) / 180;

/** The camera's right, up and back (toward the viewer) as unit vectors; z is up, y runs to the back. */
const BACK: Vec3 = [
  Math.sin(AZIMUTH) * Math.cos(ELEVATION),
  -Math.cos(AZIMUTH) * Math.cos(ELEVATION),
  Math.sin(ELEVATION),
];
const RIGHT: Vec3 = [Math.cos(AZIMUTH), Math.sin(AZIMUTH), 0];
const UP: Vec3 = cross(BACK, RIGHT);

type Vec3 = [number, number, number];
interface Pt {
  x: number;
  y: number;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A point on the page (mm; y grows downward). */
function toPage(p: Vec3): Pt {
  return { x: dot(p, RIGHT), y: -dot(p, UP) };
}

const n = (v: number): string => v.toFixed(2);

export interface ExplodedView {
  svg: string;
  /** The parts in assembly order, by the names the instructions give them. */
  parts: { name: string }[];
}

interface Block {
  part: NumberedPart;
  box: BoxMm;
  /** Where it is in the drawing order, once sorted. */
  depth: number;
}

/** The blocks that make up a part, moved to where the 3D view puts it at full explode. */
function blocksOf(
  part: NumberedPart,
  byKey: ReadonlyMap<string, TraySpec>,
  center: [number, number],
): Block[] {
  const { spec } = part;
  const [px, py, pz] = trayPosition(spec, EXPLODED_FACTOR, center, anchorOf(spec, byKey));
  const [dx, dy, dz] = [px - spec.x, py - spec.y, pz - spec.z];
  // A merged part moves as one: its members and bridges keep their places in it.
  const boxes: BoxMm[] = spec.merged ? [...spec.merged.members, ...spec.merged.bridges] : [spec];
  return boxes.map((b) => {
    const box = { x: b.x + dx, y: b.y + dy, z: b.z + dz, w: b.w, d: b.d, h: b.h };
    const mid: Vec3 = [box.x + box.w / 2, box.y + box.d / 2, box.z + box.h / 2];
    return { part, box, depth: dot(mid, BACK) };
  });
}

const EPS = 0.01;

/**
 * Whether `a` is behind `b` as seen from the picture's side (the front, the right, above): they
 * are apart along some axis with `b` toward the viewer. Boxes that overlap give no answer.
 */
function isBehind(a: BoxMm, b: BoxMm): boolean {
  return (
    a.x + a.w <= b.x + EPS || // b is further right
    b.y + b.d <= a.y + EPS || // b is further to the front
    a.z + a.h <= b.z + EPS // b is higher
  );
}

/** `loose` is a spacer or divider that goes into `tray`. */
function standsIn(loose: TraySpec, tray: TraySpec): boolean {
  return (loose.part === "spacer" || loose.part === "divider") && parentKey(loose) === tray.key;
}

/**
 * The blocks back to front, so painting them in this order hides what should be hidden. Blocks
 * that are apart are ordered by which one is nearer; a spacer in the tray it goes into (the two
 * overlap) comes after the tray; what is left, and any cycle, goes by distance.
 */
function paintOrder(blocks: readonly Block[]): Block[] {
  const count = blocks.length;
  const before: Set<number>[] = blocks.map(() => new Set());
  const drawAfter = (a: number, b: number): void => {
    before[b]?.add(a); // a must be painted before b
  };
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (!a || !b || a.part === b.part) {
        continue;
      }
      const aBehind = isBehind(a.box, b.box);
      const bBehind = isBehind(b.box, a.box);
      if (aBehind && !bBehind) {
        drawAfter(i, j);
      } else if (bBehind && !aBehind) {
        drawAfter(j, i);
      } else if (!aBehind && !bBehind) {
        // Overlapping: a loose part goes on top of the tray it stands in.
        if (standsIn(a.part.spec, b.part.spec)) {
          drawAfter(j, i);
        } else if (standsIn(b.part.spec, a.part.spec)) {
          drawAfter(i, j);
        } else if (a.depth <= b.depth) {
          drawAfter(i, j);
        } else {
          drawAfter(j, i);
        }
      }
    }
  }
  const done = new Set<number>();
  const readyAt = (i: number): boolean => [...(before[i] ?? [])].every((x) => done.has(x));
  const out: Block[] = [];
  while (out.length < count) {
    let pick = -1;
    let pickReady = false;
    for (let i = 0; i < count; i++) {
      if (done.has(i)) {
        continue;
      }
      // The farthest block whose own "behind" blocks are painted; in a cycle, the farthest left.
      const ready = readyAt(i);
      const farther = (blocks[i]?.depth ?? 0) < (blocks[pick]?.depth ?? 0);
      if (pick === -1 || (ready && !pickReady) || (ready === pickReady && farther)) {
        pick = i;
        pickReady = ready;
      }
    }
    done.add(pick);
    const chosen = blocks[pick];
    if (chosen) {
      out.push(chosen);
    }
  }
  return out;
}

/** A hex colour scaled toward black; the faces of a block are the top colour in three lights. */
function shade(hex: string, factor: number): string {
  const v = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number): string =>
    Math.round(((v >> shift) & 0xff) * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

interface Faces {
  top: Vec3[];
  front: Vec3[];
  right: Vec3[];
}

/** The three faces a viewer in front, to the right and above sees of a box. */
function facesOf(b: BoxMm): Faces {
  const [x0, y0, z0] = [b.x, b.y, b.z];
  const [x1, y1, z1] = [b.x + b.w, b.y + b.d, b.z + b.h];
  return {
    top: [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    front: [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ],
    right: [
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ],
  };
}

function inConvex(p: Pt, poly: readonly Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) {
      continue;
    }
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (c !== 0) {
      if (sign !== 0 && Math.sign(c) !== sign) {
        return false;
      }
      sign = Math.sign(c);
    }
  }
  return true;
}

const points = (poly: readonly Pt[]): string => poly.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");

/** The font of the name badges, mm. */
const BADGE_FONT = 3.6;

/**
 * The exploded picture of a layout, or null when it has no parts. Parts are painted back to front
 * and named as in `trayNames` (the packing steps and the parts table use the same names); the
 * badges go on last, so none is hidden, each on a face nothing painted later covers.
 */
export function explodedView(layout: StoredLayout, project: Project): ExplodedView | null {
  const parts = numberParts(layout.trays);
  if (parts.length === 0) {
    return null;
  }
  const names = trayNames(parts, project.components);
  const shortOf = (part: NumberedPart): string =>
    (names.get(part.spec.key)?.short ?? "?").toUpperCase();
  const fullOf = (part: NumberedPart): string => names.get(part.spec.key)?.full ?? part.label;
  const widest = Math.max(...parts.map((p) => badgeSize(BADGE_FONT, shortOf(p)).w));
  const byKey = new Map(layout.trays.map((t) => [t.key, t]));
  const outline = boxOutline(project.box, project.settings);
  const center = outlineCenter(outline);
  const sorted = paintOrder(parts.flatMap((p) => blocksOf(p, byKey, center)));
  // The box floor, to say where "down" is, and the corner to call the front.
  const [fx, fy, fz] = outline.min;
  const [fw, fd] = outline.size;
  const floor = (
    [
      [fx, fy, fz],
      [fx + fw, fy, fz],
      [fx + fw, fy + fd, fz],
      [fx, fy + fd, fz],
    ] as Vec3[]
  ).map(toPage);
  // FRONT goes just outside the middle of the floor's front edge, away from the floor's centre.
  const frontMid = toPage([fx + fw / 2, fy, fz]);
  const floorMid = {
    x: floor.reduce((sum, p) => sum + p.x, 0) / floor.length,
    y: floor.reduce((sum, p) => sum + p.y, 0) / floor.length,
  };
  const away = Math.hypot(frontMid.x - floorMid.x, frontMid.y - floorMid.y) || 1;
  const frontLabel = {
    x: frontMid.x + ((frontMid.x - floorMid.x) / away) * 9,
    y: frontMid.y + ((frontMid.y - floorMid.y) / away) * 9,
  };

  const polys = sorted.map((b) => {
    const f = facesOf(b.box);
    return { top: f.top.map(toPage), front: f.front.map(toPage), right: f.right.map(toPage) };
  });
  // The label's own extent counts toward the page, so the picture never cuts it off.
  const labelEnds = [-10, 10].map((dx) => ({ x: frontLabel.x + dx, y: frontLabel.y + 3.5 }));
  const all: Pt[] = [
    ...floor,
    ...labelEnds,
    ...polys.flatMap((p) => [...p.top, ...p.front, ...p.right]),
  ];
  const pad = widest / 2 + 4;
  const minX = Math.min(...all.map((p) => p.x)) - pad;
  const maxX = Math.max(...all.map((p) => p.x)) + pad;
  const minY = Math.min(...all.map((p) => p.y)) - pad;
  const maxY = Math.max(...all.map((p) => p.y)) + pad;
  const w = maxX - minX;
  const h = maxY - minY;

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}" width="${n(w * 3)}" height="${n(h * 3)}" font-family="system-ui, sans-serif">`,
    `<title>${escapeXml("Exploded view of all parts, in assembly order")}</title>`,
    `<rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="#ffffff"/>`,
    `<polygon points="${points(floor)}" fill="none" stroke="#767676" stroke-width="0.5" stroke-dasharray="2 1.5"/>`,
  ];

  sorted.forEach((b, i) => {
    const poly = polys[i];
    if (!poly) {
      return;
    }
    const spec = b.part.spec;
    const loose = spec.part === "spacer" || spec.part === "divider";
    const tint = loose ? SPACER_COLOR : (paperTintOf(spec, project) ?? "#ffffff");
    const stroke = loose ? "#8a5a00" : INK;
    const dash = !loose && paperTintOf(spec, project) === null ? ` stroke-dasharray="2 1.5"` : "";
    const look = `stroke="${stroke}" stroke-width="0.4" stroke-linejoin="round"${dash}`;
    out.push(
      `<g data-part="${b.part.number}">`,
      `<polygon points="${points(poly.right)}" fill="${shade(tint, 0.76)}" ${look}/>`,
      `<polygon points="${points(poly.front)}" fill="${shade(tint, 0.88)}" ${look}/>`,
      `<polygon points="${points(poly.top)}" fill="${tint}" ${look}/>`,
      "</g>",
    );
  });

  out.push(
    `<text x="${n(frontLabel.x)}" y="${n(frontLabel.y)}" font-size="5" letter-spacing="0.5" text-anchor="middle" dominant-baseline="central" fill="#333333" stroke="#ffffff" stroke-width="1.5" paint-order="stroke">FRONT</text>`,
  );

  // One name per part, on its largest block, on the first face that nothing later covers.
  const badges = parts.map((part) => {
    const mine = sorted
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.part === part)
      .sort((a, b) => b.b.box.w * b.b.box.d - a.b.box.w * a.b.box.d);
    const first = mine[0];
    const poly = first ? polys[first.i] : undefined;
    const faces = poly ? [poly.top, poly.front, poly.right] : [];
    const covered = (p: Pt): boolean =>
      first === undefined
        ? false
        : polys
            .slice(first.i + 1)
            .some((q, k) => sorted[first.i + 1 + k]?.part !== part && hits(q, p));
    const mid = (face: readonly Pt[]): Pt => ({
      x: face.reduce((s, p) => s + p.x, 0) / face.length,
      y: face.reduce((s, p) => s + p.y, 0) / face.length,
    });
    const spots = faces.map(mid);
    return { part, at: spots.find((p) => !covered(p)) ?? spots[0] ?? { x: 0, y: 0 } };
  });
  // Badges that landed on top of each other are pushed apart, deterministically: along the axis
  // they overlap least on, which is up and down for the usual wide pills.
  const pill = (i: number) => badgeSize(BADGE_FONT, shortOf(badges[i]?.part as NumberedPart));
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 0; i < badges.length; i++) {
      for (let j = i + 1; j < badges.length; j++) {
        const a = badges[i]?.at;
        const b = badges[j]?.at;
        if (!a || !b) {
          continue;
        }
        const pa = pill(i);
        const pb = pill(j);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = (pa.w + pb.w) / 2 + 0.8 - Math.abs(dx);
        const overlapY = (pa.h + pb.h) / 2 + 0.8 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }
        if (overlapY <= overlapX) {
          const push = overlapY / 2;
          const sign = dy < 0 ? -1 : 1;
          a.y -= sign * push;
          b.y += sign * push;
        } else {
          const push = overlapX / 2;
          const sign = dx < 0 ? -1 : 1;
          a.x -= sign * push;
          b.x += sign * push;
        }
      }
    }
  }
  for (const { part, at } of badges) {
    const loose = part.spec.part === "spacer" || part.spec.part === "divider";
    const size = badgeSize(BADGE_FONT, shortOf(part));
    out.push(
      `<g data-badge="${part.number}">`,
      `<rect x="${n(at.x - size.w / 2)}" y="${n(at.y - size.h / 2)}" width="${n(size.w)}" height="${n(size.h)}" rx="${n(size.h / 2)}" fill="#ffffff" stroke="${loose ? "#8a5a00" : INK}" stroke-width="0.4"/>`,
      `<text x="${n(at.x)}" y="${n(at.y)}" font-size="${BADGE_FONT}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#111111">${escapeXml(shortOf(part))}</text>`,
      "</g>",
    );
  }
  out.push("</svg>");
  return { svg: out.join(""), parts: parts.map((p) => ({ name: fullOf(p) })) };
}

function hits(q: { top: Pt[]; front: Pt[]; right: Pt[] }, p: Pt): boolean {
  return inConvex(p, q.top) || inConvex(p, q.front) || inConvex(p, q.right);
}
