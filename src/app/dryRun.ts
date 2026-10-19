// src/app/dryRun.ts
// Answers "can this tray turn?" without running the optimizer: the locks a turn would write go
// through `resolveLocks`, the check every run starts with, so the reason a run would later give for
// refusing them is known now.
import { createCtx } from "../layout/context";
import type { Ctx } from "../layout/context";
import { resolveLocks } from "../layout/locks";
import { warmHints } from "../layout/warmstart";
import type { ForeignData, Lock, Project, StoredLayout, TraySpec } from "../model/types";
import { buildLayoutInput, canOptimize } from "./runner";

export interface TurnCheck {
  ok: boolean;
  reason?: string;
}

/** Closer than this (mm) is square: turning such a tray changes nothing. */
const SQUARE_MM = 0.5;

/** The tray and the trays of its stack (the layout's trays at its path), bottom first. */
function stackOf(
  layout: StoredLayout,
  trayKey: string,
): { tray: TraySpec; stack: TraySpec[] } | null {
  const trays = layout.trays.filter((t) => t.part === "tray");
  const tray = trays.find((t) => t.key === trayKey);
  if (!tray) {
    return null;
  }
  return {
    tray,
    stack: trays.filter((t) => t.path === tray.path).sort((a, b) => a.level - b.level),
  };
}

/**
 * The project's locks after turning this tray: its whole stack pinned where it is (a position lock
 * per tray, and a stack lock when there are several) with every tray's rotation flipped, because
 * trays that share a footprint turn together. Locks on other trays stay. Null without a plan or
 * when the tray is not in it. Nothing here checks the result: see `canTurn`.
 */
export function turnLocks(p: Project, trayKey: string): Lock[] | null {
  const found = p.layout ? stackOf(p.layout, trayKey) : null;
  if (!found) {
    return null;
  }
  const keys = new Set(found.stack.map((t) => t.key));
  const rest = p.locks.filter((l) =>
    l.kind === "stack"
      ? !l.trayKeys.some((k) => keys.has(k))
      : !(l.kind === "position" && keys.has(l.trayKey)),
  );
  const turned: Lock[] = found.stack.map((t) => ({
    kind: "position",
    trayKey: t.key,
    path: t.path,
    rotated: !t.rotated,
  }));
  if (found.stack.length > 1) {
    // A pending swap is a stack lock in the swapped order: keep it rather than level order.
    const swapped = p.locks.find(
      (l) =>
        l.kind === "stack" &&
        l.trayKeys.length === keys.size &&
        l.trayKeys.every((k) => keys.has(k)),
    );
    turned.push({
      kind: "stack",
      trayKeys: swapped?.kind === "stack" ? swapped.trayKeys : found.stack.map((t) => t.key),
    });
  }
  return [...rest, ...turned];
}

/** One layout context per project: the lock check reads it, locks aside, for every tray. */
const contexts = new WeakMap<Project, Ctx>();

function ctxOf(p: Project): Ctx {
  let ctx = contexts.get(p);
  if (!ctx) {
    ctx = createCtx(buildLayoutInput(p));
    contexts.set(p, ctx);
  }
  return ctx;
}

/**
 * Whether turning this tray (and so its stack) is worth offering, with a sentence the screen can
 * show as is when not. Reads the stored plan; synchronous, main thread, no optimizer. It checks
 * what `resolveLocks` checks: that the pins a turn writes don't clash with each other or with the
 * trays' sizes and rotations. Whether the turned stack then fits the box is only known to the
 * optimizer, which the next run reports. `foreign` is the file's unread components, so a group
 * listing one is no error. Never throws.
 */
export function canTurn(p: Project, trayKey: string, foreign?: ForeignData): TurnCheck {
  try {
    const layout = p.layout;
    if (!layout) {
      return { ok: false, reason: "Make a plan first." };
    }
    if (!canOptimize(p, undefined, foreign)) {
      return { ok: false, reason: "Fix the errors first." };
    }
    const found = stackOf(layout, trayKey);
    if (!found) {
      return { ok: false, reason: "That tray isn't in the plan." };
    }
    if (found.stack.every((t) => Math.abs(t.w - t.d) < SQUARE_MM)) {
      return { ok: false, reason: "This tray is square, so turning changes nothing." };
    }
    const locks = turnLocks(p, trayKey);
    if (!locks) {
      return { ok: true };
    }
    // The hints a run would give the lock check: the stored plan stands in for the warm start.
    const ctx = ctxOf(p);
    const { conflicts } = resolveLocks(ctx, locks, warmHints(ctx, layout.trays));
    const keys = new Set(found.stack.map((t) => t.key));
    const own = conflicts.find((c) => keys.has(c.trayKey));
    return own
      ? { ok: false, reason: `Turning doesn't work for ${own.name}: ${own.reason}.` }
      : { ok: true };
  } catch {
    return { ok: false, reason: "Turning isn't possible right now." };
  }
}
