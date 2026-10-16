// src/instructions/render.ts
import type { Component, ComponentKind, Project, StoredLayout, TraySpec } from "../model/types";
import { componentIndexOfTray, shadeHex } from "../ui/identity";
import type { Shade } from "../ui/identity";
import {
  footprintsAt,
  isAddOn,
  labelFontSize,
  largestOf,
  levelsOf,
  planFrame,
  planViewBox,
  spacersAt,
  toSvgRect,
  traysAt,
} from "../plan/layers";
import type { PlanFrame, ViewBox } from "../plan/layers";
import { placeBadges } from "./labels";
import type { LabelRequest } from "./labels";
import { engravesName } from "../geometry/engraves";
import { carriesName } from "../model/part-name";
import { trayNames } from "./naming";
import type { TrayName } from "./naming";
import { numberParts, outerSizeText } from "./numbering";
import type { NumberedPart } from "./numbering";

/**
 * Characters XML 1.0 can't carry: most C0 controls, U+FFFE and U+FFFF, and surrogates that don't
 * form a pair. One of them in a label would make the whole SVG fail to parse.
 */
/* eslint-disable no-control-regex -- the control characters are the point */
const XML_ILLEGAL =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/* eslint-enable no-control-regex */

export function escapeXml(s: string): string {
  return s
    .replace(XML_ILLEGAL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const n = (v: number): string => v.toFixed(2);

/** Cuts to at most `max` UTF-16 units including the ellipsis, never between a surrogate pair. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  let cut = Math.max(1, max - 1);
  const last = s.charCodeAt(cut - 1);
  if (cut > 1 && last >= 0xd800 && last <= 0xdbff) {
    cut -= 1;
  }
  return `${s.slice(0, cut)}…`;
}

const SVG_PX_PER_MM = 3;

/**
 * A spacer on paper: hatched, with a dashed edge, as on screen. Plain hex, because a printed page
 * is always black on white whatever theme the screen uses.
 */
export const SPACER_PAPER = { fill: "#e9e5db", hatch: "#ddd8cc", dash: "#6e695c" } as const;

/** The id of the hatch every spacer on a layer picture is filled with. */
const HATCH_ID = "spacer-hatch";

const HATCH_DEFS = `<defs><pattern id="${HATCH_ID}" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="2" fill="${SPACER_PAPER.fill}"/><line x1="0" y1="0" x2="0" y2="2" stroke="${SPACER_PAPER.hatch}" stroke-width="0.9"/></pattern></defs>`;

export const INK = "#333333";
const GHOST = "#767676";

/**
 * A tray's colours on paper: its component's shade of its kind's hue (the light-scheme hex of
 * `shadeOf`, as on screen), or null for a part that holds nothing (spare, filler).
 */
export function paperShadeOf(t: TraySpec, project: Project): Shade | null {
  const index = t.part === "leftover" ? null : componentIndexOfTray(t, project.components);
  const component = index === null ? undefined : project.components[index];
  if (index === null || component === undefined) {
    return null;
  }
  // Each component of a kind has its own shade: the nth of its kind, in list order.
  const nth = project.components.slice(0, index).filter((c) => c.kind === component.kind).length;
  return shadeHex(component.kind, nth, "light");
}

/** A tray's fill on paper: see `paperShadeOf`. */
export function paperTintOf(t: TraySpec, project: Project): string | null {
  return paperShadeOf(t, project)?.fill ?? null;
}

/** The kind glyphs of src/ui/kindGlyphs.tsx as plain SVG markup, on the same 24 unit grid. */
const GLYPH_MARKUP: Record<ComponentKind, string> = {
  cards: `<rect x="5" y="8" width="11" height="13"/><path d="M8 8V3h11v13h-3"/>`,
  bulk: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>`,
  tiles: `<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>`,
  minis: `<circle cx="12" cy="6" r="3"/><path d="M9.5 21l1.5-9h2l1.5 9zM7 21h10"/>`,
  custom: `<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 3"/>`,
};

/** A tray has to be at least this wide and deep (SVG units) to carry its kind glyph. */
const GLYPH_MIN_SIZE = 7;

function glyphSvg(kind: ComponentKind, r: { x: number; y: number; w: number; h: number }): string {
  const size = Math.min(6, Math.min(r.w, r.h) - 2);
  const x = r.x + r.w - size - 1;
  const y = r.y + 1;
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24)})" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="square">${GLYPH_MARKUP[kind]}</g>`;
}

function layerSvg(
  layout: StoredLayout,
  project: Project,
  frame: PlanFrame,
  vb: ViewBox,
  names: Map<string, TrayName>,
  levels: number[],
  index: number,
): string {
  const level = levels[index] ?? 0;
  const belowLevel = index > 0 ? levels[index - 1] : undefined;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}" width="${n(vb.w * SVG_PX_PER_MM)}" height="${n(vb.h * SVG_PX_PER_MM)}" font-family="system-ui, sans-serif">`,
    `<title>${escapeXml(`Layer ${index + 1} of ${levels.length}`)}</title>`,
    `<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="#ffffff"/>`,
    `<rect x="${n(-frame.bc)}" y="${n(-frame.bc)}" width="${n(frame.innerW)}" height="${n(frame.innerD)}" fill="none" stroke="#333333" stroke-width="0.6"/>`,
  ];
  const trays = traysAt(layout.trays, level);
  const spacers = spacersAt(layout.trays, level);
  const requests: LabelRequest[] = [];
  const captions: (string | null)[] = [];
  // Shapes first, all of them: a name is only legible when nothing is painted after it.
  for (const t of trays) {
    const shapes = footprintsAt(t, level).map((f) => toSvgRect(f, frame));
    const index = t.part === "leftover" ? null : componentIndexOfTray(t, project.components);
    const shade = paperShadeOf(t, project);
    // Spare and leftover trays hold no component: plain white, dashed, so they read as "the rest".
    const look =
      shade === null
        ? `fill="#ffffff" stroke="${INK}" stroke-width="0.5" stroke-dasharray="2 1.5"`
        : `fill="${shade.fill}" stroke="${shade.line}" stroke-width="0.6"`;
    for (const r of shapes) {
      out.push(
        `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="1.5" ${look}/>`,
      );
    }
    const r = largestOf(shapes) ?? toSvgRect(t, frame);
    const kind = index === null ? undefined : project.components[index]?.kind;
    if (kind !== undefined && Math.min(r.w, r.h) >= GLYPH_MIN_SIZE) {
      out.push(glyphSvg(kind, r));
    }
  }
  if (spacers.length > 0) {
    out.push(HATCH_DEFS);
  }
  for (const s of spacers) {
    const r = toSvgRect(s, frame);
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="url(#${HATCH_ID})" stroke="${SPACER_PAPER.dash}" stroke-width="0.5" stroke-dasharray="1.5 1"/>`,
    );
  }
  // The trays of the layer below, faintly, over the shapes: where this layer's trays stand.
  if (belowLevel !== undefined) {
    for (const t of traysAt(layout.trays, belowLevel)) {
      const shapes = footprintsAt(t, belowLevel).map((f) => toSvgRect(f, frame));
      const r = largestOf(shapes) ?? toSvgRect(t, frame);
      const ghost = names.get(t.key)?.short.toUpperCase();
      for (const g of shapes) {
        out.push(
          `<rect x="${n(g.x)}" y="${n(g.y)}" width="${n(g.w)}" height="${n(g.h)}" fill="none" stroke="${GHOST}" stroke-width="0.35" stroke-dasharray="2 1.5"/>`,
        );
      }
      out.push(
        `<text x="${n(r.x + 1.2)}" y="${n(r.y + 3.4)}" font-size="3" fill="${GHOST}">${escapeXml(ghost ?? "?")}</text>`,
      );
    }
  }
  for (const t of trays) {
    const r =
      largestOf(footprintsAt(t, level).map((f) => toSvgRect(f, frame))) ?? toSvgRect(t, frame);
    const name = names.get(t.key);
    const labelSize = Math.min(5, labelFontSize(r) * 0.45);
    const maxChars = Math.floor(r.w / (labelSize * 0.6));
    const caption = name && r.w >= 30 && r.h >= 24 ? truncate(name.full, maxChars) : null;
    captions.push(caption);
    requests.push({
      text: name ? name.short.toUpperCase() : "?",
      rect: r,
      kind: "tray",
      ...(caption !== null
        ? { caption: { w: Math.min(r.w, caption.length * labelSize * 0.6), h: labelSize * 1.2 } }
        : {}),
    });
  }
  for (const s of spacers) {
    const name = names.get(s.key);
    captions.push(null);
    requests.push({
      text: name ? name.short.toUpperCase() : "?",
      rect: toSvgRect(s, frame),
      kind: "spacer",
    });
  }
  const front = { x: frame.usableW / 2 - 12, y: frame.usableD + frame.bc + 4, w: 24, h: 10 };
  const placed = placeBadges(requests, vb, [front]);
  // Leaders, then captions, then every badge on top.
  placed.forEach((b) => {
    if (b.leader) {
      out.push(
        `<line x1="${n(b.cx)}" y1="${n(b.cy)}" x2="${n(b.anchor.x)}" y2="${n(b.anchor.y)}" stroke="${INK}" stroke-width="0.4"/>`,
        `<circle cx="${n(b.anchor.x)}" cy="${n(b.anchor.y)}" r="0.9" fill="${INK}"/>`,
      );
    }
  });
  placed.forEach((b, i) => {
    const caption = captions[i];
    const named = i < trays.length && names.has(trays[i]?.key ?? "");
    if (b.caption && caption && named) {
      const size = b.caption.h / 1.2;
      out.push(
        `<text x="${n(b.caption.x + b.caption.w / 2)}" y="${n(b.caption.y + b.caption.h / 2)}" font-size="${n(size)}" text-anchor="middle" dominant-baseline="central" fill="#111111" stroke="#ffffff" stroke-width="${n(size * 0.35)}" stroke-linejoin="round" paint-order="stroke">${escapeXml(caption)}</text>`,
      );
    }
  });
  placed.forEach((b, i) => {
    const spacer = i >= trays.length;
    const stroke = spacer ? SPACER_PAPER.dash : INK;
    out.push(
      `<rect x="${n(b.cx - b.w / 2)}" y="${n(b.cy - b.h / 2)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(b.h / 2)}" fill="#ffffff" stroke="${stroke}" stroke-width="0.4"/>`,
      `<text x="${n(b.cx)}" y="${n(b.cy)}" font-size="${n(b.fs)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#111111">${escapeXml(b.text)}</text>`,
    );
  });
  out.push(
    `<text x="${n(frame.usableW / 2)}" y="${n(frame.usableD + frame.bc + 9)}" font-size="6" letter-spacing="0.6" text-anchor="middle" fill="#333333">FRONT</text>`,
    "</svg>",
  );
  return out.join("");
}

export function render(layout: StoredLayout, project: Project): string[] {
  const frame = planFrame(project.box, project.settings);
  const vb = planViewBox(frame);
  const names = trayNames(numberParts(layout.trays), project.components);
  const levels = levelsOf(layout.trays);
  return levels.map((_level, i) => layerSvg(layout, project, frame, vb, names, levels, i));
}

export interface PartRow {
  /** The part's key in the layout, for lists. */
  key: string;
  /** What the part is called on screens and the page (trayNames' `full`). */
  name: string;
  /**
   * The short name cut into the part, in capitals as engraved (settings.engraveNames on and the
   * part has room for it); null otherwise.
   */
  engraved: string | null;
  /** The part carries a name (engraving on) but is too small or too thin to hold it. */
  tooSmall: boolean;
  /** "W × D × H mm". */
  size: string;
  /** Where it stands in the box: "12 mm from the left, 30 mm from the front". */
  position: string;
  layer: number;
  contents: string[];
  /** The name of the tray a spacer or divider goes into. */
  goesInto: string | null;
  /** For a riser: the name of the tray it carries (it is placed first, and the tray goes on it). */
  carries: string | null;
}

const mm1 = (v: number): string => String(Math.round(v * 10) / 10);

function positionText(spec: TraySpec): string {
  return `${mm1(spec.x)} mm from the left, ${mm1(spec.y)} mm from the front`;
}

function layerNumber(levels: number[], level: number): number {
  return levels.indexOf(level) + 1;
}

/** A part's full name, by its number in the list, for a part that is in the list. */
function fullNameOf(
  parts: readonly NumberedPart[],
  names: Map<string, TrayName>,
  number: number | null,
): string | null {
  const part = parts.find((p) => p.number === number);
  return part === undefined ? null : (names.get(part.spec.key)?.full ?? part.label);
}

export function whatGoesWhere(layout: StoredLayout, project: Project): PartRow[] {
  const levels = levelsOf(layout.trays);
  const parts = numberParts(layout.trays);
  const names = trayNames(parts, project.components);
  return parts.map((p) => {
    const parent = fullNameOf(parts, names, p.parentNumber);
    const short = names.get(p.spec.key)?.short ?? "";
    const carries = project.settings.engraveNames && carriesName(p.spec.part) && short !== "";
    // null: a part that cannot be planned is not built, and says nothing of its name
    const fits = carries ? engravesName(p.spec, project.settings, short) : false;
    return {
      key: p.spec.key,
      name: names.get(p.spec.key)?.full ?? p.label,
      engraved: fits === true ? short.toUpperCase() : null,
      tooSmall: fits === false && carries,
      size: outerSizeText(p.spec, project.settings),
      position: positionText(p.spec),
      layer: layerNumber(levels, p.spec.level),
      contents: p.spec.compartments.filter((c) => c.contents !== "").map((c) => c.contents),
      goesInto: p.spec.part === "riser" ? null : parent,
      carries: p.spec.part === "riser" ? parent : null,
    };
  });
}

export interface LayerInfo {
  layer: number;
  /** "Layer 1 (bottom)", "Layer 2", "Layer 3 (top)". */
  title: string;
  /** The names of the trays on the layer, in assembly order (spacers and risers go with trays and are left out). */
  trays: string[];
}

export function layerInfo(layout: StoredLayout, components: readonly Component[]): LayerInfo[] {
  const levels = levelsOf(layout.trays);
  const parts = numberParts(layout.trays);
  const names = trayNames(parts, components);
  return levels.map((level, i) => ({
    layer: i + 1,
    title: `Layer ${i + 1}${i === 0 ? " (bottom)" : i === levels.length - 1 ? " (top)" : ""}`,
    trays: parts
      .filter((p) => !isAddOn(p.spec) && p.spec.level === level)
      .map((p) => names.get(p.spec.key)?.full ?? p.label),
  }));
}

export function packingSteps(layout: StoredLayout, components: readonly Component[]): string[] {
  const parts = numberParts(layout.trays);
  const names = trayNames(parts, components);
  const nameOf = (p: NumberedPart): string => names.get(p.spec.key)?.full ?? p.label;
  const levels = levelsOf(layout.trays);
  const steps: string[] = [];
  levels.forEach((level, i) => {
    for (const p of parts) {
      if (isAddOn(p.spec) || p.spec.level !== level) {
        continue;
      }
      // A riser goes down first and its tray stands on it.
      const riser = parts.find((r) => r.spec.part === "riser" && r.parentNumber === p.number);
      if (riser) {
        steps.push(`Layer ${i + 1}: place ${nameOf(riser)}, then ${nameOf(p)} on it.`);
      } else {
        steps.push(`Layer ${i + 1}: place ${nameOf(p)}${i > 0 ? " on top" : ""}.`);
      }
      for (const s of parts) {
        if (s.spec.part === "spacer" && s.parentNumber === p.number) {
          steps.push(`Slide the spacer into ${nameOf(p)} (${nameOf(s)}).`);
        }
        if (s.spec.part === "divider" && s.parentNumber === p.number) {
          steps.push(`Stand ${nameOf(s)} in its floor slot.`);
        }
      }
    }
  });
  // A spacer whose tray isn't in the layout (an edited file) still has to be placed somewhere.
  for (const s of parts) {
    if (isAddOn(s.spec) && s.parentNumber === null) {
      steps.push(
        s.spec.part === "riser"
          ? `Place ${nameOf(s)} (the tray that stands on it is not in this layout).`
          : `Place ${nameOf(s)} (the tray it belongs in is not in this layout).`,
      );
    }
  }
  return steps;
}
