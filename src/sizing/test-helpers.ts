// Test-only builders. Production code never imports this file.
import type {
  BulkComponent,
  CardsComponent,
  CustomComponent,
  MinisComponent,
  TilesComponent,
} from "../model/types";

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
