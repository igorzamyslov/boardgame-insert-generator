import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import smallTiles from "../../test/fixtures/small-tiles.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { decodeHash } from "../share/link";
import { encodeHash } from "../test-support/link";
import { growthOf } from "./defaults";
import { noForeign, parseProject, serializeProject } from "./schema";
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

  it("decodes back from an old link", () => {
    const { project } = load(raw);
    const hash = encodeHash(project, noForeign());
    const decoded = decodeHash(hash);
    // A link does not carry createdWith; decoding stamps the running app's version.
    expect(decoded.ok && { ...decoded.project, createdWith: project.createdWith }).toEqual(project);
  });
});

describe("schema history", () => {
  /**
   * A file of an older line is upgraded on the way in, and says so with one notice. These tests are
   * about what else it says, so that one is left out (schema-versions.test.ts checks it).
   */
  function loadOld(raw: unknown) {
    const result = load(raw);
    return { ...result, notices: result.notices.filter((n) => n.code !== "schema.migrated") };
  }

  it("has a file for the current schema version", () => {
    expect(Object.keys(HISTORY)).toContain(`../../test/fixtures/schema/${SCHEMA_VERSION}.json`);
  });

  it.each(Object.entries(HISTORY))("%s still loads", (_path, raw) => {
    expect(parseProject(raw).ok).toBe(true);
  });

  it("reads the 0.1.1 file, its component toggles included, without notices", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.1.json"]);
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

  it("reads the 0.1.2 file, which has no stretch or growth, so no item has a room", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.2.json"]);
    expect(notices).toEqual([]);
    expect(project.components.map((c) => c.room)).toEqual(project.components.map(() => undefined));
  });

  // `stretch` (before schema 0.1.12) and then per-axis `growth` became one `room` per item in schema
  // 0.3.0 (migrate-0.3.ts); neither key is read or written any more, and what they said off or auto
  // is now none: a tray does not grow unless asked.
  describe("the stretch toggle, which growth replaced (schema 0.1.12) and room replaced (0.3.0)", () => {
    const withStretch = (index: number, stretch: boolean, storage?: string): unknown => {
      const raw = structuredClone(HISTORY["../../test/fixtures/schema/0.1.3.json"]) as {
        components: Record<string, unknown>[];
      };
      const c = raw.components[index];
      if (c === undefined) {
        throw new Error("no component");
      }
      c.stretch = stretch;
      if (storage !== undefined) {
        c.storage = storage;
      }
      return raw;
    };

    it("reads `stretch: true` of the 0.1.3 file as no room, without notices and without the old key", () => {
      const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.3.json"]);
      expect(notices).toEqual([]);
      const first = project.components[0];
      if (first?.kind !== "cards") {
        throw new Error("expected a deck first");
      }
      // a stretched deck grew by `auto`, which is now growth only under "bigger wells"
      expect(growthOf(first, "stack")).toBe("off");
      expect(growthOf(first, "stack", false, true)).toBe("auto");
      expect("stretch" in first).toBe(false);
      expect(first.room).toBeUndefined();
      expect(serializeProject(project, noForeign())).not.toContain("stretch");
    });

    it("keeps a flat deck that was stretched flat: it never stretched, so it does not grow taller", () => {
      const { project } = loadOld(withStretch(0, true, "flat"));
      const first = project.components[0];
      expect(first && growthOf(first, "stack", true)).toBe("off");
      expect(first && growthOf(first, "stack", true, true)).toBe("off");
    });

    it("reads `stretch: false` as no room, as it was", () => {
      const { project, notices } = loadOld(withStretch(0, false));
      expect(notices).toEqual([]);
      const first = project.components[0];
      expect(first?.room).toBeUndefined();
      expect(first && "growth" in first).toBe(false);
      expect(first && growthOf(first, "stack")).toBe("off");
    });

    it("lets `growth` win over `stretch` when a file has both, as a room in whole cards", () => {
      const raw = withStretch(0, false) as { components: Record<string, unknown>[] };
      const c = raw.components[0];
      if (c === undefined) {
        throw new Error("no component");
      }
      c.growth = { stack: 9 };
      const { project } = loadOld(raw);
      const room = project.components[0]?.room;
      expect(typeof room).toBe("number");
      expect(room).toBeGreaterThanOrEqual(1);
      expect(project.components[0] && "growth" in project.components[0]).toBe(false);
    });

    it("ignores `stretch` on a kind that has no stack", () => {
      const raw = structuredClone(HISTORY["../../test/fixtures/schema/0.1.3.json"]) as {
        components: { kind: string; stretch?: boolean }[];
      };
      for (const c of raw.components) {
        c.stretch = false;
      }
      const { project, notices } = loadOld(raw);
      expect(notices).toEqual([]);
      expect(project.components.map((c) => [c.kind, c.room])).toEqual(
        project.components.map((c) => [c.kind, undefined]),
      );
    });
  });

  it("reads the growth settings of the 0.1.12 file as a room per item, a number or max", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.12.json"]);
    expect(notices).toEqual([]);
    // Was: { stack: 12 }, { stack: "max" }, { w: "off", d: 8, h: "max" }, { stack: "auto" },
    // { w: 3, d: "auto" }, { h: 2 }. A deck's 12 mm is 25 of its (sleeved, scaled) cards, `max`
    // stays `max`, bulk's `max` on any axis is `max`, `auto` is none, and minis and custom items
    // have no room row (migrate-0.3.ts).
    expect(project.components.map((c) => [c.kind, c.room])).toEqual([
      ["cards", 25],
      ["cards", "max"],
      ["bulk", "max"],
      ["tiles", undefined],
      ["minis", undefined],
      ["custom", undefined],
    ]);
    expect(project.components.some((c) => "growth" in c)).toBe(false);
    expect(validateProject(project).filter((n) => n.level === "error")).toEqual([]);
    const again = loadOld(JSON.parse(serializeProject(project, noForeign())));
    // Saving stamps the running app's version, which is not what the old file says.
    expect({ ...again.project, createdWith: project.createdWith }).toEqual(project);
  });

  it("reads the dividers of the 0.1.13 file, and keeps them through a save and a link", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.13.json"]);
    expect(notices).toEqual([]);
    expect(project.components.map((c) => c.dividers)).toEqual([
      undefined,
      undefined,
      undefined,
      2,
      undefined,
      undefined,
    ]);
    expect(validateProject(project).filter((n) => n.level === "error")).toEqual([]);
    const again = loadOld(JSON.parse(serializeProject(project, noForeign())));
    // Saving stamps the running app's version, which is not what the old file says.
    expect({ ...again.project, createdWith: project.createdWith }).toEqual(project);
    const decoded = decodeHash(encodeHash(project, noForeign()));
    expect(decoded.ok && { ...decoded.project, createdWith: project.createdWith }).toEqual(project);
  });

  it("refuses a room that is neither max nor a number", () => {
    const raw = structuredClone(HISTORY["../../test/fixtures/schema/0.3.0.json"]) as {
      components: { room?: unknown }[];
    };
    const c = raw.components[0];
    if (c === undefined) {
      throw new Error("no component");
    }
    c.room = "lots";
    expect(parseProject(raw).ok).toBe(false);
  });

  it("drops an old growth that is neither a word nor a number on the way in, as it never counted", () => {
    const raw = structuredClone(HISTORY["../../test/fixtures/schema/0.1.12.json"]) as {
      components: { growth: Record<string, unknown> }[];
    };
    const c = raw.components[0];
    if (c === undefined) {
      throw new Error("no component");
    }
    c.growth = { stack: "lots" };
    const { project } = loadOld(raw);
    expect(project.components[0]?.room).toBeUndefined();
  });

  it("reads the fillToTop setting of the 0.1.4 file, and defaults it on for older files", () => {
    const { project } = loadOld(HISTORY["../../test/fixtures/schema/0.1.4.json"]);
    expect(project.settings.fillToTop).toBe(false);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.3.json"]);
    expect(older.project.settings.fillToTop).toBe(true);
  });

  it("reads the infill setting of the 0.1.7 file, and defaults it to 15 for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.7.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.infill).toBe(30);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.6.json"]);
    expect(older.project.settings.infill).toBe(15);
  });

  it("reads wallAbsorb from the 0.1.8 file, and wallGrowth, its old name, from the 0.1.6 and 0.1.7 files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.8.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.wallAbsorb).toBe(0.8);
    for (const old of ["0.1.6", "0.1.7"]) {
      const file = loadOld(HISTORY[`../../test/fixtures/schema/${old}.json`]);
      // the old key is read, not reported as an unknown field, and not written back
      expect(file.notices).toEqual([]);
      expect(file.project.settings.wallAbsorb).toBe(1.2);
      expect("wallGrowth" in file.project.settings).toBe(false);
    }
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.5.json"]);
    expect(older.project.settings.wallAbsorb).toBe(0);
  });

  it("reads the merge switches from the 0.1.9 file, and defaults them for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.9.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.mergeFillers).toBe(false);
    expect(project.settings.mergeRisers).toBe(true);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.8.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.settings.mergeFillers).toBe(true);
    expect(older.project.settings.mergeRisers).toBe(true);
  });

  it("reads the least riser from the 0.2.1 file, and defaults it to 3 mm for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.2.1.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.minRiser).toBe(7.5);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.2.0.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.settings.minRiser).toBe(3);
    // the riser fold: as saved in a file that has it, and on (the default) in a file from before it
    expect(project.settings.mergeRisers).toBe(true);
    expect(
      loadOld(HISTORY["../../test/fixtures/schema/0.1.8.json"]).project.settings.mergeRisers,
    ).toBe(true);
  });

  it("reads a figure's keepUpright from the 0.2.3 file, and leaves it absent for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.2.3.json"]);
    expect(notices).toEqual([]);
    const minis = project.components.find((c) => c.kind === "minis");
    expect(minis?.kind === "minis" && minis.figures[0]?.keepUpright).toBe(true);
    expect(minis?.kind === "minis" && minis.figures[1]).not.toHaveProperty("keepUpright");
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.2.2.json"]);
    expect(older.notices).toEqual([]);
    for (const c of older.project.components) {
      if (c.kind === "minis") {
        for (const f of c.figures) {
          expect(f).not.toHaveProperty("keepUpright");
        }
      }
    }
  });

  it("reads an item's own packing from the 0.2.4 file, and leaves it absent for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.2.4.json"]);
    expect(notices).toEqual([]);
    const own = project.components.filter(
      (c) => (c.kind === "bulk" || c.kind === "minis") && c.packing !== undefined,
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.some((c) => c.kind === "bulk" && c.packing === 0.65)).toBe(true);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.2.3.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.components.some((c) => "packing" in c)).toBe(false);
  });

  it("reads the engraving switch from the 0.1.14 file, and defaults it on for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.14.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.engraveNames).toBe(false);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.13.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.settings.engraveNames).toBe(true);
  });

  it("reads the engraving switch from the 0.1.16 file under its new name", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.16.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.engraveNames).toBe(false);
    // the 0.1.15 file calls it engraveNumbers
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.15.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.settings.engraveNames).toBe(false);
  });

  it("reads the one-wall switch from the 0.1.15 file, and defaults it off for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.15.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.oneWall).toBe(true);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.14.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.settings.oneWall).toBe(false);
  });

  it("reads the play limit from the 0.1.11 file, and defaults it for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.11.json"]);
    expect(notices).toEqual([]);
    expect(project.settings.playLimit).toBe(2.5);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.10.json"]);
    expect(older.notices).toEqual([]);
    expect(older.project.settings.playLimit).toBe(1.5);
  });

  it("reads the preset thickness correction from the 0.1.10 file, and none from older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.10.json"]);
    expect(notices).toEqual([]);
    const cards = project.components.filter((c) => c.kind === "cards");
    expect(cards.map((c) => c.thickness)).toEqual([
      { mode: "preset", scale: 1.15 },
      { mode: "measured", cards: 12, stackMm: 5.4 },
    ]);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.9.json"]);
    expect(older.notices).toEqual([]);
    const first = older.project.components.find((c) => c.kind === "cards");
    expect(first?.kind === "cards" && first.thickness).toEqual({ mode: "preset" });
  });

  it("prefers wallAbsorb when a file has both keys", () => {
    const raw = structuredClone(HISTORY["../../test/fixtures/schema/0.1.8.json"]) as {
      settings: Record<string, number>;
    };
    raw.settings.wallGrowth = 2.5;
    const { project, notices } = loadOld(raw);
    expect(notices).toEqual([]);
    expect(project.settings.wallAbsorb).toBe(0.8);
  });

  it("reads the separators option of the 0.1.5 file, and leaves it unset for older files", () => {
    const { project, notices } = loadOld(HISTORY["../../test/fixtures/schema/0.1.5.json"]);
    expect(notices).toEqual([]);
    expect(project.components.map((c) => c.separators)).toEqual([
      3,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    const older = loadOld(HISTORY["../../test/fixtures/schema/0.1.4.json"]);
    expect(older.project.components.every((c) => c.separators === undefined)).toBe(true);
  });
});
