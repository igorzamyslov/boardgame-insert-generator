import { describe, expect, it, vi } from "vitest";
import { sampleProject } from "../test-support/sample";
import type { Migration } from "./schema";
import { MIGRATIONS, noForeign, parseProject, parseProjectWith, serializeProject } from "./schema";
import { DEFAULT_SETTINGS } from "./settings";
import type { ParseResult } from "./types";
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
    expect(result.notices[0]).toMatchObject({ level: "warning", code: "schema.newerMinor" });
    expect(result.notices[0]?.message).toContain("1.2.0");
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
    expect(result.notices.map((n) => n.code)).toEqual(["schema.newerMinor"]);
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

describe("refused files", () => {
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
    expect(result.notices).toEqual([expect.objectContaining({ code: "schema.migrated" })]);
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

describe("the real registry", () => {
  it("is empty while the schema is 0.x (no compatibility promise)", () => {
    expect(parseSemver(SCHEMA_VERSION)?.major).toBe(0);
    expect(MIGRATIONS).toEqual([]);
  });
});
