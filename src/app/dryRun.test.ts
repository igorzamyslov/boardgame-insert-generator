// src/app/dryRun.test.ts
import { describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Lock, Project, StoredLayout, TraySpec } from "../model/types";
import { createCtx } from "../layout/context";
import { resolveLocks } from "../layout/locks";
import { warmHints } from "../layout/warmstart";
import { putOnLocks, standingOn, takeOff, toggleLock, turnTray } from "./actions";
import { canPutOn, canTurn, turnLocks } from "./dryRun";
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

  it("reports a conflict before running: a size lock on the tray holds its rotation", () => {
    // the tray's size lock only fits it as it is, so turning it contradicts it
    const p = planned([{ kind: "size", trayKey: HIGH, w: 74, d: 98, h: 75 }]);
    const r = canTurn(p, HIGH);
    expect(r.ok).toBe(false);
    // a whole sentence, naming the tray at fault by its label (the contents it holds)
    expect(r.reason).toMatch(
      /^Turning doesn't work for .+: it conflicts with the size lock on the same tray\.$/,
    );
    expect(r.reason).not.toContain(HIGH);
    // its stack-mate and a tray alone are not under that lock: turning them is fine
    expect(canTurn(p, LOW)).toEqual({ ok: true });
    expect(canTurn(p, ALONE)).toEqual({ ok: true });
  });

  it("reports a conflict on a pinned stack from any of its trays", () => {
    const p = planned([
      { kind: "position", trayKey: LOW, path: "10", rotated: false },
      { kind: "position", trayKey: HIGH, path: "10", rotated: false },
      { kind: "stack", trayKeys: [LOW, HIGH] },
      { kind: "size", trayKey: HIGH, w: 74, d: 98, h: 75 },
    ]);
    const r = canTurn(p, LOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(
      /^Turning doesn't work for .+: it conflicts with the size lock on the same tray\.$/,
    );
    expect(canTurn(p, HIGH)).toEqual(r);
  });

  it("a tray turns alone when it is not pinned, so a square stack-mate does not matter", () => {
    const stack = [
      tray(LOW, { path: "10", level: 0, w: 80, d: 80 }),
      tray(HIGH, { path: "10", level: 1, w: 70, d: 90 }),
    ];
    expect(canTurn(planned([], stack), HIGH)).toEqual({ ok: true });
    expect(canTurn(planned([], stack), LOW).reason).toBe(
      "This tray is square, so turning changes nothing.",
    );
  });

  it("a pinned stack is square only when every tray in it is", () => {
    const pins: Lock[] = [
      { kind: "position", trayKey: LOW, path: "10", rotated: false },
      { kind: "position", trayKey: HIGH, path: "10", rotated: false },
      { kind: "stack", trayKeys: [LOW, HIGH] },
    ];
    const stack = [
      tray(LOW, { path: "10", level: 0, w: 80, d: 80 }),
      tray(HIGH, { path: "10", level: 1, w: 70, d: 90 }),
    ];
    expect(canTurn(planned(pins, stack), LOW)).toEqual({ ok: true });
    const squares = [stack[0] as TraySpec, tray(HIGH, { path: "10", level: 1, w: 78, d: 78.2 })];
    expect(canTurn(planned(pins, squares), LOW).reason).toBe(
      "This tray is square, so turning changes nothing.",
    );
  });

  it("a pinned tray with a turn lock of its own turns with its pin, so they never clash", () => {
    const p = planned([
      { kind: "position", trayKey: ALONE, path: "0", rotated: true },
      { kind: "turn", trayKey: ALONE, rotated: true },
    ]);
    expect(canTurn(p, ALONE)).toEqual({ ok: true });
    // turned back: both locks say not rotated
    expect(turnLocks(p, ALONE)).toEqual([
      { kind: "position", trayKey: ALONE, path: "0", rotated: false },
      { kind: "turn", trayKey: ALONE, rotated: false },
    ]);
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

  it("is not blocked by a group member this app doesn't read, given the file's foreign data", () => {
    const p = planned();
    const first = p.components[0]?.id ?? "";
    const withForeign: Project = {
      ...p,
      groups: [{ id: "kit", name: "Kit", access: "often", memberIds: [first, "dial0001"] }],
    };
    const foreign = { components: [{ index: 9, raw: { id: "dial0001", kind: "dial" } }] };
    expect(canTurn(withForeign, ALONE).reason).toBe("Fix the errors first.");
    expect(canTurn(withForeign, ALONE, foreign).reason).not.toBe("Fix the errors first.");
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
  it("on an unpinned tray writes one turn lock, on that tray only, keeping every other lock", () => {
    const other: Lock = { kind: "size", trayKey: ALONE, w: 72, d: 96, h: 20 };
    const stack: Lock = { kind: "stack", trayKeys: [LOW, HIGH] };
    const p = planned([other, stack]);
    expect(turnLocks(p, HIGH)).toEqual([
      other,
      stack,
      { kind: "turn", trayKey: HIGH, rotated: true },
    ]);
  });

  it("turns a tray that is already turned back", () => {
    const p = planned([], [tray(ALONE, { path: "0", rotated: true })]);
    expect(turnLocks(p, ALONE)).toEqual([{ kind: "turn", trayKey: ALONE, rotated: false }]);
  });

  it("flips the turn lock it wrote, not the stale plan's rotation", () => {
    const first: Lock = { kind: "turn", trayKey: ALONE, rotated: true };
    // the plan has not caught up with the lock: it still shows the tray as it was
    const p = planned([first]);
    expect(turnLocks(p, ALONE)).toEqual([{ kind: "turn", trayKey: ALONE, rotated: false }]);
  });

  it("on a pinned stack flips its pins as before, and adds one turn lock on the chosen tray", () => {
    const stale: Lock[] = [
      { kind: "position", trayKey: LOW, path: "10", rotated: false },
      { kind: "position", trayKey: HIGH, path: "10", rotated: false },
      { kind: "stack", trayKeys: [LOW, HIGH] },
    ];
    const other: Lock = { kind: "size", trayKey: ALONE, w: 72, d: 96, h: 20 };
    const p = planned([other, ...stale]);
    expect(turnLocks(p, HIGH)).toEqual([
      other,
      { kind: "position", trayKey: LOW, path: "10", rotated: true },
      { kind: "position", trayKey: HIGH, path: "10", rotated: true },
      { kind: "stack", trayKeys: [LOW, HIGH] },
      { kind: "turn", trayKey: HIGH, rotated: true },
    ]);
  });

  it("on a pinned stack keeps the pins of the stack and its turn locks in agreement", () => {
    const own: Lock = { kind: "turn", trayKey: LOW, rotated: true };
    const locks: Lock[] = [
      { kind: "position", trayKey: LOW, path: "10", rotated: true },
      { kind: "position", trayKey: HIGH, path: "10", rotated: false },
      { kind: "stack", trayKeys: [LOW, HIGH] },
      own,
    ];
    // the plan shows LOW as it was before the turn lock: the lock is what turning flips
    const turned = turnLocks(planned(locks), HIGH) ?? [];
    expect(turned.filter((l) => l.kind === "turn")).toEqual([
      { kind: "turn", trayKey: LOW, rotated: false },
      { kind: "turn", trayKey: HIGH, rotated: true },
    ]);
    expect(turned.filter((l) => l.kind === "position")).toEqual([
      { kind: "position", trayKey: LOW, path: "10", rotated: false },
      { kind: "position", trayKey: HIGH, path: "10", rotated: true },
    ]);
  });

  it("is null without a plan or for a tray that is not in it", () => {
    expect(turnLocks(fixtureProject(), ALONE)).toBeNull();
    expect(turnLocks(planned(), "nope:p0:0")).toBeNull();
  });
});

describe("turn, then pin", () => {
  it("writes a pin that agrees with the turn, against the plan that has not caught up", () => {
    const p = planned();
    const tray = (p.layout as StoredLayout).trays.find((t) => t.key === HIGH) as TraySpec;
    const pinned = toggleLock(turnTray(p, tray), tray);
    const turn = pinned.locks.find((l) => l.kind === "turn");
    const pin = pinned.locks.find((l) => l.kind === "position" && l.trayKey === HIGH);
    expect(turn).toEqual({ kind: "turn", trayKey: HIGH, rotated: true });
    expect(pin).toMatchObject({ rotated: true });
    const ctx = createCtx(buildLayoutInput(pinned));
    const { conflicts } = resolveLocks(
      ctx,
      pinned.locks,
      warmHints(ctx, (p.layout as StoredLayout).trays),
    );
    expect(conflicts).toEqual([]);
  });
});

describe("canPutOn", () => {
  const nameOf = (key: string): string => `Tray ${key.slice(0, 8)}`;

  it("allows a tray on another, from any layer, and writes the order base-first", () => {
    const p = planned();
    expect(canPutOn(p, ALONE, LOW, nameOf)).toEqual({ ok: true });
    // the base's own stack comes first: the tray ends up on top of it
    expect(putOnLocks(p, ALONE, HIGH)).toEqual([{ kind: "stack", trayKeys: [LOW, HIGH, ALONE] }]);
    expect(putOnLocks(p, ALONE, LOW)).toEqual([{ kind: "stack", trayKeys: [LOW, ALONE] }]);
  });

  it("needs a plan, two different trays that are in it", () => {
    expect(canPutOn(fixtureProject(), ALONE, LOW, nameOf).reason).toBe("Make a plan first.");
    expect(canPutOn(planned(), ALONE, "nope:p0:0", nameOf).reason).toMatch(/isn't in the plan/);
    expect(canPutOn(planned(), ALONE, ALONE, nameOf).ok).toBe(false);
  });

  it("says when the stack would be taller than the box", () => {
    const base = planned();
    const low = { ...base, box: { ...base.box, innerHeight: 30 } };
    const r = canPutOn(low, ALONE, LOW, nameOf);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(
      `${nameOf(ALONE)} doesn't go on ${nameOf(LOW)}: the stack is taller than the space in the box.`,
    );
  });

  it("refuses a fifth tray, by the stack limit", () => {
    const top = "fxcrd001:p0:0";
    const spare = "fxcrd009:p0:0";
    const stack: Lock = { kind: "stack", trayKeys: [LOW, HIGH, ALONE, top] };
    const p = planned(
      [stack],
      [
        tray(LOW, { path: "10", level: 0 }),
        tray(HIGH, { path: "10", level: 1 }),
        tray(ALONE, { path: "10", level: 2 }),
        tray(top, { path: "10", level: 3 }),
        tray(spare, { path: "0" }),
      ],
    );
    const r = canPutOn(p, spare, top, nameOf);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(`${nameOf(top)} already has 3 trays on it. A stack holds at most 4.`);
  });

  it("refuses a tray, or a base, that is pinned, and names it", () => {
    const pins: Lock[] = [{ kind: "position", trayKey: ALONE, path: "0", rotated: false }];
    expect(canPutOn(planned(pins), ALONE, LOW, nameOf).reason).toBe(
      `${nameOf(ALONE)} is pinned. Unpin it before you put trays on it.`,
    );
    expect(canPutOn(planned(pins), LOW, ALONE, nameOf).reason).toMatch(/is pinned/);
  });

  it("does not change the project, and never throws", () => {
    const p = planned();
    const before = JSON.stringify(p);
    canPutOn(p, ALONE, LOW, nameOf);
    expect(JSON.stringify(p)).toBe(before);
    expect(() =>
      canPutOn({ ...p, layout: undefined, locks: null as never }, ALONE, LOW, nameOf),
    ).not.toThrow();
  });
});

describe("putOnLocks and takeOff", () => {
  it("replaces the stack locks the trays were in and keeps the other locks", () => {
    const turn: Lock = { kind: "turn", trayKey: ALONE, rotated: true };
    const p = planned([turn, { kind: "stack", trayKeys: [LOW, HIGH] }]);
    expect(putOnLocks(p, HIGH, ALONE)).toEqual([turn, { kind: "stack", trayKeys: [ALONE, HIGH] }]);
  });

  it("lists what stands on what, and a tray is taken off with the rest of its stack kept", () => {
    const p = planned([{ kind: "stack", trayKeys: [LOW, HIGH, ALONE] }]);
    expect([...standingOn(p.locks)]).toEqual([
      [HIGH, LOW],
      [ALONE, HIGH],
    ]);
    expect(takeOff(p, ALONE).locks).toEqual([{ kind: "stack", trayKeys: [LOW, HIGH] }]);
    expect(takeOff(takeOff(p, ALONE), HIGH).locks).toEqual([]);
    expect(takeOff(p, LOW)).toBe(p);
  });

  it("does not count the stack lock a pin comes with", () => {
    const pins: Lock[] = [
      { kind: "position", trayKey: LOW, path: "10", rotated: false },
      { kind: "position", trayKey: HIGH, path: "10", rotated: false },
      { kind: "stack", trayKeys: [LOW, HIGH] },
    ];
    expect(standingOn(pins).size).toBe(0);
  });
});
