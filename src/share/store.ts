import { parseProject, serializeProject } from "../model/schema";
import type { ForeignData, ParseResult, Project } from "../model/types";

/** Every localStorage key this app uses starts with this. */
export const STORAGE_PREFIX = "insert-generator:";
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const PROJECT_PREFIX = `${STORAGE_PREFIX}project:`;
const PROBE_KEY = `${STORAGE_PREFIX}probe`;

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
  available: boolean;
}

/** Thrown by save() when the browser refuses the write (usually: storage full). Nothing is half-written. */
export class StoreWriteError extends Error {}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Some browsers throw on access when site data is blocked.
    return null;
  }
}

function probe(storage: Storage | null): storage is Storage {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
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

const UNAVAILABLE: ProjectStore = {
  list: () => [],
  load: () => null,
  save: () => undefined,
  remove: () => undefined,
  available: false,
};

/**
 * The local project list (spec §8.4): one key per project plus an index of
 * { id, name, updatedAt }. Projects are keyed by id, so saving one project
 * never touches another; saving an existing id updates it in place.
 * Every storage call is wrapped: when storage is missing or blocked,
 * `available` is false and the store does nothing. Only save() throws
 * (StoreWriteError); a damaged index or entry never makes any method throw.
 */
export function createProjectStore(storage: Storage | null = defaultStorage()): ProjectStore {
  if (!probe(storage)) {
    return UNAVAILABLE;
  }
  const s = storage;

  function read(key: string): string | null {
    try {
      return s.getItem(key);
    } catch {
      return null;
    }
  }

  /** The valid, de-duplicated entries of the index; empty when it is missing or corrupt. */
  function readIndexEntries(): ProjectListEntry[] {
    const text = read(INDEX_KEY);
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

  /** Ids of all stored projects, found from the project keys themselves. */
  function storedProjectIds(): string[] {
    const ids: string[] = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if (key?.startsWith(PROJECT_PREFIX)) {
          ids.push(key.slice(PROJECT_PREFIX.length));
        }
      }
    } catch {
      // Keep what was found; the index still lists the rest.
    }
    return ids;
  }

  /** The name of a stored project that is not in the index; null when it is unreadable. */
  function nameOfStored(id: string): string | null {
    const text = read(PROJECT_PREFIX + id);
    if (text === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const name = (parsed as Record<string, unknown>).name;
      return typeof name === "string" ? name : id;
    } catch {
      return null;
    }
  }

  /**
   * The index entries whose project still exists, plus the stored projects the
   * index doesn't list (missing or corrupt index, interrupted write), those
   * with updatedAt 0. Unreadable unlisted entries are skipped.
   */
  function currentEntries(): ProjectListEntry[] {
    const entries = readIndexEntries().filter((e) => read(PROJECT_PREFIX + e.id) !== null);
    const known = new Set(entries.map((e) => e.id));
    for (const id of storedProjectIds()) {
      if (!known.has(id)) {
        const name = nameOfStored(id);
        if (name !== null) {
          known.add(id);
          entries.push({ id, name, updatedAt: 0 });
        }
      }
    }
    return entries;
  }

  function writeError(name: string, cause: unknown): StoreWriteError {
    return new StoreWriteError(`Couldn't save "${name}": browser storage is full or blocked.`, {
      cause,
    });
  }

  function restore(key: string, previous: string | null): void {
    try {
      if (previous === null) {
        s.removeItem(key);
      } else {
        s.setItem(key, previous);
      }
    } catch {
      // Best effort: the original write already failed.
    }
  }

  return {
    available: true,

    list() {
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
      const index = currentEntries().filter((e) => e.id !== p.id);
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
        restore(key, previous);
        throw writeError(p.name, e);
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
      try {
        s.setItem(INDEX_KEY, JSON.stringify(readIndexEntries().filter((e) => e.id !== id)));
      } catch {
        // A stale index entry is harmless: list() skips entries without a project.
      }
    },
  };
}
