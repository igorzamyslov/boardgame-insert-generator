import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import type { Json, ReadOptions } from "./schema-read";
import { readProject } from "./schema-read";
import { DEFAULT_SETTINGS } from "./settings";
import type { ParseResult } from "./types";
import { SCHEMA_VERSION } from "./version";

const CURRENT: ReadOptions = { newer: false, schemaVersion: SCHEMA_VERSION };
const NEWER: ReadOptions = { newer: true, schemaVersion: "0.1.9" };

const MINIMAL: Json = {
  schemaVersion: SCHEMA_VERSION,
  box: { innerWidth: 290, innerDepth: 290, innerHeight: 70 },
  printer: { bedX: 256, bedY: 256, bedZ: 256 },
};

/** The sample project as plain JSON, the way a file holds it. */
function sampleJson(): Json {
  return JSON.parse(JSON.stringify(sampleProject())) as Json;
}

function list(raw: Json, key: string): Json[] {
  return raw[key] as Json[];
}

function at(raw: Json, key: string, index: number): Json {
  return list(raw, key)[index] as Json;
}

function expectOk(result: ParseResult) {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`);
  }
  return result;
}

function expectError(result: ParseResult): string {
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

describe("readProject: files of this schema line", () => {
  it("reads every component kind, lock kind and the stored layout unchanged", () => {
    const result = expectOk(readProject(sampleJson(), CURRENT));
    expect(result.project).toEqual(sampleProject());
    expect(result.foreign).toEqual({ components: [] });
    expect(result.notices).toEqual([]);
  });

  it("does not modify its input", () => {
    const input = sampleJson();
    const copy = structuredClone(input);
    readProject(input, CURRENT);
    expect(input).toEqual(copy);
  });

  it("fills every optional field with its default", () => {
    const { project } = expectOk(readProject(MINIMAL, CURRENT));
    expect(project.name).toBe("Untitled insert");
    expect(project.id).toMatch(/^[0-9a-z]{8}$/);
    expect(project.createdWith).toBe("unknown");
    expect(project.box).toEqual({
      innerWidth: 290,
      innerDepth: 290,
      innerHeight: 70,
      headroom: 0,
      headroomCoverage: "full",
      storedOnSide: false,
    });
    expect(project.printer).toEqual({
      bedX: 256,
      bedY: 256,
      bedZ: 256,
      bedMargin: 5,
      layerHeight: 0.2,
    });
    expect(project.settings).toEqual(DEFAULT_SETTINGS);
    expect(project.components).toEqual([]);
    expect(project.locks).toEqual([]);
    expect(project.layout).toBeUndefined();
  });

  it("returns mutable copies of the frozen defaults", () => {
    const { project } = expectOk(readProject(MINIMAL, CURRENT));
    expect(() => {
      project.settings.lip.height = 3;
      project.settings.fingerPocket.width = 30;
      project.box.headroom = 4;
      project.printer.bedMargin = 2;
    }).not.toThrow();
    expect(DEFAULT_SETTINGS.lip.height).not.toBe(3);
    expect(DEFAULT_SETTINGS.fingerPocket.width).not.toBe(30);
    const partial = expectOk(readProject({ ...MINIMAL, settings: { wall: 2 } }, CURRENT)).project;
    expect(() => {
      partial.settings.lip.height = 3;
      partial.settings.fingerPocket.width = 30;
    }).not.toThrow();
  });

  it("fills single missing settings, including nested ones", () => {
    const { project } = expectOk(
      readProject({ ...MINIMAL, settings: { wall: 2, lip: { enabled: false } } }, CURRENT),
    );
    expect(project.settings).toEqual({
      ...DEFAULT_SETTINGS,
      wall: 2,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
    });
  });

  it("fills component defaults", () => {
    const input = {
      ...MINIMAL,
      components: [
        { kind: "cards", shortSide: 63.5, longSide: 88, decks: [{ count: 10 }] },
        { kind: "minis", figures: [{ w: 25, d: 25, h: 40, count: 1 }] },
      ],
    };
    const [cards, minis] = expectOk(readProject(input, CURRENT)).project.components;
    expect(cards).toMatchObject({
      name: "Cards",
      access: "sometimes",
      sleeve: "none",
      thickness: { mode: "preset" },
      storage: "auto",
      decks: [{ name: "", count: 10 }],
    });
    expect(cards?.id).toMatch(/^[0-9a-z]{8}$/);
    expect(minis).toMatchObject({ name: "Miniatures", storage: "pockets", access: "sometimes" });
  });

  it("names a field with the wrong type", () => {
    const input = sampleJson();
    (input.box as Json).innerWidth = "290";
    expect(expectError(readProject(input, CURRENT))).toMatch(
      /\/box\/innerWidth: expected a number/,
    );
  });

  it("names missing required fields and summarizes long lists", () => {
    expect(expectError(readProject({ ...MINIMAL, box: { innerWidth: 1 } }, CURRENT))).toMatch(
      /\/box\/innerDepth: missing/,
    );
    expect(expectError(readProject({ schemaVersion: SCHEMA_VERSION }, CURRENT))).toMatch(
      /\/box: missing; \/printer: missing/,
    );
    expect(expectError(readProject({ ...MINIMAL, box: {}, printer: {} }, CURRENT))).toMatch(
      /and 3 more/,
    );
  });

  it("rejects an unknown component kind or value", () => {
    expect(
      expectError(readProject({ ...MINIMAL, components: [{ kind: "dial" }] }, CURRENT)),
    ).toMatch(/\/components\/0\/kind: unknown value "dial"/);
    const input = sampleJson();
    at(input, "components", 0).storage = "sideways";
    expect(expectError(readProject(input, CURRENT))).toMatch(
      /\/components\/0\/storage: unknown value "sideways"/,
    );
  });

  it("rejects an unknown settings value", () => {
    const input = sampleJson();
    (input.settings as Json).leftover = "hollow";
    expect(expectError(readProject(input, CURRENT))).toMatch(
      /\/settings\/leftover: unknown value "hollow"/,
    );
  });

  it("drops unknown fields with one info notice", () => {
    const input = sampleJson();
    input.extra = 1;
    (input.box as Json).lidColour = "red";
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project).not.toHaveProperty("extra");
    expect(result.project.box).not.toHaveProperty("lidColour");
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({ level: "info", code: "schema.unknownFields" });
    expect(result.notices[0]?.message).toContain("/extra");
    expect(result.notices[0]?.message).toContain("/box/lidColour");
  });

  it("swaps card sides entered the wrong way round, with a notice", () => {
    const input = sampleJson();
    const cards = at(input, "components", 0);
    cards.shortSide = 88;
    cards.longSide = 63.5;
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.components[0]).toMatchObject({ shortSide: 63.5, longSide: 88 });
    expect(result.notices).toEqual([
      expect.objectContaining({ code: "schema.cardSidesSwapped", path: "/components/0/shortSide" }),
    ]);
  });

  it("drops unreadable locks with a notice and keeps the rest", () => {
    const input = sampleJson();
    list(input, "locks").push({ kind: "size", trayKey: "x" }, "junk" as unknown as Json);
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.locks).toEqual(sampleProject().locks);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["lock.dropped", "/locks/3"],
      ["lock.dropped", "/locks/4"],
    ]);
  });

  it("drops an unreadable stored layout with a notice", () => {
    const input = sampleJson();
    (input.layout as Json).seed = "forty-two";
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.layout).toBeUndefined();
    expect(result.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });
});

describe("readProject: files from a newer minor", () => {
  it("writes the given schemaVersion", () => {
    expect(expectOk(readProject(sampleJson(), NEWER)).project.schemaVersion).toBe("0.1.9");
  });

  it("keeps unknown fields on the project, the box and components", () => {
    const input = sampleJson();
    input.theme = "dark";
    (input.box as Json).insertColour = "blue";
    at(input, "components", 0).wrap = "rubber band";
    const result = expectOk(readProject(input, NEWER));
    expect(result.project).toHaveProperty("theme", "dark");
    expect(result.project.box).toHaveProperty("insertColour", "blue");
    expect(result.project.components[0]).toHaveProperty("wrap", "rubber band");
    expect(result.notices).toEqual([]);
  });

  it("keeps unknown kinds and components with unknown values as foreign, with their indices", () => {
    const input = sampleJson();
    const comps = list(input, "components");
    comps.splice(1, 0, { id: "dial0001", name: "Dial", kind: "dial", diameter: 40 });
    at(input, "components", 4).shape = { type: "circle", diameter: 30 };
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.components.map((c) => c.id)).toEqual([
      "cards001",
      "cards002",
      "bulk0001",
      "minis001",
      "custom01",
    ]);
    expect(result.foreign.components).toEqual([
      { index: 1, raw: comps[1] },
      { index: 4, raw: comps[4] },
    ]);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["schema.foreignComponent", "/components/1"],
      ["schema.foreignComponent", "/components/4"],
    ]);
  });

  it("uses the default for unknown box and settings values and keeps the raw ones", () => {
    const input = sampleJson();
    (input.box as Json).headroomCoverage = "none";
    (input.settings as Json).leftover = "hollow";
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.box.headroomCoverage).toBe("full");
    expect(result.project.settings.leftover).toBe("spare");
    expect(result.foreign.values).toEqual([
      { path: "/box/headroomCoverage", raw: "none" },
      { path: "/settings/leftover", raw: "hollow" },
    ]);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["schema.unknownValue", "/box/headroomCoverage"],
      ["schema.unknownValue", "/settings/leftover"],
    ]);
  });

  it("keeps a lock of an unknown kind in foreign.values without applying it", () => {
    const input = sampleJson();
    const magnet = { kind: "magnet", trayKey: "x", strength: 3 };
    list(input, "locks").push(magnet);
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.locks).toEqual(sampleProject().locks);
    expect(result.foreign.values).toEqual([{ path: "/locks/3", raw: magnet }]);
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([
      ["schema.unknownValue", "/locks/3"],
    ]);
  });

  it("still drops an unreadable lock of a known kind", () => {
    const input = sampleJson();
    list(input, "locks").push({ kind: "size", trayKey: "x" });
    const result = expectOk(readProject(input, NEWER));
    expect(result.foreign.values).toBeUndefined();
    expect(result.notices.map((n) => [n.code, n.path])).toEqual([["lock.dropped", "/locks/3"]]);
  });

  it("keeps a stored tray with an unknown feature verbatim and flags it", () => {
    const input = sampleJson();
    const tray = at(input.layout as Json, "trays", 0);
    const compartment = at(tray, "compartments", 0);
    list(compartment, "features").push({ type: "magnetHole", d: 6 });
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.layout?.trays[0]).toEqual(tray);
    expect(result.notices.map((n) => n.code)).toEqual(["layout.unsupportedTrays"]);

    const current = expectOk(readProject(input, CURRENT));
    expect(current.project.layout).toBeUndefined();
    expect(current.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });
});
