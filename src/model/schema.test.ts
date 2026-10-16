import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import { newComponent, newProject } from "./defaults";
import { inputsHash } from "./hash";
import { MAX_JSON_DEPTH } from "./json";
import {
  MIGRATIONS,
  noForeign,
  parseProject,
  parseProjectWith,
  parseStoredProject,
  serializeProject,
  toSerializable,
} from "./schema";
import type { Project, StoredLayout, TraySpec } from "./types";
import { VALIDATION_NOTICE_CODES, validateProject } from "./validate";
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

  it("round-trips the finger cut, curved floor and corner relief toggles, set or absent", () => {
    const p = newProject();
    const bits = { ...newComponent("bulk"), id: "b1" };
    const deck = { ...newComponent("cards"), id: "c1" };
    p.components = [
      { ...bits, fingerCuts: true, curvedFloor: false, cornerReliefs: true },
      { ...deck, fingerCuts: false, cornerReliefs: false },
      { ...newComponent("custom"), id: "x1" },
    ];
    const result = parseProject(raw(p));
    expect(result.ok && result.project.components).toEqual(p.components);
    expect(result.ok && result.project.components[2]).not.toHaveProperty("fingerCuts");
  });

  it("round-trips a project with no components", () => {
    const p = newProject();
    const result = parseProject(raw(p));
    expect(result.ok && result.project).toEqual(p);
  });

  it("round-trips fillToTop off", () => {
    const p = sampleProject();
    p.settings.fillToTop = false;
    const result = parseProject(raw(p));
    expect(result.ok && result.project.settings.fillToTop).toBe(false);
  });

  it("does not store risers: a stored riser part is not in the schema", () => {
    const input = raw(sampleProject());
    const trays = (input.layout as Json).trays as Json[];
    trays.push({ ...trays[0], key: "x:riser", part: "riser" });
    const result = parseProject(input);
    expect(result.ok && result.project.layout).toBeUndefined();
  });

  it("reads a file with no fillToTop as on", () => {
    const input = raw(sampleProject());
    delete (input.settings as Json).fillToTop;
    const result = parseProject(input);
    expect(result.ok && result.project.settings.fillToTop).toBe(true);
  });

  it("refuses a fillToTop that is not a boolean", () => {
    const input = raw(sampleProject());
    (input.settings as Json).fillToTop = "yes";
    expect(parseProject(input).ok).toBe(false);
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
    // the two merge switches and the engraving switch at their defaults are left out of what is written
    const { mergeFillers, mergeRisers, engraveNumbers, oneWall, ...written } = p.settings;
    expect([mergeFillers, mergeRisers, engraveNumbers, oneWall]).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(out.settings).toEqual({ ...written, leftover: "hollow" });
    expect(p).toEqual(before);
  });

  it("leaves the merge switches out at their defaults and writes them when changed", () => {
    // A share link has 2 000 characters: two settings nearly every project leaves alone are not
    // written, and reading puts the defaults back.
    const p = sampleProject();
    const same = serializeProject(p, noForeign());
    expect(same).not.toContain("mergeFillers");
    expect(same).not.toContain("mergeRisers");
    const read = parseProject(JSON.parse(same));
    expect(read.ok && read.project.settings).toMatchObject({
      mergeFillers: true,
      mergeRisers: false,
    });
    const changed = { ...p, settings: { ...p.settings, mergeFillers: false, mergeRisers: true } };
    const text = serializeProject(changed, noForeign());
    expect(text).toContain('"mergeFillers":false');
    expect(text).toContain('"mergeRisers":true');
    const back = parseProject(JSON.parse(text));
    expect(back.ok && back.project.settings).toMatchObject({
      mergeFillers: false,
      mergeRisers: true,
    });
    // writing leaves the project itself alone
    expect(p.settings.mergeFillers).toBe(true);
  });

  it("round-trips the one-wall switch: left out while off, written when on", () => {
    const p = sampleProject();
    expect(serializeProject(p, noForeign())).not.toContain("oneWall");
    const text = serializeProject(
      { ...p, settings: { ...p.settings, oneWall: true } },
      noForeign(),
    );
    expect(text).toContain('"oneWall":true');
    const back = parseProject(JSON.parse(text));
    expect(back.ok && back.project.settings.oneWall).toBe(true);
  });

  it("round-trips the engraving switch: left out while on, written when off", () => {
    const p = sampleProject();
    expect(p.settings.engraveNumbers).toBe(true);
    expect(serializeProject(p, noForeign())).not.toContain("engraveNumbers");
    const off = { ...p, settings: { ...p.settings, engraveNumbers: false } };
    const text = serializeProject(off, noForeign());
    expect(text).toContain('"engraveNumbers":false');
    const back = parseProject(JSON.parse(text));
    expect(back.ok && back.project.settings.engraveNumbers).toBe(false);
    // and it is no part of the inputs hash: switching it never stales a plan
    expect(inputsHash(off)).toBe(inputsHash(p));
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

describe("a stored layout leaves out what reading puts back", () => {
  const tray = (over: Partial<TraySpec>): TraySpec => ({
    key: "k",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 50,
    d: 40,
    h: 20,
    rotated: false,
    wall: 1.2,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...over,
  });
  const spacer = tray({
    key: "k:spacer",
    part: "spacer",
    path: "",
    wall: 0,
    floor: 0,
    solid: true,
    h: 9.7,
    features: [{ type: "spacerNotch", axis: "x", at: 8.41, width: 10.82, depth: 2.35 }],
  });
  const spare = tray({
    key: "leftover:0",
    part: "leftover",
    w: 31.45,
    d: 20.1,
    compartments: [
      { x: 1.2, y: 1.2, w: 29.05, d: 17.7, floorZ: 1.2, kind: "spare", contents: "", features: [] },
    ],
  });
  const solid = tray({ key: "leftover:1", part: "leftover", solid: true });
  const withLayout = (trays: TraySpec[]): Project => ({
    ...sampleProject(),
    layout: { ...(sampleProject().layout as StoredLayout), trays },
  });
  const written = (p: Project): Json[] =>
    ((raw(p).layout as Json).trays as Json[]).filter((t) => typeof t === "object");

  it("writes a spacer without its constant fields and an open leftover without its pocket", () => {
    const [t, sp, lo, so] = written(withLayout([tray({}), spacer, spare, solid]));
    // its key, stack and level are its tray's, so reading restores them
    expect(sp).toEqual({
      part: "spacer",
      x: 0,
      y: 0,
      z: 0,
      w: 50,
      d: 40,
      h: 9.7,
      features: spacer.features,
    });
    expect(lo?.compartments).toBeUndefined();
    // a tray, and a solid leftover, are written whole
    expect(t).toMatchObject({ path: "0", wall: 1.2, rotated: false, compartments: [] });
    expect(so).toMatchObject({ solid: true, compartments: [] });
  });

  it("leaves out a leftover's key (the n-th is leftover:n) and a level, z and lip of 0 or false", () => {
    const first = tray({ key: "leftover:0", part: "leftover", solid: true, compartments: [] });
    const second = tray({ key: "leftover:1", part: "leftover", solid: true, compartments: [] });
    const [t, a, b] = written(withLayout([tray({}), first, second]));
    expect(a).not.toHaveProperty("key");
    expect(b).not.toHaveProperty("key");
    for (const x of [t, a, b]) {
      expect(x).not.toHaveProperty("level");
      expect(x).not.toHaveProperty("z");
      expect(x).not.toHaveProperty("lip");
    }
    expect(t).toHaveProperty("key", "k");
  });

  it("keeps what is not the default: a leftover out of order, a level above 0, a lip, a spacer elsewhere", () => {
    const odd = tray({ key: "leftover:5", part: "leftover", solid: true, compartments: [] });
    const upper = tray({ key: "u", level: 1, z: 12.4, lip: true });
    const away = { ...spacer, stack: 3, key: "other:spacer" };
    const out = written(withLayout([tray({}), upper, away, odd]));
    expect(out[3]).toHaveProperty("key", "leftover:5");
    expect(out[1]).toMatchObject({ level: 1, z: 12.4, lip: true });
    expect(out[2]).toMatchObject({ key: "other:spacer", stack: 3 });
    const p = withLayout([tray({}), upper, away, odd]);
    const back = parseProject(raw(p));
    expect(back.ok && back.project.layout).toEqual(p.layout);
  });

  it("reads them back to the same layout", () => {
    const p = withLayout([tray({}), spacer, spare, solid]);
    const back = parseProject(raw(p));
    expect(back.ok && back.project.layout).toEqual(p.layout);
    expect(back.ok && back.notices).toEqual([]);
  });

  it("reads a layout that spells them out the same as one that does not", () => {
    const p = withLayout([spacer, spare]);
    const full = structuredClone(p) as unknown as Json;
    const spelled = parseProject(JSON.parse(JSON.stringify(full)));
    const compact = parseProject(raw(p));
    expect(spelled.ok && compact.ok && spelled.project.layout).toEqual(
      compact.ok ? compact.project.layout : null,
    );
  });

  it("keeps a pocket that is not the default one, and an open leftover with none", () => {
    const odd = tray({
      key: "leftover:2",
      part: "leftover",
      w: 31.45,
      d: 20.1,
      compartments: [
        { x: 1.2, y: 1.2, w: 20, d: 17.7, floorZ: 1.2, kind: "spare", contents: "", features: [] },
      ],
    });
    const none = tray({ key: "leftover:3", part: "leftover", compartments: [] });
    const p = withLayout([odd, none]);
    const out = written(p);
    expect(out[0]?.compartments).toHaveLength(1);
    expect(out[1]?.compartments).toEqual([]);
    const back = parseProject(raw(p));
    expect(back.ok && back.project.layout).toEqual(p.layout);
  });

  it("does not change the project it writes", () => {
    const p = withLayout([spacer, spare]);
    const before = structuredClone(p);
    raw(p);
    expect(p).toEqual(before);
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

  it("refuses a toggle that is not true or false", () => {
    const input = raw(sampleProject());
    firstCards(input).fingerCuts = "yes";
    expect(expectError(input)).toMatch(
      /damaged: \/components\/0\/fingerCuts: expected true or false/,
    );
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
        "/box/innerDepth: Box length must be at most 1000 mm; " +
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

  it("refuses an empty project id, and gives a file without one a new id", () => {
    const input = raw(newProject());
    expect(expectError({ ...input, id: "" })).toBe(
      "This project can't be opened: /id: Project id must not be empty.",
    );
    delete input.id;
    const result = parseProject(input);
    expect(result.ok && result.project.id).toMatch(/^[0-9a-z]{8}$/);
  });

  it("refuses a component id containing a colon", () => {
    const input = raw(sampleProject());
    firstCards(input).id = "a:b";
    expect(expectError(input)).toMatch(/\/components\/0\/id: A component id can't contain ':'/);
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
      VALIDATION_NOTICE_CODES.limit.count,
    );

    const twins = raw(sampleProject());
    const components = twins.components as Json[];
    components.push({ ...firstCards(twins) });
    const refused = parseProjectWith(twins, { ...opts, enforceBounds: false });
    expect(refused.ok ? "loaded" : refused.error).toMatch(/share the id/);
  });

  it("opens a stored project over the bounds, but never corrupt structure", () => {
    const input = raw(sampleProject());
    firstCards(input).decks = [{ name: "Huge", count: 5000 }];
    expect(parseProject(input).ok).toBe(false);
    const loaded = parseStoredProject(input);
    expect(loaded.ok && loaded.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.ok && validateProject(loaded.project).map((n) => n.code)).toContain(
      VALIDATION_NOTICE_CODES.limit.count,
    );
    const refused = parseStoredProject({ ...raw(newProject()), id: "" });
    expect(refused.ok ? "loaded" : refused.error).toMatch(/\/id: Project id must not be empty/);
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
    const newer = (input: Json): Json => ({ ...input, schemaVersion: "0.1.15" });

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
    const input: Json = { ...raw(sampleProject()), schemaVersion: "0.1.15" };
    // The project object is one level, so the field may hold MAX_JSON_DEPTH - 1 more.
    input.extra = nested(MAX_JSON_DEPTH - 1);
    expect(parseProject(input).ok).toBe(true);
    input.extra = nested(MAX_JSON_DEPTH);
    expect(expectError(input)).toBe(TOO_DEEP);
  });
});
