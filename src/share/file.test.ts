import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newProject } from "../model/defaults";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import { APP_VERSION } from "../model/version";
import { sampleProject } from "../test-support/sample";
import { exportJsonFile, importJsonText, jsonFileName } from "./file";

describe("exportJsonFile / importJsonText", () => {
  it("round-trips a project through a pretty-printed JSON file", async () => {
    const p = sampleProject();
    const blob = exportJsonFile(p, noForeign());
    expect(blob.type).toBe("application/json");
    const text = await blob.text();
    expect(text).toContain('\n  "box": {');
    const result = importJsonText(text);
    expect(result.ok && result.project).toEqual({ ...p, createdWith: APP_VERSION });
  });

  it("keeps foreign components in the file", async () => {
    const raw = JSON.parse(serializeProject(newProject(), noForeign())) as Record<string, unknown>;
    raw.schemaVersion = "0.4.9";
    raw.components = [{ id: "dial0001", kind: "dial" }];
    const loaded = parseProject(raw);
    if (!loaded.ok) {
      throw new Error(loaded.error);
    }
    const text = await exportJsonFile(loaded.project, loaded.foreign).text();
    expect(JSON.parse(text)).toMatchObject({ components: [{ id: "dial0001", kind: "dial" }] });
  });

  it("ignores a UTF-8 byte order mark", () => {
    const text = `\uFEFF${serializeProject(newProject(), noForeign())}`;
    expect(importJsonText(text).ok).toBe(true);
  });

  it("explains non-JSON and oversized files", () => {
    expect(importJsonText("<html>")).toEqual({
      ok: false,
      error: expect.stringMatching(/isn't valid JSON/),
    });
    expect(importJsonText(" ".repeat(1024 * 1024 + 1))).toEqual({
      ok: false,
      error: expect.stringMatching(/larger than 1 MB/),
    });
  });

  it("passes schema errors through", () => {
    expect(importJsonText("{}")).toEqual({
      ok: false,
      error: expect.stringMatching(/no schemaVersion/),
    });
  });

  it("never throws on arbitrary text, and always explains a refusal", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = importJsonText(text);
        if (!result.ok) {
          expect(result.error.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("never throws on arbitrary JSON text", () => {
    fc.assert(
      fc.property(fc.json(), (text) => {
        const result = importJsonText(text);
        if (!result.ok) {
          expect(result.error.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});

describe("jsonFileName", () => {
  it.each([
    ["My Game!", "My-Game.insert.json"],
    ["  Ark Nova: Marine Worlds ", "Ark-Nova-Marine-Worlds.insert.json"],
    ["Über-Spiel", "ber-Spiel.insert.json"],
    ["???", "insert.insert.json"],
    ["", "insert.insert.json"],
  ])("%j → %j", (name, expected) => {
    expect(jsonFileName({ ...newProject(), name })).toBe(expected);
  });
});
