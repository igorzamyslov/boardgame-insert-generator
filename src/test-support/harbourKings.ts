// src/test-support/harbourKings.ts
// "Harbour Kings": the game the design boards (docs/design/boards) are drawn with. The fixture,
// its variants and the committed seeds (docs/design/seeds, made by `npm run seeds`) feed the
// screenshot harness and the board copy tests. Test-only: nothing in the app imports it.
import { toggleLock } from "../app/actions";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Component, Group, Project, Settings, TraySpec } from "../model/types";
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
 * What `npm run seeds` found (see Tuning): one clearance of 3 mm on every component, the first of
 * its tries that puts the Heroes in a short bottom layer and leaves no sliver of a spacer in the
 * plan or the no-fit plan (the Settings values and deck sleeves came first and did not). Before
 * 0.15.0 it took a clearance of its own on each component (2 to 10 mm). Counts and names the rail
 * shows are never in it.
 */
export const LAYER_TUNING: Tuning = {
  settings: {},
  components: {
    market01: { clearance: 3 },
    starter1: { clearance: 3 },
    events01: { clearance: 3 },
    coins001: { clearance: 3 },
    resourc1: { clearance: 3 },
    dice0001: { clearance: 3 },
    hextiles: { clearance: 3 },
    heroes01: { clearance: 3 },
  },
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
        figures: [{ name: "Hero", w: 30, d: 30, h: 38, count: 6, keepUpright: true }],
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

/** The same game in a wide box (400 × 285 mm): the plan's frame is not square. */
export function harbourKingsWide(): Project {
  const p = harbourKings();
  return { ...p, box: { ...p.box, innerWidth: 400 } };
}

/** 25 components, one with a 40-character name: a long list and long names. */
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
      bulk(`group00${i}`, name, "setup", [{ name, count: 4, w: 10, d: 10, h: 8 }]),
    ),
    ...["Banners", "Anchors", "Barrels", "Flags", "Keys", "Maps", "Torches"].map((name, i) =>
      bulk(`small00${i}`, name, "sometimes", [{ name, count: 4, w: 8, d: 8, h: 6 }]),
    ),
  ];
  return { ...p, components: [...p.components, ...extra] };
}

/**
 * Groups spec G1: the five items of a game that keeps a "Player kit" (Starter deck, Resources and
 * a Hero) for each of four players, besides a Market deck and Hex tiles, with no group yet and in
 * the order G3 lists them. The seed for Add → Group.
 */
export function harbourKingsKitLoose(): Project {
  const p = untuned();
  return {
    ...p,
    id: "harbkit1",
    components: [
      cards("market01", "Market deck", "often", [{ name: "Market deck", count: 80 }]),
      // Mini cards, lying flat: a copy's tray is about 70 mm deep, so four copies stand in one column.
      cards("kitdeck1", "Starter deck", "often", [{ name: "Starter deck", count: 12 }], {
        shortSide: 41,
        longSide: 62,
        storage: "flat",
      }),
      bulk(
        "kitres01",
        "Resources",
        "often",
        ["Wood", "Stone", "Grain"].map((name) => ({ name, count: 10, w: 16, d: 16, h: 2 })),
        // Max: grouped in the Player kit it fills the room its tray already has (group-tray-fill
        // spec §2) and never makes the tray bigger; loose it would take all the room there is.
        { growth: { w: "max", d: "max", h: "max" } },
      ),
      {
        id: "kithero1",
        name: "Hero",
        access: "often",
        kind: "minis",
        figures: [{ name: "Hero", w: 30, d: 30, h: 38, count: 1 }],
        storage: "pockets",
      },
      p.components.find((c) => c.id === "hextiles") as Component,
    ],
  };
}

/** The ids of the Player kit's members, in compartment order. */
export const KIT_MEMBER_IDS = ["kitdeck1", "kitres01", "kithero1"];

/**
 * Groups spec G1's project: the loose items with the Starter deck, Resources and Hero in a
 * "Player kit" group (4 copies, "often"), listed first, then Market deck and Hex tiles.
 */
export function harbourKingsKit(): Project {
  const loose = harbourKingsKitLoose();
  const byId = (id: string) => loose.components.find((c) => c.id === id) as Component;
  const kit: Group = {
    id: "plrkit01",
    name: "Player kit",
    copies: 4,
    access: "often",
    growth: { w: "off", d: "off", h: "off" },
    memberIds: KIT_MEMBER_IDS,
  };
  return {
    ...loose,
    components: [...KIT_MEMBER_IDS.map(byId), byId("market01"), byId("hextiles")],
    groups: [kit],
  };
}

/**
 * The kit with a Hero that is too long for one copy to fit the print bed beside its other
 * compartments, so the Player kit splits ("Player kit 1a" and "1b"). `length` is the Hero's
 * footprint (mm); `npm run seeds` checks the outcome. The Hero stands (`keepUpright`): left free it
 * may lie on any side or turn in plan, and at 140 mm the Player kit no longer split.
 */
export function harbourKingsKitSplit(length = 140): Project {
  const kit = harbourKingsKit();
  return {
    ...kit,
    id: "harbkit2",
    components: kit.components.map((c) =>
      c.id === "kithero1" && c.kind === "minis"
        ? {
            ...c,
            figures: [{ name: "Hero", w: length, d: 30, h: 38, count: 1, keepUpright: true }],
          }
        : c,
    ),
  };
}

/**
 * A cards item with three flat decks of 12, 30 and 12 cards that share one well, with removable
 * dividers between them (flat-deck spec). `npm run seeds` checks it comes out as one well.
 */
export function harbourKingsFlat(): Project {
  const p = untuned();
  return {
    ...p,
    id: "harbflat",
    components: [
      cards(
        "flatdeck",
        "Starter deck",
        "often",
        [
          { name: "Deck 1", count: 12 },
          { name: "Deck 2", count: 30 },
          { name: "Deck 3", count: 12 },
        ],
        { storage: "flat", flatDecks: "dividers" },
      ),
      cards("market01", "Market deck", "often", [{ name: "Market deck", count: 80 }]),
      p.components.find((c) => c.id === "hextiles") as Component,
    ],
  };
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
 * `count`. The engine only reports a pin conflict at some counts (the rest fit around the pins or
 * fit nowhere, and which ones moves with the engine), so
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
 * `base` with four items given a size of 0 mm (three card sides and a figure's height), so the
 * status heading says "Fix the errors marked in the inputs" and offers an "Edit <item>" button for
 * each: the longest row of actions the heading has to hold (stage.css). The plan of `base` is kept.
 */
export function harbourKingsErrors(base: Project): Project {
  let p = base;
  for (const id of ["market01", "starter1", "events01"]) {
    p = withComponent(p, id, (c) => (c.kind === "cards" ? { ...c, shortSide: 0 } : c));
  }
  return withComponent(p, "heroes01", (c) =>
    c.kind === "minis" ? { ...c, figures: c.figures.map((f) => ({ ...f, h: 0 })) } : c,
  );
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
