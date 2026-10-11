import { newId } from "./ids";
import { BED_PRESETS } from "./presets";
import { DEFAULT_SETTINGS } from "./settings";
import type { Box, Component, ComponentKind, Printer, Project } from "./types";
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

const defaultBed = BED_PRESETS[0] ?? { bedX: 256, bedY: 256, bedZ: 256 };

/**
 * Printer for a new project. bedMargin and layerHeight also fill files that lack them.
 * Frozen: projects copy it, never alias it.
 */
export const DEFAULT_PRINTER: Printer = Object.freeze({
  bedX: defaultBed.bedX,
  bedY: defaultBed.bedY,
  bedZ: defaultBed.bedZ,
  bedMargin: 5,
  layerHeight: 0.2,
});

export const DEFAULT_PROJECT_NAME = "Untitled insert";

/** Default display name per component kind. */
export const KIND_NAMES: Record<ComponentKind, string> = {
  cards: "Cards",
  bulk: "Bits",
  tiles: "Tiles",
  minis: "Miniatures",
  custom: "Item",
};

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

/** A new component with spec §5 defaults (access "sometimes", storage "auto", minis "pockets"). */
export function newComponent(kind: ComponentKind): Component {
  const base = { id: newId(), name: KIND_NAMES[kind], access: "sometimes" as const };
  switch (kind) {
    case "cards":
      return {
        ...base,
        kind,
        shortSide: 63.5,
        longSide: 88,
        decks: [{ name: "Deck", count: 50 }],
        sleeve: "none",
        thickness: { mode: "preset" },
        storage: "auto",
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
        storage: "auto",
      };
    case "minis":
      return {
        ...base,
        kind,
        figures: [{ name: "Figure", w: 25, d: 25, h: 40, count: 4 }],
        storage: "pockets",
      };
    case "custom":
      return { ...base, kind, w: 50, d: 50, h: 20, count: 1 };
  }
}
