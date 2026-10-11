// Test-only builders. Production code never imports this file.
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
import { size } from "./group";
import type { TrayPartReq } from "./types";

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
