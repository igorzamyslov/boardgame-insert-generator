// src/model/topAreas.test.ts
// Kept-free areas on top (schema 0.3.1): what applies, the planes, the hash, the reader, validation.
import { describe, expect, it } from "vitest";
import fixture031 from "../../test/fixtures/schema/0.3.1.json";
import { newProject } from "./defaults";
import { inputsHash } from "./hash";
import { parseProject, serializeProject } from "./schema";
import { SCHEMA_NOTICE_CODES } from "./schema-reader";
import {
  DEFAULT_AREA_NAME,
  DEFAULT_SETTINGS,
  areaName,
  lidPlane,
  topAreasOf,
  topPlane,
  usableMm3,
} from "./settings";
import type { Box, Project } from "./types";
import { VALIDATION_NOTICE_CODES, validateProject } from "./validate";

const box = (patch: Partial<Box>): Box => ({
  ...newProject().box,
  innerWidth: 300,
  innerDepth: 200,
  innerHeight: 70,
  headroom: 10,
  headroomCoverage: "partial",
  ...patch,
});

const project = (patch: Partial<Box>): Project => ({ ...newProject(), box: box(patch) });

describe("topAreasOf: which areas apply", () => {
  it("is the sized areas of a box that keeps space for part of the top", () => {
    const b = box({
      headroomAreas: [
        { w: 220, d: 290 },
        { w: 0, d: 50 },
        { name: "Mats", w: 280, d: 100 },
      ],
    });
    expect(topAreasOf(b)).toEqual([
      { w: 220, d: 290 },
      { name: "Mats", w: 280, d: 100 },
    ]);
  });

  it("is empty for the whole top, for no headroom and for no list", () => {
    const areas = [{ w: 220, d: 290 }];
    expect(topAreasOf(box({ headroomAreas: areas, headroomCoverage: "full" }))).toEqual([]);
    expect(topAreasOf(box({ headroomAreas: areas, headroom: 0 }))).toEqual([]);
    expect(topAreasOf(box({}))).toEqual([]);
  });
});

describe("the two planes", () => {
  const s = DEFAULT_SETTINGS;

  it("without an area the lid is the plane under the kept space: as before", () => {
    const b = box({});
    expect(lidPlane(b, s)).toBe(topPlane(b, s));
    expect(topPlane(b, s)).toBeCloseTo(70 - 10 + s.topPressFit, 6);
  });

  it("with an area the stacks elsewhere reach the lid, higher by the headroom", () => {
    const b = box({ headroomAreas: [{ w: 100, d: 100 }] });
    expect(lidPlane(b, s) - topPlane(b, s)).toBeCloseTo(10, 6);
    expect(lidPlane(b, s)).toBeCloseTo(70 + s.topPressFit, 6);
  });

  it("the usable volume gives back what the area does not keep", () => {
    const none = box({});
    const some = box({ headroomAreas: [{ w: 100, d: 100 }] });
    const a = usableMm3(none, s, 300, 200);
    const b = usableMm3(some, s, 300, 200);
    expect(b - a).toBeCloseTo(300 * 200 * 10 - 100 * 100 * 10, 3);
  });

  it("names an area, 'Rulebook' when it has no name", () => {
    expect(areaName(undefined)).toBe(DEFAULT_AREA_NAME);
    expect(areaName({ w: 1, d: 1 })).toBe("Rulebook");
    expect(areaName({ name: "  ", w: 1, d: 1 })).toBe("Rulebook");
    expect(areaName({ name: "Mats", w: 1, d: 1 })).toBe("Mats");
  });
});

describe("the inputs hash", () => {
  it("is as it was for a box with no area, however it keeps the space", () => {
    const a = inputsHash(project({}));
    expect(inputsHash(project({ headroomAreas: [] }))).toBe(a);
    // areas of a box that keeps the whole top, or nothing, change no layout
    expect(inputsHash(project({ headroomAreas: [{ w: 9, d: 9 }], headroomCoverage: "full" }))).toBe(
      inputsHash(project({ headroomCoverage: "full" })),
    );
    expect(inputsHash(project({ headroomAreas: [{ w: 0, d: 0 }] }))).toBe(a);
  });

  it("changes with the size of an area that applies, not with its name", () => {
    const base = inputsHash(project({}));
    const sized = inputsHash(project({ headroomAreas: [{ w: 220, d: 290 }] }));
    expect(sized).not.toBe(base);
    expect(inputsHash(project({ headroomAreas: [{ name: "Rules", w: 220, d: 290 }] }))).toBe(sized);
    expect(inputsHash(project({ headroomAreas: [{ w: 220, d: 280 }] }))).not.toBe(sized);
  });
});

describe("reading and writing", () => {
  it("reads the 0.3.1 fixture without a notice, and it round-trips", () => {
    const first = parseProject(fixture031);
    if (!first.ok) {
      throw new Error(first.error);
    }
    expect(first.notices.map((n) => n.code)).toEqual([SCHEMA_NOTICE_CODES.migrated]);
    expect(first.project.box.headroomAreas).toEqual([{ name: "Rulebook", w: 220, d: 150 }]);
    const again = parseProject(JSON.parse(serializeProject(first.project, first.foreign)));
    if (!again.ok) {
      throw new Error(again.error);
    }
    expect(again.notices).toEqual([]);
    expect({ ...again.project, createdWith: first.project.createdWith }).toEqual(first.project);
  });

  it("reads a file made before areas with no area, and writes none", () => {
    const old = JSON.parse(JSON.stringify(fixture031)) as { box: Record<string, unknown> };
    delete old.box.headroomAreas;
    const r = parseProject({ ...old, schemaVersion: "0.3.0" });
    if (!r.ok) {
      throw new Error(r.error);
    }
    expect(r.project.box.headroomAreas).toBeUndefined();
    expect(serializeProject(r.project, r.foreign)).not.toContain("headroomAreas");
  });

  it("keeps a stored plan's reserved areas, and a plan with none has no key", () => {
    const raw = JSON.parse(JSON.stringify(fixture031)) as Record<string, unknown>;
    const layout = {
      createdWith: "0.21.0",
      geometryVersion: "0.12.0",
      inputsHash: "abc",
      seed: 1,
      iterations: 10,
      capped: false,
      trays: [],
      reserved: [{ area: 0, name: "Rulebook", x: 0, y: 140, w: 220, d: 150, z: 62 }],
    };
    const r = parseProject({ ...raw, layout });
    if (!r.ok) {
      throw new Error(r.error);
    }
    expect(r.project.layout?.reserved).toEqual(layout.reserved);
    const bare = parseProject({ ...raw, layout: { ...layout, reserved: undefined } });
    if (!bare.ok) {
      throw new Error(bare.error);
    }
    expect(bare.project.layout).toBeDefined();
    expect(bare.project.layout?.reserved).toBeUndefined();
  });

  it("reports a malformed area as the file's problem, not as a crash", () => {
    const raw = JSON.parse(JSON.stringify(fixture031)) as { box: Record<string, unknown> };
    raw.box.headroomAreas = [7];
    const r = parseProject(raw);
    expect(r.ok).toBe(false);
  });
});

describe("validation", () => {
  const codes = (p: Project) => validateProject(p).map((n) => n.code);

  it("accepts an area the floor holds, turned or not", () => {
    expect(codes(project({ headroomAreas: [{ w: 220, d: 150 }] }))).toEqual([]);
    // 190 × 290 does not fit 300 × 200 as given, but does turned
    expect(codes(project({ headroomAreas: [{ w: 190, d: 290 }] }))).toEqual([]);
  });

  it("refuses an area larger than the floor", () => {
    const p = project({ headroomAreas: [{ w: 320, d: 150 }] });
    expect(codes(p)).toContain(VALIDATION_NOTICE_CODES.field.topArea);
    const n = validateProject(p).find((x) => x.code === VALIDATION_NOTICE_CODES.field.topArea);
    expect(n?.path).toBe("/box/headroomAreas/0");
    expect(n?.message).toBe("The space kept on top is larger than the floor of the box.");
  });

  it("does not look at an area that does not apply", () => {
    expect(
      codes(project({ headroomAreas: [{ w: 999, d: 999 }], headroomCoverage: "full" })),
    ).toEqual([]);
  });

  it("refuses a negative side", () => {
    expect(codes(project({ headroomAreas: [{ w: -5, d: 20 }] })).length).toBeGreaterThan(0);
  });
});
