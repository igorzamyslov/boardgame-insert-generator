// src/instructions/numbering.ts
import type { Settings, TraySpec } from "../model/types";

export interface NumberedPart {
  number: number;
  spec: TraySpec;
  label: string;
  /** For spacers: the number of the tray they go into. */
  parentNumber: number | null;
}

export const SPACER_SUFFIX = ":spacer";

export function parentKey(spacer: TraySpec): string {
  return spacer.key.endsWith(SPACER_SUFFIX)
    ? spacer.key.slice(0, -SPACER_SUFFIX.length)
    : spacer.key;
}

export function partLabel(spec: TraySpec): string {
  if (spec.part === "spacer") {
    return "Card spacer";
  }
  if (spec.part === "leftover") {
    return spec.solid ? "Filler block" : "Spare tray";
  }
  const names: string[] = [];
  for (const c of spec.compartments) {
    if (c.kind !== "spare" && c.contents !== "" && !names.includes(c.contents)) {
      names.push(c.contents);
    }
  }
  return names.length > 0 ? names.join(" + ") : spec.key;
}

/** Code-unit order: the same on every machine, unlike `localeCompare`. */
function compareKeys(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function numberParts(trays: readonly TraySpec[]): NumberedPart[] {
  const main = trays
    .filter((t) => t.part !== "spacer")
    .sort((a, b) => a.stack - b.stack || a.level - b.level || compareKeys(a.key, b.key));
  const spacers = trays.filter((t) => t.part === "spacer");
  const used = new Set<TraySpec>();
  const ordered: TraySpec[] = [];
  for (const t of main) {
    ordered.push(t);
    for (const s of spacers) {
      if (!used.has(s) && parentKey(s) === t.key) {
        ordered.push(s);
        used.add(s);
      }
    }
  }
  const orphans = spacers.filter((s) => !used.has(s)).sort((a, b) => compareKeys(a.key, b.key));
  ordered.push(...orphans);
  const numberOf = new Map<string, number>();
  ordered.forEach((t, i) => {
    numberOf.set(t.key, i + 1);
  });
  return ordered.map((spec, i) => ({
    number: i + 1,
    spec,
    label: partLabel(spec),
    parentNumber: spec.part === "spacer" ? (numberOf.get(parentKey(spec)) ?? null) : null,
  }));
}

export function partsByKey(parts: readonly NumberedPart[]): Map<string, NumberedPart> {
  return new Map(parts.map((p) => [p.spec.key, p]));
}

/**
 * The height a tray prints at: `spec.h` plus the lip a lipped tray carries on top (plan 4's
 * over-bed and `layout.bed` notices report this height), on the 0.01 mm grid.
 */
export function printedHeight(spec: TraySpec, settings: Settings): number {
  return Math.round((spec.h + (spec.lip ? settings.lip.height : 0)) * 100) / 100;
}

/** "W × D × H mm" with the printed height; a lipped tray says so (its H includes the lip). */
export function outerSizeText(spec: TraySpec, settings: Settings): string {
  const size = `${spec.w.toFixed(1)} × ${spec.d.toFixed(1)} × ${printedHeight(spec, settings).toFixed(1)} mm`;
  return spec.lip ? `${size} with its lip` : size;
}
