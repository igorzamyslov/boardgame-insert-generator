import { describe, expect, it, vi } from "vitest";
import { sampleProject } from "../test-support/sample";
import type { Json, ReadOptions } from "./schema-read";
import { MAX_JSON_DEPTH, readProject } from "./schema-read";
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

  it("indexes a kept lock among the surviving locks, not the file's", () => {
    const input = sampleJson();
    const known = list(input, "locks");
    const magnet = { kind: "magnet", trayKey: "x" };
    const glue = { kind: "glue", trayKey: "y" };
    // File order: dropped, unknown, known x3, dropped, unknown.
    input.locks = [{ kind: "size", trayKey: "d" }, magnet, ...known, "junk", glue];
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.locks).toEqual(sampleProject().locks);
    expect(result.foreign.values).toEqual([
      { path: "/locks/0", raw: magnet },
      { path: "/locks/4", raw: glue },
    ]);
  });

  it("reads a JSON null as NaN where a number belongs, so validateProject can report it", () => {
    const input = sampleJson();
    (input.box as Json).innerDepth = null;
    (input.settings as Json).wall = null;
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.box.innerDepth).toBeNaN();
    expect(result.project.settings.wall).toBeNaN();
  });

  it("reads a JSON null as NaN in a component, optional numbers included", () => {
    const input = sampleJson();
    const cards = at(input, "components", 0);
    cards.shortSide = null;
    const custom = list(input, "components").find((c) => c.kind === "custom") as Json;
    custom.w = null;
    const result = expectOk(readProject(input, CURRENT));
    const [first] = result.project.components;
    expect(first?.kind === "cards" && first.shortSide).toBeNaN();
    const loaded = result.project.components.find((c) => c.kind === "custom");
    expect(loaded?.kind === "custom" && loaded.w).toBeNaN();
  });

  it("drops a stored layout that holds a null number (computed data is never NaN)", () => {
    const input = sampleJson();
    at(input.layout as Json, "trays", 0).x = null;
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.layout).toBeUndefined();
    expect(result.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });

  it("drops a stored layout with a null number in a compartment or in the settings", () => {
    for (const mutate of [
      (layout: Json) => {
        at(at(layout, "trays", 0), "compartments", 0).w = null;
      },
      (layout: Json) => {
        layout.seed = null;
      },
    ]) {
      const input = sampleJson();
      mutate(input.layout as Json);
      const result = expectOk(readProject(input, CURRENT));
      expect(result.project.layout).toBeUndefined();
      expect(result.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
    }
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

/** The sample project's single stored tray, as plain JSON. */
function firstTray(raw: Json): Json {
  return at(raw.layout as Json, "trays", 0);
}

/** The sample project as JSON text with a leading own "__proto__" field, as a hostile file could have it. */
function jsonWithProtoField(): Json {
  const text = JSON.stringify(sampleProject()).replace(/^\{/, '{"__proto__":{"polluted":true},');
  return JSON.parse(text) as Json;
}

describe("readProject: hostile input", () => {
  it("survives 150,000 damaged list entries and counts them", () => {
    const input = sampleJson();
    at(input, "components", 0).decks = Array.from({ length: 150_000 }, () => ({ name: "d" }));
    const error = expectError(readProject(input, CURRENT));
    expect(error).toMatch(
      /^This project file is damaged: \/components\/0\/decks\/0\/count: missing;/,
    );
    expect(error).toContain("and 149997 more");
  });

  it("survives 150,000 unknown fields and reports them once", () => {
    const input = sampleJson();
    at(input, "components", 0).decks = Array.from({ length: 150_000 }, () => ({
      name: "d",
      count: 1,
      extra: true,
    }));
    const result = expectOk(readProject(input, CURRENT));
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]?.message).toContain("and 149997 more");
  });

  it("survives 300,000 bad features in a stored tray by dropping the layout", () => {
    const input = sampleJson();
    const compartment = at(firstTray(input), "compartments", 0);
    compartment.features = Array.from({ length: 300_000 }, () => ({ type: "bogus" }));
    const result = expectOk(readProject(input, CURRENT));
    expect(result.project.layout).toBeUndefined();
    expect(result.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });

  it("survives 300,000 unknown features in a newer file by keeping the tray", () => {
    const input = sampleJson();
    const compartment = at(firstTray(input), "compartments", 0);
    compartment.features = Array.from({ length: 300_000 }, () => ({ type: "bogus" }));
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.layout?.trays).toHaveLength(1);
    expect(result.notices.map((n) => n.code)).toEqual(["layout.unsupportedTrays"]);
  });

  it("rejects deeply nested data without throwing, in newer and current files", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 5000; i++) {
      deep = [deep];
    }
    const expected = `This project file is damaged: nested too deeply (more than ${MAX_JSON_DEPTH} levels).`;

    const field = sampleJson();
    field.extra = deep;
    expect(expectError(readProject(field, NEWER))).toBe(expected);
    expect(expectError(readProject(field, CURRENT))).toBe(expected);

    const component = sampleJson();
    list(component, "components").push({ kind: "dial", ring: deep });
    expect(expectError(readProject(component, NEWER))).toBe(expected);

    const lock = sampleJson();
    list(lock, "locks").push({ kind: "magnet", strength: deep });
    expect(expectError(readProject(lock, NEWER))).toBe(expected);
  });

  it("accepts data nested exactly as deep as the limit", () => {
    let deep: unknown = 1;
    for (let i = 0; i < MAX_JSON_DEPTH - 1; i++) {
      deep = [deep];
    }
    const input = sampleJson();
    input.extra = deep;
    expectOk(readProject(input, NEWER));
  });

  it("keeps error messages short however long the quoted value is", () => {
    const huge = "x".repeat(1e6);
    const error = expectError(readProject({ ...MINIMAL, components: [{ kind: huge }] }, CURRENT));
    expect(error.length).toBeLessThan(200);
    expect(error).toContain(`"${"x".repeat(40)}…"`);
  });

  it("does not dump non-text values into messages", () => {
    const input = { ...MINIMAL, components: [{ kind: { deep: "y".repeat(1e5) } }] };
    expect(expectError(readProject(input, CURRENT))).toMatch(
      /\/components\/0\/kind: expected text\.$/,
    );
    const number = { ...MINIMAL, components: [{ kind: 42 }] };
    expect(expectError(readProject(number, CURRENT))).toMatch(/kind: expected text\.$/);
  });

  it("keeps notices short too", () => {
    const huge = "x".repeat(1e6);

    const swapped = sampleJson();
    Object.assign(at(swapped, "components", 0), { name: huge, shortSide: 88, longSide: 63.5 });
    const swappedResult = expectOk(readProject(swapped, CURRENT));
    expect(swappedResult.notices[0]?.message.length).toBeLessThan(200);

    const foreign = sampleJson();
    list(foreign, "components").push({ kind: "dial", name: huge });
    const foreignResult = expectOk(readProject(foreign, NEWER));
    expect(foreignResult.notices[0]?.message.length).toBeLessThan(200);

    const unknownKey = sampleJson();
    unknownKey[huge] = 1;
    const droppedResult = expectOk(readProject(unknownKey, CURRENT));
    expect(droppedResult.notices[0]?.message.length).toBeLessThan(200);

    const tray = sampleJson();
    Object.assign(firstTray(tray), { part: "drawer", key: huge });
    const trayResult = expectOk(readProject(tray, NEWER));
    expect(trayResult.notices[0]?.message.length).toBeLessThan(250);
  });

  it("never touches Object.prototype through a __proto__ field", () => {
    expectOk(readProject(jsonWithProtoField(), CURRENT));
    expectOk(readProject(jsonWithProtoField(), NEWER));
    expect(({} as Json).polluted).toBeUndefined();
  });

  it("lists a __proto__ field as unknown in a current file and drops it", () => {
    const result = expectOk(readProject(jsonWithProtoField(), CURRENT));
    expect(Object.hasOwn(result.project, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(result.project)).toBe(Object.prototype);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]?.message).toContain("/__proto__");
  });

  it("keeps a __proto__ field as an own property in a newer file", () => {
    const result = expectOk(readProject(jsonWithProtoField(), NEWER));
    expect(Object.hasOwn(result.project, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(result.project, "__proto__")?.value).toEqual({
      polluted: true,
    });
    expect(Object.getPrototypeOf(result.project)).toBe(Object.prototype);
    expect(result.notices).toEqual([]);
  });

  it("treats a component entry that is not an object as damage in a newer file", () => {
    for (const entry of [42, null, "cards", [1]]) {
      const input = sampleJson();
      list(input, "components").splice(1, 0, entry as unknown as Json);
      expect(expectError(readProject(input, NEWER))).toMatch(/\/components\/1: expected an object/);
      expect(expectError(readProject(input, CURRENT))).toMatch(
        /\/components\/1: expected an object/,
      );
    }
  });

  it("reports an unknown tile shape type once, without follow-on problems", () => {
    const input = sampleJson();
    at(input, "components", 3).shape = { type: "circle", diameter: 30 };
    expect(expectError(readProject(input, CURRENT))).toBe(
      'This project file is damaged: /components/3/shape/type: unknown value "circle".',
    );
  });

  it("keeps a stored tray of an unknown part verbatim even if it lacks fields", () => {
    const input = sampleJson();
    const tray = firstTray(input);
    tray.part = "drawer";
    delete tray.wall;
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.layout?.trays[0]).toEqual(tray);
    expect(result.notices.map((n) => n.code)).toEqual(["layout.unsupportedTrays"]);

    const current = expectOk(readProject(input, CURRENT));
    expect(current.project.layout).toBeUndefined();
    expect(current.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });

  it("still drops the layout for a missing field in a tray of a known part", () => {
    const input = sampleJson();
    delete firstTray(input).wall;
    const result = expectOk(readProject(input, NEWER));
    expect(result.project.layout).toBeUndefined();
    expect(result.notices.map((n) => n.code)).toEqual(["layout.dropped"]);
  });

  it("does not generate ids that the file already has", () => {
    const random = vi.spyOn(crypto, "getRandomValues");
    try {
      expectOk(readProject(sampleJson(), CURRENT));
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

describe("readProject: newer files, unknown fields and independence from the input", () => {
  it("keeps unknown fields on nested objects", () => {
    const input = sampleJson();
    (input.settings as Json).extra1 = 1;
    ((input.settings as Json).lip as Json).extra2 = 2;
    (input.layout as Json).extra3 = 3;
    firstTray(input).extra4 = 4;
    at(input, "locks", 0).extra5 = 5;
    (at(input, "components", 0).decks as Json[]).forEach((d) => (d.extra6 = 6));
    const { project, notices } = expectOk(readProject(input, NEWER));
    expect(project.settings).toHaveProperty("extra1", 1);
    expect(project.settings.lip).toHaveProperty("extra2", 2);
    expect(project.layout).toHaveProperty("extra3", 3);
    expect(project.layout?.trays[0]).toHaveProperty("extra4", 4);
    expect(project.locks[0]).toHaveProperty("extra5", 5);
    const cards = project.components[0];
    expect(cards?.kind === "cards" && cards.decks[0]).toHaveProperty("extra6", 6);
    expect(notices).toEqual([]);
  });

  it("does not modify its input in a newer file", () => {
    const input = sampleJson();
    input.theme = { colours: ["dark"] };
    list(input, "components").push({ kind: "dial", ring: { n: 1 } });
    list(input, "locks").push({ kind: "magnet", strength: { n: 3 } });
    (input.box as Json).headroomCoverage = "none";
    const feature = { type: "magnetHole", d: 6 };
    list(at(firstTray(input), "compartments", 0), "features").push(feature);
    const copy = structuredClone(input);
    readProject(input, NEWER);
    expect(input).toEqual(copy);
  });

  it("never shares objects with its input", () => {
    const input = sampleJson();
    input.theme = { colours: ["dark"] };
    (input.box as Json).insertColour = { r: 1 };
    list(input, "components").push({ kind: "dial", ring: { n: 1 } });
    list(input, "locks").push({ kind: "magnet", strength: { n: 3 } });
    list(at(firstTray(input), "compartments", 0), "features").push({ type: "magnetHole", d: 6 });
    const copy = structuredClone(input);
    const result = expectOk(readProject(input, NEWER));

    (result.project as unknown as Json & { theme: { colours: string[] } }).theme.colours.push("x");
    (result.project.box as unknown as { insertColour: Json }).insertColour.r = 2;
    ((result.foreign.components[0]?.raw as Json).ring as Json).n = 2;
    ((result.foreign.values?.[0]?.raw as Json).strength as Json).n = 4;
    const tray = result.project.layout?.trays[0];
    const compartment = tray?.compartments[0] as unknown as Json;
    (compartment.features as Json[]).forEach((f) => (f.d = 7));
    compartment.x = 99;
    expect(input).toEqual(copy);
  });
});
