import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { LINK_TARGET_CHARS, decodeHash, encodeHash } from "../share/link";
import { noForeign, parseProject } from "./schema";
import { validateProject } from "./validate";
import { SCHEMA_VERSION } from "./version";

/** Synthetic games (roadmap §5) until real measured games exist (spec §12). */
const FIXTURES: Record<string, unknown> = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
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
});
