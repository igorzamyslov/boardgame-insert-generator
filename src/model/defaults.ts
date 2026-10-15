import { deepFreeze } from "./freeze";
import { newId } from "./ids";
import { BAMBU_256_BED, STANDARD_CARD } from "./presets";
import { DEFAULT_SETTINGS } from "./settings";
import type {
  Access,
  Box,
  CardsComponent,
  Component,
  ComponentKind,
  GrowthAxis,
  GrowthMode,
  MinisComponent,
  Printer,
  Project,
  Sleeve,
  TileShape,
  TilesComponent,
} from "./types";
import { APP_VERSION, SCHEMA_VERSION } from "./version";

/**
 * Box for a new project. Its headroom, headroomCoverage and storedOnSide also
 * fill files that lack them (spec §9). Frozen: projects copy it, never alias it.
 */
export const DEFAULT_BOX: Box = Object.freeze({
  innerWidth: 285,
  innerDepth: 285,
  innerHeight: 70,
  headroom: 0,
  headroomCoverage: "full",
  storedOnSide: false,
});

/**
 * Printer for a new project. bedMargin and layerHeight also fill files that lack them.
 * Frozen: projects copy it, never alias it.
 */
export const DEFAULT_PRINTER: Printer = Object.freeze({
  bedX: BAMBU_256_BED.bedX,
  bedY: BAMBU_256_BED.bedY,
  bedZ: BAMBU_256_BED.bedZ,
  bedMargin: 5,
  layerHeight: 0.2,
});

export const DEFAULT_PROJECT_NAME = "Untitled insert";

/** Default display name per component kind. Frozen. */
export const KIND_NAMES: Record<ComponentKind, string> = deepFreeze({
  cards: "Cards",
  bulk: "Bits",
  tiles: "Tiles",
  minis: "Miniatures",
  custom: "Item",
});

/**
 * Spec §5 defaults of the component fields a file may leave out. newComponent
 * uses them, and the reader fills missing fields with them. Frozen: copy the
 * nested `thickness` object, never alias it.
 */
export const COMPONENT_DEFAULTS: {
  access: Access;
  cards: {
    sleeve: Exclude<Sleeve, object>;
    thickness: { mode: "preset" };
    storage: CardsComponent["storage"];
  };
  tiles: {
    storage: TilesComponent["storage"];
    hexOrientation: Extract<TileShape, { type: "hex" }>["orientation"];
  };
  minis: { storage: MinisComponent["storage"] };
} = deepFreeze({
  access: "sometimes",
  cards: { sleeve: "none", thickness: { mode: "preset" }, storage: "auto" },
  tiles: { storage: "auto", hexOrientation: "flat" },
  minis: { storage: "pockets" },
});

/** Stored like bulk: bulk components and minis stored as bulk. */
function bulkLike(c: Component): boolean {
  return c.kind === "bulk" || (c.kind === "minis" && c.storage === "bulk");
}

/** The three per-component toggles, resolved (spec §5). */
export interface Toggles {
  fingerCuts: boolean;
  curvedFloor: boolean;
  cornerReliefs: boolean;
}

/**
 * The toggles of a component of its kind (and storage) that sets none, as before the toggles:
 * finger cuts on cards, tiles, minis pockets and custom wells; a curved floor on bulk (and minis
 * stored as bulk); corner reliefs in tiles and custom wells.
 */
function kindDefaults(c: Component): Toggles {
  return {
    fingerCuts: !bulkLike(c),
    curvedFloor: bulkLike(c),
    cornerReliefs: c.kind === "tiles" || c.kind === "custom",
  };
}

/** Whether the component's compartments get finger cuts (spec §5, §6.1). */
export function fingerCutsOn(c: Component): boolean {
  return c.fingerCuts ?? kindDefaults(c).fingerCuts;
}

/**
 * Whether the component's compartments get a curved floor, the scoop ramp (spec §5, §6.1). Never
 * for cards or tiles: cards would bend and upright items tilt (validation refuses it there).
 */
export function curvedFloorOn(c: Component): boolean {
  if (c.kind === "cards" || c.kind === "tiles") {
    return false;
  }
  return c.curvedFloor ?? kindDefaults(c).curvedFloor;
}

/** Whether the component's compartments get Ø 3 mm corner reliefs (spec §5, §6.1). */
export function cornerReliefsOn(c: Component): boolean {
  return c.cornerReliefs ?? kindDefaults(c).cornerReliefs;
}

/**
 * The growth axes a component offers, in the user's terms (minimal-trays spec §5, the table of
 * defaults): the ones where more room holds more of its contents, or at least a looser fit.
 * Everything else cannot grow at all, and is not offered: a card well's width and length (cards
 * slide), a tile's footprint, a minis pocket's depth (a figure's height is fixed).
 */
export function growthAxesOf(c: Component): readonly GrowthAxis[] {
  switch (c.kind) {
    case "cards":
    case "tiles":
      return ["stack"];
    case "bulk":
    case "custom":
      return ["w", "d", "h"];
    case "minis":
      return c.storage === "bulk" ? ["w", "d", "h"] : ["w", "d"];
    default: {
      const unreachable: never = c;
      return unreachable;
    }
  }
}

/**
 * The growth of `axis` for a component that sets none (spec §5): `auto` wherever extra room means
 * more pieces (loose pieces on every axis, a deck or stack of tiles standing up along its stack),
 * `off` where it only adds slop (a deck or stack lying flat grows taller only when asked: the
 * box's spare height belongs to a riser under the tray; pockets and custom wells). `lying` says a
 * card deck or tile stack lies flat, which is what the stack axis is then (its height).
 */
export function defaultGrowth(c: Component, axis: GrowthAxis, lying = false): GrowthMode {
  if (!growthAxesOf(c).includes(axis)) {
    return "off";
  }
  switch (c.kind) {
    case "bulk":
      return "auto";
    case "minis":
      return bulkLike(c) ? "auto" : "off";
    case "cards":
    case "tiles":
      return lying ? "off" : "auto";
    case "custom":
      return "off";
    default: {
      const unreachable: never = c;
      return unreachable;
    }
  }
}

/**
 * How far the component's contents may be given more room along `axis` (spec §5): what it set,
 * else the kind's default. An axis the kind does not offer (`growthAxesOf`) is always `off`.
 */
export function growthOf(c: Component, axis: GrowthAxis, lying = false): GrowthMode {
  if (!growthAxesOf(c).includes(axis)) {
    return "off";
  }
  return c.growth?.[axis] ?? defaultGrowth(c, axis, lying);
}

/**
 * The growth of a component stored loose in a scoop bin, its bulk fallback (spec §7.1): what it
 * set on that axis (width, length and height are the bin's), else bulk's `auto`.
 */
export function binGrowthOf(c: Component, axis: "w" | "d" | "h"): GrowthMode {
  return c.growth?.[axis] ?? "auto";
}

/**
 * The component with `axis` set to `mode`, or with it cleared (undefined: the kind's default).
 * An emptied `growth` is dropped, so a component that sets nothing stays as it was.
 */
export function withGrowth<C extends Component>(
  c: C,
  axis: GrowthAxis,
  mode: GrowthMode | undefined,
): C {
  const rest = Object.fromEntries(Object.entries(c.growth ?? {}).filter(([key]) => key !== axis));
  const growth = mode === undefined ? rest : { ...rest, [axis]: mode };
  const others = Object.fromEntries(Object.entries(c).filter(([key]) => key !== "growth"));
  return (Object.keys(growth).length === 0 ? others : { ...others, growth }) as C;
}

/**
 * How many loose plates the component's spacer (the room it grows into) is printed as, before the plates that
 * would come out too thin are dropped (spec §6.2). 1, the single spacer block, unless set.
 */
export function separatorsOf(c: Component): number {
  return c.separators ?? 1;
}

/** The component with `separators` set to `n`; 1 is the default, so it is stored as nothing. */
export function withSeparators<C extends Component>(c: C, n: number): C {
  if (n !== 1) {
    return { ...c, separators: n };
  }
  return Object.fromEntries(Object.entries(c).filter(([key]) => key !== "separators")) as C;
}

/** The component's toggles: what it set, else its kind's defaults. */
export function togglesOf(c: Component): Toggles {
  return {
    fingerCuts: fingerCutsOn(c),
    curvedFloor: curvedFloorOn(c),
    cornerReliefs: cornerReliefsOn(c),
  };
}

/** The toggles of a scoop bin when its component changed none: bulk's defaults. */
const BIN_DEFAULTS: Toggles = {
  fingerCuts: false,
  curvedFloor: true,
  cornerReliefs: false,
};

/**
 * The toggles of a component stored loose in a bin, its bulk fallback (spec §7.1): each toggle
 * the component turned away from its kind's default, else bulk's default (no finger cuts, a curved
 * floor, no corner reliefs). A toggle set to its kind's default counts as not set, so a value the
 * UI wrote and an absent one give the same bin (review 3, I1).
 */
export function binTogglesOf(c: Component): Toggles {
  const kind = kindDefaults(c);
  const set = togglesOf(c);
  const pick = (t: keyof Toggles): boolean => (set[t] === kind[t] ? BIN_DEFAULTS[t] : set[t]);
  return {
    fingerCuts: pick("fingerCuts"),
    curvedFloor: pick("curvedFloor"),
    cornerReliefs: pick("cornerReliefs"),
  };
}

/** The component's group, or undefined when it has none. An empty groupId means no group. */
export function groupOf(c: Component): string | undefined {
  return c.groupId === "" ? undefined : c.groupId;
}

export function newProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdWith: APP_VERSION,
    id: newId(),
    name: DEFAULT_PROJECT_NAME,
    box: { ...DEFAULT_BOX },
    printer: { ...DEFAULT_PRINTER },
    settings: structuredClone(DEFAULT_SETTINGS),
    components: [],
    locks: [],
  };
}

/** A new component with the spec §5 defaults of COMPONENT_DEFAULTS and sample sizes. */
export function newComponent(kind: ComponentKind): Component {
  const d = COMPONENT_DEFAULTS;
  const base = { id: newId(), name: KIND_NAMES[kind], access: d.access };
  switch (kind) {
    case "cards":
      return {
        ...base,
        kind,
        shortSide: STANDARD_CARD.shortSide,
        longSide: STANDARD_CARD.longSide,
        decks: [{ name: "", count: 50 }],
        sleeve: d.cards.sleeve,
        thickness: { ...d.cards.thickness },
        storage: d.cards.storage,
      };
    case "bulk":
      return { ...base, kind, items: [{ name: "", count: 20, w: 20, d: 20, h: 2 }] };
    case "tiles":
      return {
        ...base,
        kind,
        shape: { type: "rect", w: 50, d: 50 },
        thickness: 2,
        count: 20,
        storage: d.tiles.storage,
      };
    case "minis":
      return {
        ...base,
        kind,
        figures: [{ name: "", w: 25, d: 25, h: 40, count: 4 }],
        storage: d.minis.storage,
      };
    case "custom":
      return { ...base, kind, w: 50, d: 50, h: 20, count: 1 };
  }
}
