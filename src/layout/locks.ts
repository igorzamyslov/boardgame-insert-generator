import type { Lock, StoredLayout, TraySpec } from "../model/types";
import { compareCodeUnits } from "../util/compare";
import { fitsBed } from "./bed";
import {
  MAX_DEPTH,
  MAX_LEVELS,
  withSizeLocks,
  type Ctx,
  type FixedSize,
  type PartRef,
} from "./context";
import { partLabel, REMOVED_TRAY } from "./labels";
import { insertItem, insertLeaf, removeItems, type MoveEnv } from "./moves";
import type { Rng } from "./prng";
import { stackHeights, stackLevels } from "./stack";
import {
  cut,
  leaf,
  itemsOf,
  leaves,
  nodeAt,
  replaceAt,
  type Axis,
  type StackItem,
  type Tree,
  type TreeNode,
} from "./tree";
import type { LockConflict } from "./types";
import { toU } from "./units";

export interface LockedLeaf {
  readonly path: string;
  /** Bottom → top. */
  readonly items: readonly StackItem[];
}

export interface ResolvedLocks {
  /** Leaves fixed by position locks (frozen, at their path). */
  readonly leaves: readonly LockedLeaf[];
  /** Stack-locked groups without a position: frozen leaves that may move. */
  readonly groups: readonly (readonly StackItem[])[];
  readonly lockedPaths: readonly string[];
  /** Per requirement: the variant forced by locks, or null. */
  readonly pinnedVariant: readonly (number | null)[];
  /** Size locks keyed by partId. */
  readonly sizes: ReadonlyMap<number, FixedSize>;
  readonly rotationFixed: ReadonlySet<number>;
  /** Locks that survived validation, in input order. */
  readonly kept: readonly Lock[];
}

/** Hints from a warm-start layout, so locks keep the variant and rotation the user saw. */
export interface LockHints {
  variantOf?(req: number): number | undefined;
  rotatedOf?(trayKey: string): boolean | undefined;
  /**
   * The tray's level in the layout being re-run, counting only the trays below it that still
   * exist: orders trays locked to one path, and 0 marks the lowest.
   */
  levelOf?(trayKey: string): number | undefined;
  /** The layout being re-run is a single stack at the root path "": the only path a lock can name. */
  readonly singleLeaf?: boolean;
}

/**
 * Names trays for notices from the layout's contents. A key several variants share names the
 * tray of the variant that has all of `withKeys` (the other trays of its stack lock), so a
 * stack lock's trays are named from one variant and each deck is named by one tray.
 */
export function trayNamer(ctx: Ctx): TrayNamer {
  return (key, withKeys = []) => {
    const refs = ctx.refsOfKey(key);
    const sameVariant = (ref: PartRef): boolean =>
      withKeys
        .filter((k) => ctx.refsOfKey(k)[0]?.req === ref.req)
        .every((k) => ctx.refsOfKey(k).some((o) => o.variant === ref.variant));
    const ref = refs.find(sameVariant) ?? refs[0];
    const part = ref ? ctx.part(ref) : undefined;
    return part
      ? partLabel(
          part.compartments.map((c) => c.contents),
          key,
        )
      : REMOVED_TRAY;
  };
}

export function noLocks(ctx: Ctx): ResolvedLocks {
  return {
    leaves: [],
    groups: [],
    lockedPaths: [],
    pinnedVariant: ctx.input.requirements.map(() => null),
    sizes: new Map(),
    rotationFixed: new Set(),
    kept: [],
  };
}

/** A guillotine path (a string of 0/1 digits) no longer than MAX_DEPTH: locks, stored layouts. */
export function isValidPath(path: string): boolean {
  return /^[01]*$/.test(path) && path.length <= MAX_DEPTH;
}

/** Names a tray by its key for a notice (`trayLabel` with the layout's context). */
export type TrayNamer = (trayKey: string, withKeys?: readonly string[]) => string;

interface PosLock {
  readonly lock: Lock & { kind: "position" };
  readonly ref: PartRef;
  readonly id: number;
}

/**
 * What a conflict calls the lock's tray: its name, or the names of a stack lock's trays.
 * The key to unpin is the lock's own (first) tray key.
 */
export function conflictOf(lock: Lock, reason: string, name: TrayNamer): LockConflict {
  if (lock.kind === "stack") {
    return {
      trayKey: lock.trayKeys[0] ?? "",
      kind: lock.kind,
      name: [...new Set(lock.trayKeys.map((k) => name(k, lock.trayKeys)))].join(", "),
      reason,
    };
  }
  return { trayKey: lock.trayKey, kind: lock.kind, name: name(lock.trayKey), reason };
}

/** One conflict per tray and kind of lock (the first reason found), so a duplicate lock lists once. */
export function dedupeConflicts(conflicts: readonly LockConflict[]): LockConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.trayKey}|${c.kind ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Validates locks before optimizing (spec §7.2). Every lock that can't be kept — unknown
 * trayKey, contents that no longer fit a size lock, box edits, conflicting paths or
 * stacks — is reported in `conflicts` (the caller doesn't accept such a layout and asks the
 * user which pins to remove), never dropped silently. The layout is still built as if a
 * conflicting lock were not there, so the rest of the search runs: only the requirements a
 * kept lock names stay pinned to a variant.
 *
 * Position locks: trays locked to one path stack in the order of their level in the layout
 * being re-run (`hints.levelOf`; input order without one), except that a stack lock keeps the
 * order it gives. A position lock on a tray that sits above other trays in that layout, with
 * none of the trays under it locked to the same path and no stack lock around it, would drop
 * it to the floor and evict its stack-mates, so it is a conflict (the UI locks a
 * whole stack with a position lock per tray plus a stack lock). The root path "" is a valid
 * position only when the layout is a single tray, or the layout being re-run is one single
 * stack (`hints.singleLeaf`).
 *
 * Size locks are checked against the unlipped level-0 metrics. A size-locked tray that ends
 * up lower in a stack (lipped) can need more; the search then sees lock overflow, and the
 * fallback in `optimize` (Task 18) reports the lock as a conflict with its generic reason.
 */
export function resolveLocks(
  ctx: Ctx,
  locks: readonly Lock[],
  hints: LockHints = {},
): { resolved: ResolvedLocks; conflicts: LockConflict[] } {
  // A lock in conflict after step 1 (size, position, stack or leaf checks) must not have narrowed
  // the variants of the locks that follow it: resolve again without it, so a lock is never
  // reported as conflicting because of a lock that is itself in conflict. The set only shrinks.
  const late: LockConflict[] = [];
  let live = locks;
  for (;;) {
    const pass = resolveOnce(ctx, live, hints);
    if (pass.lateDropped.size === 0) {
      return { resolved: pass.resolved, conflicts: dedupeConflicts([...late, ...pass.conflicts]) };
    }
    late.push(...pass.lateConflicts);
    live = live.filter((l) => !pass.lateDropped.has(l));
  }
}

function resolveOnce(
  ctx: Ctx,
  locks: readonly Lock[],
  hints: LockHints,
): {
  resolved: ResolvedLocks;
  conflicts: LockConflict[];
  lateDropped: ReadonlySet<Lock>;
  lateConflicts: LockConflict[];
} {
  const conflicts: LockConflict[] = [];
  const lateConflicts: LockConflict[] = [];
  const dropped = new Set<Lock>();
  const name = trayNamer(ctx);
  const lateDropped = new Set<Lock>();
  let early = true;
  const drop = (lock: Lock, reason: string): void => {
    dropped.add(lock);
    const conflict = conflictOf(lock, reason, name);
    if (early) {
      conflicts.push(conflict);
    } else {
      lateDropped.add(lock);
      lateConflicts.push(conflict);
    }
  };
  const reqs = ctx.input.requirements;

  // 1. Keys must exist; all locks on one requirement must agree on a variant.
  const candidates: (Set<number> | null)[] = reqs.map(() => null);
  const accepted: Lock[] = [];
  for (const lock of locks) {
    const keys = lock.kind === "stack" ? lock.trayKeys : [lock.trayKey];
    if (keys.length === 0) {
      drop(lock, "it lists no trays");
      continue;
    }
    const missing = keys.find((k) => ctx.refsOfKey(k).length === 0);
    if (missing !== undefined) {
      drop(lock, "what it held was removed or changed");
      continue;
    }
    const next = new Map<number, Set<number>>();
    let ok = true;
    for (const k of keys) {
      const refs = ctx.refsOfKey(k);
      const r = refs[0]?.req ?? 0;
      const withKey = new Set(refs.map((ref) => ref.variant));
      const cur = next.get(r) ?? candidates[r] ?? null;
      const inter = cur === null ? withKey : new Set([...cur].filter((v) => withKey.has(v)));
      if (inter.size === 0) {
        ok = false;
        break;
      }
      next.set(r, inter);
    }
    if (!ok) {
      drop(lock, "it conflicts with other pins on the same item");
      continue;
    }
    for (const [r, set] of next) {
      candidates[r] = set;
    }
    accepted.push(lock);
  }
  early = false;
  const pinnedVariant = candidates.map((set, r) => {
    if (set === null) {
      return null;
    }
    const preferred = hints.variantOf?.(r);
    return preferred !== undefined && set.has(preferred)
      ? preferred
      : bestVariant(ctx, r, set, accepted);
  });
  const refOf = (key: string): PartRef => {
    const refs = ctx.refsOfKey(key);
    return refs.find((r) => r.variant === pinnedVariant[r.req]) ?? (refs[0] as PartRef);
  };
  const rotatable = (ref: PartRef): boolean => ctx.part(ref)?.rotatable ?? false;

  // 2. Size locks.
  const sizes = new Map<number, FixedSize>();
  for (const lock of accepted) {
    if (lock.kind !== "size") {
      continue;
    }
    const ref = refOf(lock.trayKey);
    const id = ctx.partId(ref);
    if (sizes.has(id)) {
      drop(lock, "another size lock already fixes this tray");
      continue;
    }
    const m = ctx.metrics(ref, false, 0);
    const w = toU(lock.w);
    const d = toU(lock.d);
    const h = toU(lock.h);
    const asIs = w >= m.w && d >= m.d;
    const turned = rotatable(ref) && w >= m.d && d >= m.w;
    if ((!asIs && !turned) || h < m.h) {
      drop(lock, "its contents no longer fit that size");
      continue;
    }
    if (w > ctx.floorW || d > ctx.floorD || h > ctx.topPlane) {
      drop(lock, "it no longer fits in the box");
      continue;
    }
    if (!fitsBed(ctx.bed, w, d, h)) {
      drop(lock, "it is larger than the print bed");
      continue;
    }
    const rotated = asIs && turned ? (hints.rotatedOf?.(lock.trayKey) ?? false) : !asIs;
    sizes.set(id, { w, d, h, rotated });
  }

  // 3. Position locks.
  const singleTray =
    reqs.length === 1 && (reqs[0]?.variants[pinnedVariant[0] ?? 0]?.parts.length ?? 0) === 1;
  const pos = new Map<number, PosLock>();
  for (const lock of accepted) {
    if (lock.kind !== "position") {
      continue;
    }
    const ref = refOf(lock.trayKey);
    const id = ctx.partId(ref);
    if (!isValidPath(lock.path)) {
      drop(lock, "its position is not valid");
      continue;
    }
    if (pos.has(id)) {
      drop(lock, "another pin already holds this tray in place");
      continue;
    }
    if (lock.rotated && !rotatable(ref)) {
      drop(lock, "this tray can't be rotated");
      continue;
    }
    const size = sizes.get(id);
    if (size && size.rotated !== lock.rotated) {
      drop(lock, "it conflicts with the size lock on the same tray");
      continue;
    }
    const clash = [...pos.values()].find(
      (p) =>
        p.lock.path !== lock.path &&
        (p.lock.path.startsWith(lock.path) || lock.path.startsWith(p.lock.path)),
    );
    if (clash) {
      drop(lock, `it conflicts with the pin on "${name(clash.lock.trayKey)}"`);
      continue;
    }
    if (lock.path === "" && !singleTray && hints.singleLeaf !== true) {
      drop(lock, "it conflicts with the other trays");
      continue;
    }
    pos.set(id, { lock, ref, id });
  }

  const sized = withSizeLocks(ctx, sizes);
  const rotationOf = (ref: PartRef, key: string): boolean => {
    const id = ctx.partId(ref);
    const fixed = pos.get(id)?.lock.rotated ?? sizes.get(id)?.rotated;
    if (fixed !== undefined) {
      return fixed;
    }
    return rotatable(ref) && (hints.rotatedOf?.(key) ?? false);
  };
  const itemOf = (key: string): StackItem => {
    const ref = refOf(key);
    return { ...ref, rotated: rotationOf(ref, key) };
  };
  const fitsHeight = (items: readonly StackItem[]): boolean => {
    const h = stackHeights(sized, stackLevels(sized, items));
    return h.overflow === 0 && h.lockOverflow === 0;
  };

  // 4. Stack locks.
  const inGroup = new Map<number, { lock: Lock; items: StackItem[] }>();
  const groupsAll: { lock: Lock; items: StackItem[]; path: string | null }[] = [];
  for (const lock of accepted) {
    if (lock.kind !== "stack") {
      continue;
    }
    const items = lock.trayKeys.map(itemOf);
    const ids = items.map((i) => ctx.partId(i));
    if (new Set(ids).size !== ids.length || ids.some((id) => inGroup.has(id))) {
      drop(lock, "a tray is in more than one pinned stack");
      continue;
    }
    if (items.length > MAX_LEVELS) {
      drop(lock, `a stack holds at most ${MAX_LEVELS} trays`);
      continue;
    }
    const paths = new Set(
      ids.flatMap((id) => {
        const p = pos.get(id);
        return p ? [p.lock.path] : [];
      }),
    );
    if (paths.size > 1) {
      drop(lock, "its trays are pinned to different positions");
      continue;
    }
    if (!fitsHeight(items)) {
      drop(lock, "the stack is taller than the space in the box");
      continue;
    }
    const g = { lock, items, path: [...paths][0] ?? null };
    groupsAll.push(g);
    for (const id of ids) {
      inGroup.set(id, g);
    }
  }

  // 5. Locked leaves: position-locked trays (and their stack groups) per path. Trays locked to
  // one path stack in the order of their level in the layout being re-run (input order without
  // one); a stack lock keeps the order it gives. A tray that sat above others there and now
  // would be the lowest locked one at its path would silently drop to the floor, so its lock
  // is reported as a conflict instead.
  interface Unit {
    readonly items: StackItem[];
    readonly pos: PosLock | null;
    /** Level in the layout being re-run; Infinity when unknown. */
    readonly level: number;
  }
  const levelOf = (item: StackItem): number => {
    const key = ctx.part(item)?.trayKey;
    return (key === undefined ? undefined : hints.levelOf?.(key)) ?? Infinity;
  };
  const byPath = new Map<string, { units: Unit[]; locks: PosLock[]; groups: Set<object> }>();
  for (const lock of accepted) {
    if (lock.kind !== "position" || dropped.has(lock)) {
      continue;
    }
    const ref = refOf(lock.trayKey);
    const id = ctx.partId(ref);
    const entry = byPath.get(lock.path) ?? { units: [], locks: [], groups: new Set<object>() };
    const g = inGroup.get(id);
    const posLock = { lock, ref, id };
    if (g) {
      if (!entry.groups.has(g)) {
        entry.groups.add(g);
        const first = g.items[0];
        entry.units.push({ items: [...g.items], pos: null, level: first ? levelOf(first) : 0 });
      }
    } else {
      const item = itemOf(lock.trayKey);
      entry.units.push({ items: [item], pos: posLock, level: levelOf(item) });
    }
    entry.locks.push(posLock);
    byPath.set(lock.path, entry);
  }
  const lockedLeaves: LockedLeaf[] = [];
  for (const [path, entry] of byPath) {
    // a stable sort: trays of unknown level, and all trays without a layout, keep input order
    const units = [...entry.units].sort((a, b) =>
      a.level === b.level ? 0 : a.level < b.level ? -1 : 1,
    );
    const lowest = units[0];
    if (lowest?.pos && lowest.level > 0 && lowest.level !== Infinity) {
      drop(
        lowest.pos.lock,
        "it is on top of other trays in the current layout and nothing under it is pinned to the same position; pin the whole stack to hold it there",
      );
      pos.delete(lowest.pos.id);
      continue;
    }
    const items = units.flatMap((u) => u.items);
    if (items.length > MAX_LEVELS || !fitsHeight(items)) {
      for (const p of entry.locks) {
        drop(p.lock, "the trays pinned to this position don't fit on top of each other");
        pos.delete(p.id);
      }
      continue;
    }
    lockedLeaves.push({ path, items });
  }
  const groups = groupsAll
    .filter((g) => !g.items.some((i) => pos.has(ctx.partId(i))))
    .map((g) => g.items);
  const rotationFixed = new Set<number>([...pos.keys(), ...sizes.keys(), ...inGroup.keys()]);

  // 6. Locks in conflict above must not keep pinning their requirement's variant. A requirement a
  // kept lock names keeps its pin: the kept locks were resolved under it, and it lies in
  // their intersection.
  const kept = locks.filter((l) => !dropped.has(l));
  const named = new Set(
    kept.flatMap((l) =>
      (l.kind === "stack" ? l.trayKeys : [l.trayKey]).map((k) => ctx.refsOfKey(k)[0]?.req ?? 0),
    ),
  );
  return {
    resolved: {
      leaves: lockedLeaves,
      groups,
      lockedPaths: lockedLeaves.map((l) => l.path),
      pinnedVariant: pinnedVariant.map((v, r) => (named.has(r) ? v : null)),
      sizes,
      rotationFixed,
      kept,
    },
    conflicts,
    lateDropped,
    lateConflicts,
  };
}

/**
 * Which of the variants that have every key the locks name on requirement `req` to pin when no
 * layout says which one the user saw. A key is shared by variants (`<key>:p0:0` is the single strip
 * and the first tray of a split), so the lowest index would pin whatever comes first, an upright
 * variant that no box lock can hold. Picks the one whose trays the size locks fit, then the one
 * whose locked trays are lowest (the most any pin or stack can hold), then the lowest index.
 */
function bestVariant(
  ctx: Ctx,
  req: number,
  variants: ReadonlySet<number>,
  accepted: readonly Lock[],
): number {
  const keys = new Set(
    accepted.flatMap((l) =>
      (l.kind === "stack" ? l.trayKeys : [l.trayKey]).filter(
        (k) => ctx.refsOfKey(k)[0]?.req === req,
      ),
    ),
  );
  const cost = (variant: number): [number, number] => {
    const refOf = (key: string): PartRef | undefined =>
      ctx.refsOfKey(key).find((r) => r.req === req && r.variant === variant);
    let misfit = 0;
    for (const lock of accepted) {
      const ref = lock.kind === "size" ? refOf(lock.trayKey) : undefined;
      if (lock.kind !== "size" || !ref) {
        continue;
      }
      const m = ctx.metrics(ref, false, 0);
      const w = toU(lock.w);
      const d = toU(lock.d);
      const fits =
        ((w >= m.w && d >= m.d) || (rotatable(ctx, ref) && w >= m.d && d >= m.w)) &&
        toU(lock.h) >= m.h;
      misfit += fits ? 0 : 1;
    }
    let height = 0;
    for (const key of keys) {
      const ref = refOf(key);
      height += ref ? ctx.metrics(ref, false, 0).h : 0;
    }
    return [misfit, height];
  };
  let best = Math.min(...variants);
  let bestCost = cost(best);
  for (const v of [...variants].sort((a, b) => a - b)) {
    const c = cost(v);
    if (c[0] < bestCost[0] || (c[0] === bestCost[0] && c[1] < bestCost[1])) {
      best = v;
      bestCost = c;
    }
  }
  return best;
}

function rotatable(ctx: Ctx, ref: PartRef): boolean {
  return ctx.part(ref)?.rotatable ?? false;
}

export function moveEnvOf(ctx: Ctx, resolved: ResolvedLocks): MoveEnv {
  return {
    ctx,
    lockedPaths: resolved.lockedPaths,
    variantPinned: resolved.pinnedVariant.map((v) => v !== null),
    rotationFixed: resolved.rotationFixed,
  };
}

function sameItems(a: readonly StackItem[], b: readonly StackItem[], ctx: Ctx): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i];
      return y !== undefined && ctx.partId(x) === ctx.partId(y);
    })
  );
}

/**
 * Ensures every requirement has exactly the parts of its active variant in the tree:
 * drops duplicates and parts of other variants, inserts missing parts.
 */
export function completeTree(tree: Tree, env: MoveEnv, rng: Rng): Tree | null {
  const { ctx } = env;
  // The drop set is computed first, so removeItems' predicate stays pure: it evaluates the
  // predicate more than once per item.
  const seen = new Set<number>();
  const drop = new Set<StackItem>();
  for (const item of itemsOf(tree.root)) {
    const id = ctx.partId(item);
    const wrong = item.variant !== (tree.variants[item.req] ?? 0) || ctx.part(item) === undefined;
    if (wrong || seen.has(id)) {
      drop.add(item);
    } else {
      seen.add(id);
    }
  }
  let root: TreeNode | null = removeItems(tree.root, (item) => drop.has(item), env);
  ctx.input.requirements.forEach((r, i) => {
    const v = tree.variants[i] ?? 0;
    (r.variants[v]?.parts ?? []).forEach((p, k) => {
      const item: StackItem = { req: i, variant: v, part: k, rotated: false };
      if (root !== null && !seen.has(ctx.partId(item))) {
        root = insertItem(
          root,
          { ...item, rotated: p.rotatable && rng.nextInt(2) === 1 },
          env,
          rng,
        );
      }
    });
  });
  return root === null ? null : { ...tree, root };
}

/**
 * Turns any start tree into one that satisfies the resolved locks: pinned variants,
 * frozen locked leaves at their exact paths (route cuts get the warm-start axis when
 * known), stack-locked groups as frozen leaves, then completeTree. Returns null only
 * when no unlocked leaf is left to insert into.
 */
export function applyLocks(
  tree: Tree,
  resolved: ResolvedLocks,
  env: MoveEnv,
  rng: Rng,
  axisOf: (path: string) => Axis | undefined = () => undefined,
): Tree | null {
  const { ctx } = env;
  const free: MoveEnv = { ...env, lockedPaths: [] };
  const variants = tree.variants.map((v, i) => resolved.pinnedVariant[i] ?? v);
  const posIds = new Set(resolved.leaves.flatMap((l) => l.items.map((i) => ctx.partId(i))));
  let root: TreeNode = tree.root;

  // Groups already standing as a stack keep their place (frozen); others are re-inserted.
  const intactGroups = new Set<number>();
  for (const [gi, g] of resolved.groups.entries()) {
    const at = leaves(root).find((l) => sameItems(l.leaf.stack, g, ctx));
    if (at) {
      root = replaceAt(root, at.path, leaf(at.leaf.stack, true));
      intactGroups.add(gi);
    }
  }
  const groupIds = new Set(
    resolved.groups.flatMap((g, gi) => (intactGroups.has(gi) ? [] : g.map((i) => ctx.partId(i)))),
  );
  root = removeItems(
    root,
    (item) => {
      const id = ctx.partId(item);
      return posIds.has(id) || groupIds.has(id) || item.variant !== variants[item.req];
    },
    free,
  );

  const displaced: { items: StackItem[]; frozen: boolean }[] = [];
  for (const locked of [...resolved.leaves].sort((a, b) => compareCodeUnits(a.path, b.path))) {
    for (let n = 0; n < locked.path.length; n++) {
      const q = locked.path.slice(0, n);
      const node = nodeAt(root, q);
      const axis = axisOf(q) ?? (n % 2 === 0 ? "x" : "y");
      if (!node) {
        break;
      }
      if (node.kind === "leaf") {
        const onA = locked.path.charAt(n) === "0";
        root = replaceAt(root, q, onA ? cut(axis, leaf([]), node) : cut(axis, node, leaf([])));
      } else if (axisOf(q) !== undefined && node.axis !== axis) {
        root = replaceAt(root, q, { ...node, axis });
      }
    }
    const existing = nodeAt(root, locked.path);
    if (existing) {
      for (const l of leaves(existing)) {
        if (l.leaf.stack.length > 0) {
          displaced.push({ items: [...l.leaf.stack], frozen: l.leaf.frozen });
        }
      }
    }
    root = replaceAt(root, locked.path, leaf(locked.items, true));
  }

  let out: TreeNode | null = root;
  for (const d of displaced) {
    if (out === null) {
      break;
    }
    if (d.frozen) {
      out = insertLeaf(out, leaf(d.items, true), env, rng);
    } else {
      for (const item of d.items) {
        out = out === null ? null : insertItem(out, item, env, rng);
      }
    }
  }
  resolved.groups.forEach((g, gi) => {
    if (out !== null && !intactGroups.has(gi)) {
      out = insertLeaf(out, leaf(g, true), env, rng);
    }
  });
  if (out === null) {
    return null;
  }
  return completeTree({ root: out, variants }, env, rng);
}

/**
 * Drag-to-swap in the plan view: swaps the two trays' leaves (whole stacks) and locks
 * both. Trays in the same stack swap levels via a stack lock instead.
 */
export function swapLocks(
  locks: readonly Lock[],
  keyA: string,
  keyB: string,
  layout: StoredLayout,
): Lock[] {
  const trays = layout.trays.filter((t) => t.part === "tray");
  const a = trays.find((t) => t.key === keyA);
  const b = trays.find((t) => t.key === keyB);
  if (!a || !b || keyA === keyB) {
    return [...locks];
  }
  const stackAt = (path: string): TraySpec[] =>
    trays.filter((t) => t.path === path).sort((p, q) => p.level - q.level);
  if (a.path === b.path) {
    const keys = stackAt(a.path).map((t) =>
      t.key === keyA ? keyB : t.key === keyB ? keyA : t.key,
    );
    const rest = locks.filter(
      (l) => !(l.kind === "stack" && l.trayKeys.some((k) => keys.includes(k))),
    );
    return [...rest, { kind: "stack", trayKeys: keys }];
  }
  const sa = stackAt(a.path);
  const sb = stackAt(b.path);
  const moved = new Set([...sa, ...sb].map((t) => t.key));
  const rest = locks.filter((l) => {
    if (l.kind === "stack") {
      return !l.trayKeys.some((k) => moved.has(k));
    }
    return !(l.kind === "position" && moved.has(l.trayKey));
  });
  const out: Lock[] = [...rest];
  for (const [stack, path] of [
    [sa, b.path],
    [sb, a.path],
  ] as const) {
    for (const t of stack) {
      out.push({ kind: "position", trayKey: t.key, path, rotated: t.rotated });
    }
    if (stack.length > 1) {
      out.push({ kind: "stack", trayKeys: stack.map((t) => t.key) });
    }
  }
  return out;
}
