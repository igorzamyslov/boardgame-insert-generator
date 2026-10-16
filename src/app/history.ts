// src/app/history.ts
// Undo and redo for whole projects: every edit is one step, and a project's history is
// dropped when another project opens.
import { batch, computed, signal } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import type { Project } from "../model/types";

export const HISTORY_LIMIT = 100;

export interface History {
  /** Records `p` as the new current entry; what could be redone is dropped. */
  push(p: Project): void;
  /** Replaces the current entry (a plan arriving for the edit that made it). No-op while empty. */
  amend(p: Project): void;
  /** Starts the history at `p` when it is empty, so the first edit has something to go back to. */
  ensureBase(p: Project): void;
  /** Steps back and returns the entry now current, or null at the oldest one. */
  undo(): Project | null;
  /** Steps forward and returns the entry now current, or null at the newest one. */
  redo(): Project | null;
  canUndo: ReadonlySignal<boolean>;
  canRedo: ReadonlySignal<boolean>;
  clear(): void;
}

export function createHistory(limit = HISTORY_LIMIT): History {
  let entries: Project[] = [];
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
    push(p) {
      const keep = Math.max(1, limit);
      entries = [...entries.slice(0, cursor.value + 1), p].slice(-keep);
      cursor.value = entries.length - 1;
      sync();
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
      return entries[cursor.value] ?? null;
    },
    redo() {
      if (cursor.value >= entries.length - 1) {
        return null;
      }
      cursor.value += 1;
      return entries[cursor.value] ?? null;
    },
    canUndo,
    canRedo,
    clear() {
      entries = [];
      cursor.value = -1;
      sync();
    },
  };
}
