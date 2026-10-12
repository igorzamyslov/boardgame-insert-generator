// Test-only builders. Production code never imports this file.
import { expect } from "vitest";
import { planTray } from "../geometry/plan";
import { DEFAULT_SETTINGS, MIN_FEATURE_MM, MIN_SLOT_WIDTH } from "../model/settings";
import type {
  BulkComponent,
  CardsComponent,
  CompartmentSpec,
  Component,
  CustomComponent,
  MinisComponent,
  Settings,
  TilesComponent,
  TraySpec,
} from "../model/types";
import { groupOf } from "../model/defaults";
import { componentOptions } from "./component";
import { combineOptions } from "./group";
import { buildVariants } from "./variants";
import type { OuterSize, RealizedTray, RealizeOptions, TrayPartReq } from "./types";
import { ceilU, floorU, fromU, toU } from "./units";

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

/**
 * The part `partIndex` of variant `variantId` of the first requirement size() would make from
 * `components` (the first component's group), before size() drops the variants whose finger
 * slots do not fit, so tests can realize those too. Built from size()'s own pieces.
 */
export function partOf(
  components: Component[],
  variantId: string,
  settings: Settings = DEFAULT_SETTINGS,
  partIndex = 0,
): TrayPartReq {
  const first = at(components, 0);
  const key = groupOf(first) ?? first.id;
  const members = components.flatMap((c, index) =>
    (groupOf(c) ?? c.id) === key ? [componentOptions(c, settings, index).options] : [],
  );
  const variants = buildVariants({
    key,
    options: combineOptions(members.filter((options) => options.length > 0)),
    players: members.length === 1 ? (first.perPlayer?.players ?? null) : null,
  });
  const variant = variants.find((v) => v.id === variantId);
  if (variant === undefined) {
    throw new Error(`no variant ${variantId}; have ${variants.map((v) => v.id).join(", ")}`);
  }
  return at(variant.parts, partIndex);
}

/**
 * Asserts the contract of a realized tray. The geometry rules (roadmap §4.6: walls, bottom
 * chamfer, reach bands, finger slot placement and clearance, for the tray and its spacers) are
 * planTray's own: the tray must plan without a RangeError. On top of that, in whole 0.01 mm
 * units, what only sizing promises: compartments keep the divider setting apart, floors are at
 * least the floor setting, finger slots are at least min(MIN_SLOT_WIDTH, the width setting), and
 * wall cutouts at most the width setting, their floor notch at most the notch setting.
 */
export function assertTrayInvariants(
  realized: RealizedTray,
  outer: OuterSize,
  settings: Settings,
  opts: RealizeOptions,
): void {
  const gap = ceilU(Math.max(settings.divider, MIN_FEATURE_MM));
  const minFloor = ceilU(Math.max(settings.floor, MIN_FEATURE_MM));
  const minSlot = Math.min(toU(MIN_SLOT_WIDTH), ceilU(settings.fingerPocket.width));
  // A cutout's half-width is a whole unit: the setting, rounded up to an even unit count.
  const maxCut = 2 * Math.ceil(ceilU(settings.fingerPocket.width) / 2);
  const u = (mm: number): number => Math.round(mm * 100);
  const list = realized.compartments;
  list.forEach((c, i) => {
    const label = `compartment ${i} (${c.contents})`;
    expect(u(c.floorZ), `${label} floorZ`).toBeGreaterThanOrEqual(minFloor);
    for (const f of c.features) {
      if (f.type === "fingerPocket") {
        expect(u(f.width), `${label} ${f.side} slot width`).toBeGreaterThanOrEqual(minSlot);
      }
      if (f.type === "wallCutout") {
        expect(u(f.width), `${label} ${f.side} cutout width`).toBeLessThanOrEqual(maxCut);
        expect(u(f.floorNotch), `${label} ${f.side} floor notch`).toBeLessThanOrEqual(
          ceilU(settings.fingerPocket.floorNotch),
        );
      }
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
  const tray: TraySpec = {
    key: "invariants",
    part: "tray",
    path: "",
    stack: 0,
    level: opts.level,
    x: 0,
    y: 0,
    z: 0,
    w: fromU(floorU(outer.w)),
    d: fromU(floorU(outer.d)),
    h: fromU(floorU(outer.h)),
    rotated: false,
    wall: realized.wall,
    floor: fromU(minFloor),
    lip: opts.lipped && settings.lip.enabled,
    solid: false,
    compartments: list,
  };
  for (const spec of [tray, ...realized.spacers]) {
    planTray(spec, settings);
  }
  for (const sp of realized.spacers) {
    expectSpacerNotched(sp, list, u(tray.h));
  }
}

/**
 * A spacer standing in a well that a finger channel crosses is notched to match (spec §6.2): along
 * the channel, on its centre line, at least as wide and at least as deep (whole 0.01 mm units).
 */
function expectSpacerNotched(sp: TraySpec, compartments: CompartmentSpec[], H: number): void {
  const u = (mm: number): number => Math.round(mm * 100);
  const well = compartments.find(
    (c) =>
      u(sp.x) >= u(c.x) &&
      u(sp.x + sp.w) <= u(c.x + c.w) &&
      u(sp.y) >= u(c.y) &&
      u(sp.y + sp.d) <= u(c.y + c.d),
  );
  const top = u(sp.z + sp.h);
  for (const f of well?.features ?? []) {
    if (f.type !== "wallCutout" || H - u(f.depth) >= top) {
      continue;
    }
    const axis = f.side === "left" || f.side === "right" ? "x" : "y";
    const notch = (sp.features ?? []).find((n) => n.type === "spacerNotch");
    const label = `${sp.key}: spacer notch for the ${f.side} channel`;
    expect(notch?.type === "spacerNotch" && notch.axis, label).toBe(axis);
    if (notch?.type === "spacerNotch") {
      expect(u(notch.at), `${label} centre`).toBe(u(f.at) - u(axis === "x" ? sp.y : sp.x));
      expect(u(notch.width), `${label} width`).toBeGreaterThanOrEqual(u(f.width));
      expect(top - u(notch.depth), `${label} bottom`).toBeLessThanOrEqual(H - u(f.depth));
    }
  }
}
