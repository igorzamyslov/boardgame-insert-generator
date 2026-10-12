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

/**
 * Whether the component's compartments get finger cuts (spec §5, §6.1): its `fingerCuts`, else
 * on for cards, tiles, minis pockets and custom wells and off for bulk (and minis stored as bulk),
 * as before the toggle.
 */
export function fingerCutsOn(c: Component): boolean {
  return c.fingerCuts ?? !bulkLike(c);
}

/**
 * Whether the component's compartments get a curved floor, the scoop ramp (spec §5, §6.1): its
 * `curvedFloor`, else on for bulk (and minis stored as bulk) and off otherwise, as before the
 * toggle. Never for cards or tiles: cards would bend and upright items tilt (validation refuses
 * it there).
 */
export function curvedFloorOn(c: Component): boolean {
  if (c.kind === "cards" || c.kind === "tiles") {
    return false;
  }
  return c.curvedFloor ?? bulkLike(c);
}

/**
 * Whether the component's compartments get Ø 3 mm corner reliefs (spec §5, §6.1): its
 * `cornerReliefs`, else on for tiles and custom wells and off otherwise, as before the toggle.
 */
export function cornerReliefsOn(c: Component): boolean {
  return c.cornerReliefs ?? (c.kind === "tiles" || c.kind === "custom");
}

/** The three per-component toggles, resolved (spec §5). */
export interface Toggles {
  fingerCuts: boolean;
  curvedFloor: boolean;
  cornerReliefs: boolean;
}

/** The component's toggles: what it set, else its kind's defaults. */
export function togglesOf(c: Component): Toggles {
  return {
    fingerCuts: fingerCutsOn(c),
    curvedFloor: curvedFloorOn(c),
    cornerReliefs: cornerReliefsOn(c),
  };
}

/**
 * The toggles of a component stored loose in a scoop bin, its bulk fallback (spec §7.1): what it
 * set, else bulk's defaults (no finger cuts, a curved floor, no corner reliefs).
 */
export function binTogglesOf(c: Component): Toggles {
  return {
    fingerCuts: c.fingerCuts ?? false,
    curvedFloor: c.curvedFloor ?? true,
    cornerReliefs: c.cornerReliefs ?? false,
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
        decks: [{ name: "Deck", count: 50 }],
        sleeve: d.cards.sleeve,
        thickness: { ...d.cards.thickness },
        storage: d.cards.storage,
      };
    case "bulk":
      return { ...base, kind, items: [{ name: "Tokens", count: 20, w: 20, d: 20, h: 2 }] };
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
        figures: [{ name: "Figure", w: 25, d: 25, h: 40, count: 4 }],
        storage: d.minis.storage,
      };
    case "custom":
      return { ...base, kind, w: 50, d: 50, h: 20, count: 1 };
  }
}
