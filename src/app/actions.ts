// src/app/actions.ts
import { groupOf, newComponent } from "../model/defaults";
import type {
  Box,
  CardsComponent,
  Component,
  ComponentKind,
  Lock,
  Notice,
  Printer,
  Project,
  Settings,
  TraySpec,
} from "../model/types";
import { NOTICE_CODES, swapLocks } from "../layout";

/** Only real trays can be locked; leftovers are regenerated and spacers follow their tray. */
export function isLockable(t: TraySpec): boolean {
  return t.part === "tray";
}

export function updateBox(p: Project, patch: Partial<Box>): Project {
  return { ...p, box: { ...p.box, ...patch } };
}

export function updatePrinter(p: Project, patch: Partial<Printer>): Project {
  return { ...p, printer: { ...p.printer, ...patch } };
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

/** The key a component's requirement and its trays carry: its group, else its own id. */
function requirementKey(c: Component): string {
  return groupOf(c) ?? c.id;
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
function withComponents(p: Project, components: Component[]): Project {
  const after = new Set(components.map(requirementKey));
  const gone = new Set(p.components.map(requirementKey).filter((k) => !after.has(k)));
  const locks = gone.size === 0 ? p.locks : withoutKeys(p.locks, gone);
  return { ...p, components, locks };
}

export function updateComponent(p: Project, id: string, next: Component): Project {
  return withComponents(
    p,
    p.components.map((c) => (c.id === id ? next : c)),
  );
}

export function removeComponent(p: Project, id: string): Project {
  return withComponents(
    p,
    p.components.filter((c) => c.id !== id),
  );
}

/** Puts a removed component back where it was (Undo); nothing happens if it is already there. */
export function restoreComponent(p: Project, component: Component, index: number): Project {
  if (p.components.some((c) => c.id === component.id)) {
    return p;
  }
  const at = Math.min(Math.max(0, index), p.components.length);
  return withComponents(p, [...p.components.slice(0, at), component, ...p.components.slice(at)]);
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

export function lockedKeys(p: Project): Set<string> {
  const keys = new Set<string>();
  for (const l of p.locks) {
    if (l.kind === "position") {
      keys.add(l.trayKey);
    }
  }
  return keys;
}

export function toggleLock(p: Project, tray: TraySpec): Project {
  if (!isLockable(tray)) {
    return p;
  }
  // The whole stack: locking one tray of a stack alone would put it on the floor and evict
  // the trays under and over it (a run reports such a lock as a pin conflict).
  const stack = (p.layout?.trays ?? [])
    .filter((t) => t.part === "tray" && t.path === tray.path)
    .sort((a, b) => a.level - b.level);
  const members = stack.some((t) => t.key === tray.key) ? stack : [tray];
  const keys = new Set(members.map((t) => t.key));
  const rest = p.locks.filter((l) =>
    l.kind === "stack"
      ? !l.trayKeys.some((k) => keys.has(k))
      : !(l.kind === "position" && keys.has(l.trayKey)),
  );
  if (lockedKeys(p).has(tray.key)) {
    return { ...p, locks: rest };
  }
  const locks: Lock[] = members.map((t) => ({
    kind: "position",
    trayKey: t.key,
    path: t.path,
    rotated: t.rotated,
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

const DROPPED_LOCK_PATH = /^\/locks\/(\d+)$/;

/**
 * Removes the locks named by `lock.dropped` notices, which carry `path: "/locks/<index>"` into
 * `p.locks`. For explicit use only: the runner no longer calls it, because a run's pins are never
 * dropped silently (it reports `LayoutResult.lockConflicts` and the user unpins).
 * Returns `p` itself when nothing was dropped.
 */
export function pruneDroppedLocks(p: Project, notices: readonly Notice[]): Project {
  const dropped = new Set<number>();
  for (const n of notices) {
    const m = n.code === NOTICE_CODES.lockDropped ? DROPPED_LOCK_PATH.exec(n.path ?? "") : null;
    if (m) {
      dropped.add(Number(m[1]));
    }
  }
  if (dropped.size === 0) {
    return p;
  }
  return { ...p, locks: p.locks.filter((_, i) => !dropped.has(i)) };
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

export function setGroup<C extends Component>(c: C, groupId: string | undefined): C {
  const next = { ...c };
  const trimmed = groupId?.trim() ?? "";
  if (trimmed === "") {
    delete next.groupId;
  } else {
    next.groupId = trimmed;
    delete next.perPlayer;
  }
  return next;
}

export function setPerPlayer<C extends Component>(c: C, players: number | undefined): C {
  const next = { ...c };
  if (players === undefined) {
    delete next.perPlayer;
  } else {
    next.perPlayer = { players };
  }
  return next;
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
