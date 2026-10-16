// src/app/history.ts
// Undo and redo for whole projects: every edit is one step, and a project's history is
// dropped when another project opens.
import { batch, computed, signal } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import type { Project } from "../model/types";

export const HISTORY_LIMIT = 100;

export interface PushOptions {
  /** Replaces the newest entry instead of adding one when the previous push was less than this many ms ago. */
  coalesceMs?: number;
}

export interface History {
  /** Records `p` as the new current entry; what could be redone is dropped. */
  push(p: Project, opts?: PushOptions): void;
  /** Replaces the current entry (a plan arriving for the edit that made it). No-op while empty. */
  amend(p: Project): void;
  /**
   * Walks back from the entry before the current one, replacing each with `update(entry)` until
   * `update` returns null (entries an edit and its plan arrived apart from, such as a rename).
   */
  amendBefore(update: (entry: Project) => Project | null): void;
  /** Starts the history at `p` when it is empty, so the first edit has something to go back to. */
  ensureBase(p: Project): void;
  /** Steps back and returns the entry now current, or null at the oldest one. */
  undo(): Project | null;
  /** Steps forward and returns the entry now current, or null at the newest one. */
  redo(): Project | null;
  canUndo: ReadonlySignal<boolean>;
  canRedo: ReadonlySignal<boolean>;
  /** Changes on push, undo, redo and clear, not on amend: tells whether "the latest step" is still the same one. */
  version: ReadonlySignal<number>;
  clear(): void;
}

export function createHistory(
  limit = HISTORY_LIMIT,
  now: () => number = () => Date.now(),
): History {
  let entries: Project[] = [];
  let lastPushAt = Number.NEGATIVE_INFINITY;
  const version = signal(0);
  const cursor = signal(-1);
  const count = signal(0);
  const canUndo = computed(() => cursor.value > 0);
  const canRedo = computed(() => cursor.value < count.value - 1);

  function sync(): void {
    batch(() => {
      count.value = entries.length;
      cursor.value = Math.min(cursor.value, entries.length - 1);
    });
  }

  return {
    push(p, opts = {}) {
      const at = now();
      // The base entry (cursor 0) is never replaced: the first edit must stay undoable.
      const coalesce =
        opts.coalesceMs !== undefined &&
        cursor.value > 0 &&
        cursor.value === entries.length - 1 &&
        at - lastPushAt < opts.coalesceMs;
      lastPushAt = at;
      version.value += 1;
      if (coalesce) {
        entries = entries.map((e, i) => (i === cursor.value ? p : e));
        return;
      }
      const keep = Math.max(1, limit);
      entries = [...entries.slice(0, cursor.value + 1), p].slice(-keep);
      cursor.value = entries.length - 1;
      sync();
    },
    amendBefore(update) {
      for (let i = cursor.value - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        const next = entry === undefined ? null : update(entry);
        if (!next) {
          return;
        }
        entries = entries.map((e, j) => (j === i ? next : e));
      }
    },
    amend(p) {
      if (cursor.value >= 0) {
        entries = entries.map((e, i) => (i === cursor.value ? p : e));
      }
    },
    ensureBase(p) {
      if (entries.length === 0) {
        entries = [p];
        cursor.value = 0;
        sync();
      }
    },
    undo() {
      if (cursor.value <= 0) {
        return null;
      }
      cursor.value -= 1;
      lastPushAt = Number.NEGATIVE_INFINITY;
      version.value += 1;
      return entries[cursor.value] ?? null;
    },
    redo() {
      if (cursor.value >= entries.length - 1) {
        return null;
      }
      cursor.value += 1;
      lastPushAt = Number.NEGATIVE_INFINITY;
      version.value += 1;
      return entries[cursor.value] ?? null;
    },
    canUndo,
    canRedo,
    version,
    clear() {
      entries = [];
      lastPushAt = Number.NEGATIVE_INFINITY;
      version.value += 1;
      cursor.value = -1;
      sync();
    },
  };
}
