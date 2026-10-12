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
  for (const t of traysAt(layout.trays, level)) {
    const r = toSvgRect(t, frame);
    const part = byKey.get(t.key);
    const fs = labelFontSize(r);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const fill = t.part === "leftover" ? "#f0f0f0" : "#cfe3f7";
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="1.5" fill="${fill}" stroke="#1d4f80" stroke-width="0.5"/>`,
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(fs * 0.75)}" fill="#ffffff" stroke="#1d4f80" stroke-width="0.4"/>`,
      `<text x="${n(cx)}" y="${n(cy)}" font-size="${n(fs)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#111111">${part ? part.number : "?"}</text>`,
    );
    if (part && r.w >= 30 && r.h >= 24) {
      const labelSize = Math.min(5, fs * 0.45);
      const maxChars = Math.floor(r.w / (labelSize * 0.6));
      out.push(
        `<text x="${n(cx)}" y="${n(cy + fs * 0.75 + labelSize * 1.2)}" font-size="${n(labelSize)}" text-anchor="middle" fill="#111111">${escapeXml(truncate(part.label, maxChars))}</text>`,
      );
    }
  }
  for (const s of spacersAt(layout.trays, level)) {
    const r = toSvgRect(s, frame);
    const part = byKey.get(s.key);
    out.push(
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="#f7e3c4" stroke="#8a5a00" stroke-width="0.4" stroke-dasharray="1.5 1"/>`,
      `<text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2)}" font-size="4" text-anchor="middle" dominant-baseline="central" fill="#5a3a00">${part ? part.number : "?"}</text>`,
    );
  }
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
