import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import smallTiles from "../../test/fixtures/small-tiles.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { LINK_TARGET_CHARS, decodeHash, encodeHash } from "../share/link";
import { stretchOn } from "./defaults";
import { noForeign, parseProject } from "./schema";
import { validateProject } from "./validate";
import { SCHEMA_VERSION } from "./version";

/** Synthetic games (roadmap §5) until real measured games exist (spec §12). */
const FIXTURES: Record<string, unknown> = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
  "small-tiles": smallTiles,
  "tiny-box": tinyBox,
};

/**
 * One saved file per historical schema line (spec §11). Add a file here
 * whenever SCHEMA_VERSION's line changes, and keep the old ones: they must
 * keep loading (through migrations from 1.0 on). The 0.x files are deleted
 * at 1.0, which refuses 0.x files by design.
 */
const HISTORY = import.meta.glob<unknown>("../../test/fixtures/schema/*.json", {
  eager: true,
  import: "default",
});

function load(raw: unknown) {
  const result = parseProject(raw);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

describe.each(Object.entries(FIXTURES))("fixture %s", (_name, raw) => {
  it("is at the current schema version", () => {
    expect((raw as { schemaVersion: string }).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("parses without notices and validates without errors", () => {
    const { project, foreign, notices } = load(raw);
    expect(notices).toEqual([]);
    expect(foreign.components).toEqual([]);
    expect(validateProject(project).filter((n) => n.level === "error")).toEqual([]);
  });

  it(`fits in a ${LINK_TARGET_CHARS}-character link and decodes back`, () => {
    const { project } = load(raw);
    const hash = encodeHash(project, noForeign());
    expect(hash.length).toBeLessThanOrEqual(LINK_TARGET_CHARS);
    const decoded = decodeHash(hash);
    expect(decoded.ok && decoded.project).toEqual(project);
  });
});

describe("schema history", () => {
  it("has a file for the current schema version", () => {
    expect(Object.keys(HISTORY)).toContain(`../../test/fixtures/schema/${SCHEMA_VERSION}.json`);
  });

  it.each(Object.entries(HISTORY))("%s still loads", (_path, raw) => {
    expect(parseProject(raw).ok).toBe(true);
  });

  it("reads the 0.1.1 file, its component toggles included, without notices", () => {
    const { project, notices } = load(HISTORY["../../test/fixtures/schema/0.1.1.json"]);
    expect(notices).toEqual([]);
    const toggles = project.components.map((c) => [
      c.id,
      c.fingerCuts,
      c.curvedFloor,
      c.cornerReliefs,
    ]);
    expect(toggles).toEqual([
      ["cards001", undefined, undefined, undefined],
      ["cards002", false, undefined, true],
      ["bulk0001", true, false, undefined],
      ["tiles001", undefined, undefined, undefined],
      ["minis001", undefined, undefined, undefined],
      ["custom01", undefined, true, false],
    ]);
  });

  it("reads the 0.1.2 file with no stretch set, so every component keeps it off", () => {
    const { project, notices } = load(HISTORY["../../test/fixtures/schema/0.1.2.json"]);
    expect(notices).toEqual([]);
    expect(project.components.map((c) => [c.stretch, stretchOn(c)])).toEqual(
      project.components.map(() => [undefined, false]),
    );
  });

  it("reads the stretch toggle of the 0.1.3 file", () => {
    const { project } = load(HISTORY["../../test/fixtures/schema/0.1.3.json"]);
    expect(project.components.map((c) => c.stretch)).toEqual([
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("reads the fillToTop setting of the 0.1.4 file, and defaults it on for older files", () => {
    const { project } = load(HISTORY["../../test/fixtures/schema/0.1.4.json"]);
    expect(project.settings.fillToTop).toBe(false);
    const older = load(HISTORY["../../test/fixtures/schema/0.1.3.json"]);
    expect(older.project.settings.fillToTop).toBe(true);
  });

  it("reads the infill setting of the 0.1.7 file, and defaults it to 15 for older files", () => {
    const { project, notices } = load(HISTORY["../../test/fixtures/schema/0.1.7.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.infill).toBe(30);
    const older = load(HISTORY["../../test/fixtures/schema/0.1.6.json"]);
    expect(older.project.settings.infill).toBe(15);
  });

  it("reads wallAbsorb from the 0.1.8 file, and wallGrowth, its old name, from the 0.1.6 and 0.1.7 files", () => {
    const { project, notices } = load(HISTORY["../../test/fixtures/schema/0.1.8.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.wallAbsorb).toBe(0.8);
    for (const old of ["0.1.6", "0.1.7"]) {
      const file = load(HISTORY[`../../test/fixtures/schema/${old}.json`]);
      // the old key is read, not reported as an unknown field, and not written back
      expect(file.notices).toEqual([]);
      expect(file.project.settings.wallAbsorb).toBe(1.2);
      expect("wallGrowth" in file.project.settings).toBe(false);
    }
    const older = load(HISTORY["../../test/fixtures/schema/0.1.5.json"]);
    expect(older.project.settings.wallAbsorb).toBe(0);
  });

  it("reads the merge switches from the 0.1.9 file, and defaults them for older files", () => {
    const { project, notices } = load(HISTORY["../../test/fixtures/schema/0.1.9.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.mergeFillers).toBe(false);
    expect(project.settings.mergeRisers).toBe(true);
    const older = load(HISTORY["../../test/fixtures/schema/0.1.8.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.settings.mergeFillers).toBe(true);
    expect(older.project.settings.mergeRisers).toBe(false);
  });

  it("reads the preset thickness correction from the 0.1.10 file, and none from older files", () => {
    const { project, notices } = load(HISTORY["../../test/fixtures/schema/0.1.10.json"]);
    expect(notices).toEqual([]);
    const cards = project.components.filter((c) => c.kind === "cards");
    expect(cards.map((c) => c.thickness)).toEqual([
      { mode: "preset", scale: 1.15 },
      { mode: "measured", cards: 12, stackMm: 5.4 },
    ]);
    const older = load(HISTORY["../../test/fixtures/schema/0.1.9.json"]);
    expect(older.notices).toEqual([]);
    const first = older.project.components.find((c) => c.kind === "cards");
    expect(first?.kind === "cards" && first.thickness).toEqual({ mode: "preset" });
  });

  it("prefers wallAbsorb when a file has both keys", () => {
    const raw = structuredClone(HISTORY["../../test/fixtures/schema/0.1.8.json"]) as {
      settings: Record<string, number>;
    };
    raw.settings.wallGrowth = 2.5;
    const { project, notices } = load(raw);
    expect(notices).toEqual([]);
    expect(project.settings.wallAbsorb).toBe(0.8);
  });

  it("reads the separators option of the 0.1.5 file, and leaves it unset for older files", () => {
    const { project, notices } = load(HISTORY["../../test/fixtures/schema/0.1.5.json"]);
    expect(notices).toEqual([]);
    expect(project.components.map((c) => c.separators)).toEqual([
      3,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    const older = load(HISTORY["../../test/fixtures/schema/0.1.4.json"]);
    expect(older.project.components.every((c) => c.separators === undefined)).toBe(true);
  });
});
