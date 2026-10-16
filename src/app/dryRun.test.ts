// src/app/dryRun.test.ts
import { describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Lock, Project, StoredLayout, TraySpec } from "../model/types";
import { canTurn, turnLocks } from "./dryRun";
import { buildLayoutInput } from "./runner";
import { fixtureProject, makeLayout, makeTray } from "./test-helpers";

vi.mock("./runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./runner")>();
  return { ...actual, buildLayoutInput: vi.fn(actual.buildLayoutInput) };
});

// Trays of the cards-heavy fixture: standing apart, and two of them stacked at one path.
const ALONE = "fxcrd003:p0:0";
const LOW = "fxcrd002:p0:1";
const HIGH = "fxcrd002:p0:0";

function tray(key: string, over: Partial<TraySpec> = {}): TraySpec {
  return makeTray({ key, w: 72, d: 96, ...over });
}

function planned(locks: Lock[] = [], trays?: TraySpec[]): Project {
  const base = fixtureProject();
  // tall enough that the fixture's trays can stand on each other
  const p = { ...base, locks, box: { ...base.box, innerHeight: 200 } };
  const all = trays ?? [
    tray(ALONE, { path: "0" }),
    tray(LOW, { path: "10", level: 0 }),
    tray(HIGH, { path: "10", level: 1, z: 20, lip: false }),
  ];
  return { ...p, layout: makeLayout(inputsHash(p), all) };
}

describe("canTurn", () => {
  it("a square tray cannot usefully turn", () => {
    const p = planned([], [tray(ALONE, { w: 80, d: 80.3 })]);
    expect(canTurn(p, ALONE)).toEqual({
      ok: false,
      reason: "This tray is square, so turning changes nothing.",
    });
    // 0.5 mm apart is no longer square
    const near = planned([], [tray(ALONE, { w: 80, d: 80.5 })]);
    expect(canTurn(near, ALONE)).toEqual({ ok: true });
  });

  it("needs a plan, and a tray that is in it", () => {
    expect(canTurn(fixtureProject(), ALONE)).toEqual({
      ok: false,
      reason: "Make a plan first.",
    });
    const r = canTurn(planned(), "nope:p0:0");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/isn't in the plan/);
  });

  it("allows a tray that stands alone, and a stack, when nothing is in the way", () => {
    expect(canTurn(planned(), ALONE)).toEqual({ ok: true });
    expect(canTurn(planned(), HIGH)).toEqual({ ok: true });
  });

  it("reports a stack conflict before running", () => {
    // the upper tray's size lock keeps it as it is, so turning the stack contradicts it (it fits either way up)
    const p = planned([{ kind: "size", trayKey: HIGH, w: 150, d: 150, h: 90 }]);
    const r = canTurn(p, LOW);
    expect(r.ok).toBe(false);
    // a whole sentence, naming the tray at fault by its label (the contents it holds)
    expect(r.reason).toMatch(
      /^Turning doesn't work for .+: it conflicts with the size lock on the same tray\.$/,
    );
    expect(r.reason).not.toContain(HIGH);
    // the same stack seen from its other tray
    expect(canTurn(p, HIGH)).toEqual(r);
    // a tray alone is not in that stack
    expect(canTurn(p, ALONE)).toEqual({ ok: true });
  });

  it("a stack is square only when every tray in it is", () => {
    const stack = [
      tray(LOW, { path: "10", level: 0, w: 80, d: 80 }),
      tray(HIGH, { path: "10", level: 1, w: 70, d: 90 }),
    ];
    expect(canTurn(planned([], stack), LOW)).toEqual({ ok: true });
    const squares = [stack[0] as TraySpec, tray(HIGH, { path: "10", level: 1, w: 78, d: 78.2 })];
    expect(canTurn(planned([], squares), LOW).reason).toBe(
      "This tray is square, so turning changes nothing.",
    );
  });

  it("builds the layout input once for several trays of one project", () => {
    const p = planned();
    const build = vi.mocked(buildLayoutInput);
    build.mockClear();
    canTurn(p, ALONE);
    canTurn(p, LOW);
    canTurn(p, HIGH);
    expect(build).toHaveBeenCalledTimes(1);
    // an edit is a new project: its own context
    canTurn({ ...p, name: "Renamed" }, ALONE);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("asks to fix the errors before anything else when the project has some", () => {
    const p = planned();
    const broken = { ...p, box: { ...p.box, innerWidth: -1 } };
    expect(canTurn(broken, ALONE)).toEqual({ ok: false, reason: "Fix the errors first." });
  });

  it("never throws", () => {
    const p = planned();
    const bad = {
      ...p,
      layout: { ...(p.layout as StoredLayout), trays: [null as unknown as TraySpec] },
    };
    expect(canTurn(bad, ALONE)).toEqual({
      ok: false,
      reason: "Turning isn't possible right now.",
    });
  });

  it("is not blocked by a conflict that has nothing to do with the stack", () => {
    const p = planned([{ kind: "position", trayKey: "gone:p0:0", path: "0", rotated: false }]);
    expect(canTurn(p, ALONE)).toEqual({ ok: true });
  });

  it("does not change the project", () => {
    const p = planned();
    const before = JSON.stringify(p);
    canTurn(p, HIGH);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("turnLocks", () => {
  it("pins the whole stack with its rotation flipped, keeping other locks", () => {
    const other: Lock = { kind: "size", trayKey: ALONE, w: 72, d: 96, h: 20 };
    const stale: Lock = { kind: "position", trayKey: HIGH, path: "0", rotated: false };
    const p = planned([other, stale]);
    expect(turnLocks(p, HIGH)).toEqual([
      other,
      { kind: "position", trayKey: LOW, path: "10", rotated: true },
      { kind: "position", trayKey: HIGH, path: "10", rotated: true },
      { kind: "stack", trayKeys: [LOW, HIGH] },
    ]);
  });

  it("turns a tray that is already turned back", () => {
    const p = planned([], [tray(ALONE, { path: "0", rotated: true })]);
    expect(turnLocks(p, ALONE)).toEqual([
      { kind: "position", trayKey: ALONE, path: "0", rotated: false },
    ]);
  });
});
