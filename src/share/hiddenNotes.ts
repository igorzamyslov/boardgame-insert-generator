import { signal } from "@preact/signals";
import { isRecord } from "../model/json";
import type { Notice } from "../model/types";
import { STORAGE_PREFIX, defaultStorage } from "./store";

const KEY_PREFIX = `${STORAGE_PREFIX}hidden-notes:`;

/** What a notice is called when it is hidden: its code and field, so another tray's note is another note. */
export function noteKey(n: Pick<Notice, "code" | "path">): string {
  return `${n.code}|${n.path ?? ""}`;
}

/** A hidden note stays hidden only while its words are the ones that were hidden (its numbers have not changed). */
export function isHidden(hidden: Readonly<Record<string, string>>, n: Notice): boolean {
  return hidden[noteKey(n)] === n.message;
}

export interface HiddenNotesStore {
  /** The notes this project's person hid: key to the words they had. Reading it tracks changes. */
  of(projectId: string): Readonly<Record<string, string>>;
  /** Hides this note for the project. Holds for this visit when storage is missing, blocked or full. */
  hide(projectId: string, n: Notice): void;
  /** Brings every hidden note of the project back. */
  showAll(projectId: string): void;
  /** Forgets the project's hidden notes (it was deleted). */
  forget(projectId: string): void;
}

function parse(text: string | null): Record<string, string> {
  if (text === null) {
    return {};
  }
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
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
  const cache = signal<Record<string, Record<string, string>>>({});
  const read = (id: string): Record<string, string> => {
    try {
      return parse(storage?.getItem(KEY_PREFIX + id) ?? null);
    } catch {
      return {};
    }
  };
  const write = (id: string, value: Record<string, string>): void => {
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
  const get = (id: string): Record<string, string> => cache.value[id] ?? read(id);
  return {
    of: get,
    hide: (id, n) => write(id, { ...get(id), [noteKey(n)]: n.message }),
    showAll: (id) => write(id, {}),
    forget: (id) => write(id, {}),
  };
}
