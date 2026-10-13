// src/instructions/render.ts
import type { Project, Settings, StoredLayout } from "../model/types";
import {
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

function layerSvg(
  layout: StoredLayout,
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
  if (belowLevel !== undefined) {
    for (const t of traysAt(layout.trays, belowLevel)) {
      const r = toSvgRect(t, frame);
      out.push(
        `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="#eeeeee" stroke="#bbbbbb" stroke-width="0.3" stroke-dasharray="2 1.5"/>`,
      );
    }
  }
  const trays = traysAt(layout.trays, level);
  const spacers = spacersAt(layout.trays, level);
  const requests: LabelRequest[] = [];
  const captions: (string | null)[] = [];
  // Shapes first, all of them: a number is only legible when nothing is painted after it.
  for (const t of trays) {
    const r = toSvgRect(t, frame);
    const fill = t.part === "leftover" ? "#f0f0f0" : "#cfe3f7";
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="1.5" fill="${fill}" stroke="#1d4f80" stroke-width="0.5"/>`,
    );
  }
  for (const s of spacers) {
    const r = toSvgRect(s, frame);
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="#f7e3c4" stroke="#8a5a00" stroke-width="0.4" stroke-dasharray="1.5 1"/>`,
    );
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
        `<line x1="${n(b.cx)}" y1="${n(b.cy)}" x2="${n(b.anchor.x)}" y2="${n(b.anchor.y)}" stroke="#1d4f80" stroke-width="0.4"/>`,
        `<circle cx="${n(b.anchor.x)}" cy="${n(b.anchor.y)}" r="0.9" fill="#1d4f80"/>`,
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
    const stroke = spacer ? "#8a5a00" : "#1d4f80";
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
  return levels.map((_level, i) => layerSvg(layout, frame, vb, byKey, levels, i));
}

export interface PartRow {
  number: number;
  label: string;
  size: string;
  layer: number;
  contents: string[];
  goesInto: number | null;
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
    layer: layerNumber(levels, p.spec.level),
    contents: p.spec.compartments.filter((c) => c.contents !== "").map((c) => c.contents),
    goesInto: p.parentNumber,
  }));
}

export function packingSteps(layout: StoredLayout): string[] {
  const parts = numberParts(layout.trays);
  const levels = levelsOf(layout.trays);
  const steps: string[] = [];
  levels.forEach((level, i) => {
    for (const p of parts) {
      if (p.spec.part === "spacer" || p.spec.level !== level) {
        continue;
      }
      steps.push(`Layer ${i + 1}: place #${p.number} ${p.label}${i > 0 ? " on top" : ""}.`);
      for (const s of parts) {
        if (s.spec.part === "spacer" && s.parentNumber === p.number) {
          steps.push(`Slide card spacer #${s.number} into tray #${p.number}.`);
        }
      }
    }
  });
  // A spacer whose tray isn't in the layout (an edited file) still has to be placed somewhere.
  for (const s of parts) {
    if (s.spec.part === "spacer" && s.parentNumber === null) {
      steps.push(`Place card spacer #${s.number} (the tray it belongs in is not in this layout).`);
    }
  }
  return steps;
}
