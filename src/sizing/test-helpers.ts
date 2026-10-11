// Test-only builders. Production code never imports this file.
import { expect } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type {
  BulkComponent,
  CardsComponent,
  Component,
  CustomComponent,
  MinisComponent,
  Settings,
  TilesComponent,
} from "../model/types";
import { MIN_FEATURE } from "./constants";
import { size } from "./group";
import { wallFor } from "./outer";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, floorU, fromU } from "./units";

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
 * compartments keep a divider apart and a wall from every outer face, floors sit inside the
 * tray, and finger slots stay between the inner faces.
 */
export function assertTrayInvariants(
  realized: RealizedTray,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): void {
  const wall = ceilU(wallFor(settings, opts.lipped));
  const gap = ceilU(Math.max(settings.divider, MIN_FEATURE));
  const minFloor = ceilU(Math.max(settings.floor, MIN_FEATURE));
  const u = (mm: number): number => Math.round(mm * 100);
  const W = floorU(outer.w);
  const D = floorU(outer.d);
  const H = floorU(outer.h);
  const list = realized.compartments;
  list.forEach((c, i) => {
    const label = `compartment ${i} (${c.contents})`;
    expect(u(c.x), `${label} x`).toBeGreaterThanOrEqual(wall);
    expect(u(c.y), `${label} y`).toBeGreaterThanOrEqual(wall);
    expect(u(c.x + c.w), `${label} x end`).toBeLessThanOrEqual(W - wall);
    expect(u(c.y + c.d), `${label} y end`).toBeLessThanOrEqual(D - wall);
    expect(u(c.floorZ), `${label} floorZ`).toBeGreaterThanOrEqual(minFloor);
    expect(u(c.floorZ), `${label} floorZ`).toBeLessThan(H);
    for (const f of c.features) {
      if (f.type !== "fingerPocket") {
        continue;
      }
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
}
