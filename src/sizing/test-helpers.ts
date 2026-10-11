// Test-only builders. Production code never imports this file.
import { expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  MIN_FEATURE_MM,
  SLOT_CONTENT_OVERLAP,
  maxChannelSpacing,
} from "../model/settings";
import type {
  BulkComponent,
  CardsComponent,
  CompartmentSpec,
  Component,
  CustomComponent,
  MinisComponent,
  Settings,
  Side,
  TilesComponent,
} from "../model/types";
import { MIN_POCKET_CONTENT } from "./constants";
import { size } from "./group";
import { chamferMinimumsU, wallFor } from "./outer";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, floorU, fromU, maxOf, toU } from "./units";

/** Index access for tests under noUncheckedIndexedAccess: throws instead of returning undefined. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no element at index ${index} (length ${items.length})`);
  }
  return item;
}

export function cards(over: Partial<CardsComponent> = {}): CardsComponent {
  return {
    id: "c1",
    name: "Cards",
    access: "sometimes",
    kind: "cards",
    shortSide: 63.5,
    longSide: 88,
    decks: [{ name: "Main", count: 52 }],
    sleeve: "standard",
    thickness: { mode: "preset" },
    storage: "upright-long",
    ...over,
  };
}

export function bulk(over: Partial<BulkComponent> = {}): BulkComponent {
  return {
    id: "b1",
    name: "Bits",
    access: "sometimes",
    kind: "bulk",
    items: [{ name: "Cubes", count: 30, w: 10, d: 10, h: 10 }],
    ...over,
  };
}

export function tiles(over: Partial<TilesComponent> = {}): TilesComponent {
  return {
    id: "t1",
    name: "Hexes",
    access: "sometimes",
    kind: "tiles",
    shape: { type: "hex", flatToFlat: 40, orientation: "flat" },
    thickness: 2,
    count: 60,
    storage: "flat",
    ...over,
  };
}

export function minis(over: Partial<MinisComponent> = {}): MinisComponent {
  return {
    id: "m1",
    name: "Minis",
    access: "sometimes",
    kind: "minis",
    figures: [{ name: "Hero", w: 25, d: 25, h: 40, count: 2 }],
    storage: "pockets",
    ...over,
  };
}

export function custom(over: Partial<CustomComponent> = {}): CustomComponent {
  return {
    id: "x1",
    name: "Dial",
    access: "sometimes",
    kind: "custom",
    w: 40,
    d: 30,
    h: 10,
    count: 2,
    ...over,
  };
}

/** The part `partIndex` of variant `variantId` of the first requirement of `size(components)`. */
export function partOf(
  components: Component[],
  variantId: string,
  settings: Settings = DEFAULT_SETTINGS,
  partIndex = 0,
): TrayPartReq {
  const req = at(size(components, settings).requirements, 0);
  const variant = req.variants.find((v) => v.id === variantId);
  if (variant === undefined) {
    throw new Error(`no variant ${variantId}; have ${req.variants.map((v) => v.id).join(", ")}`);
  }
  return at(variant.parts, partIndex);
}

/**
 * Asserts the geometry contract of a realized tray (roadmap §4.6) in whole 0.01 mm units:
 * the tray and its spacers are big enough for their bottom chamfer, compartments keep a divider
 * apart and a wall from every outer face, floors sit inside the tray, reach bands leave at least
 * MIN_POCKET_CONTENT for the contents on both axes, finger pockets have a positive width, reach
 * and depth, finger slots stay between the inner faces, and finger slots keep clear of other
 * compartments and their slots (assertSlotClearance).
 */
export function assertTrayInvariants(
  realized: RealizedTray,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): void {
  const wall = ceilU(wallFor(settings, opts.lipped));
  const gap = ceilU(Math.max(settings.divider, MIN_FEATURE_MM));
  const minFloor = ceilU(Math.max(settings.floor, MIN_FEATURE_MM));
  const u = (mm: number): number => Math.round(mm * 100);
  const W = floorU(outer.w);
  const D = floorU(outer.d);
  const H = floorU(outer.h);
  const chamfer = chamferMinimumsU(settings, opts.level);
  expect(Math.min(W, D), "tray footprint vs bottom chamfer").toBeGreaterThanOrEqual(chamfer.side);
  expect(H, "tray height vs bottom chamfer").toBeGreaterThanOrEqual(chamfer.h);
  const spacerChamfer = chamferMinimumsU(settings, 0);
  for (const sp of realized.spacers) {
    expect(
      Math.min(u(sp.w), u(sp.d)),
      `${sp.key} footprint vs bottom chamfer`,
    ).toBeGreaterThanOrEqual(spacerChamfer.side);
    expect(u(sp.h), `${sp.key} height vs bottom chamfer`).toBeGreaterThanOrEqual(spacerChamfer.h);
  }
  const list = realized.compartments;
  list.forEach((c, i) => {
    const label = `compartment ${i} (${c.contents})`;
    expect(u(c.x), `${label} x`).toBeGreaterThanOrEqual(wall);
    expect(u(c.y), `${label} y`).toBeGreaterThanOrEqual(wall);
    expect(u(c.x + c.w), `${label} x end`).toBeLessThanOrEqual(W - wall);
    expect(u(c.y + c.d), `${label} y end`).toBeLessThanOrEqual(D - wall);
    expect(u(c.floorZ), `${label} floorZ`).toBeGreaterThanOrEqual(minFloor);
    expect(u(c.floorZ), `${label} floorZ`).toBeLessThan(H);
    // The geometry's content rectangle: the compartment minus each side's deepest reach band.
    const band = (side: string): number =>
      maxOf(
        c.features.flatMap((f) =>
          f.type === "fingerPocket" && f.side === side ? [u(f.reach)] : [],
        ),
      );
    const minContent = toU(MIN_POCKET_CONTENT);
    expect(u(c.w) - band("left") - band("right"), `${label} content width`).toBeGreaterThanOrEqual(
      minContent,
    );
    expect(u(c.d) - band("front") - band("back"), `${label} content depth`).toBeGreaterThanOrEqual(
      minContent,
    );
    for (const f of c.features) {
      if (f.type !== "fingerPocket") {
        continue;
      }
      expect(u(f.width), `${label} pocket width`).toBeGreaterThan(0);
      expect(u(f.reach), `${label} pocket reach`).toBeGreaterThan(0);
      expect(u(f.depth), `${label} pocket depth`).toBeGreaterThan(0);
      const alongX = f.side === "front" || f.side === "back";
      const lo = wall;
      const hi = (alongX ? W : D) - wall;
      // Edges sit on half units for an odd width, so compare in half units: 2·edge = 2·at ∓ width.
      const centre = Math.round(f.at * 200);
      const width = u(f.width);
      expect(centre - width, `${label} slot start`).toBeGreaterThanOrEqual(2 * lo);
      expect(centre + width, `${label} slot end`).toBeLessThanOrEqual(2 * hi);
    }
    for (const other of list.slice(i + 1)) {
      const apartX = Math.max(u(other.x) - u(c.x + c.w), u(c.x) - u(other.x + other.w));
      const apartY = Math.max(u(other.y) - u(c.y + c.d), u(c.y) - u(other.y + other.d));
      expect(
        Math.max(apartX, apartY),
        `${label} and ${other.contents} must be ≥ ${fromU(gap)} mm apart`,
      ).toBeGreaterThanOrEqual(gap);
    }
  });
  assertSlotClearance(list, H);
}

/** A rectangle in doubled 0.01 mm units: slot edges sit on half units when the width is odd. */
interface Rect2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Slot2 extends Rect2 {
  side: Side;
  centre: number; // along the side, doubled
  width: number; // units
  bottom: number; // units
}

/** How far apart two rectangles are along the axis that separates them most (< 0: overlap). */
function separation(a: Rect2, b: Rect2): number {
  return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
}

/** Slots on one band line: same side, band, width and depth (they may merge). */
function twins(a: Slot2, b: Slot2): boolean {
  const alongX = a.side === "front" || a.side === "back";
  return (
    a.side === b.side &&
    a.width === b.width &&
    a.bottom === b.bottom &&
    (alongX ? a.y0 === b.y0 && a.y1 === b.y1 : a.x0 === b.x0 && a.x1 === b.x1)
  );
}

interface Cut {
  rect: Rect2; // the compartment rectangle, doubled
  content: Rect2; // minus its reach bands
  slots: Slot2[];
}

/** The well and slot footprints planTray cuts for `c` (plan 3 planCompartment), doubled. */
function cutOf(c: CompartmentSpec, H: number): Cut {
  const u = (mm: number): number => Math.round(mm * 100);
  const band = (side: Side): number =>
    maxOf(
      c.features.flatMap((f) => (f.type === "fingerPocket" && f.side === side ? [u(f.reach)] : [])),
    );
  const rect: Rect2 = {
    x0: 2 * u(c.x),
    y0: 2 * u(c.y),
    x1: 2 * (u(c.x) + u(c.w)),
    y1: 2 * (u(c.y) + u(c.d)),
  };
  const content: Rect2 = {
    x0: rect.x0 + 2 * band("left"),
    y0: rect.y0 + 2 * band("front"),
    x1: rect.x1 - 2 * band("right"),
    y1: rect.y1 - 2 * band("back"),
  };
  // Slots run SLOT_CONTENT_OVERLAP into the contents, at most half of them.
  const intoY = Math.min(2 * toU(SLOT_CONTENT_OVERLAP), (content.y1 - content.y0) / 2);
  const intoX = Math.min(2 * toU(SLOT_CONTENT_OVERLAP), (content.x1 - content.x0) / 2);
  const slots = c.features.flatMap((f): Slot2[] => {
    if (f.type !== "fingerPocket") {
      return [];
    }
    const centre = Math.round(f.at * 200);
    const width = u(f.width);
    const [lo, hi] = [centre - width, centre + width];
    const slot = { side: f.side, centre, width, bottom: H - Math.min(u(f.depth), H - u(c.floorZ)) };
    switch (f.side) {
      case "front":
        return [{ ...slot, x0: lo, x1: hi, y0: rect.y0, y1: content.y0 + intoY }];
      case "back":
        return [{ ...slot, x0: lo, x1: hi, y0: content.y1 - intoY, y1: rect.y1 }];
      case "left":
        return [{ ...slot, x0: rect.x0, x1: content.x0 + intoX, y0: lo, y1: hi }];
      case "right":
        return [{ ...slot, x0: content.x1 - intoX, x1: rect.x1, y0: lo, y1: hi }];
    }
  });
  return { rect, content, slots };
}

/**
 * Whether `other` (a compartment's contents) reaches into `slot` of a compartment with contents
 * `own` only within the slot's overlap into those contents, i.e. it lies on the contents side of
 * the reach band and does not stop short of the slot's end.
 */
function onlyInOverlap(slot: Slot2, own: Rect2, other: Rect2): boolean {
  switch (slot.side) {
    case "front":
      return other.y0 >= own.y0 && other.y0 <= slot.y1;
    case "back":
      return other.y1 <= own.y1 && other.y1 >= slot.y0;
    case "left":
      return other.x0 >= own.x0 && other.x0 <= slot.x1;
    case "right":
      return other.x1 <= own.x1 && other.x1 >= slot.x0;
  }
}

/**
 * The finger slot clearance rule (roadmap §4.6) in doubled units:
 * - every finger slot keeps MIN_FEATURE_MM (along x or y) from the contents of every other
 *   compartment, unless those only reach into its overlap into its own contents;
 * - slots of different compartments keep MIN_FEATURE_MM apart, except twins (one band line:
 *   same side, band, width and depth): taken in order along the side, neighbouring twins either
 *   keep MIN_FEATURE_MM apart or merge, centres at most maxChannelSpacing apart.
 */
function assertSlotClearance(list: readonly CompartmentSpec[], H: number): void {
  const min = 2 * ceilU(MIN_FEATURE_MM);
  const cuts = list.map((c) => cutOf(c, H));
  const slots = cuts.flatMap((cut, owner) => cut.slots.map((slot) => ({ owner, slot })));
  const name = (i: number): string => `compartment ${i} (${list[i]?.contents})`;
  for (const { owner, slot } of slots) {
    const own = cuts[owner];
    cuts.forEach((other, j) => {
      if (j !== owner && own !== undefined && !onlyInOverlap(slot, own.content, other.content)) {
        expect(
          separation(slot, other.content),
          `${name(owner)} ${slot.side} slot must keep ${MIN_FEATURE_MM} mm from ${name(j)}`,
        ).toBeGreaterThanOrEqual(min);
      }
    });
    for (const t of slots) {
      if (t.owner !== owner && !twins(slot, t.slot)) {
        expect(
          separation(slot, t.slot),
          `${name(owner)} ${slot.side} slot must keep ${MIN_FEATURE_MM} mm from the ${t.slot.side} slot of ${name(t.owner)}`,
        ).toBeGreaterThanOrEqual(min);
      }
    }
    // Its next twin along the side.
    const next = slots
      .filter((t) => twins(slot, t.slot) && t.slot.centre > slot.centre)
      .sort((a, b) => a.slot.centre - b.slot.centre)[0];
    if (next !== undefined) {
      const spacing = (next.slot.centre - slot.centre) / 200;
      if (spacing > maxChannelSpacing(slot.width / 200)) {
        expect(
          separation(slot, next.slot),
          `${name(owner)} ${slot.side} slot must keep ${MIN_FEATURE_MM} mm from the slot of ${name(next.owner)} or merge with it`,
        ).toBeGreaterThanOrEqual(min);
      }
    }
  }
}
