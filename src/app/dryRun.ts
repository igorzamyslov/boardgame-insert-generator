// src/app/dryRun.ts
// Answers "can this tray turn?" without running the optimizer: the locks a turn would write go
// through `resolveLocks`, the check every run starts with, so the reason a run would later give for
// refusing them is known now.
import { createCtx } from "../layout/context";
import { resolveLocks } from "../layout/locks";
import { warmHints } from "../layout/warmstart";
import type { Lock, Project, StoredLayout, TraySpec } from "../model/types";
import { buildLayoutInput } from "./runner";

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

/**
 * Whether turning this tray (and so its stack) would do anything and be kept by the next run, with
 * the reason when not. Reads the stored plan; synchronous, main thread, no optimizer. The reason of
 * a refused lock is the one `resolveLocks` gives (a phrase that continues "Turning is blocked
 * because ..."), taken from the conflicts about the stack's own trays only.
 */
export function canTurn(p: Project, trayKey: string): TurnCheck {
  const layout = p.layout;
  if (!layout) {
    return { ok: false, reason: "Make a plan first." };
  }
  const found = stackOf(layout, trayKey);
  if (!found) {
    return { ok: false, reason: "That tray isn't in the plan." };
  }
  if (Math.abs(found.tray.w - found.tray.d) < SQUARE_MM) {
    return { ok: false, reason: "This tray is square, so turning changes nothing." };
  }
  const locks = turnLocks(p, trayKey);
  if (!locks) {
    return { ok: true };
  }
  // The inputs and hints a run would give the lock check: the stored plan stands in for the warm start.
  const ctx = createCtx(buildLayoutInput({ ...p, locks }));
  const { conflicts } = resolveLocks(ctx, locks, warmHints(ctx, layout.trays));
  const keys = new Set(found.stack.map((t) => t.key));
  const own = conflicts.find((c) => keys.has(c.trayKey));
  return own ? { ok: false, reason: own.reason } : { ok: true };
}
