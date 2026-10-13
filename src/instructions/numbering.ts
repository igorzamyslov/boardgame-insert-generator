// src/instructions/numbering.ts
import type { Settings, TraySpec } from "../model/types";
import { isAddOn } from "../plan/layers";
import { RISER_SUFFIX } from "../sizing/constants";
import { compareCodeUnits } from "../util/compare";

export interface NumberedPart {
  number: number;
  spec: TraySpec;
  label: string;
  /** For addOns: the number of the tray they go into. For a riser: the tray that stands on it. */
  parentNumber: number | null;
}

export const SPACER_SUFFIX = ":spacer";

/** A spacer's key ends `:spacer`, or `:spacer:<n>` for plate n of several (splitSeparators). */
const SPACER_KEY = /:spacer(?::(\d+))?$/;

/** The tray a spacer goes into, or a riser carries, by key. */
export function parentKey(addOn: TraySpec): string {
  if (addOn.part === "riser") {
    return addOn.key.endsWith(RISER_SUFFIX) ? addOn.key.slice(0, -RISER_SUFFIX.length) : addOn.key;
  }
  return addOn.key.replace(SPACER_KEY, "");
}

export function partLabel(spec: TraySpec): string {
  if (spec.part === "spacer") {
    const plate = SPACER_KEY.exec(spec.key)?.[1];
    return plate === undefined ? "Card spacer" : `Spacer plate ${plate}`;
  }
  if (spec.part === "riser") {
    return "Riser";
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

export function numberParts(trays: readonly TraySpec[]): NumberedPart[] {
  const main = trays
    .filter((t) => !isAddOn(t))
    .sort((a, b) => a.stack - b.stack || a.level - b.level || compareCodeUnits(a.key, b.key));
  const addOns = trays.filter(isAddOn);
  const used = new Set<TraySpec>();
  const ordered: TraySpec[] = [];
  // The plates of a split spacer go in plate order, whatever order they came in.
  const plateOf = (s: TraySpec): number => Number(SPACER_KEY.exec(s.key)?.[1] ?? 0);
  const take = (kind: TraySpec["part"], t: TraySpec): TraySpec[] =>
    addOns
      .filter((s) => s.part === kind && !used.has(s) && parentKey(s) === t.key)
      .sort((a, b) => plateOf(a) - plateOf(b));
  for (const t of main) {
    // A riser is placed first, then the tray on it, then the addOns that go into the tray.
    for (const r of take("riser", t)) {
      used.add(r);
      ordered.push(r);
    }
    ordered.push(t);
    for (const sp of take("spacer", t)) {
      used.add(sp);
      ordered.push(sp);
    }
  }
  const orphans = addOns.filter((s) => !used.has(s)).sort((a, b) => compareCodeUnits(a.key, b.key));
  ordered.push(...orphans);
  const numberOf = new Map<string, number>();
  ordered.forEach((t, i) => {
    numberOf.set(t.key, i + 1);
  });
  return ordered.map((spec, i) => ({
    number: i + 1,
    spec,
    label: partLabel(spec),
    parentNumber: isAddOn(spec) ? (numberOf.get(parentKey(spec)) ?? null) : null,
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
