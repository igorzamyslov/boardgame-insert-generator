// src/model/step.test.ts
// The rim's kind (2026-10-23): "rim" by default and for every file that does not say, the stepped
// base on request; hashed only when it is the step, so no saved plan goes stale.
import { describe, expect, it } from "vitest";
import { sampleProject } from "../test-support/sample";
import { canonicalJson, inputsHash, lipForHash } from "./hash";
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
  it("is Auto by default, with a 1.5 mm step for the stepped base; unresolved, Auto builds as the rim", () => {
    expect(DEFAULT_SETTINGS.lip.joint).toBe("auto");
    expect(DEFAULT_SETTINGS.lip.stepHeight).toBe(1.5);
    expect(rimOn(DEFAULT_SETTINGS)).toBe(true);
    expect(stepOn(DEFAULT_SETTINGS)).toBe(false);
  });

  it("reads a file with the switch on and no kind as the rim, and keeps the step and its height", () => {
    const file = raw(sampleProject());
    const lip = (file.settings as Json).lip as Json;
    delete lip.joint;
    lip.enabled = true;
    delete lip.stepHeight;
    const old = parseProject(file);
    expect(old.ok && old.project.settings.lip).toMatchObject({ joint: "rim", stepHeight: 1.5 });
    const stepped = parseProject(raw(withLip(sampleProject(), { joint: "step", stepHeight: 2.2 })));
    expect(stepped.ok && stepped.project.settings.lip).toMatchObject({
      joint: "step",
      stepHeight: 2.2,
    });
  });

  it("keeps the hash of every rim project, and changes it for the step and its height", () => {
    const p = withLip(sampleProject(), { joint: "rim" });
    const before = inputsHash(p);
    expect(inputsHash(withLip(p, { stepHeight: 2.5 }))).toBe(before);
    const stepped = inputsHash(withLip(p, { joint: "step" }));
    expect(stepped).not.toBe(before);
    expect(inputsHash(withLip(p, { joint: "step", stepHeight: 2.5 }))).not.toBe(stepped);
  });

  it("hashes Auto as a joint of its own, with the step's height, so only a switch to it plans again", () => {
    const p = sampleProject();
    const hashed = (joint: "off" | "auto" | "rim" | "step", stepHeight?: number) =>
      inputsHash(withLip(p, { joint, ...(stepHeight === undefined ? {} : { stepHeight }) }));
    const all = [hashed("off"), hashed("auto"), hashed("rim"), hashed("step")];
    expect(new Set(all).size).toBe(4);
    expect(hashed("auto", 2.5)).not.toBe(hashed("auto"));
    expect(hashed("rim", 2.5)).toBe(hashed("rim"));
    expect(hashed("off", 2.5)).toBe(hashed("off"));
  });

  it("hashes off, the rim and the step as the switch and kind they were, so no saved plan goes stale", () => {
    const rest = { height: 2, thickness: 1.2, ledge: 1.7, play: 0.25 };
    const wasOff = lipForHash({ ...DEFAULT_SETTINGS.lip, joint: "off" });
    const wasRim = lipForHash({ ...DEFAULT_SETTINGS.lip, joint: "rim" });
    const wasStep = lipForHash({ ...DEFAULT_SETTINGS.lip, joint: "step" });
    expect(wasOff).toEqual({ ...rest, enabled: false });
    expect(wasRim).toEqual({ ...rest, enabled: true });
    expect(wasStep).toEqual({ ...rest, enabled: true, stepBase: 1.5 });
  });

  it("hashes the step under a key no file holds, so an older app sees a stepped plan as stale", () => {
    // An older app keeps a newer file's lip.joint and lip.stepHeight as they are and hashes them so.
    const stepped = { ...DEFAULT_SETTINGS.lip, joint: "step" as const };
    expect(canonicalJson(lipForHash(stepped))).not.toBe(canonicalJson(stepped));
    expect(lipForHash(stepped)).not.toHaveProperty("joint");
    expect(lipForHash(stepped)).not.toHaveProperty("stepHeight");
    expect(lipForHash(stepped)).toHaveProperty("stepBase", 1.5);
  });

  it("asks the step to be the lip play (times Fit) and MIN_FEATURE_MM high, at least", () => {
    const at = (fit: number, play: number, stepHeight: number) =>
      validateProject({
        ...withLip(sampleProject(), { joint: "step", play, stepHeight }),
        settings: {
          ...withLip(sampleProject(), { joint: "step", play, stepHeight }).settings,
          fit,
        },
      }).filter((n) => n.code === "field.stepPlay");
    expect(at(3, 0.4, 1)).toHaveLength(1);
    expect(at(2, 0.5, 1)).toHaveLength(1);
    expect(at(1, 0.2, 1)).toHaveLength(0);
    expect(at(1, 0.25, 1.5)).toHaveLength(0);
    // the rim asks nothing of the step's height
    const rimmed = validateProject({
      ...withLip(sampleProject(), { joint: "rim", play: 0.5, stepHeight: 1 }),
    }).filter((n) => n.code === "field.stepPlay");
    expect(rimmed).toHaveLength(0);
    expect(at(3, 0.4, 1)[0]?.path).toBe("/settings/lip/stepHeight");
  });

  it("validates the step's height, and asks no lip ledge of the step", () => {
    const p = withLip(sampleProject(), { joint: "step", stepHeight: 0.5 });
    expect(validateProject(p).map((n) => n.path)).toContain("/settings/lip/stepHeight");
    // a ledge too narrow for the rim's bearing is no error with the step
    const narrow = withLip(sampleProject(), { joint: "step", ledge: 0.5, play: 0.25 });
    expect(validateProject(narrow).filter((n) => n.level === "error")).toEqual([]);
    const rimmed = withLip(narrow, { joint: "rim" });
    expect(validateProject(rimmed).map((n) => n.path)).toContain("/settings/bottomChamfer");
  });
});

describe("the step's numbers at the defaults", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, joint: "step" } };

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
