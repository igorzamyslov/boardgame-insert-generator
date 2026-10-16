// src/test-support/harbourKings.ts
// "Harbour Kings": the game the design boards (docs/design/boards) are drawn with. The fixture,
// its variants and the committed seeds (docs/design/seeds, made by `npm run seeds`) feed the
// screenshot harness and the board copy tests. Test-only: nothing in the app imports it.
import { toggleLock } from "../app/actions";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Component, Project, Settings, TraySpec } from "../model/types";
import { APP_VERSION, SCHEMA_VERSION } from "../model/version";
import type { LayoutResult } from "../layout/types";
import { createProjectStore } from "../share";
import { MemoryStorage } from "./memory-storage";

/** A long component name: the tray bar, the rail row and the status line must clip it. */
export const LONG_NAME = "The Very Long Name Of A Card Deck Here 40";

function cards(
  id: string,
  name: string,
  access: Component["access"],
  decks: { name: string; count: number }[],
  extra: Partial<Component> = {},
): Component {
  return {
    id,
    name,
    access,
    kind: "cards",
    shortSide: 63.5,
    longSide: 88,
    decks,
    sleeve: "standard",
    thickness: { mode: "preset" },
    storage: "auto",
    ...extra,
  } as Component;
}

function bulk(
  id: string,
  name: string,
  access: Component["access"],
  items: { name: string; count: number; w: number; d: number; h: number }[],
  extra: Partial<Component> = {},
): Component {
  return { id, name, access, kind: "bulk", items, ...extra } as Component;
}

/**
 * Values the rail never shows, set so the optimizer plans the game in two layers, as Main draws it
 * (a bottom layer with the Heroes pockets under a top layer of cards). Found by the tune pass of
 * `npm run seeds`, which prints a new one when the engine's plans move; paste it in here.
 */
export interface Tuning {
  settings: Partial<Settings>;
  /** Component fields by component id: a clearance, a sleeve, a figure's size. */
  components: Record<string, Record<string, unknown>>;
}

export const NO_TUNING: Tuning = { settings: {}, components: {} };

/**
 * What `npm run seeds` found (see Tuning): 6 mm of clearance around every component, the first
 * value the tune pass reached that puts the Heroes in a short bottom layer (Settings values and
 * deck sleeves came first in its order and did not). Counts and names the rail shows are never in it.
 */
export const LAYER_TUNING: Tuning = {
  settings: {},
  components: Object.fromEntries(
    [
      "market01",
      "starter1",
      "events01",
      "coins001",
      "resourc1",
      "dice0001",
      "hextiles",
      "heroes01",
    ].map((id) => [id, { clearance: 6 }]),
  ),
};

/** The project with the tuning applied: settings merged, component fields overlaid by id. */
export function applyTuning(p: Project, tuning: Tuning): Project {
  return {
    ...p,
    settings: { ...p.settings, ...tuning.settings },
    components: p.components.map((c) => ({ ...c, ...tuning.components[c.id] }) as Component),
  };
}

/** The base game: eight components, as the boards' list shows them (and the tuning, see Tuning). */
export function harbourKings(tuning: Tuning = LAYER_TUNING): Project {
  return applyTuning(untuned(), tuning);
}

function untuned(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdWith: APP_VERSION,
    id: "harbour1",
    name: "Harbour Kings",
    box: {
      innerWidth: 285,
      innerDepth: 285,
      innerHeight: 70,
      headroom: 0,
      headroomCoverage: "partial",
      storedOnSide: false,
    },
    printer: { bedX: 256, bedY: 256, bedZ: 256, bedMargin: 5, layerHeight: 0.2 },
    settings: structuredClone(DEFAULT_SETTINGS),
    components: [
      cards("market01", "Market deck", "often", [{ name: "Market deck", count: 80 }]),
      cards("starter1", "Starter decks", "setup", [
        { name: "Deck 1", count: 12 },
        { name: "Deck 2", count: 12 },
        { name: "Deck 3", count: 12 },
        { name: "Deck 4", count: 12 },
      ]),
      cards("events01", "Event cards", "sometimes", [{ name: "Event cards", count: 30 }]),
      bulk("coins001", "Coins and cubes", "often", [
        { name: "Gold coins", count: 40, w: 20, d: 20, h: 2 },
        { name: "Silver coins", count: 24, w: 20, d: 20, h: 2 },
        { name: "Wood cubes", count: 24, w: 8, d: 8, h: 8 },
        { name: "Wood discs", count: 8, w: 12, d: 12, h: 4 },
      ]),
      bulk(
        "resourc1",
        "Resource tokens",
        "often",
        ["Wood", "Stone", "Grain", "Wool", "Ore", "Fish"].map((name) => ({
          name,
          count: 20,
          w: 16,
          d: 16,
          h: 2,
        })),
      ),
      bulk("dice0001", "Dice", "often", [{ name: "Dice", count: 10, w: 16, d: 16, h: 16 }]),
      {
        id: "hextiles",
        name: "Hex tiles",
        access: "setup",
        kind: "tiles",
        shape: { type: "hex", flatToFlat: 50, orientation: "flat" },
        thickness: 2.2,
        count: 24,
        storage: "auto",
      },
      {
        id: "heroes01",
        name: "Heroes",
        access: "setup",
        kind: "minis",
        figures: [{ name: "Hero", w: 30, d: 30, h: 38, count: 6 }],
        storage: "pockets",
      },
    ],
    locks: [],
  };
}

/** The box has 8 mm of room above the trays, all of it covered by a lid. */
export function harbourKingsHeadroom(): Project {
  const p = harbourKings();
  return { ...p, box: { ...p.box, headroom: 8, headroomCoverage: "full" } };
}

/** 25 components, one with a 40-character name and a group of three: a long list and long names. */
export function harbourKingsLong(): Project {
  const p = harbourKings();
  const extra: Component[] = [
    cards("longname", LONG_NAME, "sometimes", [{ name: "Deck", count: 12 }]),
    ...["Red", "Blue", "Green", "Yellow", "Black", "White"].map((colour, i) =>
      bulk(`marker0${i}`, `${colour} markers`, "sometimes", [
        { name: `${colour} markers`, count: 6, w: 10, d: 10, h: 4 },
      ]),
    ),
    ...["Scouts", "Knights", "Ships"].map((name, i) =>
      bulk(`group00${i}`, name, "setup", [{ name, count: 4, w: 10, d: 10, h: 8 }], {
        groupId: "Crew",
      }),
    ),
    ...["Banners", "Anchors", "Barrels", "Flags", "Keys", "Maps", "Torches"].map((name, i) =>
      bulk(`small00${i}`, name, "sometimes", [{ name, count: 4, w: 8, d: 8, h: 6 }]),
    ),
  ];
  return { ...p, components: [...p.components, ...extra] };
}

function withComponent(p: Project, id: string, change: (c: Component) => Component): Project {
  return { ...p, components: p.components.map((c) => (c.id === id ? change(c) : c)) };
}

/**
 * `base` with the Heroes figures `height` mm tall, and the plan of `base` kept: it is now stale.
 * Taller than the box has room for, the search finds no fit and the closest attempt overhangs the
 * box: the height story NoFit tells. `npm run seeds` checks the outcome.
 */
export function harbourKingsNoFit(base: Project, height = 80): Project {
  return withComponent(base, "heroes01", (c) =>
    c.kind === "minis" ? { ...c, figures: c.figures.map((f) => ({ ...f, h: height })) } : c,
  );
}

/** An extra no-fit: `count` Heroes figures, more pockets than the print bed holds in one tray. */
export function harbourKingsNoFitBed(base: Project, count = 40): Project {
  return withComponent(base, "heroes01", (c) =>
    c.kind === "minis" ? { ...c, figures: c.figures.map((f) => ({ ...f, count })) } : c,
  );
}

function trayOf(layout: readonly TraySpec[] | undefined, componentId: string): TraySpec {
  const tray = layout?.find((t) => t.part === "tray" && t.key.startsWith(`${componentId}:`));
  if (tray === undefined) {
    throw new Error(`the stored plan has no tray for ${componentId}`);
  }
  return tray;
}

/**
 * `base` with Market deck and Heroes pinned where `base`'s plan has them, and Hex tiles raised to
 * `count`. The engine only reports a pin conflict at some counts (with the tuned base: 100 does;
 * 30 to 80 and 120 still fit around the pins, 90, 110 and 130 and up fit nowhere), so
 * `npm run seeds` checks the outcome.
 */
export function harbourKingsPinConflict(base: Project, count = 100): Project {
  let p = base;
  for (const id of ["market01", "heroes01"]) {
    p = toggleLock(p, trayOf(base.layout?.trays, id));
  }
  return withComponent(p, "hextiles", (c) => (c.kind === "tiles" ? { ...c, count } : c));
}

/**
 * `base` with changes that give sizing notices (a measured thickness under the least a card can
 * have, on each deck), and the plan of `base` kept: the banner and the notices show at once.
 */
export function harbourKingsNotes(base: Project): Project {
  let p = base;
  for (const id of ["market01", "starter1", "events01"]) {
    p = withComponent(p, id, (c) =>
      c.kind === "cards" ? { ...c, thickness: { mode: "measured", cards: 20, stackMm: 1 } } : c,
    );
  }
  return p;
}

export interface Seed {
  /** What the real stores leave in localStorage. */
  storage: Record<string, string>;
  project: Project;
  /** The fresh run's result, for the seeds that stand for a run (no fit, pin conflict). */
  result?: LayoutResult;
}

const SEEDS = import.meta.glob<unknown>("../../docs/design/seeds/*.json", {
  eager: true,
  import: "default",
});

/** A committed seed (`npm run seeds` writes them); throws when it is missing or unreadable. */
export function loadSeed(name: string): Seed {
  const raw = SEEDS[`../../docs/design/seeds/${name}.json`] as
    { storage: Record<string, string>; projectId: string } | undefined;
  if (raw === undefined) {
    throw new Error(`no seed "${name}": run npm run seeds`);
  }
  const memory = new MemoryStorage();
  for (const [key, value] of Object.entries(raw.storage)) {
    memory.setItem(key, value);
  }
  const loaded = createProjectStore(memory).load(raw.projectId);
  if (loaded === null || !loaded.ok) {
    throw new Error(`seed "${name}" does not hold a project`);
  }
  const result = SEEDS[`../../docs/design/seeds/${name}.result.json`] as LayoutResult | undefined;
  return { storage: raw.storage, project: loaded.project, ...(result ? { result } : {}) };
}
