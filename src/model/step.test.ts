// src/model/step.test.ts
// The rim's kind (2026-10-23): "rim" by default and for every file that does not say, the stepped
// base on request; hashed only when it is the step, so no saved plan goes stale.
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import { inputsHash } from "./hash";
import { bottomEdgeOf, rimOn, socketOf, stepOf, stepOn, upperTrayMinH } from "./lip";
import { noForeign, parseProject, serializeProject } from "./schema";
import { DEFAULT_SETTINGS } from "./settings";
import type { Project, Settings } from "./types";
import { validateProject } from "./validate";

type Json = Record<string, unknown>;

const withLip = (p: Project, lip: Partial<Settings["lip"]>): Project => ({
  ...p,
  settings: { ...p.settings, lip: { ...p.settings.lip, ...lip } },
});

function raw(p: Project): Json {
  return JSON.parse(serializeProject(p, noForeign())) as Json;
}

describe("the rim's kind", () => {
  it("is the rim by default, with a 1.5 mm step for the stepped base", () => {
    expect(DEFAULT_SETTINGS.lip.kind).toBe("rim");
    expect(DEFAULT_SETTINGS.lip.stepHeight).toBe(1.5);
    expect(rimOn(DEFAULT_SETTINGS)).toBe(true);
    expect(stepOn(DEFAULT_SETTINGS)).toBe(false);
  });

  it("reads a file without a kind as the rim, and keeps the step and its height", () => {
    const file = raw(sampleProject());
    const lip = (file.settings as Json).lip as Json;
    delete lip.kind;
    delete lip.stepHeight;
    const old = parseProject(file);
    expect(old.ok && old.project.settings.lip).toMatchObject({ kind: "rim", stepHeight: 1.5 });
    const stepped = parseProject(raw(withLip(sampleProject(), { kind: "step", stepHeight: 2.2 })));
    expect(stepped.ok && stepped.project.settings.lip).toMatchObject({
      kind: "step",
      stepHeight: 2.2,
    });
  });

  it("keeps the hash of every rim project, and changes it for the step and its height", () => {
    const p = sampleProject();
    const before = inputsHash(p);
    expect(inputsHash(withLip(p, { stepHeight: 2.5 }))).toBe(before);
    const stepped = inputsHash(withLip(p, { kind: "step" }));
    expect(stepped).not.toBe(before);
    expect(inputsHash(withLip(p, { kind: "step", stepHeight: 2.5 }))).not.toBe(stepped);
  });

  it("validates the step's height, and asks no lip ledge of the step", () => {
    const p = withLip(sampleProject(), { kind: "step", stepHeight: 0.5 });
    expect(validateProject(p).map((n) => n.path)).toContain("/settings/lip/stepHeight");
    // a ledge too narrow for the rim's bearing is no error with the step
    const narrow = withLip(sampleProject(), { kind: "step", ledge: 0.5, play: 0.25 });
    expect(validateProject(narrow).filter((n) => n.level === "error")).toEqual([]);
    const rimmed = withLip(narrow, { kind: "rim" });
    expect(validateProject(rimmed).map((n) => n.path)).toContain("/settings/bottomChamfer");
  });
});

describe("the step's numbers at the defaults", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, kind: "step" } };

  it("insets the slab by the wall and the play, 1.5 mm high, with no groove", () => {
    expect(stepOf(s, 0)).toBeNull();
    expect(stepOf(s, 1)).toMatchObject({ height: 1.5, wall: 1.6, play: 0.25, inset: 1.85 });
    expect(socketOf(s, false)).toBeNull();
    expect(socketOf(s, true)).toEqual({ wall: 1.6, depth: 1.75, round: 1.85 });
    expect(socketOf(DEFAULT_SETTINGS, true)).toBeNull();
  });

  it("asks an upper tray only the step's wall and MIN_FEATURE_MM above the seam", () => {
    expect(upperTrayMinH(s)).toBeCloseTo(2.4, 9);
    const edge = bottomEdgeOf(s, 1);
    expect(edge.at(1.2) - 1.2).toBeCloseTo(0.4, 9);
    expect(edge.round).toBeCloseTo(1.85, 9);
  });
});
