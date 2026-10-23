import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newComponent, newProject } from "../model/defaults";
import type { Json } from "../model/json";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import type { Project } from "../model/types";
import { VALIDATION_NOTICE_CODES, validateProject } from "../model/validate";
import { APP_VERSION } from "../model/version";
import { MemoryStorage } from "../test-support/memory-storage";
import { sampleProject } from "../test-support/sample";
import { importJsonText } from "./file";
import { splitRisers } from "../layout/risers";
import { encodeHash } from "../test-support/link";
import { decodeHash } from "./link";
import { STORAGE_PREFIX, StoreWriteError, createProjectStore } from "./store";

function named(name: string): Project {
  return { ...newProject(), name };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createProjectStore", () => {
  it("saves, lists and loads a project", () => {
    const store = createProjectStore(new MemoryStorage());
    const p = sampleProject();
    store.save(p, noForeign());
    expect(store.available).toBe(true);
    expect(store.list()).toEqual([{ id: p.id, name: p.name, updatedAt: 1_000 }]);
    const loaded = store.load(p.id);
    expect(loaded?.ok && loaded.project).toEqual({ ...p, createdWith: APP_VERSION });
  });

  it("keeps fillToTop across a save and a reload, and derives the same risers from it", () => {
    const store = createProjectStore(new MemoryStorage());
    const base = sampleProject();
    const p: Project = { ...base, settings: { ...base.settings, fillToTop: false } };
    store.save(p, noForeign());
    const loaded = store.load(p.id);
    expect(loaded?.ok && loaded.project.settings.fillToTop).toBe(false);
    // Risers are derived from the stored trays, so the reloaded layout prints the same parts.
    const same = createProjectStore(new MemoryStorage());
    same.save(base, noForeign());
    const again = same.load(base.id);
    if (!again?.ok || !base.layout) {
      throw new Error("expected the sample to load");
    }
    expect(splitRisers(again.project.layout?.trays ?? [], again.project)).toEqual(
      splitRisers(base.layout.trays, base),
    );
  });

  it("lists the most recently saved first", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = named("A");
    const b = named("B");
    store.save(a, noForeign());
    vi.setSystemTime(2_000);
    store.save(b, noForeign());
    expect(store.list().map((e) => e.name)).toEqual(["B", "A"]);
    vi.setSystemTime(3_000);
    store.save(a, noForeign());
    expect(store.list().map((e) => e.name)).toEqual(["A", "B"]);
  });

  it("updates a project with the same id in place and never touches another id", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    const b = named("B");
    store.save(a, noForeign());
    store.save(b, noForeign());
    const aJson = storage.getItem(`${STORAGE_PREFIX}project:${a.id}`);
    store.save({ ...b, name: "B renamed" }, noForeign());
    expect(
      store
        .list()
        .map((e) => e.name)
        .sort(),
    ).toEqual(["A", "B renamed"]);
    expect(storage.getItem(`${STORAGE_PREFIX}project:${a.id}`)).toBe(aJson);
  });

  it("removes a project", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = named("A");
    store.save(a, noForeign());
    store.remove(a.id);
    expect(store.list()).toEqual([]);
    expect(store.load(a.id)).toBeNull();
  });

  it("returns null for an unknown id and an error for a damaged entry", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    expect(store.load("nope")).toBeNull();
    storage.setItem(`${STORAGE_PREFIX}project:bad`, "{oops");
    expect(store.load("bad")).toEqual({ ok: false, error: expect.stringMatching(/damaged/) });
  });

  it("rebuilds a missing or corrupt index from the saved projects", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    storage.setItem(`${STORAGE_PREFIX}index`, "garbage");
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 0 }]);
    storage.removeItem(`${STORAGE_PREFIX}index`);
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 0 }]);
  });

  it("only uses keys with its prefix and leaves other keys alone", () => {
    const storage = new MemoryStorage();
    storage.setItem("other-app:data", "keep");
    const store = createProjectStore(storage);
    store.save(named("A"), noForeign());
    store.remove(store.list()[0]?.id ?? "");
    expect(storage.getItem("other-app:data")).toBe("keep");
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i) ?? "";
      expect(key === "other-app:data" || key.startsWith(STORAGE_PREFIX)).toBe(true);
    }
  });
});

describe("createProjectStore when storage is full", () => {
  it("throws StoreWriteError and keeps the previous save intact", () => {
    const p = sampleProject();
    const size = serializeProject(p, noForeign()).length;
    const store = createProjectStore(new MemoryStorage(size + 500));
    store.save(p, noForeign());
    const bigger = { ...p, name: "x".repeat(1_000) };
    expect(() => {
      store.save(bigger, noForeign());
    }).toThrow(StoreWriteError);
    const loaded = store.load(p.id);
    expect(loaded?.ok && loaded.project.name).toBe("Sample");
    expect(store.list().map((e) => e.name)).toEqual(["Sample"]);
  });

  it("rolls the project back when only the index write fails", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const p = named("Before");
    store.save(p, noForeign());
    storage.failOn = (key) => key === `${STORAGE_PREFIX}index`;
    expect(() => {
      store.save({ ...p, name: "After" }, noForeign());
    }).toThrow(StoreWriteError);
    const loaded = store.load(p.id);
    expect(loaded?.ok && loaded.project.name).toBe("Before");
  });
});

describe("createProjectStore without usable storage", () => {
  it("is unavailable when there is no storage", () => {
    const store = createProjectStore(null);
    expect(store.available).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.load("x")).toBeNull();
    expect(() => {
      store.save(newProject(), noForeign());
      store.remove("x");
    }).not.toThrow();
  });

  it("is unavailable when reading from storage throws", () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const store = createProjectStore(storage);
    expect(store.available).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.load("x")).toBeNull();
    expect(() => {
      store.save(newProject(), noForeign());
      store.remove("x");
    }).not.toThrow();
  });

  it("stays available when every write throws: reads and removes work, save fails", () => {
    const storage = new MemoryStorage();
    const seeded = createProjectStore(storage);
    const a = named("A");
    const b = named("B");
    seeded.save(a, noForeign());
    seeded.save(b, noForeign());
    storage.failOn = () => true;
    const store = createProjectStore(storage);
    expect(store.available).toBe(true);
    expect(
      store
        .list()
        .map((e) => e.name)
        .sort(),
    ).toEqual(["A", "B"]);
    const loaded = store.load(a.id);
    expect(loaded?.ok && loaded.project.name).toBe("A");
    expect(() => {
      store.save({ ...a, name: "A2" }, noForeign());
    }).toThrow(StoreWriteError);
    store.remove(b.id);
    expect(store.list().map((e) => e.name)).toEqual(["A"]);
    expect(store.load(b.id)).toBeNull();
    const still = store.load(a.id);
    expect(still?.ok && still.project.name).toBe("A");
  });

  it("gives every unavailable store its own state", () => {
    const first = createProjectStore(null);
    const second = createProjectStore(null);
    expect(first).not.toBe(second);
    first.available = true;
    first.list = () => [{ id: "x", name: "X", updatedAt: 1 }];
    expect(second.available).toBe(false);
    expect(second.list()).toEqual([]);
    expect(createProjectStore(null).available).toBe(false);
  });

  it("does not write anything when it is created", () => {
    const storage = new MemoryStorage();
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    createProjectStore(storage);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.length).toBe(0);
  });
});

const INDEX = `${STORAGE_PREFIX}index`;
const projectKey = (id: string): string => `${STORAGE_PREFIX}project:${id}`;

describe("createProjectStore with a damaged index", () => {
  it("skips index entries that have no stored project", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    storage.setItem(
      INDEX,
      JSON.stringify([
        { id: a.id, name: "A", updatedAt: 5 },
        { id: "ghost", name: "Ghost", updatedAt: 9 },
      ]),
    );
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 5 }]);
    expect(store.load("ghost")).toBeNull();
  });

  it("lists stored projects the index does not mention", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    const b = named("B");
    store.save(a, noForeign());
    vi.setSystemTime(2_000);
    store.save(b, noForeign());
    storage.setItem(INDEX, JSON.stringify([{ id: b.id, name: "B", updatedAt: 2_000 }]));
    expect(store.list()).toEqual([
      { id: b.id, name: "B", updatedAt: 2_000 },
      { id: a.id, name: "A", updatedAt: 0 },
    ]);
  });

  it("ignores malformed and duplicate index entries and non-array indexes", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    storage.setItem(
      INDEX,
      JSON.stringify([
        null,
        7,
        "x",
        { id: a.id, name: 3, updatedAt: 1 },
        { id: a.id, name: "A", updatedAt: 4 },
        { id: a.id, name: "A again", updatedAt: 8 },
      ]),
    );
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 4 }]);
    storage.setItem(INDEX, '{"id":"x"}');
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 0 }]);
    storage.setItem(INDEX, "null");
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 0 }]);
  });

  it("repairs the index on the next save without losing other projects", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    storage.setItem(INDEX, "garbage");
    store.save(named("B"), noForeign());
    expect(
      store
        .list()
        .map((e) => e.name)
        .sort(),
    ).toEqual(["A", "B"]);
    expect(() => {
      JSON.parse(storage.getItem(INDEX) ?? "");
    }).not.toThrow();
  });
});

describe("createProjectStore with a project from a newer minor", () => {
  it("keeps foreign parts and extras and saves them back byte for byte", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const file = JSON.parse(serializeProject(sampleProject(), noForeign())) as Json;
    file.schemaVersion = "0.2.5";
    file.theme = { colours: ["dark"] };
    (file.box as Json).lidColour = "blue";
    (file.components as Json[]).splice(1, 0, { kind: "dial", id: "dial0001", ring: { n: 1 } });
    (file.settings as Json).leftover = "hollow";
    (file.locks as Json[]).push({ kind: "magnet", trayKey: "x", strength: 3 });
    const opened = parseProject(file);
    if (!opened.ok) {
      throw new Error(`expected the file to open: ${opened.error}`);
    }
    const key = projectKey(opened.project.id);
    store.save(opened.project, opened.foreign);
    const saved = storage.getItem(key);
    expect(JSON.parse(saved ?? "null")).toEqual(file);

    const loaded = store.load(opened.project.id);
    if (!loaded?.ok) {
      throw new Error("expected the autosave to load");
    }
    expect(loaded.project.schemaVersion).toBe("0.2.5");
    expect(loaded.project).toHaveProperty("theme", { colours: ["dark"] });
    expect(loaded.project.box).toHaveProperty("lidColour", "blue");
    expect(loaded.foreign).toEqual(opened.foreign);
    expect(loaded.foreign.components).toEqual([
      { index: 1, raw: { kind: "dial", id: "dial0001", ring: { n: 1 } } },
    ]);
    expect(loaded.foreign.values).toEqual([
      { path: "/settings/leftover", raw: "hollow" },
      { path: "/locks/3", raw: { kind: "magnet", trayKey: "x", strength: 3 } },
    ]);
    expect(serializeProject(loaded.project, loaded.foreign)).toBe(saved);
    store.save(loaded.project, loaded.foreign);
    expect(storage.getItem(key)).toBe(saved);
  });
});

describe("createProjectStore ids", () => {
  it("takes the id from the storage key, so saving never forks a second entry", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const stored = JSON.parse(serializeProject(named("Stored"), noForeign())) as Record<
      string,
      unknown
    >;
    storage.setItem(projectKey("idless"), JSON.stringify({ ...stored, id: undefined }));
    storage.setItem(projectKey("keyed"), JSON.stringify({ ...stored, id: "other" }));
    storage.setItem(projectKey("blank"), JSON.stringify({ ...stored, id: "" }));

    for (const id of ["idless", "keyed", "blank"]) {
      const loaded = store.load(id);
      if (!loaded?.ok) {
        throw new Error(`expected ${id} to load`);
      }
      expect(loaded.project.id).toBe(id);
      store.save(loaded.project, loaded.foreign);
    }
    expect(
      store
        .list()
        .map((e) => e.id)
        .sort(),
    ).toEqual(["blank", "idless", "keyed"]);
  });
});

describe("createProjectStore and the spec §5 upper bounds", () => {
  it("loads an autosave over the bounds, which links and files refuse", () => {
    const store = createProjectStore(new MemoryStorage());
    const p = named("Big");
    p.components = Array.from({ length: 101 }, () => newComponent("custom"));
    store.save(p, noForeign());

    const loaded = store.load(p.id);
    if (!loaded?.ok) {
      throw new Error("expected the autosave to load");
    }
    expect(loaded.project.components).toHaveLength(101);
    expect(validateProject(loaded.project).map((n) => n.code)).toContain(
      VALIDATION_NOTICE_CODES.limit.components,
    );

    const refused = /Too many items \(101\)/;
    const file = importJsonText(serializeProject(p, noForeign()));
    expect(file.ok ? "loaded" : file.error).toMatch(refused);
    const link = decodeHash(encodeHash(p, noForeign()));
    expect(link.ok ? "loaded" : link.error).toMatch(refused);
  });

  it("still refuses a stored project with corrupt structure", () => {
    const store = createProjectStore(new MemoryStorage());
    const p = named("Twins");
    const c = newComponent("custom");
    p.components = [c, { ...c }];
    store.save(p, noForeign());
    const loaded = store.load(p.id);
    expect(loaded?.ok ? "loaded" : loaded?.error).toMatch(/share the id/);
  });
});

describe("createProjectStore with damaged project entries", () => {
  it("lists every unlisted project key by its id, whatever its content", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    storage.setItem(projectKey("bad"), "{oops");
    storage.setItem(projectKey("scalar"), "42");
    storage.setItem(projectKey("nameless"), "{}");
    storage.setItem(projectKey("named"), '{"name":"Readable"}');
    expect(store.list().map((e) => [e.id, e.name])).toEqual([
      ["bad", "bad"],
      ["named", "Readable"],
      ["nameless", "nameless"],
      ["scalar", "scalar"],
    ]);
    expect(store.load("bad")).toEqual({ ok: false, error: expect.stringMatching(/damaged/) });
    expect(store.load("scalar")?.ok).toBe(false);
  });

  it("lets the user remove an unlisted damaged entry to recover space", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    storage.setItem(projectKey("bad"), "{oops");
    expect(store.list().map((e) => e.id)).toEqual(["bad"]);
    store.remove("bad");
    expect(storage.getItem(projectKey("bad"))).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("keeps a listed but damaged entry visible so it can be removed", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    storage.setItem(projectKey("bad"), "{oops");
    storage.setItem(INDEX, JSON.stringify([{ id: "bad", name: "Bad", updatedAt: 1 }]));
    expect(store.list()).toEqual([{ id: "bad", name: "Bad", updatedAt: 1 }]);
    expect(store.load("bad")).toEqual({ ok: false, error: expect.stringMatching(/damaged/) });
    store.remove("bad");
    expect(store.list()).toEqual([]);
  });

  it("returns an error result for valid JSON that is not a project", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    storage.setItem(projectKey("odd"), "[1,2]");
    const result = store.load("odd");
    expect(result?.ok).toBe(false);
  });
});

describe("createProjectStore when storage calls throw", () => {
  const boom = (): never => {
    throw new DOMException("blocked", "SecurityError");
  };

  it("treats a throwing getItem as unreadable and refuses to save", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    vi.spyOn(storage, "getItem").mockImplementation(boom);
    expect(store.list()).toEqual([{ id: a.id, name: a.id, updatedAt: 0 }]);
    expect(store.load(a.id)).toBeNull();
    expect(() => {
      store.save({ ...a, name: "B" }, noForeign());
    }).toThrow(StoreWriteError);
    vi.restoreAllMocks();
    const loaded = store.load(a.id);
    expect(loaded?.ok && loaded.project.name).toBe("A");
  });

  it("falls back to the index when key() throws, and to an empty list without one", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    vi.spyOn(storage, "key").mockImplementation(boom);
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 1_000 }]);
    storage.removeItem(INDEX);
    expect(store.list()).toEqual([]);
  });

  it("keeps the project when removeItem throws", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    vi.spyOn(storage, "removeItem").mockImplementation(boom);
    expect(() => {
      store.remove(a.id);
    }).not.toThrow();
    expect(store.list().map((e) => e.name)).toEqual(["A"]);
    expect(store.load(a.id)?.ok).toBe(true);
  });

  it("still removes the project when the index cannot be rewritten", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    storage.failOn = (key) => key === INDEX;
    expect(() => {
      store.remove(a.id);
    }).not.toThrow();
    expect(storage.getItem(projectKey(a.id))).toBeNull();
    expect(store.list()).toEqual([]);
    expect(store.load(a.id)).toBeNull();
  });

  it("does not throw from list, load or remove when every call throws", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    store.save(named("A"), noForeign());
    vi.spyOn(storage, "getItem").mockImplementation(boom);
    vi.spyOn(storage, "setItem").mockImplementation(boom);
    vi.spyOn(storage, "removeItem").mockImplementation(boom);
    vi.spyOn(storage, "key").mockImplementation(boom);
    expect(store.list()).toEqual([]);
    expect(store.load("x")).toBeNull();
    expect(() => {
      store.remove("x");
    }).not.toThrow();
    expect(() => {
      store.save(named("B"), noForeign());
    }).toThrow(StoreWriteError);
  });

  it("is unavailable when reading the global localStorage throws", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: boom });
    try {
      const store = createProjectStore();
      expect(store.available).toBe(false);
      expect(store.list()).toEqual([]);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });
});

describe("createProjectStore rollback details", () => {
  it("removes a new project again when only the index write fails", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const p = named("New");
    storage.failOn = (key) => key === INDEX;
    expect(() => {
      store.save(p, noForeign());
    }).toThrow(StoreWriteError);
    expect(storage.getItem(projectKey(p.id))).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("restores the previous index and leaves other projects untouched on failure", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    const b = named("B");
    store.save(a, noForeign());
    store.save(b, noForeign());
    const before = [storage.getItem(INDEX), storage.getItem(projectKey(a.id))];
    storage.failOn = (key) => key === INDEX;
    expect(() => {
      store.save({ ...b, name: "B2" }, noForeign());
    }).toThrow(StoreWriteError);
    expect([storage.getItem(INDEX), storage.getItem(projectKey(a.id))]).toEqual(before);
    expect(
      store
        .list()
        .map((e) => e.name)
        .sort(),
    ).toEqual(["A", "B"]);
  });
});

describe("createProjectStore ordering, namespacing and errors", () => {
  it("lists the later save first when two saves share a timestamp", () => {
    const store = createProjectStore(new MemoryStorage());
    vi.spyOn(Date, "now").mockReturnValue(5_000);
    store.save(named("First"), noForeign());
    store.save(named("Second"), noForeign());
    store.save(named("Third"), noForeign());
    expect(store.list().map((e) => e.name)).toEqual(["Third", "Second", "First"]);
    store.save(named("Fourth"), noForeign());
    expect(store.list().map((e) => e.name)).toEqual(["Fourth", "Third", "Second", "First"]);
  });

  it("orders rebuilt entries by id, after entries from the index", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    for (const id of ["c", "a", "b"]) {
      storage.setItem(projectKey(id), `{"name":"${id}"}`);
    }
    expect(store.list().map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("only reads the keys that were asked for once per list", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    store.save(named("A"), noForeign());
    store.save(named("B"), noForeign());
    const getItem = vi.spyOn(storage, "getItem");
    store.list();
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(INDEX);
  });

  it("ignores keys outside its namespace when rebuilding", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    storage.removeItem(INDEX);
    storage.setItem("other-app:project:zzz", '{"name":"Other"}');
    storage.setItem(`${STORAGE_PREFIX}index2`, "[]");
    storage.setItem(`${STORAGE_PREFIX}projectX`, '{"name":"X"}');
    storage.setItem(`${STORAGE_PREFIX}probe`, "1");
    expect(store.list()).toEqual([{ id: a.id, name: "A", updatedAt: 0 }]);
  });

  it("names its error class", () => {
    const error = new StoreWriteError("x");
    expect(error.name).toBe("StoreWriteError");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StoreWriteError);
  });

  it("attaches both errors when the rollback fails as well", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const p = named("Before");
    store.save(p, noForeign());
    // Every write fails except the project's own, so the index write fails and
    // so does the rollback that puts the old project text back.
    let projectWrites = 0;
    storage.failOn = (key) => {
      if (key === projectKey(p.id)) {
        projectWrites++;
        return projectWrites > 1;
      }
      return key === INDEX;
    };
    let caught: unknown;
    try {
      store.save({ ...p, name: "After" }, noForeign());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StoreWriteError);
    const cause = (caught as StoreWriteError).cause as { write: unknown; restore: unknown };
    expect(cause.write).toBeInstanceOf(DOMException);
    expect(cause.restore).toBeInstanceOf(DOMException);
  });

  it("keeps the plain write error as the cause when the rollback works", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    storage.failOn = (key) => key === INDEX;
    let caught: unknown;
    try {
      store.save(named("X"), noForeign());
    } catch (e) {
      caught = e;
    }
    expect((caught as StoreWriteError).cause).toBeInstanceOf(DOMException);
  });

  it("does not rewrite the index when reading it threw", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    const b = named("B");
    store.save(a, noForeign());
    store.save(b, noForeign());
    const indexBefore = storage.getItem(INDEX);
    const realGet = storage.getItem.bind(storage);
    vi.spyOn(storage, "getItem").mockImplementation((key) => {
      if (key === INDEX) {
        throw new DOMException("blocked", "SecurityError");
      }
      return realGet(key);
    });
    const setItem = vi.spyOn(storage, "setItem");
    store.remove(a.id);
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(projectKey(a.id))).toBeNull();
    vi.restoreAllMocks();
    expect(storage.getItem(INDEX)).toBe(indexBefore);
    expect(store.list().map((e) => e.name)).toEqual(["B"]);
  });

  it("refuses to save when the index can't be read, and writes nothing", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    const before = [storage.getItem(INDEX), storage.getItem(projectKey(a.id))];
    const realGet = storage.getItem.bind(storage);
    vi.spyOn(storage, "getItem").mockImplementation((key) => {
      if (key === INDEX) {
        throw new DOMException("blocked", "SecurityError");
      }
      return realGet(key);
    });
    const setItem = vi.spyOn(storage, "setItem");
    const removeItem = vi.spyOn(storage, "removeItem");
    expect(() => {
      store.save({ ...a, name: "A2" }, noForeign());
    }).toThrow(StoreWriteError);
    expect(() => {
      store.save(named("B"), noForeign());
    }).toThrow(StoreWriteError);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect([storage.getItem(INDEX), storage.getItem(projectKey(a.id))]).toEqual(before);
    expect(storage.length).toBe(2);
  });
});
