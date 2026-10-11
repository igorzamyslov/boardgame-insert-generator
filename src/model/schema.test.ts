import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import { newComponent, newProject } from "./defaults";
import { MAX_JSON_DEPTH } from "./json";
import {
  MIGRATIONS,
  noForeign,
  parseProject,
  parseProjectWith,
  serializeProject,
  toSerializable,
} from "./schema";
import type { Project } from "./types";
import { validateProject } from "./validate";
import { APP_VERSION, SCHEMA_VERSION } from "./version";

type Json = Record<string, unknown>;

function raw(p: Project): Json {
  return JSON.parse(serializeProject(p, noForeign())) as Json;
}

function firstCards(input: Json): Json {
  return (input.components as Json[])[0] as Json;
}

function expectError(input: unknown): string {
  const result = parseProject(input);
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

describe("serializeProject / parseProject", () => {
  it("round-trips every component kind, lock kind and the stored layout", () => {
    const p = sampleProject();
    const result = parseProject(raw(p));
    expect(result).toEqual({
      ok: true,
      project: { ...p, createdWith: APP_VERSION },
      foreign: { components: [] },
      notices: [],
    });
  });

  it("round-trips a project with no components", () => {
    const p = newProject();
    const result = parseProject(raw(p));
    expect(result.ok && result.project).toEqual(p);
  });

  it("writes createdWith as this app's version", () => {
    expect(raw({ ...sampleProject(), createdWith: "0.0.1" }).createdWith).toBe(APP_VERSION);
  });
});

describe("a half-edited project (NaN fields)", () => {
  it("survives serialize and parse, and validateProject reports the fields", () => {
    const p = sampleProject();
    p.box.innerDepth = Number.NaN;
    const cards = p.components[0];
    if (cards?.kind !== "cards") {
      throw new Error("the sample starts with a cards component");
    }
    const deck = cards.decks[0];
    if (!deck) {
      throw new Error("the sample cards have a deck");
    }
    deck.count = Number.NaN;

    const result = parseProject(raw(p));
    if (!result.ok) {
      throw new Error(`expected ok, got: ${result.error}`);
    }
    expect(result.project.box.innerDepth).toBeNaN();
    const loadedCards = result.project.components[0];
    expect(loadedCards?.kind === "cards" && loadedCards.decks[0]?.count).toBeNaN();
    const paths = validateProject(result.project).map((n) => n.path);
    expect(paths).toContain("/box/innerDepth");
    expect(paths).toContain("/components/0/decks/0/count");
  });

  it("still refuses text and other types where a number belongs", () => {
    for (const bad of ["12", {}, [], true]) {
      const input = raw(newProject());
      (input.box as Json).innerDepth = bad;
      expect(expectError(input)).toMatch(/\/box\/innerDepth: expected a number/);
    }
  });
});

describe("toSerializable", () => {
  it("returns a deep copy that shares nothing with the project or the foreign data", () => {
    const foreigns = [
      noForeign(),
      {
        components: [{ index: 0, raw: { kind: "dial", nested: { a: 1 } } }],
        values: [
          { path: "/settings/leftover", raw: { mode: "hollow", nested: { a: 1 } } },
          { path: "/locks/1", raw: { kind: "magnet", trayKey: "x", strength: { n: 3 } } },
        ],
      },
    ];
    for (const foreign of foreigns) {
      const p = sampleProject();
      const projectBefore = structuredClone(p);
      const foreignBefore = structuredClone(foreign);
      const out = toSerializable(p, foreign);
      (out.box as Json).innerWidth = 1;
      (out.settings as Json).wall = 99;
      for (const comp of out.components as Json[]) {
        comp.name = "changed";
        comp.nested = "changed";
      }
      for (const lock of out.locks as Json[]) {
        lock.trayKey = "changed";
        lock.strength = "changed";
      }
      const leftover = (out.settings as Json).leftover;
      if (typeof leftover === "object" && leftover !== null) {
        (leftover as Json).nested = "changed";
      }
      ((out.layout as Json).trays as Json[]).length = 0;
      expect(p).toEqual(projectBefore);
      expect(foreign).toEqual(foreignBefore);
    }
  });

  it("re-inserts foreign components at their original indices", () => {
    const p = newProject();
    const [a, b] = [newComponent("custom"), newComponent("cards")];
    p.components = [a, b];
    const x = { kind: "dial", id: "x" };
    const y = { kind: "spinner", id: "y" };
    const out = toSerializable(p, {
      components: [
        { index: 3, raw: y },
        { index: 1, raw: x },
      ],
    });
    expect(out.components).toEqual([a, x, b, y]);
  });

  it("writes unknown values back while the field still holds the substituted default", () => {
    const p = newProject();
    const before = structuredClone(p);
    const out = toSerializable(p, {
      components: [],
      values: [
        { path: "/box/headroomCoverage", raw: "none" },
        { path: "/settings/leftover", raw: "hollow" },
      ],
    });
    expect(out.box).toEqual({ ...p.box, headroomCoverage: "none" });
    expect(out.settings).toEqual({ ...p.settings, leftover: "hollow" });
    expect(p).toEqual(before);
  });

  it("keeps the user's value when the field was changed after loading", () => {
    const p = newProject();
    p.settings = { ...p.settings, leftover: "solid" };
    const out = toSerializable(p, {
      components: [],
      values: [{ path: "/settings/leftover", raw: "hollow" }],
    });
    expect((out.settings as Record<string, unknown>).leftover).toBe("solid");
  });

  it("re-inserts unknown locks at their original indices", () => {
    const p = newProject();
    const a = { kind: "stack" as const, trayKeys: ["a:p0:0"] };
    const b = { kind: "stack" as const, trayKeys: ["b:p0:0"] };
    p.locks = [a, b];
    const x = { kind: "magnet", trayKey: "x" };
    const y = { kind: "glue", trayKey: "y" };
    const out = toSerializable(p, {
      components: [],
      values: [
        { path: "/locks/3", raw: y },
        { path: "/locks/1", raw: x },
      ],
    });
    expect(out.locks).toEqual([a, x, b, y]);
    expect(p.locks).toEqual([a, b]);
  });

  it("appends foreign components whose index is past the end", () => {
    const p = newProject();
    const out = toSerializable(p, { components: [{ index: 7, raw: { kind: "dial" } }] });
    expect(out.components).toEqual([{ kind: "dial" }]);
  });

  it("never mutates the shared defaults when writing values back", () => {
    const out = toSerializable(newProject(), {
      components: [],
      values: [{ path: "/settings/leftover", raw: "hollow" }],
    });
    expect((out.settings as Json).leftover).toBe("hollow");
    expect(newProject().settings.leftover).toBe("spare");
  });
});

describe("parseProject: not a project", () => {
  it.each([null, 42, "text", [1, 2]])("rejects %j", (input) => {
    expect(expectError(input)).toMatch(/not an insert generator project/);
  });

  it("rejects a missing or unreadable schemaVersion", () => {
    const input = raw(newProject());
    delete input.schemaVersion;
    expect(expectError(input)).toMatch(/no schemaVersion/);
    expect(expectError({ ...input, schemaVersion: "one" })).toMatch(
      /unreadable schema version "one"/,
    );
  });

  it("passes damaged-file errors through", () => {
    const input = raw(newProject());
    (input.box as Json).innerWidth = "wide";
    expect(expectError(input)).toMatch(/damaged: \/box\/innerWidth: expected a number/);
  });
});

describe("parseProject: spec §5 bounds", () => {
  it("refuses counts over 2000", () => {
    const input = raw(sampleProject());
    firstCards(input).decks = [{ name: "Huge", count: 5000 }];
    expect(expectError(input)).toBe(
      "This project can't be opened: /components/0/decks/0/count: Card count must be at most 2000.",
    );
  });

  it("names the path of every refused value and ends with one full stop", () => {
    const input = raw(newProject());
    Object.assign(input.box as Json, { innerWidth: 1001, innerDepth: 1001 });
    input.components = [{ ...newComponent("custom"), count: 2001 }];
    expect(expectError(input)).toBe(
      "This project can't be opened: /box/innerWidth: Box width must be at most 1000 mm; " +
        "/box/innerDepth: Box depth must be at most 1000 mm; " +
        "/components/0/count: Count must be at most 2000.",
    );
  });

  it("refuses more than 100 components", () => {
    const input = raw(newProject());
    input.components = Array.from({ length: 101 }, (_, i) => ({
      id: `c${String(i).padStart(7, "0")}`,
      kind: "custom",
      w: 10,
      d: 10,
      h: 10,
      count: 1,
    }));
    expect(expectError(input)).toMatch(/Too many components \(101\)/);
  });

  it("still loads field-level problems, so a half-edited project can be fixed", () => {
    const input = raw(sampleProject());
    firstCards(input).decks = [{ name: "Empty", count: 0 }];
    expect(parseProject(input).ok).toBe(true);
  });

  it("loads over-limit input without enforceBounds, but never corrupt structure", () => {
    const input = raw(sampleProject());
    firstCards(input).decks = [{ name: "Huge", count: 5000 }];
    const opts = { appSchemaVersion: SCHEMA_VERSION, migrations: MIGRATIONS };
    expect(parseProjectWith(input, opts).ok).toBe(false);
    expect(parseProjectWith(input, { ...opts, enforceBounds: true }).ok).toBe(false);
    const loaded = parseProjectWith(input, { ...opts, enforceBounds: false });
    expect(loaded.ok && validateProject(loaded.project).map((n) => n.code)).toContain(
      "limit.count",
    );

    const twins = raw(sampleProject());
    const components = twins.components as Json[];
    components.push({ ...firstCards(twins) });
    const refused = parseProjectWith(twins, { ...opts, enforceBounds: false });
    expect(refused.ok ? "loaded" : refused.error).toMatch(/share the id/);
  });

  it("uses the current schema version by default", () => {
    const result = parseProject(raw(newProject()));
    expect(result.ok && result.project.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

/** `levels` arrays nested inside each other around a number. */
function nested(levels: number): unknown {
  let deep: unknown = 1;
  for (let i = 0; i < levels; i++) {
    deep = [deep];
  }
  return deep;
}

describe("parseProject: hostile input", () => {
  const TOO_DEEP = `This project file is damaged: nested too deeply (more than ${MAX_JSON_DEPTH} levels).`;

  it("rejects input nested too deeply with an error result", () => {
    const input = raw(newProject());
    let nest: unknown = 1;
    for (let i = 0; i < 100; i += 1) {
      nest = { a: nest };
    }
    input.extra = nest;
    expect(expectError(input)).toBe(TOO_DEEP);
  });

  it("rejects deeply nested data without throwing, in newer and current files", () => {
    const deep = nested(5000);
    const newer = (input: Json): Json => ({ ...input, schemaVersion: "0.1.9" });

    const field = raw(sampleProject());
    field.extra = deep;
    expect(expectError(newer(field))).toBe(TOO_DEEP);
    expect(expectError(field)).toBe(TOO_DEEP);

    const component = raw(sampleProject());
    (component.components as unknown[]).push({ kind: "dial", ring: deep });
    expect(expectError(newer(component))).toBe(TOO_DEEP);

    const lock = raw(sampleProject());
    (lock.locks as unknown[]).push({ kind: "magnet", strength: deep });
    expect(expectError(newer(lock))).toBe(TOO_DEEP);
  });

  it("accepts data nested exactly as deep as the limit", () => {
    const input: Json = { ...raw(sampleProject()), schemaVersion: "0.1.9" };
    // The project object is one level, so the field may hold MAX_JSON_DEPTH - 1 more.
    input.extra = nested(MAX_JSON_DEPTH - 1);
    expect(parseProject(input).ok).toBe(true);
    input.extra = nested(MAX_JSON_DEPTH);
    expect(expectError(input)).toBe(TOO_DEEP);
  });
});
