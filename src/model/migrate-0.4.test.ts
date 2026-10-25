import { describe, expect, it } from "vitest";
import type { Json } from "./json";
import { migrateTo040 } from "./migrate-0.4";
import { MIGRATIONS, parseProject } from "./schema";
import { SCHEMA_VERSION, parseSemver } from "./version";
import old from "../../test/fixtures/schema/0.3.4.json";

// Schema 0.4.0 (owner, 2026-10-25): the card clearance defaults became 3 mm and 2 mm. A value that
// still equals the old default moves; a value the person changed stays.

const settingsOf = (out: Json): Json => out.settings as Json;

describe("the migration from 0.3 to 0.4", () => {
  it("is registered for the line 0.3 and is the one the schema version needs", () => {
    expect(parseSemver(SCHEMA_VERSION)).toMatchObject({ major: 0, minor: 4 });
    expect(MIGRATIONS.find((m) => m.from === "0.3")).toMatchObject({ to: "0.4.0" });
  });

  it("moves values still at the old defaults to the new ones", () => {
    const out = migrateTo040({ settings: { cardClearance: 1.5, cardStackClearance: 1 } });
    expect(settingsOf(out)).toMatchObject({ cardClearance: 3, cardStackClearance: 2 });
  });

  it("leaves values the person changed alone, each on its own", () => {
    const out = migrateTo040({ settings: { cardClearance: 2, cardStackClearance: 1 } });
    expect(settingsOf(out)).toMatchObject({ cardClearance: 2, cardStackClearance: 2 });
    const kept = migrateTo040({ settings: { cardClearance: 1.5, cardStackClearance: 1.5 } });
    expect(settingsOf(kept)).toMatchObject({ cardClearance: 3, cardStackClearance: 1.5 });
  });

  it("does not mutate its input and survives a file without settings", () => {
    const input: Json = { settings: { cardClearance: 1.5 } };
    migrateTo040(input);
    expect(input).toEqual({ settings: { cardClearance: 1.5 } });
    expect(migrateTo040({})).toEqual({});
  });

  it("carries a saved 0.3.4 project (old defaults) into the new defaults", () => {
    const parsed = parseProject(structuredClone(old));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project.settings).toMatchObject({ cardClearance: 3, cardStackClearance: 2 });
    }
  });

  it("keeps a 0.3.4 project's own clearances", () => {
    const own = structuredClone(old) as unknown as { settings: Json };
    own.settings.cardClearance = 2.2;
    own.settings.cardStackClearance = 0.5;
    const parsed = parseProject(own);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project.settings).toMatchObject({
        cardClearance: 2.2,
        cardStackClearance: 0.5,
      });
    }
  });
});
