// src/app/dryRun.test.ts
import { describe, expect, it } from "vitest";
import { inputsHash } from "../model/hash";
import type { Lock, Project, TraySpec } from "../model/types";
import { canTurn, turnLocks } from "./dryRun";
import { fixtureProject, makeLayout, makeTray } from "./test-helpers";

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
    expect(r.reason).toBe("it conflicts with the size lock on the same tray");
    // the same stack seen from its other tray
    expect(canTurn(p, HIGH)).toEqual(r);
    // a tray alone is not in that stack
    expect(canTurn(p, ALONE)).toEqual({ ok: true });
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
