// src/instructions/render.ts
import type { ComponentKind, Project, Settings, StoredLayout, TraySpec } from "../model/types";
import { SPACER_COLOR, componentIndexOfTray } from "../ui/identity";
import {
  isAddOn,
  labelFontSize,
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
import { numberParts, outerSizeText, partsByKey } from "./numbering";
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
 * The identity tints on paper: the light-theme values of --tint-1 … --tint-8, fixed because a
 * printed page is always black on white whatever theme the screen uses. Indexed like tintVar.
 */
const PAPER_TINTS = [
  "#d3e0f5",
  "#f0d5cc",
  "#d6ead7",
  "#f2e6bd",
  "#e0d7f0",
  "#cde8e6",
  "#f2d3de",
  "#dfe2e7",
] as const;

const INK = "#333333";
const GHOST = "#767676";

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
  byKey: Map<string, NumberedPart>,
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
  // Shapes first, all of them: a number is only legible when nothing is painted after it.
  for (const t of trays) {
    const r = toSvgRect(t, frame);
    const index = t.part === "leftover" ? null : componentIndexOfTray(t, project.components);
    const tint = index === null ? null : PAPER_TINTS[index % PAPER_TINTS.length];
    // Spare and leftover trays hold no component: plain white, dashed, so they read as "the rest".
    const look =
      tint === null || tint === undefined
        ? `fill="#ffffff" stroke="${INK}" stroke-width="0.5" stroke-dasharray="2 1.5"`
        : `fill="${tint}" stroke="${INK}" stroke-width="0.5"`;
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="1.5" ${look}/>`,
    );
    const kind = index === null ? undefined : project.components[index]?.kind;
    if (kind !== undefined && Math.min(r.w, r.h) >= GLYPH_MIN_SIZE) {
      out.push(glyphSvg(kind, r));
    }
  }
  for (const s of spacers) {
    const r = toSvgRect(s, frame);
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="${SPACER_COLOR}" stroke="#8a5a00" stroke-width="0.4" stroke-dasharray="1.5 1"/>`,
    );
  }
  // The trays of the layer below, faintly, over the shapes: where this layer's trays stand.
  if (belowLevel !== undefined) {
    for (const t of traysAt(layout.trays, belowLevel)) {
      const r = toSvgRect(t, frame);
      const num = byKey.get(t.key)?.number;
      out.push(
        `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="none" stroke="${GHOST}" stroke-width="0.35" stroke-dasharray="2 1.5"/>`,
        `<text x="${n(r.x + 1.2)}" y="${n(r.y + 3.4)}" font-size="3" fill="${GHOST}">${num ?? "?"}</text>`,
      );
    }
  }
  for (const t of trays) {
    const r = toSvgRect(t, frame);
    const part = byKey.get(t.key);
    const labelSize = Math.min(5, labelFontSize(r) * 0.45);
    const maxChars = Math.floor(r.w / (labelSize * 0.6));
    const caption = part && r.w >= 30 && r.h >= 24 ? truncate(part.label, maxChars) : null;
    captions.push(caption);
    requests.push({
      text: part ? String(part.number) : "?",
      rect: r,
      kind: "tray",
      ...(caption !== null
        ? { caption: { w: Math.min(r.w, caption.length * labelSize * 0.6), h: labelSize * 1.2 } }
        : {}),
    });
  }
  for (const s of spacers) {
    const part = byKey.get(s.key);
    captions.push(null);
    requests.push({
      text: part ? String(part.number) : "?",
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
    const part = i < trays.length ? byKey.get(trays[i]?.key ?? "") : undefined;
    if (b.caption && caption && part) {
      const size = b.caption.h / 1.2;
      out.push(
        `<text x="${n(b.caption.x + b.caption.w / 2)}" y="${n(b.caption.y + b.caption.h / 2)}" font-size="${n(size)}" text-anchor="middle" dominant-baseline="central" fill="#111111" stroke="#ffffff" stroke-width="${n(size * 0.35)}" stroke-linejoin="round" paint-order="stroke">${escapeXml(caption)}</text>`,
      );
    }
  });
  placed.forEach((b, i) => {
    const spacer = i >= trays.length;
    const stroke = spacer ? "#8a5a00" : INK;
    out.push(
      `<circle cx="${n(b.cx)}" cy="${n(b.cy)}" r="${n(b.r)}" fill="#ffffff" stroke="${stroke}" stroke-width="0.4"/>`,
      `<text x="${n(b.cx)}" y="${n(b.cy)}" font-size="${n(b.fs)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#111111">${b.text}</text>`,
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
  const byKey = partsByKey(numberParts(layout.trays));
  const levels = levelsOf(layout.trays);
  return levels.map((_level, i) => layerSvg(layout, project, frame, vb, byKey, levels, i));
}

export interface PartRow {
  number: number;
  label: string;
  size: string;
  /** Where it stands in the box: "12 mm from the left, 30 mm from the front". */
  position: string;
  layer: number;
  contents: string[];
  goesInto: number | null;
  /** For a riser: the tray it carries (it is placed first, and the tray goes on it). */
  carries: number | null;
}

const mm1 = (v: number): string => String(Math.round(v * 10) / 10);

function positionText(spec: TraySpec): string {
  return `${mm1(spec.x)} mm from the left, ${mm1(spec.y)} mm from the front`;
}

function layerNumber(levels: number[], level: number): number {
  return levels.indexOf(level) + 1;
}

export function whatGoesWhere(layout: StoredLayout, settings: Settings): PartRow[] {
  const levels = levelsOf(layout.trays);
  return numberParts(layout.trays).map((p) => ({
    number: p.number,
    label: p.label,
    size: outerSizeText(p.spec, settings),
    position: positionText(p.spec),
    layer: layerNumber(levels, p.spec.level),
    contents: p.spec.compartments.filter((c) => c.contents !== "").map((c) => c.contents),
    goesInto: p.spec.part === "riser" ? null : p.parentNumber,
    carries: p.spec.part === "riser" ? p.parentNumber : null,
  }));
}

export interface LayerInfo {
  layer: number;
  /** "Layer 1 (bottom)", "Layer 2", "Layer 3 (top)". */
  title: string;
  /** The trays on the layer, "1 Cards", in numbering order (spacers and risers go with trays and are left out). */
  trays: string[];
}

export function layerInfo(layout: StoredLayout): LayerInfo[] {
  const levels = levelsOf(layout.trays);
  const parts = numberParts(layout.trays);
  return levels.map((level, i) => ({
    layer: i + 1,
    title: `Layer ${i + 1}${i === 0 ? " (bottom)" : i === levels.length - 1 ? " (top)" : ""}`,
    trays: parts
      .filter((p) => !isAddOn(p.spec) && p.spec.level === level)
      .map((p) => `${p.number} ${p.label}`),
  }));
}

export function packingSteps(layout: StoredLayout): string[] {
  const parts = numberParts(layout.trays);
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
        steps.push(
          `Layer ${i + 1}: place riser #${riser.number}, then #${p.number} ${p.label} on it.`,
        );
      } else {
        steps.push(`Layer ${i + 1}: place #${p.number} ${p.label}${i > 0 ? " on top" : ""}.`);
      }
      for (const s of parts) {
        if (s.spec.part === "spacer" && s.parentNumber === p.number) {
          steps.push(`Slide ${s.label.toLowerCase()} #${s.number} into tray #${p.number}.`);
        }
      }
    }
  });
  // A spacer whose tray isn't in the layout (an edited file) still has to be placed somewhere.
  for (const s of parts) {
    if (isAddOn(s.spec) && s.parentNumber === null) {
      steps.push(
        s.spec.part === "riser"
          ? `Place riser #${s.number} (the tray that stands on it is not in this layout).`
          : `Place ${s.label.toLowerCase()} #${s.number} (the tray it belongs in is not in this layout).`,
      );
    }
  }
  return steps;
}
