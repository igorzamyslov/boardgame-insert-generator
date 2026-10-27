// src/app/fitTest.ts
// The fit test: a small plate of short slices, one for each distinct well of the project, printed
// before the whole insert to see that the real cards and pieces fit. Each slice is an ordinary tray
// (the same builder, wall, floor, corner radius and Fit as the real one) with one well of the real
// inner size and a low rim; nothing about how normal parts are built changes.
import type { Component, Settings, TraySpec } from "../model/types";
import type { NumberedPart } from "../instructions/numbering";
import { componentName, SHORT_NAME_MAX } from "../instructions/naming";
import type { TrayName } from "../instructions/naming";
import { componentIndexOfContents } from "../ui/identity";

/** How tall a slice is, mm: a low ring the real thing drops into. */
export const FIT_RING_MM = 8;

/** A slice's floor, mm: thin, so the plate stays a few grams (the real floor does not decide the fit). */
export const FIT_FLOOR_MM = 0.8;

/** No more slices than this: one plate, a few grams (the first kinds in the plan win). */
export const FIT_SLICE_MAX = 6;

export interface FitSlice {
  part: NumberedPart;
  /** The item the well holds, for the object's name in the file. */
  item: string;
  /** What is cut into the slice. */
  short: string;
}

const isScoop = (s: FitSlice): boolean => s.part.spec.compartments[0]?.kind === "scoop";

/** The characters the engraving font can print: letters, digits, space and hyphen. */
function printable(name: string): string {
  return name
    .replace(/[^A-Za-z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function componentOf(
  c: TraySpec["compartments"][number],
  components: readonly Component[],
): Component | undefined {
  if (c.componentId !== undefined) {
    const found = components.find((k) => k.id === c.componentId);
    if (found !== undefined) {
      return found;
    }
  }
  const at = componentIndexOfContents(c.contents, components);
  return at === null ? undefined : components[at];
}

/**
 * The slices of a plan's trays: for each distinct kind of well (cards, tiles, a figure's pocket…,
 * the first of each in the plan, so copies and alike trays count once) a tray with only that well, cut off low. A spare holds
 * nothing, only one scoop is taken (bulk is loose), and parts that are no tray (spacers, risers)
 * have no well.
 */
export function fitSlices(
  trays: readonly TraySpec[],
  components: readonly Component[],
  settings: Pick<Settings, "floor">,
): FitSlice[] {
  const seen = new Set<string>();
  const slices: FitSlice[] = [];
  for (const tray of trays) {
    if (tray.part !== "tray" && tray.part !== "leftover") {
      continue;
    }
    for (const owner of tray.merged?.members ?? [tray]) {
      for (const c of owner.compartments) {
        // a spare holds nothing; bulk goes in scoops, and one of them says how loose bulk sits
        if (c.kind === "spare" || (c.kind === "scoop" && slices.some((s) => isScoop(s)))) {
          continue;
        }
        const component = componentOf(c, components);
        const item = component === undefined ? c.contents.trim() : componentName(component);
        const id = `${component?.kind ?? item}|${c.kind}`;
        if (seen.has(id) || slices.length >= FIT_SLICE_MAX) {
          continue;
        }
        seen.add(id);
        const n = slices.length + 1;
        const floor = Math.min(FIT_FLOOR_MM, owner.floor > 0 ? owner.floor : settings.floor);
        const key = `fit-${n}`;
        const spec: TraySpec = {
          key,
          part: "tray",
          path: key,
          stack: 1,
          level: 0,
          x: 0,
          y: 0,
          z: 0,
          w: c.w + 2 * owner.wall,
          d: c.d + 2 * owner.wall,
          h: FIT_RING_MM,
          rotated: false,
          wall: owner.wall,
          floor,
          lip: false,
          solid: false,
          compartments: [{ ...c, x: owner.wall, y: owner.wall, floorZ: floor, features: [] }],
        };
        slices.push({
          part: {
            number: n,
            spec,
            label: item === "" ? `Fit test ${n}` : item,
            parentNumber: null,
          },
          item,
          short: shortOf(item, n),
        });
      }
    }
  }
  return slices;
}

/** The label cut into a slice: the item's name, in what the font prints, at most the engraved length. */
function shortOf(item: string, n: number): string {
  const text = printable(item);
  return text === "" ? `Fit ${n}` : text.slice(0, SHORT_NAME_MAX).trim();
}

/** Names for the slices, keyed as the export wants them: the object's name, and the engraved text. */
export function fitNames(slices: readonly FitSlice[]): Map<string, TrayName> {
  return new Map(
    slices.map((s) => [
      s.part.spec.key,
      { full: s.item === "" ? s.part.label : `Fit test: ${s.item}`, short: s.short },
    ]),
  );
}
