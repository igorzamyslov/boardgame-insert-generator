import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newProject } from "../model/defaults";
import { noForeign, serializeProject } from "../model/schema";
import type { Project } from "../model/types";
import { APP_VERSION } from "../model/version";
import { MemoryStorage } from "../test-support/memory-storage";
import { sampleProject } from "../test-support/sample";
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

  it("is unavailable when every write throws (blocked or private-mode storage)", () => {
    const storage = new MemoryStorage();
    storage.failOn = () => true;
    const store = createProjectStore(storage);
    expect(store.available).toBe(false);
    expect(() => {
      store.save(newProject(), noForeign());
    }).not.toThrow();
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

describe("createProjectStore with damaged project entries", () => {
  it("skips an unreadable entry the index does not list", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    store.save(named("A"), noForeign());
    storage.setItem(projectKey("bad"), "{oops");
    storage.setItem(projectKey("scalar"), "42");
    storage.setItem(projectKey("nameless"), "{}");
    storage.removeItem(INDEX);
    expect(store.list().map((e) => e.name)).toEqual(["A", "nameless"]);
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

  it("treats a throwing getItem as empty and refuses to save", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const a = named("A");
    store.save(a, noForeign());
    vi.spyOn(storage, "getItem").mockImplementation(boom);
    expect(store.list()).toEqual([]);
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
