// src/instructions/labels.ts
// Where the name badges of an assembly picture go. Every badge is drawn after all shapes, so
// nothing covers it; this module makes sure no badge covers another one (or a tray's caption) and
// that a tray too small for a badge gets one beside it, joined by a leader line. A badge is a pill
// as wide as its text (a short tray name, at most ten characters), so it is placed as a box.
import { labelFontSize } from "../plan/layers";
import type { SvgRect, ViewBox } from "../plan/layers";

/** Smallest badge font in mm; at the page's print size it is still readable. */
export const MIN_BADGE_FONT = 3.5;
/** Largest badge font in mm: a name is much wider than a number was, so it is kept modest. */
export const MAX_BADGE_FONT = 7;
const GAP = 0.6;
const RINGS = 6;
/** Tried in this order: above, below, right, left, then the diagonals. */
const ANGLES = [
  -90, 90, 0, 180, -45, 45, -135, 135, -67.5, 67.5, -112.5, 112.5, -22.5, 22.5, -157.5, 157.5,
];
const FRACTIONS = [0.5, 0.25, 0.75];
/** Average width of a bold capital, in fonts, and the room a pill leaves at both ends and above. */
const CHAR_EM = 0.7;
const PAD_EM = 0.45;
const HEIGHT_EM = 1.5;

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
  /** Badge centre and size (a pill, w wide and h high), and the font size of its text. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  fs: number;
  /** Beside its shape rather than on it: draw a leader line to `anchor`. */
  leader: boolean;
  /** The centre of the shape the badge belongs to. */
  anchor: { x: number; y: number };
  /** Where the caption goes, when the request has one. */
  caption: Box | null;
}

/** The size of the pill of a text at a font size. */
export function badgeSize(fs: number, text: string): { w: number; h: number } {
  const h = fs * HEIGHT_EM;
  return { w: Math.max(h, fs * (CHAR_EM * text.length + PAD_EM * 2)), h };
}

function fontFor(req: LabelRequest): number {
  const { rect } = req;
  let fs = Math.min(
    req.kind === "spacer" ? 5 : MAX_BADGE_FONT,
    labelFontSize(rect),
    MAX_BADGE_FONT,
  );
  const fits = (f: number): boolean => {
    const size = badgeSize(f, req.text);
    return size.w + 1 <= rect.w && size.h + 1 <= rect.h;
  };
  while (fs > MIN_BADGE_FONT && !fits(fs)) {
    fs = Math.max(MIN_BADGE_FONT, fs - 0.25);
  }
  return fs;
}

interface Pill {
  x: number;
  y: number;
  w: number;
  h: number;
}

function pillsOverlap(a: Pill, b: Pill): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP;
}

function pillHitsBox(p: Pill, b: Box): boolean {
  return (
    Math.abs(p.x - (b.x + b.w / 2)) < (p.w + b.w) / 2 + GAP / 2 &&
    Math.abs(p.y - (b.y + b.h / 2)) < (p.h + b.h) / 2 + GAP / 2
  );
}

function inside(rect: SvgRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Candidate centres on the shape (centre first), then around it, nearest ring first. */
function candidates(rect: SvgRect, size: { w: number; h: number }, fitsInside: boolean) {
  const out: { x: number; y: number; outside: boolean }[] = [];
  if (fitsInside) {
    const lo = (a: number, extent: number): number => a + extent / 2 + GAP;
    const hi = (a: number, room: number, extent: number): number => a + room - extent / 2 - GAP;
    for (const fy of FRACTIONS) {
      for (const fx of FRACTIONS) {
        const x = Math.max(
          lo(rect.x, size.w),
          Math.min(hi(rect.x, rect.w, size.w), rect.x + rect.w * fx),
        );
        const y = Math.max(
          lo(rect.y, size.h),
          Math.min(hi(rect.y, rect.h, size.h), rect.y + rect.h * fy),
        );
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
      // how far the pill reaches from its centre along this direction
      const reach = Math.abs(dx) * (size.w / 2) + Math.abs(dy) * (size.h / 2);
      const dist = exit + reach + 1 + k * size.h * 0.9;
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
  const pills: Pill[] = [];
  const boxes: Box[] = [...keepClear];
  const placed: PlacedBadge[] = [];
  for (const req of requests) {
    const { rect } = req;
    const fs = fontFor(req);
    const size = badgeSize(fs, req.text);
    const fitsInside = size.w + 1 <= rect.w && size.h + 1 <= rect.h;
    const anchor = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const list = candidates(rect, size, fitsInside);
    const free = (c: { x: number; y: number }): boolean => {
      const pill = { x: c.x, y: c.y, ...size };
      return (
        c.x - size.w / 2 >= bounds.x &&
        c.y - size.h / 2 >= bounds.y &&
        c.x + size.w / 2 <= bounds.x + bounds.w &&
        c.y + size.h / 2 <= bounds.y + bounds.h &&
        !pills.some((o) => pillsOverlap(pill, o)) &&
        !boxes.some((b) => pillHitsBox(pill, b))
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
            y: pick.y + size.h / 2 + 0.4,
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
    pills.push({ x: pick.x, y: pick.y, ...size });
    if (caption) {
      boxes.push(caption);
    }
    placed.push({
      text: req.text,
      cx: pick.x,
      cy: pick.y,
      ...size,
      fs,
      leader: outsideShape,
      anchor,
      caption,
    });
  }
  return placed;
}
