// src/instructions/labels.ts
// Where the numbered badges of an assembly picture go. Every badge is drawn after all shapes, so
// nothing covers it; this module makes sure no badge covers another one (or a tray's caption) and
// that a tray too small for a badge gets one beside it, joined by a leader line.
import { labelFontSize } from "../plan/layers";
import type { SvgRect, ViewBox } from "../plan/layers";

/** Smallest badge font in mm; at the page's print size it is still readable. */
export const MIN_BADGE_FONT = 3.5;
const GAP = 0.6;
const RINGS = 6;
/** Tried in this order: above, below, right, left, then the diagonals. */
const ANGLES = [
  -90, 90, 0, 180, -45, 45, -135, 135, -67.5, 67.5, -112.5, 112.5, -22.5, 22.5, -157.5, 157.5,
];
const FRACTIONS = [0.5, 0.25, 0.75];

export interface LabelRequest {
  text: string;
  rect: SvgRect;
  kind: "tray" | "spacer";
  /** A name printed under the badge; kept clear of the other badges. */
  caption?: { w: number; h: number };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedBadge {
  text: string;
  /** Badge centre and radius, and the font size of the number. */
  cx: number;
  cy: number;
  r: number;
  fs: number;
  /** Beside its shape rather than on it: draw a leader line to `anchor`. */
  leader: boolean;
  /** The centre of the shape the badge belongs to. */
  anchor: { x: number; y: number };
  /** Where the caption goes, when the request has one. */
  caption: Box | null;
}

function radiusFor(fs: number, text: string): number {
  return Math.max(fs * 0.75, fs * (0.3 * text.length + 0.25));
}

function fontFor(req: LabelRequest): number {
  const room = Math.min(req.rect.w, req.rect.h);
  let fs = req.kind === "spacer" ? Math.min(5, labelFontSize(req.rect)) : labelFontSize(req.rect);
  while (fs > MIN_BADGE_FONT && radiusFor(fs, req.text) * 2 + 1 > room) {
    fs = Math.max(MIN_BADGE_FONT, fs - 0.25);
  }
  return fs;
}

function circlesOverlap(a: { x: number; y: number; r: number }, b: typeof a): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + GAP;
}

function circleHitsBox(c: { x: number; y: number; r: number }, b: Box): boolean {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - nx, c.y - ny) < c.r + GAP / 2;
}

function inside(rect: SvgRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Candidate centres on the shape (centre first), then around it, nearest ring first. */
function candidates(rect: SvgRect, r: number, fitsInside: boolean) {
  const out: { x: number; y: number; outside: boolean }[] = [];
  if (fitsInside) {
    const lo = (a: number): number => a + r + GAP;
    const hi = (a: number, size: number): number => a + size - r - GAP;
    for (const fy of FRACTIONS) {
      for (const fx of FRACTIONS) {
        const x = Math.max(lo(rect.x), Math.min(hi(rect.x, rect.w), rect.x + rect.w * fx));
        const y = Math.max(lo(rect.y), Math.min(hi(rect.y, rect.h), rect.y + rect.h * fy));
        out.push({ x, y, outside: false });
      }
    }
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  for (let k = 0; k < RINGS; k += 1) {
    for (const deg of ANGLES) {
      const dx = Math.cos((deg * Math.PI) / 180);
      const dy = Math.sin((deg * Math.PI) / 180);
      const exit = Math.min(
        Math.abs(dx) < 1e-9 ? Infinity : rect.w / 2 / Math.abs(dx),
        Math.abs(dy) < 1e-9 ? Infinity : rect.h / 2 / Math.abs(dy),
      );
      const dist = exit + r + 1 + k * r * 0.9;
      out.push({ x: cx + dx * dist, y: cy + dy * dist, outside: true });
    }
  }
  return out;
}

/**
 * Places one badge per request, in order (earlier ones keep their preferred spot). A badge sits
 * in the middle of its shape when it fits there, else elsewhere on it, else beside it. It stays
 * inside `bounds`, off the other badges, off the captions and, when beside a shape, off the other
 * shapes where there is room. `keepClear` is for fixed text such as the FRONT mark.
 */
export function placeBadges(
  requests: readonly LabelRequest[],
  bounds: ViewBox,
  keepClear: readonly Box[] = [],
): PlacedBadge[] {
  const circles: { x: number; y: number; r: number }[] = [];
  const boxes: Box[] = [...keepClear];
  const placed: PlacedBadge[] = [];
  for (const req of requests) {
    const { rect } = req;
    const fs = fontFor(req);
    const r = radiusFor(fs, req.text);
    const fitsInside = Math.min(rect.w, rect.h) >= 2 * r + 1;
    const anchor = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const list = candidates(rect, r, fitsInside);
    const free = (c: { x: number; y: number }): boolean => {
      const circle = { x: c.x, y: c.y, r };
      return (
        c.x - r >= bounds.x &&
        c.y - r >= bounds.y &&
        c.x + r <= bounds.x + bounds.w &&
        c.y + r <= bounds.y + bounds.h &&
        !circles.some((o) => circlesOverlap(circle, o)) &&
        !boxes.some((b) => circleHitsBox(circle, b))
      );
    };
    const others = requests.filter((o) => o !== req);
    const strict = (c: { x: number; y: number; outside: boolean }): boolean =>
      !c.outside || !others.some((o) => inside(o.rect, c.x, c.y));
    const pick =
      list.find((c) => free(c) && strict(c)) ?? list.find((c) => free(c)) ?? list[0] ?? anchor;
    const outsideShape = !inside(rect, pick.x, pick.y);
    const centred = Math.abs(pick.x - anchor.x) < 1e-6 && Math.abs(pick.y - anchor.y) < 1e-6;
    let caption: Box | null = null;
    if (req.caption) {
      caption = centred
        ? {
            x: anchor.x - req.caption.w / 2,
            y: pick.y + r + 0.4,
            w: req.caption.w,
            h: req.caption.h,
          }
        : {
            x: anchor.x - req.caption.w / 2,
            y: anchor.y - req.caption.h / 2,
            w: req.caption.w,
            h: req.caption.h,
          };
    }
    circles.push({ x: pick.x, y: pick.y, r });
    if (caption) {
      boxes.push(caption);
    }
    placed.push({
      text: req.text,
      cx: pick.x,
      cy: pick.y,
      r,
      fs,
      leader: outsideShape,
      anchor,
      caption,
    });
  }
  return placed;
}
