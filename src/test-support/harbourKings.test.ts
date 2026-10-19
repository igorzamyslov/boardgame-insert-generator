// src/test-support/harbourKings.test.ts
import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "../geometry/version";
import { inputsHash } from "../model/hash";
import { levelsOf } from "../plan/layers";
import { misfitOf } from "../ui/noFit";
import { numberParts } from "../instructions/numbering";
import { trayNames } from "../instructions/naming";
import {
  harbourKings,
  harbourKingsKit,
  harbourKingsKitLoose,
  loadSeed,
  LONG_NAME,
} from "./harbourKings";

const CURRENT = [
  "harbour-kings",
  "harbour-kings-headroom",
  "harbour-kings-long",
  "harbour-kings-wide",
  "harbour-kings-kit",
  "harbour-kings-kit-loose",
  "harbour-kings-kit-split",
  "harbour-kings-flat",
];
const STALE = [
  "harbour-kings-stale",
  "harbour-kings-nofit",
  "harbour-kings-nofit-bed",
  "harbour-kings-pins",
  "harbour-kings-notes",
];
const SEEDS = [...CURRENT, ...STALE];
const PINNED_AT = 1792108800000;

describe("harbourKings", () => {
  it("matches the boards' contents", () => {
    const p = harbourKings();
    expect(p.components.map((c) => c.name)).toEqual([
      "Market deck",
      "Starter decks",
      "Event cards",
      "Coins and cubes",
      "Resource tokens",
      "Dice",
      "Hex tiles",
      "Heroes",
    ]);
    expect([p.box.innerWidth, p.box.innerDepth, p.box.innerHeight]).toEqual([285, 285, 70]);
    expect(p.printer.bedX).toBe(256);
  });

  it("keeps each committed seed current", () => {
    for (const name of CURRENT) {
      const { project } = loadSeed(name);
      const hint = `${name} is stale: run npm run seeds`;
      expect(project.layout?.inputsHash, hint).toBe(inputsHash(project));
    }
  });

  it("keeps every seed on the current geometry", () => {
    for (const name of SEEDS) {
      const { project } = loadSeed(name);
      expect(project.layout?.geometryVersion, `${name} is stale: run npm run seeds`).toBe(
        GEOMETRY_VERSION,
      );
    }
  });

  it("stores two keys per seed", () => {
    for (const name of SEEDS) {
      const { storage, project } = loadSeed(name);
      const index = JSON.parse(storage["insert-generator:index"] ?? "null") as { id: string }[];
      expect(index.map((e) => e.id)).toEqual([project.id]);
      const extra = Object.keys(storage).filter(
        (k) => k !== "insert-generator:index" && k !== `insert-generator:project:${project.id}`,
      );
      expect(
        extra.filter((k) => k !== "insert-generator:prefs"),
        name,
      ).toEqual([]);
      expect(storage[`insert-generator:project:${project.id}`], name).toBeTypeOf("string");
    }
  });

  it("pins updatedAt", () => {
    for (const name of SEEDS) {
      const index = JSON.parse(loadSeed(name).storage["insert-generator:index"] ?? "[]") as {
        updatedAt: number;
      }[];
      expect(index.map((e) => e.updatedAt)).toEqual([PINNED_AT]);
    }
  });

  it("makes the stale seeds stale", () => {
    for (const name of STALE) {
      const { project } = loadSeed(name);
      expect(project.layout?.inputsHash, name).not.toBe(inputsHash(project));
    }
  });

  it("keeps a wide box (400 by 285 mm) in the wide seed", () => {
    const { project } = loadSeed("harbour-kings-wide");
    expect([project.box.innerWidth, project.box.innerDepth]).toEqual([400, 285]);
    expect(project.layout).toBeDefined();
  });

  it("keeps a 25-component list with a long name in the long seed", () => {
    const { project } = loadSeed("harbour-kings-long");
    expect(project.components).toHaveLength(25);
    expect(project.components.some((c) => c.name === LONG_NAME)).toBe(true);
    expect(LONG_NAME.length).toBeGreaterThanOrEqual(40);
    // R20: no "Crew" group, so Main's long-list states keep their boards.
    expect(project.groups ?? []).toEqual([]);
  });

  it("stores the fresh runs that no store can restore", () => {
    const nofit = loadSeed("harbour-kings-nofit");
    expect(nofit.result?.layout).toBeNull();
    expect(nofit.result?.bestAttempt).not.toBeNull();
    const pins = loadSeed("harbour-kings-pins");
    expect(pins.result?.lockConflicts.length).toBeGreaterThan(0);
    expect(pins.result?.layout).not.toBeNull();
  });

  it("plans the workspace seed in two layers, the Heroes in a short bottom one", () => {
    const trays = loadSeed("harbour-kings").project.layout?.trays ?? [];
    expect(levelsOf(trays)).toHaveLength(2);
    const heroes = trays.find((t) => t.part === "tray" && t.key.startsWith("heroes01:"));
    expect(heroes?.level).toBe(0);
    expect(heroes?.h ?? 99).toBeLessThanOrEqual(46);
    const headroom = loadSeed("harbour-kings-headroom").project.layout?.trays ?? [];
    expect(levelsOf(headroom)).toHaveLength(2);
  });

  it("tells the height story in the no-fit seed, and the bed story in the extra one", () => {
    const reasonOf = (name: string) => {
      const { project, result } = loadSeed(name);
      return misfitOf(
        result?.bestAttempt ?? null,
        project.box,
        project.settings,
        project.components,
      );
    };
    expect(reasonOf("harbour-kings-nofit")).toMatchObject({ name: "Heroes", reason: "box" });
    expect(reasonOf("harbour-kings-nofit-bed")).toMatchObject({ name: "Heroes", reason: "bed" });
  });
});

describe("the groups seeds (0.7.0)", () => {
  /** What the packing guide calls each tray of the seed's plan, by tray key. */
  function names(name: string): Map<string, string> {
    const { project } = loadSeed(name);
    const parts = numberParts(project.layout?.trays ?? []);
    const all = trayNames(parts, project.components, project.groups ?? []);
    return new Map([...all].map(([key, n]) => [key, n.full]));
  }

  it("holds the kit as G1 draws it: one layer, six trays, the four copies on one x", () => {
    const { project } = loadSeed("harbour-kings-kit");
    expect(project.groups).toEqual([
      {
        id: "plrkit01",
        name: "Player kit",
        copies: 4,
        access: "often",
        growth: { w: "off", d: "off", h: "off" },
        memberIds: ["kitdeck1", "kitres01", "kithero1"],
      },
    ]);
    expect(project.components.map((c) => c.name)).toEqual([
      "Starter deck",
      "Resources",
      "Hero",
      "Market deck",
      "Hex tiles",
    ]);
    const trays = project.layout?.trays ?? [];
    expect(levelsOf(trays)).toHaveLength(1);
    const parts = trays.filter((t) => t.part === "tray");
    expect(parts).toHaveLength(6);
    const kit = parts.filter((t) => t.key.startsWith("plrkit01:"));
    expect(kit).toHaveLength(4);
    expect(new Set(kit.map((t) => Math.round(t.x))).size).toBe(1);
    const right = Math.max(...kit.map((t) => t.x + t.w));
    for (const other of parts.filter((t) => !t.key.startsWith("plrkit01:"))) {
      expect(other.x).toBeGreaterThanOrEqual(right - 3);
    }
    const named = names("harbour-kings-kit");
    expect(kit.map((t) => named.get(t.key)).sort()).toEqual([
      "Player kit 1",
      "Player kit 2",
      "Player kit 3",
      "Player kit 4",
    ]);
  });

  it("holds the same five items, ungrouped, in G3's order", () => {
    const { project } = loadSeed("harbour-kings-kit-loose");
    expect(project.groups).toBeUndefined();
    expect(project.components.map((c) => c.name)).toEqual([
      "Market deck",
      "Starter deck",
      "Resources",
      "Hero",
      "Hex tiles",
    ]);
    expect(harbourKingsKitLoose().components.map((c) => c.id)).toEqual(
      project.components.map((c) => c.id),
    );
    // the kit is the loose project with three of them grouped
    expect(
      harbourKingsKit()
        .components.map((c) => c.id)
        .sort(),
    ).toEqual(project.components.map((c) => c.id).sort());
  });

  it("splits each copy of the kit in two in the split seed: Player kit 1a and 1b", () => {
    const named = [...names("harbour-kings-kit-split").values()];
    expect(named).toEqual(expect.arrayContaining(["Player kit 1a", "Player kit 1b"]));
  });

  it("puts three flat decks in one well in the flat seed", () => {
    const { project } = loadSeed("harbour-kings-flat");
    const deck = project.components.find((c) => c.id === "flatdeck");
    expect(deck?.kind === "cards" && deck.flatDecks).toBe("dividers");
    const trays = (project.layout?.trays ?? []).filter(
      (t) => t.part === "tray" && t.key.startsWith("flatdeck:"),
    );
    expect(trays).toHaveLength(1);
    expect(trays[0]?.compartments).toHaveLength(1);
  });
});
