import { describe, expect, it, vi } from "vitest";
import combinedLegacy from "../../test/fixtures/legacy/combined.json";
import groupedLegacy from "../../test/fixtures/legacy/grouped-space.json";
import hashes from "../../test/fixtures/legacy/hashes.json";
import perPlayerLegacy from "../../test/fixtures/legacy/per-player.json";
import plainLegacy from "../../test/fixtures/legacy/plain.json";
import { sampleProject } from "../test-support/sample";
import { inputsHash } from "./hash";
import type { Migration } from "./schema";
import {
  MIGRATIONS,
  noForeign,
  parseProject,
  parseProjectWith,
  parseStoredProject,
  SCHEMA_NOTICE_CODES,
  serializeProject,
} from "./schema";
import { DEFAULT_SETTINGS } from "./settings";
import { Reader } from "./schema-reader";
import type { ParseResult } from "./types";
import { valueAt, pointerKeys } from "./json";
import { SCHEMA_VERSION, parseSemver } from "./version";

type Json = Record<string, unknown>;

/** The sample project as raw JSON, claiming to be schema `version`. */
function fileAt(version: string, createdWith = "9.9.9"): Json {
  const raw = JSON.parse(serializeProject(sampleProject(), noForeign())) as Json;
  return { ...raw, schemaVersion: version, createdWith };
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

describe("same line, older or equal minor", () => {
  it("loads an older minor, fills missing fields and upgrades the version", () => {
    const raw = fileAt("1.1.0");
    delete (raw.settings as Json).packingFactor;
    const result = expectOk(parseProject(raw, "1.3.0"));
    expect(result.project.settings.packingFactor).toBe(DEFAULT_SETTINGS.packingFactor);
    expect(result.project.schemaVersion).toBe("1.3.0");
    expect(result.notices).toEqual([]);
  });

  it("treats 0.MINOR as the line and PATCH as the minor before 1.0", () => {
    const result = expectOk(parseProject(fileAt("0.1.2"), "0.1.5"));
    expect(result.project.schemaVersion).toBe("0.1.5");
    expect(result.notices).toEqual([]);
  });
});

describe("same line, newer minor", () => {
  function newerFile(): Json {
    const raw = fileAt("1.2.0", "1.2.0");
    raw.theme = "dark";
    const comps = raw.components as Json[];
    comps.splice(1, 0, { id: "dial0001", name: "Dial", kind: "dial", diameter: 40 });
    (raw.box as Json).headroomCoverage = "none";
    (raw.settings as Json).leftover = "hollow";
    (raw.locks as Json[]).splice(1, 0, { kind: "magnet", trayKey: "x" });
    return raw;
  }

  it("loads with a 'made with a newer app' warning and keeps the file's version", () => {
    const result = expectOk(parseProject(newerFile(), "1.0.0"));
    expect(result.notices[0]).toMatchObject({
      level: "warning",
      code: SCHEMA_NOTICE_CODES.newerMinor,
    });
    expect(result.notices[0]?.message).toContain("(schema 1.2.0)");
    expect(result.notices[0]?.message).toContain("this app (");
    expect(result.project.schemaVersion).toBe("1.2.0");
    expect(result.foreign.components.map((f) => f.index)).toEqual([1]);
  });

  it("saves unknown fields, values, locks and components back unchanged and in order", () => {
    const input = newerFile();
    const result = expectOk(parseProject(input, "1.0.0"));
    expect(result.project.settings.leftover).toBe("spare");
    const saved = JSON.parse(serializeProject(result.project, result.foreign)) as Json;
    expect(saved.theme).toBe("dark");
    expect(saved.schemaVersion).toBe("1.2.0");
    expect(saved.components).toEqual(input.components);
    expect(saved.locks).toEqual(input.locks);
    expect(saved.box).toEqual(input.box);
    expect(saved.settings).toEqual(input.settings);
  });

  it("saves the user's choice for a field changed after loading", () => {
    const result = expectOk(parseProject(newerFile(), "1.0.0"));
    const edited = {
      ...result.project,
      settings: { ...result.project.settings, leftover: "solid" as const },
    };
    const saved = JSON.parse(serializeProject(edited, result.foreign)) as Json;
    expect((saved.settings as Json).leftover).toBe("solid");
    expect((saved.box as Json).headroomCoverage).toBe("none");
  });

  it("treats a newer 0.MINOR.PATCH as a newer minor before 1.0", () => {
    const result = expectOk(parseProject(fileAt("0.1.3"), "0.1.0"));
    expect(result.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.newerMinor]);
  });

  it("names the schema version even when the file has no createdWith", () => {
    const input = newerFile();
    delete input.createdWith;
    const result = expectOk(parseProject(input, "1.0.0"));
    expect(result.notices[0]?.message).toMatch(/Made with app unknown \(schema 1\.2\.0\)/);
  });

  it("keeps unknown locks in their relative order when a dropped lock precedes them", () => {
    const input = newerFile();
    // [dropped, unknown, ...known]: the dropped one is gone, the unknown one comes first.
    const magnet = { kind: "magnet", trayKey: "x" };
    const known = (input.locks as Json[]).filter((l) => l.kind !== "magnet");
    input.locks = [{ kind: "size", trayKey: "d" }, magnet, ...known];
    const result = expectOk(parseProject(input, "1.0.0"));
    const saved = JSON.parse(serializeProject(result.project, result.foreign)) as Json;
    expect(saved.locks).toEqual([magnet, ...known]);
  });

  it("keeps an own __proto__ field through parse, serialize and parse", () => {
    // JSON.parse makes "__proto__" an own data property; object literals would not.
    const text = JSON.stringify(newerFile()).replace(
      /"box":\{/,
      '"box":{"__proto__":{"polluted":true},',
    );
    const first = expectOk(parseProject(JSON.parse(text) as unknown, "1.0.0"));
    expect(Object.hasOwn(first.project.box, "__proto__")).toBe(true);
    const saved = serializeProject(first.project, first.foreign);
    expect(saved).toContain('"__proto__":{"polluted":true}');
    const second = expectOk(parseProject(JSON.parse(saved) as unknown, "1.0.0"));
    expect(Object.hasOwn(second.project.box, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(second.project.box)).toBe(Object.prototype);
    expect(second.project.box).toEqual(first.project.box);
  });
});

describe("same line, newer patch from 1.0 on", () => {
  it("loads silently and takes the app's version", () => {
    const result = expectOk(parseProject(fileAt("1.2.5"), "1.2.0"));
    expect(result.notices).toEqual([]);
    expect(result.project.schemaVersion).toBe("1.2.0");
  });
});

describe("refused files", () => {
  it("refuses a 1.0.0 file in a 0.x app", () => {
    expect(expectError(parseProject(fileAt("1.0.0", "1.0.0"), "0.1.0"))).toMatch(/Update the app/);
  });

  it("refuses a newer major and names both versions", () => {
    const message = expectError(parseProject(fileAt("2.0.0", "2.1.0"), "1.4.0"));
    expect(message).toMatch(/made with app 2\.1\.0/);
    expect(message).toMatch(/Update the app/);
  });

  it("refuses a newer 0.MINOR before 1.0", () => {
    expect(expectError(parseProject(fileAt("0.2.0"), "0.1.0"))).toMatch(/Update the app/);
  });

  it("refuses 0.x files from 1.0 on", () => {
    expect(expectError(parseProject(fileAt("0.9.0", "0.9.3"), "1.0.0"))).toMatch(
      /preview version of the app \(0\.9\.3/,
    );
  });

  it("refuses an older line with no registered migration", () => {
    expect(expectError(parseProject(fileAt("0.0.9"), SCHEMA_VERSION))).toMatch(
      /no migration from schema line 0\.0/,
    );
  });
});

describe("migrations (fake registry)", () => {
  /** Schema 1 called the box fields width/depth/height; schema 2 renamed them; schema 3 changed nothing. */
  const fake: Migration[] = [
    {
      from: "1",
      to: "2.0.0",
      migrate: (raw) => {
        const { width, depth, height, ...rest } = raw.box as Json;
        return {
          ...raw,
          box: { ...rest, innerWidth: width, innerDepth: depth, innerHeight: height },
        };
      },
    },
    { from: "2", to: "3.0.0", migrate: (raw) => raw },
  ];

  function v1File(): Json {
    const raw = fileAt("1.4.0", "1.4.0");
    const { innerWidth, innerDepth, innerHeight, ...rest } = raw.box as Json;
    return { ...raw, box: { ...rest, width: innerWidth, depth: innerDepth, height: innerHeight } };
  }

  it("runs every step from the file's line to the app's line", () => {
    const input = v1File();
    const copy = structuredClone(input);
    const result = expectOk(
      parseProjectWith(input, { appSchemaVersion: "3.0.0", migrations: fake }),
    );
    expect(result.project.box).toEqual(sampleProject().box);
    expect(result.project.schemaVersion).toBe("3.0.0");
    expect(result.notices).toEqual([
      expect.objectContaining({ code: SCHEMA_NOTICE_CODES.migrated }),
    ]);
    expect(input).toEqual(copy);
  });

  it("refuses when a step is missing", () => {
    const result = parseProjectWith(v1File(), {
      appSchemaVersion: "3.0.0",
      migrations: fake.slice(1),
    });
    expect(expectError(result)).toMatch(/no migration from schema line 1/);
  });

  it("refuses a step that does not move to a later line instead of looping", () => {
    const stuck: Migration[] = [{ from: "1", to: "1.9.0", migrate: (raw) => raw }];
    const result = parseProjectWith(v1File(), { appSchemaVersion: "2.0.0", migrations: stuck });
    expect(expectError(result)).toMatch(/no migration from schema line 1/);
  });

  it("refuses a step whose target version can't be read", () => {
    const unreadable: Migration[] = [{ from: "1", to: "two", migrate: (raw) => raw }];
    const result = parseProjectWith(v1File(), {
      appSchemaVersion: "2.0.0",
      migrations: unreadable,
    });
    expect(expectError(result)).toMatch(/no migration from schema line 1/);
  });

  it("refuses deeply nested input before any migration runs", () => {
    const migrate = vi.fn((raw: Json) => raw);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      let nest: unknown = 1;
      for (let i = 0; i < 5000; i += 1) {
        nest = { a: nest };
      }
      const input = { ...v1File(), extra: nest };
      const result = parseProjectWith(input, {
        appSchemaVersion: "2.0.0",
        migrations: [{ from: "1", to: "2.0.0", migrate }],
      });
      expect(expectError(result)).toMatch(/nested too deeply/);
      expect(migrate).not.toHaveBeenCalled();
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("supports 0.MINOR lines", () => {
    const zero: Migration[] = [{ from: "0.1", to: "0.2.0", migrate: (raw) => raw }];
    const result = parseProjectWith(fileAt("0.1.4"), {
      appSchemaVersion: "0.2.1",
      migrations: zero,
    });
    expect(expectOk(result).project.schemaVersion).toBe("0.2.1");
  });

  it("turns a throwing migration into an error result instead of throwing", () => {
    const broken: Migration[] = [
      {
        from: "1",
        to: "2.0.0",
        migrate: () => {
          throw new Error("boom");
        },
      },
    ];
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = parseProjectWith(v1File(), { appSchemaVersion: "2.0.0", migrations: broken });
      expect(result).toEqual({ ok: false, error: "This project file could not be read." });
      expect(logged).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });

  it("still throws for an invalid app schema version, which is a programming error", () => {
    expect(() => parseProjectWith({}, { appSchemaVersion: "one", migrations: [] })).toThrow(
      /Invalid app schema version/,
    );
  });
});

/**
 * Compatibility lines below the app's that have no migration to a later line.
 * From 1.0 on every MAJOR line 1..A-1 needs one (spec §9); none are needed while 0.x.
 */
function linesWithoutMigration(appSchemaVersion: string, migrations: readonly Migration[]) {
  const app = parseSemver(appSchemaVersion)?.major ?? 0;
  const missing: string[] = [];
  for (let line = 1; line < app; line += 1) {
    const step = migrations.find((m) => m.from === String(line));
    const to = step ? parseSemver(step.to) : null;
    if (!to || to.major <= line) {
      missing.push(String(line));
    }
  }
  return missing;
}

describe("the migration registry invariant", () => {
  const step = (from: string, to: string): Migration => ({ from, to, migrate: (raw) => raw });

  it("holds for the real registry and the app's schema version", () => {
    expect(linesWithoutMigration(SCHEMA_VERSION, MIGRATIONS)).toEqual([]);
  });

  it("is checked for real: a complete fake registry passes, a gap or a stuck step fails", () => {
    expect(linesWithoutMigration("3.0.0", [step("1", "2.0.0"), step("2", "3.0.0")])).toEqual([]);
    expect(linesWithoutMigration("3.0.0", [step("1", "2.0.0")])).toEqual(["2"]);
    expect(linesWithoutMigration("3.0.0", [step("1", "2.0.0"), step("2", "2.5.0")])).toEqual(["2"]);
    expect(linesWithoutMigration("0.4.0", [])).toEqual([]);
  });
});

describe("unknown-value fallbacks", () => {
  /** Paths of every enum the reader reads in box, printer and settings. */
  function enumPaths(): string[] {
    const spy = vi.spyOn(Reader.prototype, "oneOf");
    try {
      expectOk(parseProject(fileAt(SCHEMA_VERSION)));
      const paths = spy.mock.contexts.map((reader, i) =>
        (reader as Reader).at(String(spy.mock.calls[i]?.[0])),
      );
      return paths.filter((path) => /^\/(box|printer|settings)\//.test(path));
    } finally {
      spy.mockRestore();
    }
  }

  it("finds the enum fields it should (so the check below is not vacuous)", () => {
    expect(enumPaths()).toEqual(
      expect.arrayContaining(["/box/headroomCoverage", "/settings/leftover"]),
    );
  });

  it("round-trips an unknown value at every enum field of box, printer and settings", () => {
    for (const path of enumPaths()) {
      const raw = fileAt("0.1.9");
      const keys = pointerKeys(path);
      const parent = valueAt(raw, keys.slice(0, -1)) as Json;
      parent[keys.at(-1) ?? ""] = "not-a-known-value";
      const result = expectOk(parseProject(raw, "0.1.0"));
      // The reader substituted something known and recorded the original...
      expect(result.foreign.values, path).toEqual([{ path, raw: "not-a-known-value" }]);
      expect(valueAt(result.project, keys), path).not.toBe("not-a-known-value");
      // ...and the writer recognises that substitute as "unchanged", writing the original back.
      const saved = JSON.parse(serializeProject(result.project, result.foreign)) as Json;
      expect(valueAt(saved, keys), path).toBe("not-a-known-value");
    }
  });
});

describe("schema 0.2.0: groups, copies, turn locks and flat decks", () => {
  const HISTORY = import.meta.glob<unknown>("../../test/fixtures/schema/*.json", {
    eager: true,
    import: "default",
  });
  const fixture = (version: string): Json =>
    structuredClone(HISTORY[`../../test/fixtures/schema/${version}.json`]) as Json;
  const migrated = (result: ParseResult) =>
    result.ok ? result.notices.filter((n) => n.code === SCHEMA_NOTICE_CODES.migrated) : [];
  const old = Object.keys(HISTORY).filter((k) => /\/0\.1\.\d+\.json$/.test(k));
  /** What a file says besides its upgrade: every file of an older line gets one migrated notice. */
  const otherNotices = (result: ParseResult) =>
    result.ok ? result.notices.filter((n) => n.code !== SCHEMA_NOTICE_CODES.migrated) : [];
  /** The 0.2.0 fixture as this app writes it today (schema 0.3.0): groups and all, no upgrade left. */
  const current = (): Json => {
    const first = expectOk(parseProject(fixture("0.2.0")));
    return JSON.parse(serializeProject(first.project, first.foreign)) as Json;
  };

  it("migrates every history fixture, with one migrated notice", () => {
    expect(old.length).toBeGreaterThan(10);
    for (const path of old) {
      const result = expectOk(parseProject(structuredClone(HISTORY[path])));
      expect(migrated(result), path).toHaveLength(1);
      expect(result.project.schemaVersion, path).toBe(SCHEMA_VERSION);
    }
  });

  it("turns the 0.1.16 group 'setup' into a group of its two members, keeping its pin", () => {
    const { project } = expectOk(parseProject(fixture("0.1.16")));
    expect(project.groups).toEqual([
      { id: "setup", name: "setup", access: "setup", memberIds: ["cards002", "tiles001"] },
    ]);
    expect(project.components.some((c) => "groupId" in c)).toBe(false);
    expect(project.locks).toContainEqual({
      kind: "stack",
      trayKeys: ["setup:p0:0", "cards001:p0:0"],
    });
    expect(project.components.find((c) => c.id === "bulk0001")?.copies).toBe(4);
    expect(project.components.some((c) => "perPlayer" in c)).toBe(false);
  });

  it("reads the 0.2.0 fixture with no notices, and it round-trips", () => {
    const first = expectOk(parseProject(fixture("0.2.0")));
    // The one thing it says is that it was upgraded, from 0.2.0 to the schema of this app.
    expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(first.notices[0]?.message).toContain(`0.2.0 to ${SCHEMA_VERSION}`);
    expect(first.foreign.components).toEqual([]);
    const { project } = first;
    expect(project.groups?.map((g) => [g.id, g.copies, g.memberIds])).toEqual([
      ["kit1", 4, ["minis001", "cards002", "custom01"]],
      ["spare01", undefined, []],
    ]);
    // A group's growth, which sizing never read, is dropped by the 0.3.0 migration (the fixture's
    // first group had one).
    expect(project.groups?.[0] && "growth" in project.groups[0]).toBe(false);
    // a member order that is not the list order, kept
    expect(project.components.map((c) => c.id).indexOf("cards002")).toBeLessThan(
      project.components.map((c) => c.id).indexOf("minis001"),
    );
    expect(project.components.find((c) => c.id === "bulk0001")?.copies).toBe(3);
    expect(project.locks).toContainEqual({ kind: "turn", trayKey: "bulk0001:p1:0", rotated: true });
    const deck = project.components.find((c) => c.id === "cards001");
    expect(deck?.kind === "cards" && deck.flatDecks).toBe("dividers");
    const again = expectOk(parseProject(JSON.parse(serializeProject(project, first.foreign))));
    // Saving stamps the running app's version, which is not what the fixture says.
    expect({ ...again.project, createdWith: project.createdWith }).toEqual(project);
    expect(again.notices).toEqual([]);
  });

  it("writes groups only when there are some", () => {
    const first = expectOk(parseProject(fixture("0.2.0")));
    const none = { ...first.project, groups: [] };
    expect("groups" in (JSON.parse(serializeProject(none, first.foreign)) as Json)).toBe(false);
    const bare = { ...first.project };
    delete bare.groups;
    expect("groups" in (JSON.parse(serializeProject(bare, first.foreign)) as Json)).toBe(false);
  });

  it("opens an autosave from 0.6 through the migration", () => {
    const result = expectOk(parseStoredProject(fixture("0.1.16")));
    expect(migrated(result)).toHaveLength(1);
    expect(result.project.groups?.[0]?.id).toBe("setup");
  });

  it("keeps the unknown fields of a group in a newer 0.4.x file, and writes them back", () => {
    // 0.2.x files are older than this app's line now, so a "newer minor" has to be a 0.4.x one.
    const raw: Json = { ...current(), schemaVersion: "0.4.7" };
    (raw.groups as Json[])[0] = { ...(raw.groups as Json[])[0], future: 1 };
    const result = expectOk(parseProject(raw));
    expect(result.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.newerMinor]);
    const saved = JSON.parse(serializeProject(result.project, result.foreign)) as Json;
    expect((saved.groups as Json[])[0]?.future).toBe(1);
  });

  it("drops an unknown field of a group with one notice in a file of this version", () => {
    const raw = current();
    (raw.groups as Json[])[0] = { ...(raw.groups as Json[])[0], future: 1 };
    const result = expectOk(parseProject(raw));
    expect(result.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.unknownFields]);
    expect(JSON.stringify(result.project)).not.toContain("future");
  });

  it("refuses a group that uses a value this app doesn't know, rather than lose it", () => {
    const raw: Json = { ...current(), schemaVersion: "0.4.7" };
    (raw.groups as Json[])[0] = { ...(raw.groups as Json[])[0], access: "never" };
    expect(expectError(parseProject(raw))).toMatch(/groups\/0\/access/);
  });

  it("refuses a group that is not an object", () => {
    const raw: Json = { ...fixture("0.2.0"), groups: [7] };
    expect(expectError(parseProject(raw))).toMatch(/groups\/0: expected an object/);
  });

  it("refuses a 0.2.0 file in a 0.1 app, as it does any newer line", () => {
    expect(expectError(parseProject(fixture("0.2.0"), "0.1.16"))).toMatch(
      /Update the app to open it\./,
    );
  });

  describe("a 0.6 project with a stored plan", () => {
    const open = (raw: unknown) => expectOk(parseProject(structuredClone(raw)));

    it("keeps the stored plan of a plain or per-player project, but it is stale once: its inputsHash is new", () => {
      // Schema 0.3.0 made growth the last step of planning, and hash.ts's PLANNING_MODEL went into
      // every hash on purpose: before that, these two kept their hash through every migration.
      // hashes.json still holds the old values, for documentation.
      for (const [name, raw] of [
        ["plain", plainLegacy],
        ["per-player", perPlayerLegacy],
      ] as const) {
        const { project } = open(raw);
        expect(project.layout?.inputsHash, name).toBe(hashes[name]);
        expect(inputsHash(project), name).not.toBe(hashes[name]);
        expect(project.layout?.inputsHash, name).not.toBe(inputsHash(project));
      }
    });

    it("makes the plan of a grouped project stale: its hash is a new one", () => {
      const { project } = open(groupedLegacy);
      expect(inputsHash(project)).not.toBe(hashes["grouped-space"]);
      expect(project.layout?.inputsHash).not.toBe(inputsHash(project));
    });

    it("makes a combined plan stale for good, and keeps its tray keys", () => {
      const { project } = open(combinedLegacy);
      expect(project.layout?.inputsHash).toBe("");
      expect(project.layout?.trays.some((t) => t.key.includes(":pall:"))).toBe(true);
    });

    it("moves a renamed group's pins and plan to its new id, and leaves them valid", () => {
      const { project } = open(groupedLegacy);
      expect(project.groups?.[0]).toMatchObject({ id: "group-1", name: "Player kit" });
      expect(project.locks.map((l) => (l.kind === "stack" ? l.trayKeys : [l.trayKey]))).toEqual([
        ["group-1:p0:0"],
        ["group-1:p0:0", "cards001:p0:0"],
      ]);
      expect(project.layout?.trays.filter((t) => t.key.startsWith("group-1:"))).not.toHaveLength(0);
    });
  });

  it("reads a turn lock, and drops one with no tray with a notice", () => {
    const raw = fixture("0.2.0");
    const locks = raw.locks as Json[];
    locks.push({ kind: "turn", rotated: false });
    const result = expectOk(parseProject(raw));
    expect(result.project.locks.filter((l) => l.kind === "turn")).toHaveLength(1);
    expect(otherNotices(result).map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.lockDropped]);
  });
});

describe("schema 0.3.0: room for more replaces growth and stretch", () => {
  const HISTORY = import.meta.glob<unknown>("../../test/fixtures/schema/*.json", {
    eager: true,
    import: "default",
  });
  const fixture = (version: string): Json =>
    structuredClone(HISTORY[`../../test/fixtures/schema/${version}.json`]) as Json;

  it("opens the 0.2.4 fixture at the current schema, with one migrated notice", () => {
    const result = expectOk(parseProject(fixture("0.2.4")));
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(result.notices[0]?.message).toContain(`0.2.4 to ${SCHEMA_VERSION}`);
    expect(result.foreign.components).toEqual([]);
  });

  it("writes no growth, stretch or group growth back after the upgrade", () => {
    const first = expectOk(parseProject(fixture("0.2.4")));
    const text = serializeProject(first.project, first.foreign);
    expect(text).not.toContain('"growth"');
    expect(text).not.toContain('"stretch"');
    const again = expectOk(parseProject(JSON.parse(text)));
    expect(again.notices).toEqual([]);
    expect({ ...again.project, createdWith: first.project.createdWith }).toEqual(first.project);
  });

  it("reads the 0.3.0 fixture with no notices, and it round-trips", () => {
    const first = expectOk(parseProject(fixture("0.3.0")));
    expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(first.foreign.components).toEqual([]);
    const again = expectOk(
      parseProject(JSON.parse(serializeProject(first.project, first.foreign))),
    );
    expect(again.notices).toEqual([]);
    expect({ ...again.project, createdWith: first.project.createdWith }).toEqual(first.project);
  });

  it("reads the 0.3.2 fixture (a flat deck with dividers) with no notices, and it round-trips", () => {
    const first = expectOk(parseProject(fixture("0.3.2")));
    expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(first.project.components[0]).toMatchObject({ storage: "flat", dividers: 2 });
    const again = expectOk(
      parseProject(JSON.parse(serializeProject(first.project, first.foreign))),
    );
    expect(again.notices).toEqual([]);
    expect({ ...again.project, createdWith: first.project.createdWith }).toEqual(first.project);
  });
});

describe("schema 0.3.3: one joint for the rim between layers", () => {
  const HISTORY = import.meta.glob<unknown>("../../test/fixtures/schema/*.json", {
    eager: true,
    import: "default",
  });
  const fixtureAt = (version: string): Json =>
    structuredClone(HISTORY[`../../test/fixtures/schema/${version}.json`]) as Json;

  it("reads the 0.3.3 fixture with no notices, and it round-trips", () => {
    const first = expectOk(parseProject(fixtureAt("0.3.3")));
    expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(first.project.settings.lip.joint).toBe("auto");
    const again = expectOk(
      parseProject(JSON.parse(serializeProject(first.project, first.foreign))),
    );
    expect(again.notices).toEqual([]);
    expect({ ...again.project, createdWith: first.project.createdWith }).toEqual(first.project);
  });

  it.each(["0.3.0", "0.3.2"])(
    "reads the %s fixture's switch and kind as the joint they meant, with its hash",
    (version) => {
      const first = expectOk(parseProject(fixtureAt(version)));
      expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
      expect(first.project.settings.lip.joint).toBe("step");
      expect(first.project.settings.lip).not.toHaveProperty("enabled");
      expect(first.project.settings.lip).not.toHaveProperty("kind");
    },
  );

  it("reads a file saved at 0.3.2 with no layout joint, and leaves the layout's joint unset", () => {
    const first = expectOk(parseProject(fixtureAt("0.3.2")));
    expect(first.project.layout?.joint).toBeUndefined();
  });
});

describe("schema 0.3.4: the list order is kept with the project", () => {
  const HISTORY = import.meta.glob<unknown>("../../test/fixtures/schema/*.json", {
    eager: true,
    import: "default",
  });
  const fixture = (version: string): Json =>
    structuredClone(HISTORY[`../../test/fixtures/schema/${version}.json`]) as Json;

  it("reads the 0.3.4 fixture (a listOrder) with no notices, keeps it and round-trips", () => {
    const first = expectOk(parseProject(fixture("0.3.4")));
    expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(first.project.listOrder).toEqual([
      "custom01",
      "minis001",
      "tiles001",
      "bulk0001",
      "cards002",
      "cards001",
    ]);
    const written = JSON.parse(serializeProject(first.project, first.foreign)) as Json;
    expect(written.listOrder).toEqual(first.project.listOrder);
    const again = expectOk(parseProject(written));
    expect(again.notices).toEqual([]);
    expect({ ...again.project, createdWith: first.project.createdWith }).toEqual(first.project);
  });

  it("does not write an empty listOrder, and ignores entries that are not text", () => {
    const raw = fileAt("0.3.4");
    raw.listOrder = [];
    const empty = expectOk(parseProject(raw));
    expect(empty.project.listOrder).toBeUndefined();
    expect(JSON.parse(serializeProject(empty.project, empty.foreign))).not.toHaveProperty(
      "listOrder",
    );
    raw.listOrder = ["a", 3, "b"];
    expect(expectOk(parseProject(raw)).project.listOrder).toEqual(["a", "b"]);
  });
});

describe("schema 0.4.0: comfortable card clearances", () => {
  const HISTORY = import.meta.glob<unknown>("../../test/fixtures/schema/*.json", {
    eager: true,
    import: "default",
  });
  const fixtureAt = (version: string): Json =>
    structuredClone(HISTORY[`../../test/fixtures/schema/${version}.json`]) as Json;

  it("reads the 0.4.0 fixture with no notices, and it round-trips", () => {
    const first = expectOk(parseProject(fixtureAt("0.4.0")));
    expect(first.notices).toEqual([]);
    expect(first.project.settings).toMatchObject({ cardClearance: 3, cardStackClearance: 2 });
    const again = expectOk(
      parseProject(JSON.parse(serializeProject(first.project, first.foreign))),
    );
    expect(again.notices).toEqual([]);
    expect({ ...again.project, createdWith: first.project.createdWith }).toEqual(first.project);
  });

  it("opens the 0.3.4 fixture with its old default clearances moved, and one migrated notice", () => {
    const first = expectOk(parseProject(fixtureAt("0.3.4")));
    expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(first.project.settings).toMatchObject({ cardClearance: 3, cardStackClearance: 2 });
  });
});
