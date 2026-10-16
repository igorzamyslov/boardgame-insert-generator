// src/app/actions.test.ts
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "../model/defaults";
import { GEOMETRY_VERSION } from "../geometry/version";
import { NOTICE_CODES } from "../layout";
import type { CardsComponent, Lock, Notice, Project, TraySpec } from "../model/types";
import {
  addComponent,
  isLockable,
  lockedKeys,
  pruneDroppedLocks,
  removeComponent,
  restoreComponent,
  removeLock,
  renameProject,
  setCardSides,
  setClearance,
  setGroup,
  setLock,
  setPerPlayer,
  setSettings,
  sizeLockedKeys,
  swapTrays,
  toggleLock,
  toggleSizeLock,
  updateBox,
  updateComponent,
  updatePrinter,
  applyPrinter,
} from "./actions";

function tray(over: Partial<TraySpec>): TraySpec {
  return {
    key: "a:p0:0",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 80,
    h: 40,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [],
    ...over,
  };
}

function withLayout(p: Project, trays: TraySpec[]): Project {
  return {
    ...p,
    layout: {
      createdWith: "0.1.0",
      geometryVersion: GEOMETRY_VERSION,
      inputsHash: "x",
      seed: 1,
      iterations: 1000,
      capped: false,
      trays,
    },
  };
}

describe("project actions", () => {
  it("patches box and printer without mutating the input", () => {
    const p = newProject();
    const frozen = JSON.stringify(p);
    const q = updatePrinter(updateBox(p, { innerWidth: 290 }), { bedX: 256 });
    expect(q.box.innerWidth).toBe(290);
    expect(q.box.innerDepth).toBe(p.box.innerDepth);
    expect(q.printer.bedX).toBe(256);
    expect(JSON.stringify(p)).toBe(frozen);
  });

  it("applies a whole printer as a copy, leaving the rest alone", () => {
    const p = addComponent(newProject(), "cards");
    const frozen = JSON.stringify(p);
    const printer = { bedX: 180, bedY: 170, bedZ: 160, bedMargin: 3, layerHeight: 0.16 };
    const q = applyPrinter(p, printer);
    expect(q.printer).toEqual(printer);
    expect(q.printer).not.toBe(printer);
    expect(q.box).toBe(p.box);
    expect(q.components).toBe(p.components);
    expect(JSON.stringify(p)).toBe(frozen);
  });

  it("renames", () => {
    expect(renameProject(newProject(), "Wingspan").name).toBe("Wingspan");
  });

  it("adds, updates and removes components", () => {
    const p1 = addComponent(newProject(), "cards");
    expect(p1.components).toHaveLength(1);
    const c = p1.components[0];
    if (!c) {
      throw new Error("component missing");
    }
    const p2 = updateComponent(p1, c.id, { ...c, name: "Main deck" });
    expect(p2.components[0]?.name).toBe("Main deck");
    const locks: Lock[] = [
      { kind: "position", trayKey: `${c.id}:p0:0`, path: "0", rotated: false },
      { kind: "stack", trayKeys: [`${c.id}:p0:0`, "other:p0:0"] },
      { kind: "position", trayKey: "other:p0:0", path: "1", rotated: false },
    ];
    const p3 = removeComponent({ ...p2, locks }, c.id);
    expect(p3.components).toHaveLength(0);
    expect(p3.locks).toEqual([
      { kind: "position", trayKey: "other:p0:0", path: "1", rotated: false },
    ]);
    // a stack lock keeps the rest of its stack, in order, while two or more trays remain
    const three: Lock[] = [
      { kind: "stack", trayKeys: ["x:p0:0", `${c.id}:p0:0`, "y:p0:0"] },
      { kind: "stack", trayKeys: [`${c.id}:p0:1`, "z:p0:0"] },
    ];
    expect(removeComponent({ ...p2, locks: three }, c.id).locks).toEqual([
      { kind: "stack", trayKeys: ["x:p0:0", "y:p0:0"] },
    ]);
  });

  it("drops locks keyed by a group no component keeps any more", () => {
    const a = { ...newComponent("bulk"), groupId: "g" };
    const b = { ...newComponent("bulk"), groupId: "g" };
    const lockG: Lock = { kind: "position", trayKey: "g:p0:0", path: "0", rotated: false };
    const lockH: Lock = { kind: "position", trayKey: "h:p0:0", path: "1", rotated: false };
    const base: Project = { ...newProject(), components: [a, b], locks: [lockG, lockH] };
    // another member keeps the group: its locks stay
    expect(removeComponent(base, a.id).locks).toEqual([lockG, lockH]);
    // the last member goes: so do its locks
    const last = removeComponent(removeComponent(base, a.id), b.id);
    expect(last.locks).toEqual([lockH]);
    // regrouping the last member frees the old key, and the new key has no locks yet
    const solo: Project = { ...base, components: [a] };
    expect(updateComponent(solo, a.id, setGroup(a, "other")).locks).toEqual([lockH]);
    expect(updateComponent(solo, a.id, setGroup(a, undefined)).locks).toEqual([lockH]);
    // an edit that keeps the group keeps its locks
    expect(updateComponent(solo, a.id, { ...a, name: "x" }).locks).toEqual([lockG, lockH]);
    // an ungrouped component joining a group frees the lock keyed by its own id
    const c = newComponent("bulk");
    const lockC: Lock = { kind: "position", trayKey: `${c.id}:p0:0`, path: "2", rotated: false };
    const ungrouped: Project = { ...newProject(), components: [c], locks: [lockC] };
    expect(updateComponent(ungrouped, c.id, setGroup(c, "g")).locks).toEqual([]);
  });

  it("replaces the settings", () => {
    const p = newProject();
    const s = { ...p.settings, cornerRadius: 4 };
    expect(setSettings(p, s).settings.cornerRadius).toBe(4);
  });

  it("sets, replaces, removes and toggles locks", () => {
    const p = newProject();
    const l1: Lock = { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false };
    const l2: Lock = { kind: "position", trayKey: "a:p0:0", path: "1", rotated: true };
    const size: Lock = { kind: "size", trayKey: "a:p0:0", w: 1, d: 2, h: 3 };
    const p1 = setLock(setLock(setLock(p, l1), size), l2);
    expect(p1.locks).toEqual([size, l2]);
    expect(removeLock(p1, "a:p0:0", "position").locks).toEqual([size]);
    expect(removeLock(p1, "a:p0:0").locks).toEqual([]);

    const t = tray({ key: "a:p0:0", path: "01", rotated: true });
    const on = toggleLock(p, t);
    expect(on.locks).toEqual([{ kind: "position", trayKey: "a:p0:0", path: "01", rotated: true }]);
    expect(lockedKeys(on)).toEqual(new Set(["a:p0:0"]));
    expect(toggleLock(on, t).locks).toEqual([]);
    expect(toggleLock(p, tray({ key: "leftover:0", part: "leftover" }))).toBe(p);
  });

  it("locks and unlocks a whole stack together", () => {
    const lower = tray({ key: "a:p0:0", path: "1", level: 0, rotated: true });
    const upper = tray({ key: "b:p0:0", path: "1", level: 1 });
    const beside = tray({ key: "c:p0:0", path: "0" });
    const other: Lock = { kind: "position", trayKey: "c:p0:0", path: "0", rotated: false };
    const swapped: Lock = { kind: "stack", trayKeys: ["b:p0:0", "a:p0:0"] };
    const p = { ...withLayout(newProject(), [beside, upper, lower]), locks: [other, swapped] };
    const on = toggleLock(p, upper);
    // a pending swap (the stack lock's order) survives locking the stack
    expect(on.locks).toEqual([
      other,
      { kind: "position", trayKey: "a:p0:0", path: "1", rotated: true },
      { kind: "position", trayKey: "b:p0:0", path: "1", rotated: false },
      swapped,
    ]);
    // without a pending swap the stack lock is in level order
    const plain = toggleLock({ ...p, locks: [other] }, upper);
    expect(plain.locks.at(-1)).toEqual({ kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] });
    expect(lockedKeys(on)).toEqual(new Set(["a:p0:0", "b:p0:0", "c:p0:0"]));
    // either tray of the stack unlocks it all; the tray beside stays locked
    expect(toggleLock(on, lower).locks).toEqual([other]);
    expect(toggleLock(on, upper).locks).toEqual([other]);
  });

  it("only locks real trays", () => {
    expect(isLockable(tray({}))).toBe(true);
    expect(isLockable(tray({ part: "leftover", key: "leftover:0" }))).toBe(false);
    expect(isLockable(tray({ part: "spacer", key: "a:p0:0:spacer" }))).toBe(false);
  });

  it("swaps trays through their layout", () => {
    const a = tray({ key: "a:p0:0", path: "0", stack: 0 });
    const b = tray({ key: "b:p0:0", path: "1", stack: 1 });
    const p = withLayout(newProject(), [a, b]);
    expect(swapTrays(p, "a:p0:0", "b:p0:0").locks).toHaveLength(2);
    const noLayout = newProject();
    expect(swapTrays(noLayout, "a:p0:0", "b:p0:0")).toBe(noLayout);
  });

  it("orders card sides so short ≤ long", () => {
    const c = newComponent("cards") as CardsComponent;
    expect(setCardSides(c, 88, 63.5)).toMatchObject({ shortSide: 63.5, longSide: 88 });
    expect(setCardSides(c, 41, 63)).toMatchObject({ shortSide: 41, longSide: 63 });
  });

  it("sets and clears group, perPlayer and clearance", () => {
    const c = newComponent("bulk");
    const pp = setPerPlayer(c, 4);
    expect(pp.perPlayer).toEqual({ players: 4 });
    const grouped = setGroup(pp, "  tokens ");
    expect(grouped.groupId).toBe("tokens");
    expect(grouped.perPlayer).toBeUndefined();
    expect("groupId" in setGroup(grouped, "  ")).toBe(false);
    expect("perPlayer" in setPerPlayer(pp, undefined)).toBe(false);
    expect(setClearance(c, 2).clearance).toBe(2);
    expect("clearance" in setClearance(setClearance(c, 2), undefined)).toBe(false);
  });
});

describe("size locks", () => {
  it("toggles a size lock from the tray's current outer size", () => {
    const p = newProject();
    const t = tray({ key: "a:p0:0", w: 120.5, d: 80, h: 33.4, rotated: true });
    const on = toggleSizeLock(p, t);
    expect(on.locks).toEqual([{ kind: "size", trayKey: "a:p0:0", w: 120.5, d: 80, h: 33.4 }]);
    expect(sizeLockedKeys(on)).toEqual(new Set(["a:p0:0"]));
    expect(lockedKeys(on)).toEqual(new Set());
    expect(toggleSizeLock(on, t).locks).toEqual([]);
    expect(p.locks).toEqual([]);
  });

  it("keeps a position lock on the same tray and ignores leftovers", () => {
    const t = tray({ key: "a:p0:0" });
    const p = toggleLock(newProject(), t);
    const both = toggleSizeLock(p, t);
    expect(both.locks.map((l) => l.kind)).toEqual(["position", "size"]);
    expect(toggleSizeLock(both, t).locks.map((l) => l.kind)).toEqual(["position"]);
    const left = newProject();
    expect(toggleSizeLock(left, tray({ key: "leftover:0", part: "leftover" }))).toBe(left);
  });
});

describe("pruneDroppedLocks", () => {
  const locks: Lock[] = [
    { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
    { kind: "size", trayKey: "a:p0:0", w: 50, d: 40, h: 20 },
    { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] },
  ];
  const dropped = (index: number): Notice => ({
    level: "warning",
    code: NOTICE_CODES.lockDropped,
    message: "Size lock on a:p0:0 was dropped: its contents no longer fit.",
    path: `/locks/${index}`,
  });

  it("removes exactly the locks named by lock.dropped notices", () => {
    const p: Project = { ...newProject(), locks };
    expect(pruneDroppedLocks(p, [dropped(1), dropped(2)]).locks).toEqual([locks[0]]);
  });

  it("returns the same project when nothing was dropped or the notice has no lock path", () => {
    const p: Project = { ...newProject(), locks };
    const other: Notice = {
      level: "warning",
      code: NOTICE_CODES.play,
      message: "",
      path: "/locks/0",
    };
    const noPath: Notice = { level: "warning", code: NOTICE_CODES.lockDropped, message: "" };
    expect(pruneDroppedLocks(p, [other, noPath])).toBe(p);
  });
});

describe("restoreComponent", () => {
  it("puts a removed component back at its index, and does nothing if it is already there", () => {
    const p0 = addComponent(addComponent(newProject(), "cards"), "bulk");
    const [first, second] = p0.components;
    if (first === undefined || second === undefined) {
      throw new Error("expected two components");
    }
    const p1 = removeComponent(p0, first.id);
    expect(p1.components.map((c) => c.id)).toEqual([second.id]);
    const p2 = restoreComponent(p1, first, 0);
    expect(p2.components.map((c) => c.id)).toEqual([first.id, second.id]);
    expect(restoreComponent(p2, first, 1)).toBe(p2);
    expect(restoreComponent(p1, first, 99).components.map((c) => c.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
});
