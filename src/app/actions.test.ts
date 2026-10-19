// src/app/actions.test.ts
import { describe, expect, it } from "vitest";
import { newComponent, newProject } from "../model/defaults";
import { GEOMETRY_VERSION } from "../geometry/version";
import type { BulkComponent, CardsComponent, Group, Lock, Project, TraySpec } from "../model/types";
import {
  addComponent,
  addGroup,
  clearChoices,
  freeTurn,
  isLockable,
  lockedKeys,
  moveToGroup,
  newGroupWith,
  orderMember,
  removeComponent,
  removeGroup,
  removeLock,
  renameGroup,
  renameProject,
  setCardSides,
  setClearance,
  setCopies,
  setGroupAccess,
  setGroupCopies,
  setLock,
  setItemCopies,
  setSettings,
  sizeLockedKeys,
  swapTrays,
  takeOutOfGroup,
  toggleLock,
  toggleSizeLock,
  turnTray,
  turnedKeys,
  unpinTrays,
  updateBox,
  updateComponent,
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
  it("patches the box without mutating the input", () => {
    const p = newProject();
    const frozen = JSON.stringify(p);
    const q = updateBox(p, { innerWidth: 290 });
    expect(q.box.innerWidth).toBe(290);
    expect(q.box.innerDepth).toBe(p.box.innerDepth);
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
    const a = newComponent("bulk");
    const b = newComponent("bulk");
    const group: Group = { id: "g", name: "G", access: "sometimes", memberIds: [a.id, b.id] };
    const lockG: Lock = { kind: "position", trayKey: "g:p0:0", path: "0", rotated: false };
    const lockH: Lock = { kind: "position", trayKey: "h:p0:0", path: "1", rotated: false };
    const base: Project = {
      ...newProject(),
      components: [a, b],
      groups: [group],
      locks: [lockG, lockH],
    };
    // another member keeps the group: its locks stay
    expect(removeComponent(base, a.id).locks).toEqual([lockG, lockH]);
    // the last member goes: so do its locks
    const last = removeComponent(removeComponent(base, a.id), b.id);
    expect(last.locks).toEqual([lockH]);
    // an edit that keeps the group keeps its locks
    expect(updateComponent(base, a.id, { ...a, name: "x" }).locks).toEqual([lockG, lockH]);
  });

  it("removes an item from its group's members in the same step", () => {
    const a = newComponent("bulk");
    const b = newComponent("bulk");
    const c = newComponent("bulk");
    const kit: Group = { id: "kit", name: "Kit", access: "often", memberIds: [a.id, b.id] };
    const other: Group = { id: "oth", name: "Other", access: "often", memberIds: [c.id] };
    const base: Project = { ...newProject(), components: [a, b, c], groups: [kit, other] };
    const after = removeComponent(base, a.id);
    expect(after.components.map((x) => x.id)).toEqual([b.id, c.id]);
    expect(after.groups).toEqual([{ ...kit, memberIds: [b.id] }, other]);
    // the group stays, empty, when its last member goes
    expect(removeComponent(after, b.id).groups?.[0]?.memberIds).toEqual([]);
    // a project without groups gets none
    expect(removeComponent({ ...newProject(), components: [a] }, a.id).groups).toBeUndefined();
  });

  it("clears every choice in one step", () => {
    const c = newComponent("cards");
    const locks: Lock[] = [
      { kind: "position", trayKey: `${c.id}:p0:0`, path: "1", rotated: true },
      { kind: "size", trayKey: `${c.id}:p0:0`, w: 1, d: 2, h: 3 },
      { kind: "stack", trayKeys: [`${c.id}:p0:0`, "b:p0:0"] },
    ];
    const p: Project = { ...newProject(), components: [c], locks };
    const cleared = clearChoices(p);
    expect(cleared.locks).toEqual([]);
    expect(cleared.components).toBe(p.components);
    expect(cleared.box).toBe(p.box);
    expect(p.locks).toHaveLength(3);
    // nothing to clear: the same project, so no history step is made for it
    expect(clearChoices(cleared)).toBe(cleared);
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

  it("sets and clears copies and clearance", () => {
    const c = newComponent("bulk");
    const copied = setItemCopies(c, 4);
    expect(copied.copies).toBe(4);
    expect("copies" in setItemCopies(copied, undefined)).toBe(false);
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

describe("unpinTrays", () => {
  const stacked = (): Project => {
    const lower = tray({ key: "a:p0:0", path: "0", level: 0 });
    const upper = tray({ key: "b:p0:0", path: "0", level: 1 });
    const alone = tray({ key: "c:p0:0", path: "1" });
    const p = withLayout(newProject(), [lower, upper, alone]);
    return toggleSizeLock(toggleLock(toggleLock(p, lower), alone), alone);
  };

  it("unpins the whole stack a tray is in, and leaves other pins and the size locks", () => {
    const p = stacked();
    expect(p.locks.map((l) => l.kind).sort()).toEqual([
      "position",
      "position",
      "position",
      "size",
      "stack",
    ]);
    const q = unpinTrays(p, ["b:p0:0"]);
    expect(lockedKeys(q)).toEqual(new Set(["c:p0:0"]));
    expect(q.locks.some((l) => l.kind === "stack")).toBe(false);
    expect(sizeLockedKeys(q)).toEqual(new Set(["c:p0:0"]));
  });

  it("returns the same project when nothing was pinned there", () => {
    const p = stacked();
    expect(unpinTrays(p, ["zzz:p0:0"])).toBe(p);
  });
});

describe("turn locks", () => {
  // two trays stacked at "1", a third beside them, in a plan of the fixture's own trays
  const lower = tray({ key: "a:p0:0", path: "1", level: 0 });
  const upper = tray({ key: "b:p0:0", path: "1", level: 1 });
  const beside = tray({ key: "c:p0:0", path: "0" });
  const planned = (): Project => withLayout(newProject(), [beside, lower, upper]);
  const turns = (p: Project): Lock[] => p.locks.filter((l) => l.kind === "turn");

  it("turn does not pin: one turn lock on that tray, no position lock, no stack lock", () => {
    const p = turnTray(planned(), upper);
    expect(p.locks).toEqual([{ kind: "turn", trayKey: "b:p0:0", rotated: true }]);
    expect(lockedKeys(p).size).toBe(0);
  });

  it("turn on a pinned stack flips its pins and adds one turn lock", () => {
    const pinned = toggleLock(planned(), upper);
    const p = turnTray(pinned, upper);
    expect(
      p.locks.filter((l) => l.kind === "position").map((l) => l.kind === "position" && l.rotated),
    ).toEqual([true, true]);
    expect(p.locks.some((l) => l.kind === "stack")).toBe(true);
    expect(turns(p)).toEqual([{ kind: "turn", trayKey: "b:p0:0", rotated: true }]);
  });

  it("turn twice returns to the first rotation: the second flips the lock, not the stale plan", () => {
    const once = turnTray(planned(), upper);
    const twice = turnTray(once, upper);
    expect(turns(twice)).toEqual([{ kind: "turn", trayKey: "b:p0:0", rotated: false }]);
    expect(turns(turnTray(twice, upper))).toEqual([
      { kind: "turn", trayKey: "b:p0:0", rotated: true },
    ]);
  });

  it("pin after turn agrees: the pin takes the turn lock's rotation, and nothing conflicts", () => {
    const once = turnTray(planned(), lower);
    const pinned = toggleLock(once, lower);
    const pins = pinned.locks.filter((l) => l.kind === "position");
    expect(pins.map((l) => l.kind === "position" && [l.trayKey, l.rotated])).toEqual([
      ["a:p0:0", true],
      ["b:p0:0", false],
    ]);
  });

  it("turn survives a pin and an unpin (R3)", () => {
    const once = turnTray(planned(), upper);
    const pinned = toggleLock(once, upper);
    expect(turns(pinned)).toEqual(turns(once));
    expect(turns(toggleLock(pinned, upper))).toEqual(turns(once));
    expect(turns(unpinTrays(pinned, ["b:p0:0"]))).toEqual(turns(once));
    expect(lockedKeys(unpinTrays(pinned, ["b:p0:0"])).size).toBe(0);
  });

  it("lockedKeys does not include turned trays; turnedKeys lists them", () => {
    const p = turnTray(turnTray(planned(), upper), beside);
    expect(lockedKeys(p).size).toBe(0);
    expect(turnedKeys(p)).toEqual(new Set(["b:p0:0", "c:p0:0"]));
  });

  it("freeTurn removes that tray's turn lock only", () => {
    const other: Lock = { kind: "size", trayKey: "b:p0:0", w: 100, d: 80, h: 40 };
    const p = turnTray(turnTray({ ...planned(), locks: [other] }, upper), beside);
    const freed = freeTurn(p, "b:p0:0");
    expect(freed.locks).toEqual([other, { kind: "turn", trayKey: "c:p0:0", rotated: true }]);
    expect(freeTurn(freed, "zzz:p0:0")).toBe(freed);
  });

  it('removeLock by kind "turn" clears a turn conflict, and clearChoices clears turn locks too', () => {
    const p = turnTray(planned(), upper);
    expect(removeLock(p, "b:p0:0", "turn").locks).toEqual([]);
    expect(clearChoices(p).locks).toEqual([]);
  });

  it("a turn on a leftover is not written", () => {
    const p = planned();
    expect(turnTray(p, tray({ key: "leftover:0", part: "leftover" }))).toBe(p);
  });
});

// Group actions: each says what it changes (spec 7.3, 7.4, 8).
describe("group actions", () => {
  const named = (name: string, over: Partial<BulkComponent> = {}): BulkComponent => ({
    ...(newComponent("bulk") as BulkComponent),
    name,
    ...over,
  });
  const pin = (trayKey: string): Lock => ({ kind: "position", trayKey, path: "0", rotated: false });
  const size = (trayKey: string): Lock => ({ kind: "size", trayKey, w: 50, d: 40, h: 20 });
  const turn = (trayKey: string): Lock => ({ kind: "turn", trayKey, rotated: true });

  /** A group "Player kit" x4 holding Hero and Cards, access often, plus a loose item Dice. */
  function kitProject(extra: Partial<Project> = {}) {
    const hero = named("Hero", { access: "setup" });
    const cards = named("Cards");
    const dice = named("Dice", { copies: 3, access: "setup" });
    const kit: Group = {
      id: "kit",
      name: "Player kit",
      copies: 4,
      access: "often",
      memberIds: [hero.id, cards.id],
    };
    const p: Project = {
      ...newProject(),
      components: [hero, cards, dice],
      groups: [kit],
      ...extra,
    };
    return { p, hero, cards, dice, kit };
  }

  it("addGroup adds an empty group at the end, named the next free name, once", () => {
    const { p } = kitProject();
    const { project, groupId } = addGroup(p);
    expect(project.groups).toHaveLength(2);
    const added = project.groups?.[1];
    expect(added).toMatchObject({ id: groupId, name: "Group", access: "sometimes", memberIds: [] });
    expect(added?.copies ?? 1).toBe(1);
    // the next one does not collide
    expect(addGroup(project).project.groups?.[2]?.name).toBe("Group 2");
    // the first group of a project that has none
    expect(addGroup(newProject()).project.groups).toHaveLength(1);
    // the input is untouched
    expect(p.groups).toHaveLength(1);
  });

  it("newGroupWith makes a group of the item with its copies and access, and no pieces change", () => {
    const { p, dice } = kitProject({ locks: [pin("other:p0:0")] });
    const { project, groupId, notes } = newGroupWith(p, dice.id);
    const g = project.groups?.find((x) => x.id === groupId);
    expect(g).toMatchObject({ name: "Group", copies: 3, access: "setup", memberIds: [dice.id] });
    expect(project.groups?.at(-1)?.id).toBe(groupId);
    expect("copies" in (project.components.find((c) => c.id === dice.id) ?? {})).toBe(false);
    expect(notes).toEqual([]);
    // an item with one copy gives the group none
    const one = named("One");
    const made = newGroupWith({ ...p, components: [...p.components, one] }, one.id);
    expect("copies" in (made.project.groups?.at(-1) ?? {})).toBe(false);
    // the item's own trays are gone with its keys
    const pinned = newGroupWith(
      { ...p, locks: [pin(`${dice.id}:p1:0`), pin("zzz:p0:0")] },
      dice.id,
    );
    expect(pinned.project.locks).toEqual([pin("zzz:p0:0")]);
    expect(pinned.notes).toEqual(["1 pin removed"]);
  });

  describe("Copies follow the pieces", () => {
    it("takeOutOfGroup gives the item the group's Copies and its own access back", () => {
      const { p, hero } = kitProject();
      const { project, notes } = takeOutOfGroup(p, hero.id);
      const out = project.components.find((c) => c.id === hero.id);
      expect(out?.copies).toBe(4);
      expect(out?.access).toBe("setup");
      expect(project.groups?.[0]?.memberIds).toEqual([p.components[1]?.id]);
      expect(notes).toEqual(["Hero is out of Player kit."]);
    });

    it("takeOutOfGroup from a group of one copy leaves the item with none", () => {
      const { p, hero, kit } = kitProject();
      const one: Project = { ...p, groups: [{ ...kit, copies: 1 }] };
      const out = takeOutOfGroup(one, hero.id).project.components.find((c) => c.id === hero.id);
      expect("copies" in (out ?? {})).toBe(false);
      const none: Group = { ...kit };
      delete none.copies;
      const out2 = takeOutOfGroup({ ...p, groups: [none] }, hero.id).project.components[0];
      expect("copies" in (out2 ?? {})).toBe(false);
    });

    it("takeOutOfGroup on an ungrouped item changes nothing", () => {
      const { p, dice } = kitProject();
      expect(takeOutOfGroup(p, dice.id)).toEqual({ project: p, notes: [] });
    });

    it("removeGroup gives every member the group's Copies and deletes the group", () => {
      const { p, hero, cards, dice } = kitProject();
      const { project, notes } = removeGroup(p, "kit");
      expect(project.groups).toBeUndefined();
      expect(project.components.find((c) => c.id === hero.id)?.copies).toBe(4);
      expect(project.components.find((c) => c.id === cards.id)?.copies).toBe(4);
      expect(project.components.find((c) => c.id === dice.id)?.copies).toBe(3);
      // each member's own access came back
      expect(project.components.find((c) => c.id === hero.id)?.access).toBe("setup");
      expect(notes).toEqual(["Player kit removed. Its items are back in the list."]);
    });

    it("removeGroup keeps the other groups, and a one-copy group leaves no copies", () => {
      const { p, hero, kit } = kitProject();
      const other: Group = { id: "oth", name: "", access: "often", memberIds: [] };
      const one: Project = { ...p, groups: [{ ...kit, copies: 1 }, other] };
      const r = removeGroup(one, "kit");
      expect(r.project.groups).toEqual([other]);
      expect("copies" in (r.project.components.find((c) => c.id === hero.id) ?? {})).toBe(false);
      // an unnamed group is called "Group"
      expect(removeGroup(r.project, "oth").notes).toEqual([
        "Group removed. Its items are back in the list.",
      ]);
    });

    it("moveToGroup takes the item's copies away and says the change only when the number changes", () => {
      const { p, dice } = kitProject();
      // Dice x3 into a x4 group: the number changes
      const a = moveToGroup(p, dice.id, "kit", 1);
      expect("copies" in (a.project.components.find((c) => c.id === dice.id) ?? {})).toBe(false);
      expect(a.project.groups?.[0]?.memberIds).toEqual([
        p.components[0]?.id,
        dice.id,
        p.components[1]?.id,
      ]);
      expect(a.notes).toEqual(["Dice now has the group's 4 copies."]);
      // Dice x3 into a x3 group: the same number, no note
      const three: Project = { ...p, groups: [{ ...(p.groups?.[0] as Group), copies: 3 }] };
      expect(moveToGroup(three, dice.id, "kit", 0).notes).toEqual([]);
      // an item of one copy into a group of one copy: no note either
      const solo = named("Solo");
      const q: Project = {
        ...p,
        components: [...p.components, solo],
        groups: [{ ...(p.groups?.[0] as Group), copies: 1 }],
      };
      expect(moveToGroup(q, solo.id, "kit", 0).notes).toEqual([]);
      // one copy into a group of four is the group's 4 copies; into none: its single copy
      expect(
        moveToGroup({ ...p, components: [...p.components, solo] }, solo.id, "kit", 0).notes,
      ).toEqual(["Solo now has the group's 4 copies."]);
      const dice3 = moveToGroup(
        { ...q, components: q.components.map((c) => (c.id === dice.id ? { ...c, copies: 2 } : c)) },
        dice.id,
        "kit",
        0,
      );
      expect(dice3.notes).toEqual(["Dice now has the group's single copy."]);
    });

    it("moveToGroup from one group to another compares the copies it had there", () => {
      const { p, hero, kit } = kitProject();
      const b: Group = { id: "b", name: "B", copies: 4, access: "often", memberIds: [] };
      const c: Group = { id: "c", name: "C", copies: 2, access: "often", memberIds: [] };
      const q: Project = { ...p, groups: [kit, b, c] };
      expect(moveToGroup(q, hero.id, "b", 0).notes).toEqual([]);
      expect(moveToGroup(q, hero.id, "c", 0).notes).toEqual(["Hero now has the group's 2 copies."]);
      const moved = moveToGroup(q, hero.id, "c", 0).project;
      expect(moved.groups?.[0]?.memberIds).toEqual([q.components[1]?.id]);
      expect(moved.groups?.[2]?.memberIds).toEqual([hero.id]);
    });

    it("setCopies and setGroupCopies write 1 as none, and keep the number in range", () => {
      const { p, dice } = kitProject();
      const a = setCopies(p, dice.id, 5).project.components.find((c) => c.id === dice.id);
      expect(a?.copies).toBe(5);
      const b = setCopies(p, dice.id, 1).project.components.find((c) => c.id === dice.id);
      expect("copies" in (b ?? {})).toBe(false);
      expect(setGroupCopies(p, "kit", 6).project.groups?.[0]?.copies).toBe(6);
      expect("copies" in (setGroupCopies(p, "kit", 1).project.groups?.[0] ?? {})).toBe(false);
      // a grouped item's copies are the group's: setting it changes nothing
      expect(setCopies(p, p.components[0]?.id ?? "", 2)).toEqual({ project: p, notes: [] });
    });
  });

  describe("pins, size locks and turn locks go with the trays that go", () => {
    it("lowering copies drops the vanished copies' pins and says so", () => {
      const { p } = kitProject({
        locks: [pin("kit:p0:0"), pin("kit:p1:0"), pin("kit:p2:0"), pin("kit:p3:0")],
      });
      const r = setGroupCopies(p, "kit", 2);
      expect(r.project.locks).toEqual([pin("kit:p0:0"), pin("kit:p1:0")]);
      expect(r.notes).toEqual(["2 pins removed"]);
      expect(r.project.groups?.[0]?.copies).toBe(2);
      // the pins on p2 and p3 only
      const only = kitProject({ locks: [pin("kit:p2:0"), pin("kit:p3:1"), pin("kit:p1:0")] });
      const r2 = setGroupCopies(only.p, "kit", 2);
      expect(r2.project.locks).toEqual([pin("kit:p1:0")]);
      expect(r2.notes).toEqual(["2 pins removed"]);
    });

    it("says '1 pin removed' for one, and nothing when nothing goes", () => {
      const { p } = kitProject({ locks: [pin("kit:p3:0"), pin("kit:p0:0")] });
      expect(setGroupCopies(p, "kit", 3).notes).toEqual(["1 pin removed"]);
      expect(setGroupCopies(p, "kit", 3).project.locks).toEqual([pin("kit:p0:0")]);
      expect(setGroupCopies(p, "kit", 4).notes).toEqual([]);
      // raising copies drops nothing
      expect(setGroupCopies(p, "kit", 6)).toMatchObject({ notes: [], project: { locks: p.locks } });
      // p1 does not take p10's locks, nor p10 p1's
      const ten = kitProject({
        groups: [{ id: "kit", name: "K", copies: 10, access: "often", memberIds: [] }],
        locks: [pin("kit:p1:0"), pin("kit:p9:0")],
      });
      expect(setGroupCopies(ten.p, "kit", 2).project.locks).toEqual([pin("kit:p1:0")]);
    });

    it("a stack lock keeps the rest while two or more trays remain", () => {
      const keys = ["kit:p0:0", "kit:p1:0", "kit:p2:0", "kit:p3:0"];
      const stack: Lock = { kind: "stack", trayKeys: keys };
      const { p } = kitProject({ locks: [...keys.map(pin), stack] });
      const r = setGroupCopies(p, "kit", 2);
      expect(r.project.locks).toEqual([
        pin("kit:p0:0"),
        pin("kit:p1:0"),
        { kind: "stack", trayKeys: ["kit:p0:0", "kit:p1:0"] },
      ]);
      expect(r.notes).toEqual(["2 pins removed"]);
      // one tray left is no stack
      const one = setGroupCopies(p, "kit", 1);
      expect(one.project.locks).toEqual([pin("kit:p0:0")]);
      expect(one.notes).toEqual(["3 pins removed"]);
    });

    it("size locks say 'Size unlocked on <n> trays' after the pins; turn locks go with no word", () => {
      const { p } = kitProject({
        locks: [
          pin("kit:p3:0"),
          size("kit:p2:0"),
          size("kit:p3:0"),
          size("kit:p0:0"),
          turn("kit:p3:0"),
          turn("kit:p0:0"),
        ],
      });
      const r = setGroupCopies(p, "kit", 2);
      expect(r.project.locks).toEqual([size("kit:p0:0"), turn("kit:p0:0")]);
      expect(r.notes).toEqual(["1 pin removed", "Size unlocked on 2 trays"]);
      // one tray says so in the singular
      const one = kitProject({ locks: [size("kit:p3:0")] });
      expect(setGroupCopies(one.p, "kit", 3).notes).toEqual(["Size unlocked on 1 tray"]);
      // turn locks alone: dropped, nothing said (R16)
      const turns = kitProject({ locks: [turn("kit:p3:0"), turn("kit:p1:0")] });
      const t = setGroupCopies(turns.p, "kit", 3);
      expect(t.project.locks).toEqual([turn("kit:p1:0")]);
      expect(t.notes).toEqual([]);
    });

    it("lowering an item's own Copies prunes its copies' locks the same way", () => {
      const { p, dice } = kitProject();
      const q: Project = {
        ...p,
        locks: [pin(`${dice.id}:p0:0`), pin(`${dice.id}:p2:0`), size(`${dice.id}:p1:0`)],
      };
      const r = setCopies(q, dice.id, 1);
      expect(r.project.locks).toEqual([pin(`${dice.id}:p0:0`)]);
      expect(r.notes).toEqual(["1 pin removed", "Size unlocked on 1 tray"]);
    });

    it("a spacer under a vanished copy goes with it", () => {
      const { p } = kitProject({ locks: [size("kit:p3:0:spacer"), pin("kit:p0:0")] });
      expect(setGroupCopies(p, "kit", 3).project.locks).toEqual([pin("kit:p0:0")]);
    });

    it("moving an item in drops its own trays' locks; the group's stay", () => {
      const { p, dice } = kitProject({ locks: [pin("kit:p0:0")] });
      const q: Project = {
        ...p,
        locks: [
          ...p.locks,
          pin(`${dice.id}:p0:0`),
          size(`${dice.id}:p1:0`),
          turn(`${dice.id}:p2:0`),
        ],
      };
      const r = moveToGroup(q, dice.id, "kit", 2);
      expect(r.project.locks).toEqual([pin("kit:p0:0")]);
      expect(r.notes).toEqual([
        "Dice now has the group's 4 copies.",
        "1 pin removed",
        "Size unlocked on 1 tray",
      ]);
    });

    it("moving an item out drops nothing of the group while it has other members", () => {
      const { p, hero } = kitProject({ locks: [pin("kit:p0:0"), size("kit:p1:0")] });
      const r = takeOutOfGroup(p, hero.id);
      expect(r.project.locks).toEqual(p.locks);
      expect(r.notes).toEqual(["Hero is out of Player kit."]);
    });

    it("the last member leaving drops every lock of the group, after the Copies note", () => {
      const { p, hero, cards } = kitProject({
        locks: [
          pin("kit:p0:0"),
          pin("kit:p3:0"),
          size("kit:p1:0"),
          turn("kit:p2:0"),
          pin("other:p0:0"),
        ],
      });
      const first = takeOutOfGroup(p, hero.id);
      const last = takeOutOfGroup(first.project, cards.id);
      expect(last.project.locks).toEqual([pin("other:p0:0")]);
      expect(last.notes).toEqual([
        "Cards is out of Player kit.",
        "2 pins removed",
        "Size unlocked on 1 tray",
      ]);
      // the group stays, empty
      expect(last.project.groups?.[0]?.memberIds).toEqual([]);
      // moving the last member to another group does the same to the group it left
      const other: Group = { id: "oth", name: "Other", copies: 4, access: "often", memberIds: [] };
      const moved = moveToGroup(
        { ...first.project, groups: [...(first.project.groups ?? []), other] },
        cards.id,
        "oth",
        0,
      );
      expect(moved.project.locks).toEqual([pin("other:p0:0")]);
      expect(moved.notes).toEqual(["2 pins removed", "Size unlocked on 1 tray"]);
    });

    it("removing a group drops all its locks, and says so after its own note", () => {
      const { p } = kitProject({
        locks: [
          pin("kit:p0:0"),
          pin("kit:p1:0"),
          pin("kit:p2:0"),
          { kind: "stack", trayKeys: ["kit:p0:0", "other:p0:0"] },
          size("kit:p0:0"),
          size("kit:p1:0"),
          pin("other:p0:0"),
        ],
      });
      const r = removeGroup(p, "kit");
      expect(r.project.locks).toEqual([pin("other:p0:0")]);
      expect(r.notes).toEqual([
        "Player kit removed. Its items are back in the list.",
        "3 pins removed",
        "Size unlocked on 2 trays",
      ]);
    });
  });

  it("removeComponent prunes membership in the same step", () => {
    const { p, hero } = kitProject({ locks: [pin("kit:p0:0")] });
    const r = removeComponent(p, hero.id);
    expect(r.groups?.[0]?.memberIds).toEqual([p.components[1]?.id]);
    expect(r.locks).toEqual([pin("kit:p0:0")]);
  });

  it("orderMember moves a member, at both ends, and clamps an index out of range", () => {
    const a = named("A");
    const b = named("B");
    const c = named("C");
    const g: Group = { id: "g", name: "G", access: "often", memberIds: [a.id, b.id, c.id] };
    const p: Project = { ...newProject(), components: [a, b, c], groups: [g] };
    const order = (q: Project) => q.groups?.[0]?.memberIds;
    expect(order(orderMember(p, "g", a.id, 1))).toEqual([b.id, a.id, c.id]);
    expect(order(orderMember(p, "g", a.id, 2))).toEqual([b.id, c.id, a.id]);
    expect(order(orderMember(p, "g", c.id, 0))).toEqual([c.id, a.id, b.id]);
    expect(order(orderMember(p, "g", b.id, 99))).toEqual([a.id, c.id, b.id]);
    expect(order(orderMember(p, "g", b.id, -5))).toEqual([b.id, a.id, c.id]);
    expect(order(orderMember(p, "g", b.id, 1))).toEqual([a.id, b.id, c.id]);
    // not a member, or no such group: nothing changes
    expect(orderMember(p, "g", "zz", 0)).toBe(p);
    expect(orderMember(p, "zz", a.id, 0)).toBe(p);
    // locks and the components are untouched
    expect(orderMember(p, "g", a.id, 2).components).toBe(p.components);
  });

  it("moveToGroup into the group it is in only orders it, with no note", () => {
    const { p, hero } = kitProject();
    const r = moveToGroup(p, hero.id, "kit", 1);
    expect(r.project.groups?.[0]?.memberIds).toEqual([p.components[1]?.id, hero.id]);
    expect(r.notes).toEqual([]);
    expect(moveToGroup(p, hero.id, "zz", 0)).toEqual({ project: p, notes: [] });
  });

  it("moveToGroup clamps the place in the new group", () => {
    const { p, dice } = kitProject();
    expect(moveToGroup(p, dice.id, "kit", 99).project.groups?.[0]?.memberIds.at(-1)).toBe(dice.id);
    expect(moveToGroup(p, dice.id, "kit", -3).project.groups?.[0]?.memberIds[0]).toBe(dice.id);
  });

  it("renames a group and sets how often it is reached for", () => {
    const { p } = kitProject();
    expect(renameGroup(p, "kit", "Hands").groups?.[0]?.name).toBe("Hands");
    expect(setGroupAccess(p, "kit", "setup").groups?.[0]?.access).toBe("setup");
    expect(renameGroup(p, "zz", "x")).toBe(p);
    expect(setGroupAccess(p, "zz", "setup")).toBe(p);
  });
});
