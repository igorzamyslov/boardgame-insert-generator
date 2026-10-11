import { parseProject, serializeProject } from "../model/schema";
import type { ForeignData, ParseResult, Project } from "../model/types";

/** Every localStorage key this app uses starts with this. */
export const STORAGE_PREFIX = "insert-generator:";
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const PROJECT_PREFIX = `${STORAGE_PREFIX}project:`;

export interface ProjectListEntry {
  id: string;
  name: string;
  updatedAt: number;
}

export interface ProjectStore {
  list(): ProjectListEntry[];
  load(id: string): ParseResult | null;
  save(p: Project, foreign: ForeignData): void;
  remove(id: string): void;
  /**
   * True when storage is readable (it exists and reading from it doesn't
   * throw). It says nothing about free space: when storage is full, list(),
   * load() and remove() keep working and save() throws StoreWriteError (the UI
   * shows that as "autosave failed"). False means storage is missing or
   * blocked: list() is empty, load() is null, and save() and remove() do nothing.
   */
  available: boolean;
}

/** Thrown by save() when the browser refuses the write (usually: storage full). Nothing is half-written. */
export class StoreWriteError extends Error {
  override name = "StoreWriteError";
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Some browsers throw on access when site data is blocked.
    return null;
  }
}

/** Storage is usable when it exists and can be read; it is never written to here. */
function isReadable(storage: Storage | null | undefined): storage is Storage {
  if (!storage) {
    return false;
  }
  try {
    storage.getItem(INDEX_KEY);
    return true;
  } catch {
    return false;
  }
}

function isEntry(x: unknown): x is ProjectListEntry {
  if (typeof x !== "object" || x === null) {
    return false;
  }
  const e = x as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.name === "string" && typeof e.updatedAt === "number";
}

/** A fresh object per call, so no consumer can change what another one sees. */
function unavailableStore(): ProjectStore {
  return {
    list: () => [],
    load: () => null,
    save: () => undefined,
    remove: () => undefined,
    available: false,
  };
}

/**
 * The local project list (spec §8.4): one key per project plus an index of
 * { id, name, updatedAt }. Projects are keyed by id, so saving one project
 * never touches another; saving an existing id updates it in place.
 * Every storage call is wrapped: when storage is missing or blocked,
 * `available` is false and the store does nothing; a full storage stays
 * available (readable) and only save() fails. Only save() throws
 * (StoreWriteError); a damaged index or entry never makes any method throw.
 */
export function createProjectStore(storage: Storage | null = defaultStorage()): ProjectStore {
  if (!isReadable(storage)) {
    return unavailableStore();
  }
  const s = storage;

  function read(key: string): string | null {
    try {
      return s.getItem(key);
    } catch {
      return null;
    }
  }

  /**
   * The valid, de-duplicated entries of the index, oldest save first; empty
   * when it is missing or corrupt, and null when reading it threw.
   */
  function readIndexEntries(): ProjectListEntry[] | null {
    let text: string | null;
    try {
      text = s.getItem(INDEX_KEY);
    } catch {
      return null;
    }
    if (text === null) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set<string>();
    const entries: ProjectListEntry[] = [];
    for (const item of parsed as unknown[]) {
      if (isEntry(item) && !seen.has(item.id)) {
        seen.add(item.id);
        entries.push({ id: item.id, name: item.name, updatedAt: item.updatedAt });
      }
    }
    return entries;
  }

  /** Ids of all stored projects, from the project keys themselves; null when the scan throws. */
  function storedProjectIds(): Set<string> | null {
    const ids = new Set<string>();
    try {
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if (key?.startsWith(PROJECT_PREFIX)) {
          ids.add(key.slice(PROJECT_PREFIX.length));
        }
      }
    } catch {
      return null;
    }
    return ids;
  }

  /** The name stored in a project entry; the id when it is unreadable or has no name. */
  function nameOfStored(id: string): string {
    try {
      const parsed = JSON.parse(read(PROJECT_PREFIX + id) ?? "null") as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        const name = (parsed as Record<string, unknown>).name;
        if (typeof name === "string") {
          return name;
        }
      }
    } catch {
      // Damaged entry: listed by id so the user can remove it.
    }
    return id;
  }

  /**
   * The entries to show, newest save first: the index entries whose project
   * still exists (the index is in save order, so ties go to the later save),
   * then every stored project key the index doesn't list (missing or corrupt
   * index, interrupted write, damaged entry) by id, with updatedAt 0. If the
   * key scan throws, only the index is used.
   */
  function currentEntries(): ProjectListEntry[] {
    const stored = storedProjectIds();
    const indexed = (readIndexEntries() ?? [])
      .filter((e) => stored === null || stored.has(e.id))
      .reverse();
    if (stored === null) {
      return indexed;
    }
    const listed = new Set(indexed.map((e) => e.id));
    const unlisted = [...stored]
      .filter((id) => !listed.has(id))
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
      .map((id) => ({ id, name: nameOfStored(id), updatedAt: 0 }));
    return [...indexed, ...unlisted];
  }

  function writeError(name: string, cause: unknown): StoreWriteError {
    return new StoreWriteError(`Couldn't save "${name}": browser storage is full or blocked.`, {
      cause,
    });
  }

  /** Puts a key back as it was; returns the error if that fails too. */
  function restore(key: string, previous: string | null): unknown {
    try {
      if (previous === null) {
        s.removeItem(key);
      } else {
        s.setItem(key, previous);
      }
      return undefined;
    } catch (e) {
      return e ?? new Error("restore failed");
    }
  }

  return {
    available: true,

    list() {
      // Stable sort: equal times keep the order from currentEntries().
      return currentEntries().sort((a, b) => b.updatedAt - a.updatedAt);
    },

    load(id) {
      const text = read(PROJECT_PREFIX + id);
      if (text === null) {
        return null;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { ok: false, error: "This saved project is damaged and can't be opened." };
      }
      return parseProject(raw);
    },

    save(p, foreign) {
      const key = PROJECT_PREFIX + p.id;
      const json = serializeProject(p, foreign);
      // Save order, oldest first: currentEntries() is newest first.
      const index = currentEntries()
        .filter((e) => e.id !== p.id)
        .reverse();
      index.push({ id: p.id, name: p.name, updatedAt: Date.now() });
      let previous: string | null;
      try {
        // Read directly: a failed read must not look like "no previous save".
        previous = s.getItem(key);
      } catch (e) {
        throw writeError(p.name, e);
      }
      try {
        s.setItem(key, json);
      } catch (e) {
        throw writeError(p.name, e);
      }
      try {
        s.setItem(INDEX_KEY, JSON.stringify(index));
      } catch (e) {
        const restoreError = restore(key, previous);
        throw writeError(
          p.name,
          restoreError === undefined ? e : { write: e, restore: restoreError },
        );
      }
    },

    remove(id) {
      try {
        // Project first: it can be freed even when the index can't be rewritten.
        s.removeItem(PROJECT_PREFIX + id);
      } catch {
        // Still stored and listed; the user can retry.
        return;
      }
      const entries = readIndexEntries();
      if (entries === null) {
        // The index couldn't be read: don't overwrite it with a guess.
        return;
      }
      try {
        s.setItem(INDEX_KEY, JSON.stringify(entries.filter((e) => e.id !== id)));
      } catch {
        // A stale index entry is harmless: list() skips entries without a project.
      }
    },
  };
}
