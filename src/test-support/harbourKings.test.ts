// src/test-support/harbourKings.test.ts
import { describe, expect, it } from "vitest";
import { GEOMETRY_VERSION } from "../geometry/version";
import { inputsHash } from "../model/hash";
import { harbourKings, loadSeed, LONG_NAME } from "./harbourKings";

const CURRENT = ["harbour-kings", "harbour-kings-headroom", "harbour-kings-long"];
const STALE = [
  "harbour-kings-stale",
  "harbour-kings-nofit",
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
      expect(project.layout?.geometryVersion, hint).toBe(GEOMETRY_VERSION);
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

  it("keeps a 25-component list with a long name in the long seed", () => {
    const { project } = loadSeed("harbour-kings-long");
    expect(project.components).toHaveLength(25);
    expect(project.components.some((c) => c.name === LONG_NAME)).toBe(true);
    expect(LONG_NAME.length).toBeGreaterThanOrEqual(40);
    expect(project.components.filter((c) => c.groupId !== undefined)).toHaveLength(3);
  });

  it("stores the fresh runs that no store can restore", () => {
    const nofit = loadSeed("harbour-kings-nofit");
    expect(nofit.result?.layout).toBeNull();
    expect(nofit.result?.bestAttempt).not.toBeNull();
    const pins = loadSeed("harbour-kings-pins");
    expect(pins.result?.lockConflicts.length).toBeGreaterThan(0);
    expect(pins.result?.layout).not.toBeNull();
  });
});
