// src/app/actions.ts
import { componentName } from "../instructions/naming";
import { newComponent, newGroup } from "../model/defaults";
import { newId } from "../model/ids";
import {
  DEFAULT_GROUP_NAME,
  groupById,
  groupOfItem,
  listOrderWith,
  nextGroupName,
  railEntries,
  requirementKeyOf,
} from "../model/groups";
import type {
  Access,
  Box,
  CardsComponent,
  Component,
  ComponentKind,
  Group,
  Lock,
  Printer,
  Project,
  Settings,
  TraySpec,
} from "../model/types";
import { swapLocks } from "../layout";
import { turnLocks } from "./dryRun";

/** Only real trays can be locked; leftovers are regenerated and spacers follow their tray. */
export function isLockable(t: TraySpec): boolean {
  return t.part === "tray";
}

export function updateBox(p: Project, patch: Partial<Box>): Project {
  return { ...p, box: { ...p.box, ...patch } };
}

/** Replaces the whole printer, e.g. with the one in the preferences. */
export function applyPrinter(p: Project, printer: Printer): Project {
  return { ...p, printer: { ...printer } };
}

export function renameProject(p: Project, name: string): Project {
  return { ...p, name };
}

export function addComponent(p: Project, kind: ComponentKind): Project {
  return { ...p, components: [...p.components, newComponent(kind)] };
}

/**
 * Drops the locks of trays keyed `<key>:…`; a stack lock keeps the rest of its stack, in
 * order, while two or more trays remain (one tray alone is no stack).
 */
function withoutKeys(locks: readonly Lock[], keys: ReadonlySet<string>): Lock[] {
  const gone = (trayKey: string): boolean => [...keys].some((key) => trayKey.startsWith(`${key}:`));
  return locks.flatMap((l): Lock[] => {
    if (l.kind !== "stack") {
      return gone(l.trayKey) ? [] : [l];
    }
    const trayKeys = l.trayKeys.filter((k) => !gone(k));
    return trayKeys.length >= 2 ? [{ ...l, trayKeys }] : [];
  });
}

/**
 * Locks follow their trays' key: a key (component id, or group id) that no component has
 * after an edit but one had before leaves its locks behind, and the next run would warn
 * about trays "that don't exist any more" that the user removed on purpose.
 */
function withComponents(
  p: Project,
  components: Component[],
  groups: Group[] | undefined = p.groups,
): Project {
  const after = new Set(components.map((c) => requirementKeyOf({ groups }, c)));
  const gone = new Set(
    p.components.map((c) => requirementKeyOf(p, c)).filter((k) => !after.has(k)),
  );
  const locks = gone.size === 0 ? p.locks : withoutKeys(p.locks, gone);
  return groups === p.groups ? { ...p, components, locks } : { ...p, components, groups, locks };
}

export function updateComponent(p: Project, id: string, next: Component): Project {
  return withComponents(
    p,
    p.components.map((c) => (c.id === id ? next : c)),
  );
}

/** "<name> copy", or "<name> copy 2", "… copy 3" when that is taken: a copy never has its original's name. */
function copyName(p: Project, c: Component): string {
  const base = `${componentName(c)} copy`;
  const taken = new Set(p.components.map((x) => x.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) {
    name = `${base} ${n}`;
  }
  return name;
}

/**
 * Adds a copy of an item right below it in the list, in the same group if it is in one: the same
 * settings under a new id, named "<name> copy". It has none of the original's locks (they are of
 * its trays). The copy is last in `components`, so no other item's colour (its place among the
 * items of its kind) changes; the list shows it below its original through `listOrder`/the group's
 * members. Returns the new item's id, or none when there is no such item.
 */
export function duplicateComponent(
  p: Project,
  id: string,
): { project: Project; copyId: string | null } {
  const original = p.components.find((c) => c.id === id);
  if (original === undefined) {
    return { project: p, copyId: null };
  }
  const copy: Component = {
    ...structuredClone(original),
    id: newId(),
    name: copyName(p, original),
  };
  const own = groupOfItem(p, id);
  const added: Project = {
    ...p,
    components: [...p.components, copy],
    ...(own === undefined
      ? {}
      : {
          groups: (p.groups ?? []).map((g) => {
            if (g.id !== own.id) {
              return g;
            }
            const at = g.memberIds.indexOf(id) + 1;
            return {
              ...g,
              memberIds: [...g.memberIds.slice(0, at), copy.id, ...g.memberIds.slice(at)],
            };
          }),
        }),
  };
  if (own !== undefined) {
    return { project: added, copyId: copy.id };
  }
  const entries = railEntries(added).filter((e) => !(e.kind === "item" && e.id === copy.id));
  const at = entries.findIndex((e) => e.kind === "item" && e.id === id);
  return {
    project: { ...added, listOrder: listOrderWith(added, copy.id, at + 1) },
    copyId: copy.id,
  };
}

/** Removes the item, and its id from its group's members, in the same step. */
export function removeComponent(p: Project, id: string): Project {
  const groups = p.groups?.some((g) => g.memberIds.includes(id))
    ? p.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) }))
    : p.groups;
  return withComponents(
    p,
    p.components.filter((c) => c.id !== id),
    groups,
  );
}

export function setSettings(p: Project, s: Settings): Project {
  return { ...p, settings: s };
}

function sameTarget(a: Lock, b: Lock): boolean {
  if (a.kind === "stack" || b.kind === "stack") {
    return (
      a.kind === "stack" && b.kind === "stack" && a.trayKeys.join("|") === b.trayKeys.join("|")
    );
  }
  return a.kind === b.kind && a.trayKey === b.trayKey;
}

export function setLock(p: Project, lock: Lock): Project {
  return { ...p, locks: [...p.locks.filter((l) => !sameTarget(l, lock)), lock] };
}

export function removeLock(p: Project, trayKey: string, kind?: Lock["kind"]): Project {
  const locks = p.locks.filter((l) => {
    if (kind !== undefined && l.kind !== kind) {
      return true;
    }
    return l.kind === "stack" ? !l.trayKeys.includes(trayKey) : l.trayKey !== trayKey;
  });
  return { ...p, locks };
}

/**
 * Takes every rule off the plan: pins (turned or not), stack locks and size locks, in one step.
 * The rail's "Clear all my choices". The components and the box stay as they are.
 */
export function clearChoices(p: Project): Project {
  return p.locks.length === 0 ? p : { ...p, locks: [] };
}

export function lockedKeys(p: Project): Set<string> {
  const keys = new Set<string>();
  for (const l of p.locks) {
    if (l.kind === "position") {
      keys.add(l.trayKey);
    }
  }
  return keys;
}

/** trayKeys with a turn lock (a turn fixes a tray's rotation without pinning it). */
export function turnedKeys(p: Project): Set<string> {
  const keys = new Set<string>();
  for (const l of p.locks) {
    if (l.kind === "turn") {
      keys.add(l.trayKey);
    }
  }
  return keys;
}

/** Takes the turn lock off this tray, and nothing else: the rail's "Turned" chip. */
export function freeTurn(p: Project, trayKey: string): Project {
  return turnedKeys(p).has(trayKey) ? removeLock(p, trayKey, "turn") : p;
}

/**
 * The trays a pin on `tray` holds: its whole stack, bottom to top (the trays of the stored plan
 * that share its path), or the tray alone when it is not in a stack of the plan.
 */
export function stackOf(p: Project, tray: TraySpec): TraySpec[] {
  const stack = (p.layout?.trays ?? [])
    .filter((t) => t.part === "tray" && t.path === tray.path)
    .sort((a, b) => a.level - b.level);
  return stack.some((t) => t.key === tray.key) ? stack : [tray];
}

export function toggleLock(p: Project, tray: TraySpec): Project {
  if (!isLockable(tray)) {
    return p;
  }
  // The whole stack: locking one tray of a stack alone would put it on the floor and evict
  // the trays under and over it (a run reports such a lock as a pin conflict).
  const members = stackOf(p, tray);
  const keys = new Set(members.map((t) => t.key));
  const rest = p.locks.filter((l) =>
    l.kind === "stack"
      ? !l.trayKeys.some((k) => keys.has(k))
      : !(l.kind === "position" && keys.has(l.trayKey)),
  );
  if (lockedKeys(p).has(tray.key)) {
    return { ...p, locks: rest };
  }
  // a pin holds the rotation the person turned the tray to: the plan may not show it yet
  const turnedTo = new Map(
    p.locks.flatMap((l) => (l.kind === "turn" ? [[l.trayKey, l.rotated] as const] : [])),
  );
  const locks: Lock[] = members.map((t) => ({
    kind: "position",
    trayKey: t.key,
    path: t.path,
    rotated: turnedTo.get(t.key) ?? t.rotated,
  }));
  if (members.length > 1) {
    // A pending swap is a stack lock in the swapped order: keep it rather than level order.
    const swapped = p.locks.find(
      (l) =>
        l.kind === "stack" &&
        l.trayKeys.length === keys.size &&
        l.trayKeys.every((k) => keys.has(k)),
    );
    locks.push({
      kind: "stack",
      trayKeys: swapped?.kind === "stack" ? swapped.trayKeys : members.map((t) => t.key),
    });
  }
  return { ...p, locks: [...rest, ...locks] };
}

/**
 * Takes the pins off these trays, and off the whole stack each is in: a pinned stack is pinned as
 * one, so what stays pinned would be a half of it. Size locks and turn locks stay.
 */
export function unpinTrays(p: Project, trayKeys: readonly string[]): Project {
  const keys = new Set(trayKeys);
  for (const l of p.locks) {
    if (l.kind === "stack" && l.trayKeys.some((k) => keys.has(k))) {
      l.trayKeys.forEach((k) => keys.add(k));
    }
  }
  const locks = p.locks.filter((l) => {
    if (l.kind === "stack") {
      return !l.trayKeys.some((k) => keys.has(k));
    }
    return l.kind !== "position" || !keys.has(l.trayKey);
  });
  return locks.length === p.locks.length ? p : { ...p, locks };
}

/**
 * Turns a tray 90°: one turn lock on it, which fixes its rotation and leaves it free to move; on a
 * pinned stack the pins flip with it (`turnLocks`). Whether that works is `canTurn`'s question;
 * this writes the locks regardless, and the next run reports any it cannot keep.
 */
export function turnTray(p: Project, tray: TraySpec): Project {
  if (!isLockable(tray)) {
    return p;
  }
  const locks = turnLocks(p, tray.key);
  return locks ? { ...p, locks } : p;
}

/** trayKeys with a size lock. */
export function sizeLockedKeys(p: Project): Set<string> {
  const keys = new Set<string>();
  for (const l of p.locks) {
    if (l.kind === "size") {
      keys.add(l.trayKey);
    }
  }
  return keys;
}

/** Size lock on/off: keeps the tray's current outer size (spec §5 `Lock.kind "size"`). */
export function toggleSizeLock(p: Project, tray: TraySpec): Project {
  if (!isLockable(tray)) {
    return p;
  }
  if (sizeLockedKeys(p).has(tray.key)) {
    return removeLock(p, tray.key, "size");
  }
  return setLock(p, { kind: "size", trayKey: tray.key, w: tray.w, d: tray.d, h: tray.h });
}

/**
 * What a tray stands on by a stack lock that no pin comes with (a put-on, or a swap within a
 * stack): each tray above the first of such a lock, mapped to the tray right under it.
 */
export function standingOn(locks: readonly Lock[]): Map<string, string> {
  const pinned = new Set(locks.flatMap((l) => (l.kind === "position" ? [l.trayKey] : [])));
  const on = new Map<string, string>();
  for (const l of locks) {
    if (l.kind !== "stack" || l.trayKeys.some((k) => pinned.has(k))) {
      continue;
    }
    l.trayKeys.forEach((k, i) => {
      const below = l.trayKeys[i - 1];
      if (below !== undefined) {
        on.set(k, below);
      }
    });
  }
  return on;
}

/**
 * The stack lock "Put on…" writes: the trays under the base, the base, then the tray, in that
 * order. The base's stack is its stack lock's order while it has one, else the stored plan's
 * (the trays at its path). Null without a plan, when either tray is not in it, or for one tray.
 */
export function putOnKeys(p: Project, trayKey: string, baseKey: string): string[] | null {
  const trays = (p.layout?.trays ?? []).filter((t) => t.part === "tray");
  const base = trays.find((t) => t.key === baseKey);
  if (!base || trayKey === baseKey || !trays.some((t) => t.key === trayKey)) {
    return null;
  }
  const lock = p.locks.find((l) => l.kind === "stack" && l.trayKeys.includes(baseKey));
  const stack =
    lock?.kind === "stack"
      ? lock.trayKeys
      : trays
          .filter((t) => t.path === base.path)
          .sort((a, b) => a.level - b.level)
          .map((t) => t.key);
  const under = stack.slice(0, stack.indexOf(baseKey) + 1).filter((k) => k !== trayKey);
  return [...under, trayKey];
}

/**
 * The locks after standing a tray on another: the stack lock of `putOnKeys` with no position
 * lock, so the pair moves anywhere together. Stack locks that share a tray with it are replaced.
 * Whether that works is `canPutOn`'s question (src/app/dryRun.ts).
 */
export function putOnLocks(p: Project, trayKey: string, baseKey: string): Lock[] | null {
  const keys = putOnKeys(p, trayKey, baseKey);
  if (!keys) {
    return null;
  }
  const rest = p.locks.filter(
    (l) => !(l.kind === "stack" && l.trayKeys.some((k) => keys.includes(k))),
  );
  return [...rest, { kind: "stack", trayKeys: keys }];
}

/** Stands the tray on the base (`putOnLocks`); the next run reports any lock it cannot keep. */
export function putTrayOn(p: Project, trayKey: string, baseKey: string): Project {
  const locks = putOnLocks(p, trayKey, baseKey);
  return locks ? { ...p, locks } : p;
}

/**
 * Takes a tray off what it stands on: out of its stack lock, which stays for the trays that are
 * left (one tray alone is no stack). The rail's "On …" chip. Pins are not touched.
 */
export function takeOff(p: Project, trayKey: string): Project {
  if (!standingOn(p.locks).has(trayKey)) {
    return p;
  }
  const locks = p.locks.flatMap((l): Lock[] => {
    if (l.kind !== "stack" || !l.trayKeys.includes(trayKey)) {
      return [l];
    }
    const left = l.trayKeys.filter((k) => k !== trayKey);
    return left.length > 1 ? [{ kind: "stack", trayKeys: left }] : [];
  });
  return { ...p, locks };
}

export function swapTrays(p: Project, keyA: string, keyB: string): Project {
  if (!p.layout) {
    return p;
  }
  return { ...p, locks: swapLocks(p.locks, keyA, keyB, p.layout) };
}

export function setCardSides<C extends CardsComponent>(c: C, a: number, b: number): C {
  return { ...c, shortSide: Math.min(a, b), longSide: Math.max(a, b) };
}

/** The item with `copies` set to `n`, or none (undefined: one tray, as before). */
export function setItemCopies<C extends Component>(c: C, n: number | undefined): C {
  const next = { ...c };
  if (n === undefined) {
    delete next.copies;
  } else {
    next.copies = n;
  }
  return next;
}

/** What a group edit gives back: the new project, and the words the edit says (spec §8), in order. */
export interface EditResult {
  project: Project;
  notes: string[];
}

/** The most copies an item or a group has (spec §3.3). */
const MAX_COPIES = 10;

const groupLabel = (g: Group): string => g.name.trim() || DEFAULT_GROUP_NAME;

/** The locks without those of the trays keyed `<key>:…`, and what that took off, in words. */
function pruneLocks(locks: Lock[], keys: ReadonlySet<string>): { locks: Lock[]; notes: string[] } {
  if (keys.size === 0) {
    return { locks, notes: [] };
  }
  const after = withoutKeys(locks, keys);
  const count = (ls: readonly Lock[], kind: Lock["kind"]): number =>
    ls.filter((l) => l.kind === kind).length;
  const pins = count(locks, "position") - count(after, "position");
  const sizes = count(locks, "size") - count(after, "size");
  const notes: string[] = [];
  if (pins > 0) {
    notes.push(pins === 1 ? "1 pin removed" : `${pins} pins removed`);
  }
  if (sizes > 0) {
    notes.push(sizes === 1 ? "Size unlocked on 1 tray" : `Size unlocked on ${sizes} trays`);
  }
  // A turn lock goes without a word (R16): it is a rotation, not something the person placed.
  return { locks: after, notes };
}

/** The key stems of the copies from `from` up to `to` (exclusive) of a key: `<key>:p<c>`. */
function copyStems(key: string, from: number, to: number): Set<string> {
  const out = new Set<string>();
  for (let c = from; c < to; c++) {
    out.add(`${key}:p${c}`);
  }
  return out;
}

/** The project with these keys' trays' locks pruned; the notes say what went. */
function withPrunedLocks(p: Project, keys: ReadonlySet<string>, notes: string[]): EditResult {
  const pruned = pruneLocks(p.locks, keys);
  return {
    project: pruned.locks === p.locks ? p : { ...p, locks: pruned.locks },
    notes: [...notes, ...pruned.notes],
  };
}

/** The item with these copies: 1 is none (one tray, as before). */
const withCopies = <C extends Component>(c: C, n: number): C =>
  setItemCopies(c, n > 1 ? n : undefined);

/** The group with these copies: 1 is none. */
function groupWithCopies(g: Group, n: number): Group {
  const next = { ...g };
  if (n > 1) {
    next.copies = n;
  } else {
    delete next.copies;
  }
  return next;
}

const clampCopies = (n: number): number =>
  Math.min(MAX_COPIES, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1));

/** "Hero now has the group's 4 copies." / "…the group's single copy." */
const copiesNote = (item: Component, n: number): string =>
  `${componentName(item)} now has the group's ${n === 1 ? "single copy" : `${n} copies`}.`;

/** An empty group named the next free name: Copies 1, reached for sometimes, at the end. */
export function addGroup(p: Project): { project: Project; groupId: string } {
  const group = newGroup(nextGroupName(p));
  return { project: { ...p, groups: [...(p.groups ?? []), group] }, groupId: group.id };
}

/**
 * A new group with this item as its only member. It inherits the item's Copies and its access, so
 * no pieces change and the tray reaches the same as before (no Copies note). The item's own trays
 * have a new key, so their locks go, and `notes` say so.
 */
export function newGroupWith(
  p: Project,
  itemId: string,
): { project: Project; groupId: string; notes: string[] } {
  const item = p.components.find((c) => c.id === itemId);
  const existing = groupOfItem(p, itemId);
  if (item === undefined || existing !== undefined) {
    return { project: p, groupId: existing?.id ?? "", notes: [] };
  }
  const group: Group = {
    ...newGroup(nextGroupName(p)),
    access: item.access,
    memberIds: [itemId],
  };
  if ((item.copies ?? 1) > 1) {
    group.copies = item.copies;
  }
  const grouped: Project = {
    ...p,
    components: p.components.map((c) => (c.id === itemId ? setItemCopies(c, undefined) : c)),
    groups: [...(p.groups ?? []), group],
  };
  const r = withPrunedLocks(grouped, new Set([itemId]), []);
  return { project: r.project, groupId: group.id, notes: r.notes };
}

/** The place `index` clamped into 0..length. */
const clampIndex = (index: number, length: number): number =>
  Math.min(length, Math.max(0, Math.trunc(index) || 0));

/**
 * Moves an item into a group at a place (an item already in it is only ordered). Its own `copies`
 * go and it has the group's: the first note says so when the number changes. Its own `access` stays,
 * hidden. The item's own trays' locks go, and so do all of the group it leaves if it was the last.
 */
export function moveToGroup(
  p: Project,
  itemId: string,
  groupId: string,
  index: number,
): EditResult {
  const item = p.components.find((c) => c.id === itemId);
  const target = groupById(p, groupId);
  if (item === undefined || target === undefined) {
    return { project: p, notes: [] };
  }
  const from = groupOfItem(p, itemId);
  if (from?.id === groupId) {
    return { project: orderMember(p, groupId, itemId, index), notes: [] };
  }
  const had = from === undefined ? (item.copies ?? 1) : (from.copies ?? 1);
  const has = target.copies ?? 1;
  const groups = (p.groups ?? []).map((g): Group => {
    if (g.id === from?.id) {
      return { ...g, memberIds: g.memberIds.filter((m) => m !== itemId) };
    }
    if (g.id === groupId) {
      const at = clampIndex(index, g.memberIds.length);
      return { ...g, memberIds: [...g.memberIds.slice(0, at), itemId, ...g.memberIds.slice(at)] };
    }
    return g;
  });
  const moved: Project = {
    ...p,
    components: p.components.map((c) => (c.id === itemId ? setItemCopies(c, undefined) : c)),
    groups,
  };
  const gone = new Set<string>();
  if (from === undefined) {
    gone.add(itemId);
  } else if (from.memberIds.length === 1) {
    gone.add(from.id);
  }
  return withPrunedLocks(moved, gone, had === has ? [] : [copiesNote(item, has)]);
}

/**
 * Takes an item out of its group. It has the group's Copies as its own, so no pieces vanish, and
 * its own `access` is back. The group's locks go with its last member.
 */
export function takeOutOfGroup(p: Project, itemId: string): EditResult {
  const item = p.components.find((c) => c.id === itemId);
  const from = groupOfItem(p, itemId);
  if (item === undefined || from === undefined) {
    return { project: p, notes: [] };
  }
  const out: Project = {
    ...p,
    components: p.components.map((c) => (c.id === itemId ? withCopies(c, from.copies ?? 1) : c)),
    groups: (p.groups ?? []).map((g) =>
      g.id === from.id ? { ...g, memberIds: g.memberIds.filter((m) => m !== itemId) } : g,
    ),
  };
  const gone = from.memberIds.length === 1 ? new Set([from.id]) : new Set<string>();
  return withPrunedLocks(out, gone, [`${componentName(item)} is out of ${groupLabel(from)}.`]);
}

/**
 * Puts an item at a place in the rail's list: among the other top-level entries (items and group
 * cards), `index` counting those. An item in a group leaves it first (as Take out does, with its
 * words). The list's order is a person's: it moves nothing in the plan and is no layout input.
 */
export function placeInList(p: Project, itemId: string, index: number): EditResult {
  if (!p.components.some((c) => c.id === itemId)) {
    return { project: p, notes: [] };
  }
  const out =
    groupOfItem(p, itemId) === undefined ? { project: p, notes: [] } : takeOutOfGroup(p, itemId);
  return {
    project: { ...out.project, listOrder: listOrderWith(out.project, itemId, index) },
    notes: out.notes,
  };
}

/** Moves a member to a place in its group's order; the place is clamped. Locks do not move. */
export function orderMember(p: Project, groupId: string, itemId: string, index: number): Project {
  const group = groupById(p, groupId);
  if (group === undefined || !group.memberIds.includes(itemId)) {
    return p;
  }
  const rest = group.memberIds.filter((m) => m !== itemId);
  const at = clampIndex(index, rest.length);
  const memberIds = [...rest.slice(0, at), itemId, ...rest.slice(at)];
  return {
    ...p,
    groups: (p.groups ?? []).map((g) => (g.id === groupId ? { ...g, memberIds } : g)),
  };
}

/**
 * Removes the group: each member has the group's Copies and its own access back, and the group's
 * locks go. The first note is the group's own.
 */
export function removeGroup(p: Project, groupId: string): EditResult {
  const group = groupById(p, groupId);
  if (group === undefined) {
    return { project: p, notes: [] };
  }
  const copies = group.copies ?? 1;
  const groups = (p.groups ?? []).filter((g) => g.id !== groupId);
  const after: Project = {
    ...p,
    components: p.components.map((c) =>
      group.memberIds.includes(c.id) ? withCopies(c, copies) : c,
    ),
    groups,
  };
  if (groups.length === 0) {
    // no groups at all is a project without the field, as a file has it
    delete after.groups;
  }
  return withPrunedLocks(after, new Set([groupId]), [
    `${groupLabel(group)} removed. Its items are back in the list.`,
  ]);
}

/**
 * Sets an item's Copies (1..10; 1 is none). Lowering it drops the locks of the copies that go
 * (`p<c>` with c at or past the new count). A grouped item's Copies are its group's: nothing changes.
 */
export function setCopies(p: Project, itemId: string, n: number): EditResult {
  const item = p.components.find((c) => c.id === itemId);
  if (item === undefined || groupOfItem(p, itemId) !== undefined) {
    return { project: p, notes: [] };
  }
  const next = clampCopies(n);
  const changed: Project = {
    ...p,
    components: p.components.map((c) => (c.id === itemId ? withCopies(c, next) : c)),
  };
  return withPrunedLocks(changed, copyStems(itemId, next, item.copies ?? 1), []);
}

/** Sets a group's Copies (1..10; 1 is none), dropping the locks of the copies that go. */
export function setGroupCopies(p: Project, groupId: string, n: number): EditResult {
  const group = groupById(p, groupId);
  if (group === undefined) {
    return { project: p, notes: [] };
  }
  const next = clampCopies(n);
  const changed: Project = {
    ...p,
    groups: (p.groups ?? []).map((g) => (g.id === groupId ? groupWithCopies(g, next) : g)),
  };
  return withPrunedLocks(changed, copyStems(groupId, next, group.copies ?? 1), []);
}

/** How often the group's tray is reached for. */
export function setGroupAccess(p: Project, groupId: string, access: Access): Project {
  return groupById(p, groupId) === undefined
    ? p
    : { ...p, groups: (p.groups ?? []).map((g) => (g.id === groupId ? { ...g, access } : g)) };
}

export function renameGroup(p: Project, groupId: string, name: string): Project {
  return groupById(p, groupId) === undefined
    ? p
    : { ...p, groups: (p.groups ?? []).map((g) => (g.id === groupId ? { ...g, name } : g)) };
}

export function setClearance<C extends Component>(c: C, clearance: number | undefined): C {
  const next = { ...c };
  if (clearance === undefined) {
    delete next.clearance;
  } else {
    next.clearance = clearance;
  }
  return next;
}
