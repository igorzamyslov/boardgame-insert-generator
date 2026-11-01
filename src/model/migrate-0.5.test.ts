import { describe, expect, it } from "vitest";
import type { Json } from "./json";
import { migrateTo050 } from "./migrate-0.5";
import { MIGRATIONS } from "./schema";
import { SCHEMA_VERSION, parseSemver } from "./version";

// Schema 0.5.0 (owner, 2026-11-01): the wall thickness (`wallAbsorb`) and the one-wall switch
// (`oneWall`) are the one choice `thickerWalls`. A file that used either, with bigger wells off,
// says thicker walls: the room still goes into walls, and no spacer is printed.

const settingsOf = (out: Json): Json => out.settings as Json;

describe("the migration from 0.4 to 0.5", () => {
  it("is registered for the line 0.4 and is the one the schema version needs", () => {
    expect(parseSemver(SCHEMA_VERSION)).toMatchObject({ major: 0, minor: 5 });
    expect(MIGRATIONS.find((m) => m.from === "0.4")).toMatchObject({ to: "0.5.0" });
  });

  it("turns a wall thickness above 0 into thicker walls, and drops the number", () => {
    const out = migrateTo050({ settings: { wallAbsorb: 1, wall: 1.6 } });
    expect(settingsOf(out)).toEqual({ thickerWalls: true, wall: 1.6 });
  });

  it("turns one thick wall into thicker walls, with or without a thickness", () => {
    expect(settingsOf(migrateTo050({ settings: { oneWall: true } }))).toEqual({
      thickerWalls: true,
    });
    expect(settingsOf(migrateTo050({ settings: { oneWall: true, wallAbsorb: 2 } }))).toEqual({
      thickerWalls: true,
    });
  });

  it("reads the older name of the thickness, wallGrowth, the same way", () => {
    expect(settingsOf(migrateTo050({ settings: { wallGrowth: 0.8 } }))).toEqual({
      thickerWalls: true,
    });
  });

  it("leaves a file with neither in use on separate spacers", () => {
    expect(settingsOf(migrateTo050({ settings: { wallAbsorb: 0, oneWall: false } }))).toEqual({});
    expect(settingsOf(migrateTo050({ settings: { wall: 1.6 } }))).toEqual({ wall: 1.6 });
  });

  it("keeps bigger wells where it was chosen with a thickness left in the file", () => {
    const out = migrateTo050({ settings: { biggerWells: true, wallAbsorb: 2, oneWall: true } });
    expect(settingsOf(out)).toEqual({ biggerWells: true });
  });

  it("does not mutate its input and survives a file without settings", () => {
    const input: Json = { settings: { wallAbsorb: 1 } };
    migrateTo050(input);
    expect(input).toEqual({ settings: { wallAbsorb: 1 } });
    expect(migrateTo050({})).toEqual({});
  });
});
