// src/instructions/numbering.ts
import { lipAbove, rimOn, slabUnder } from "../model/lip";
import { carriesName } from "../model/part-name";
import type { Settings, TraySpec } from "../model/types";
import { isAddOn } from "../plan/layers";
import { RISER_SUFFIX } from "../sizing/constants";
import { compareCodeUnits } from "../util/compare";

export interface NumberedPart {
  /**
   * The place of the part in assembly order, 1 up. An ordering key in code (sorting, linking a
   * part to the tray it goes into); never shown or engraved: parts are known by `trayNames`.
   */
  number: number;
  spec: TraySpec;
  label: string;
  /** For addOns: the number of the tray they go into. For a riser: the tray that stands on it. */
  parentNumber: number | null;
}

/** A spacer's key ends `:spacer`, or `:spacer:<n>` for plate n of several (splitSeparators). */
const SPACER_KEY = /:spacer(?::(\d+))?$/;

/** A divider's key ends `:divider:<n>` (splitDividers). */
const DIVIDER_KEY = /:divider:(\d+)$/;

/** The tray a spacer goes into, or a riser carries, by key. */
export function parentKey(addOn: TraySpec): string {
  if (addOn.part === "riser") {
    return addOn.key.endsWith(RISER_SUFFIX) ? addOn.key.slice(0, -RISER_SUFFIX.length) : addOn.key;
  }
  return addOn.key.replace(addOn.part === "divider" ? DIVIDER_KEY : SPACER_KEY, "");
}

export function partLabel(spec: TraySpec): string {
  if (spec.part === "divider") {
    return `Divider ${DIVIDER_KEY.exec(spec.key)?.[1] ?? ""}`.trim();
  }
  if (spec.part === "spacer") {
    const plate = SPACER_KEY.exec(spec.key)?.[1];
    return plate === undefined ? "Card spacer" : `Spacer plate ${plate}`;
  }
  if (spec.part === "riser") {
    return "Riser";
  }
  if (spec.part === "leftover") {
    if (spec.merged) {
      return spec.solid ? "Merged spacer block" : "Merged spare tray";
    }
    return spec.solid ? "Spacer block" : "Spare tray";
  }
  const names: string[] = [];
  for (const c of spec.compartments) {
    if (c.kind !== "spare" && c.contents !== "" && !names.includes(c.contents)) {
      names.push(c.contents);
    }
  }
  return names.length > 0 ? names.join(" + ") : spec.key;
}

/** Tolerance when two heights count as meeting, mm (the grid is 0.01). */
const MEET = 0.05;

/** Whether the footprints of two boxes overlap by more than an edge. */
function overlapsInPlan(a: TraySpec, b: TraySpec): boolean {
  return (
    a.x < b.x + b.w - MEET &&
    b.x < a.x + a.w - MEET &&
    a.y < b.y + b.d - MEET &&
    b.y < a.y + a.d - MEET
  );
}

/**
 * Where a merged part goes among the numbered parts: after every tray it rests on, and otherwise
 * first, so it goes in before every tray that rests on it or stands against it (a riser folded
 * into it carries its tray; a filler beside a tray is dropped in before the tray goes in beside
 * it). A member that rests on a tray (a filler in a stack level, whose floor is the top of the
 * tray below) can only be placed once that tray is, so the part follows the last such tray and
 * the parts that go into it.
 */
function mergedPosition(merged: TraySpec, ordered: readonly TraySpec[]): number {
  let after = -1;
  ordered.forEach((t, i) => {
    if (t.part !== "tray") {
      return;
    }
    const carries = (merged.merged?.members ?? []).some(
      (m) => m.z > MEET && Math.abs(t.z + t.h - m.z) <= MEET && overlapsInPlan(t, m),
    );
    if (carries) {
      // The tray's own spacers come right after it.
      let last = i;
      while (
        ordered[last + 1] !== undefined &&
        (ordered[last + 1]?.part === "spacer" || ordered[last + 1]?.part === "divider")
      ) {
        last += 1;
      }
      after = Math.max(after, last);
    }
  });
  return after + 1;
}

export function numberParts(trays: readonly TraySpec[]): NumberedPart[] {
  const main = trays
    .filter((t) => !isAddOn(t) && t.merged === undefined)
    .sort((a, b) => a.stack - b.stack || a.level - b.level || compareCodeUnits(a.key, b.key));
  const addOns = trays.filter(isAddOn);
  const used = new Set<TraySpec>();
  const ordered: TraySpec[] = [];
  // The plates of a split spacer go in plate order, whatever order they came in.
  const plateOf = (s: TraySpec): number =>
    Number((s.part === "divider" ? DIVIDER_KEY : SPACER_KEY).exec(s.key)?.[1] ?? 0);
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
    for (const dv of take("divider", t)) {
      used.add(dv);
      ordered.push(dv);
    }
  }
  const orphans = addOns.filter((s) => !used.has(s)).sort((a, b) => compareCodeUnits(a.key, b.key));
  ordered.push(...orphans);
  // Merged fillers, in key order, each at the first place that has what it rests on in.
  const joined = trays
    .filter((t) => t.merged !== undefined)
    .sort((a, b) => compareCodeUnits(a.key, b.key));
  for (const m of joined) {
    // After the merged parts already in place there, so equal places keep key order.
    let at = mergedPosition(m, ordered);
    while (ordered[at]?.merged !== undefined) {
      at += 1;
    }
    ordered.splice(at, 0, m);
  }
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

/**
 * The spec to build a printed part from: with its short name to engrave (`partName`; `name` is
 * the part's `short` from trayNames) when `engrave` (settings.engraveNames) is on and the part is
 * of a kind that carries one. The name is the one every screen and the assembly page give the
 * part, so the printed part can be found in its step.
 */
export function buildSpecOf(
  part: NumberedPart,
  engrave: boolean,
  name: string | undefined,
): TraySpec {
  return engrave && name !== undefined && name !== "" && carriesName(part.spec.part)
    ? { ...part.spec, partName: name }
    : part.spec;
}

export function partsByKey(parts: readonly NumberedPart[]): Map<string, NumberedPart> {
  return new Map(parts.map((p) => [p.spec.key, p]));
}

/**
 * The height a tray prints at: `spec.h` plus the lip a lipped tray carries on top, or the slab a
 * stepped one hangs below it (plan 4's over-bed and `layout.bed` notices report this height), on
 * the 0.01 mm grid.
 */
export function printedHeight(spec: TraySpec, settings: Settings): number {
  return Math.round(printedTop(spec, settings) * 100) / 100;
}

/**
 * The height from the part's floor to its highest point, mm. A merged part has no lip of its own
 * (`lip` is false): it is built from its members, so a riser member carries its lip on top of the
 * part's box, and the part stands as tall as the highest member with its lip.
 */
function printedTop(spec: TraySpec, settings: Settings): number {
  const own = spec.h + lipAbove(settings, spec.lip) + slabUnder(settings, spec);
  if (spec.merged === undefined) {
    return own;
  }
  return spec.merged.members.reduce(
    (top, m) => Math.max(top, m.z + m.h + lipAbove(settings, m.lip) - spec.z),
    own,
  );
}

/**
 * "W × D × H mm" with the printed height; a lipped tray says so (its H includes the lip), and so
 * does a tray with the stepped base's step under it (its H includes the step).
 */
export function outerSizeText(spec: TraySpec, settings: Settings): string {
  const height = printedHeight(spec, settings);
  const size = `${spec.w.toFixed(1)} × ${spec.d.toFixed(1)} × ${height.toFixed(1)} mm`;
  if (slabUnder(settings, spec) > 0) {
    return `${size} with its step`;
  }
  // a merged part says so when its height includes a member's lip (it stands above the part's box)
  const lipped = spec.merged === undefined ? spec.lip && rimOn(settings) : height > spec.h;
  return lipped ? `${size} with its lip` : size;
}
