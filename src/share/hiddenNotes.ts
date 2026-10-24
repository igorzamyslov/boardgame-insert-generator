import { signal } from "@preact/signals";
import { isRecord } from "../model/json";
import type { Notice } from "../model/types";
import { STORAGE_PREFIX, defaultStorage } from "./store";

const KEY_PREFIX = `${STORAGE_PREFIX}hidden-notes:`;

/** What a notice is called when it is hidden: its code and field, so another tray's note is another note. */
export function noteKey(n: Pick<Notice, "code" | "path">): string {
  return `${n.code}|${n.path ?? ""}`;
}

/**
 * The notes a person hid: key to the words hidden under it. A key holds a list because several
 * notes can share one (two stacks that only fit in one order have the same code and no field).
 */
export type HiddenNotes = Readonly<Record<string, readonly string[]>>;

/** A hidden note stays hidden only while its words are the ones that were hidden (its numbers have not changed). */
export function isHidden(hidden: HiddenNotes, n: Notice): boolean {
  return hidden[noteKey(n)]?.includes(n.message) === true;
}

export interface HiddenNotesStore {
  /** The notes this project's person hid: key to the words they had. Reading it tracks changes. */
  of(projectId: string): HiddenNotes;
  /**
   * Hides this note for the project, next to the others already hidden. `current` is every note on
   * screen now: words hidden under the note's key that no note says any more are dropped, so a
   * number that came back to an old value is not hidden by a forgotten choice. Holds for this
   * visit when storage is missing, blocked or full.
   */
  hide(projectId: string, n: Notice, current?: readonly Notice[]): void;
  /** Brings every hidden note of the project back. */
  showAll(projectId: string): void;
  /** Forgets the project's hidden notes (it was deleted). */
  forget(projectId: string): void;
}

function parse(text: string | null): Record<string, string[]> {
  if (text === null) {
    return {};
  }
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) {
      return {};
    }
    // 0.21.0 kept one string per key; a list of strings is the current form
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") {
        out[key] = [value];
      } else if (Array.isArray(value)) {
        const words = value.filter((w): w is string => typeof w === "string");
        if (words.length > 0) {
          out[key] = words;
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Which notes a person hid, per project, in localStorage under its own key (never in the project
 * file: hiding a note is the viewer's, not part of the design that is shared). Every storage call
 * is wrapped; with no storage the hiding holds for this visit only.
 */
export function createHiddenNotesStore(
  storage: Storage | null = defaultStorage(),
): HiddenNotesStore {
  const cache = signal<Record<string, Record<string, string[]>>>({});
  const read = (id: string): Record<string, string[]> => {
    try {
      return parse(storage?.getItem(KEY_PREFIX + id) ?? null);
    } catch {
      return {};
    }
  };
  const write = (id: string, value: Record<string, string[]>): void => {
    cache.value = { ...cache.value, [id]: value };
    try {
      if (Object.keys(value).length === 0) {
        storage?.removeItem(KEY_PREFIX + id);
      } else {
        storage?.setItem(KEY_PREFIX + id, JSON.stringify(value));
      }
    } catch {
      // full or blocked: it holds for this visit
    }
  };
  const get = (id: string): Record<string, string[]> => cache.value[id] ?? read(id);
  return {
    of: get,
    hide: (id, n, current) => {
      const key = noteKey(n);
      const kept = (get(id)[key] ?? []).filter(
        (words) =>
          words !== n.message &&
          (current === undefined || current.some((c) => noteKey(c) === key && c.message === words)),
      );
      write(id, { ...get(id), [key]: [...kept, n.message] });
    },
    showAll: (id) => write(id, {}),
    forget: (id) => write(id, {}),
  };
}
