// src/app/fitTest.ts
// The fit test: a small plate of short slices, one for each kind of well of the project, printed
// before the whole insert to see that the real cards and pieces fit (loose bits always fit a bin, so
// they get none). Each slice is an ordinary tray (the same builder, wall, floor, corner radius and
// Fit as the real one) with one well of the real inner size and a low rim; nothing about how normal
// parts are built changes.
import type { CompartmentSpec, Component, Settings, TraySpec } from "../model/types";
import { cardDims } from "../sizing/cards";
import type { NumberedPart } from "../instructions/numbering";
import { componentName, SHORT_NAME_MAX } from "../instructions/naming";
import type { TrayName } from "../instructions/naming";
import { componentIndexOfContents } from "../ui/identity";

/** The guide's line on the fit test (DESIGN §7: "The Download dialog offers a fit test"). */
export const FIT_GUIDE_LINE =
  "Before printing, the fit test in Download checks your cards and pieces fit. If they are tight, set Fit to Loose in Settings, or give the item its own clearance.";

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
 * The sizes of the piece a well holds, mm, that its inner size is measured against: a card's two
 * sides and the thickness of its deck, a tile's sides and its stack, a figure's three sizes. Empty
 * when the item is not known (bulk is never asked: it gets no slice).
 */
function pieceSizes(c: CompartmentSpec, component: Component | undefined, s: Settings): number[] {
  if (component === undefined) {
    return [];
  }
  const count = Number(/×(\d+)$/.exec(c.contents.trim())?.[1] ?? NaN);
  switch (component.kind) {
    case "cards": {
      const { S, L, t } = cardDims(component, s, 0).dims;
      const counts = Number.isFinite(count) ? [count] : component.decks.map((d) => d.count);
      return [S, L, ...counts.map((n) => n * t)];
    }
    case "tiles": {
      const { shape } = component;
      const sides =
        shape.type === "rect"
          ? [shape.w, shape.d]
          : [shape.flatToFlat, shape.flatToFlat / Math.cos(Math.PI / 6)];
      return [...sides, component.count * component.thickness];
    }
    case "minis":
      return component.figures.flatMap((f) => [f.w, f.d, f.h]);
    case "custom":
      return [component.w, component.d, component.h];
    default:
      return [];
  }
}

/**
 * How tight a well is: the least spare room, mm, between its inner size and the piece it holds
 * (the clearance, the well's inner size minus the piece's own). Each side of the well is measured
 * against the largest piece size that is not over it, and the least of the two counts: for a deck
 * on its edge that is its thickness, for a flat one its card size. Absent when the piece's size is
 * not known; then the larger well counts as the tighter.
 */
function spareRoom(
  c: CompartmentSpec,
  component: Component | undefined,
  s: Settings,
): number | undefined {
  const sizes = pieceSizes(c, component, s);
  const spare = [c.w, c.d].map((side) => {
    const fits = sizes.filter((v) => v <= side + 0.01);
    return fits.length === 0 ? undefined : side - Math.max(...fits);
  });
  const known = spare.filter((v): v is number => v !== undefined);
  return known.length === 0 ? undefined : Math.min(...known);
}

interface Candidate {
  owner: TraySpec;
  c: CompartmentSpec;
  item: string;
  room?: number;
  /** A deck's thickness, mm (cards only): count × per-card thickness. */
  stack?: number;
  area: number;
}

/**
 * Whether `a` is the better well to test than `b`. Cards: the THICKER deck (the one that springs
 * and fans most; every deck of a card size shares a footprint, so it tests that too), then the less
 * spare room. Anything else: the tighter well, the one with less spare room, else (not known) the
 * larger well.
 */
function tighter(a: Candidate, b: Candidate): boolean {
  if (a.stack !== undefined && b.stack !== undefined && Math.abs(a.stack - b.stack) > 0.01) {
    return a.stack > b.stack;
  }
  if (a.room !== undefined && b.room !== undefined) {
    return a.room < b.room - 1e-6;
  }
  return a.area > b.area + 1e-6;
}

/**
 * The slices of a plan's trays: for each kind of well (cards, tiles, a figure's pocket…) the one
 * most likely to go wrong, a tray with only that well, cut off low. For cards it is the THICKEST
 * deck (count × card thickness; a thin deck is a flimsy sliver, and a thick sleeved one is what
 * springs), ties to the least spare room. For tiles, figures and custom pieces it is the TIGHTEST
 * well, the one with the least spare room around its piece (`spareRoom`). The first wins a tie, so copies and alike trays count once. A spare holds nothing,
 * bulk is loose and always fits a bin (no scoop gets a slice), and parts that are no tray (spacers,
 * risers) have no well.
 */
export function fitSlices(
  trays: readonly TraySpec[],
  components: readonly Component[],
  settings: Settings,
): FitSlice[] {
  const best = new Map<string, Candidate>();
  for (const tray of trays) {
    if (tray.part !== "tray" && tray.part !== "leftover") {
      continue;
    }
    for (const owner of tray.merged?.members ?? [tray]) {
      for (const c of owner.compartments) {
        if (c.kind === "spare" || c.kind === "scoop") {
          continue;
        }
        const component = componentOf(c, components);
        const item = component === undefined ? c.contents.trim() : componentName(component);
        const id = `${component?.kind ?? item}|${c.kind}`;
        const room = spareRoom(c, component, settings);
        const count = Number(/×(\d+)$/.exec(c.contents.trim())?.[1] ?? NaN);
        const stack =
          component?.kind === "cards" && Number.isFinite(count)
            ? count * cardDims(component, settings, 0).dims.t
            : undefined;
        const candidate: Candidate = {
          ...(stack === undefined ? {} : { stack }),
          owner,
          c,
          item,
          area: c.w * c.d,
          ...(room === undefined ? {} : { room }),
        };
        const held = best.get(id);
        if (held === undefined || tighter(candidate, held)) {
          best.set(id, candidate);
        }
      }
    }
  }
  // the first kinds in the plan win (a Map keeps the order each kind first appeared in)
  return [...best.values()].slice(0, FIT_SLICE_MAX).map(({ owner, c, item }, i) => {
    const n = i + 1;
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
    return {
      part: { number: n, spec, label: item === "" ? `Fit test ${n}` : item, parentNumber: null },
      item,
      short: shortOf(item, n),
    };
  });
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
