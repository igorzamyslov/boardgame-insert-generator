// src/app/persistence.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { SCHEMA_NOTICE_CODES } from "../model/schema";
import { createProjectStore, encodeHash } from "../share";
import type { ProjectStore } from "../share";
import {
  CONFLICT_CODE,
  OPEN_FAILED_CODE,
  SAVE_DEBOUNCE_MS,
  SAVE_FAILED_CODE,
  STORAGE_UNAVAILABLE_CODE,
  createPersistence,
} from "./persistence";
import { createState } from "./state";
import { MemoryStorage } from "../test-support/memory-storage";
import { EMPTY_FOREIGN, fixtureProject, makeLayout } from "./test-helpers";

function tab(projectStore: ProjectStore, confirm = vi.fn(() => true)) {
  const state = createState(fixtureProject());
  const replaceHash = vi.fn<(hash: string) => void>();
  const hooks = { onClosing: vi.fn(), onOpened: vi.fn() };
  const persistence = createPersistence(state, { projectStore, replaceHash, confirm }, hooks);
  return { state, persistence, replaceHash, hooks, confirm };
}

function rename(state: ReturnType<typeof createState>, name: string): void {
  state.project.value = { ...state.project.value, name };
}

describe("persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a fresh project when there is no hash and nothing stored", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    expect(t.state.project.value.components).toEqual([]);
    expect(store.list().map((e) => e.id)).toEqual([t.state.project.value.id]);
    expect(t.replaceHash).toHaveBeenLastCalledWith(expect.stringMatching(/^#1\./));
    expect(t.hooks.onOpened).toHaveBeenCalledTimes(1);
  });

  it("opens a shared link with its stored layout", () => {
    const store = createProjectStore(new MemoryStorage());
    const p = fixtureProject();
    const shared: Project = { ...p, layout: makeLayout(inputsHash(p)) };
    const t = tab(store);
    t.persistence.start(encodeHash(shared, EMPTY_FOREIGN));
    expect(t.state.project.value.id).toBe(p.id);
    expect(t.state.project.value.layout?.inputsHash).toBe(inputsHash(p));
    expect(store.load(p.id)?.ok).toBe(true);
  });

  it("falls back to the most recent project and reports a corrupt link", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    const t = tab(store);
    t.persistence.start("#1.this-is-not-a-valid-payload");
    expect(t.state.project.value.id).toBe(a.id);
    expect(t.state.appNotices.value.map((n) => n.code)).toContain(OPEN_FAILED_CODE);
  });

  it("link with an existing id and different content opens as a copy", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    const changed: Project = {
      ...a,
      name: "Shared",
      box: { ...a.box, innerWidth: a.box.innerWidth - 10 },
    };
    const t = tab(store);
    t.persistence.start(encodeHash(changed, EMPTY_FOREIGN));
    expect(t.state.project.value.id).not.toBe(a.id);
    expect(t.state.project.value.name).toBe("Shared (copy)");
    const original = store.load(a.id);
    expect(original?.ok && original.project.box.innerWidth).toBe(a.box.innerWidth);
    expect(store.list()).toHaveLength(2);
  });

  it("a link identical to the stored project just opens it", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    const t = tab(store);
    t.persistence.start(encodeHash(a, EMPTY_FOREIGN));
    expect(t.state.project.value.id).toBe(a.id);
    expect(store.list()).toHaveLength(1);
  });

  it("external save pauses autosave until the user chooses", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    const id = tab1.state.project.value.id;
    vi.advanceTimersByTime(1000);

    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    expect(tab2.state.project.value.id).toBe(id);
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "From tab 2");
    tab2.persistence.flush();

    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(true);
    expect(tab1.state.appNotices.value.map((n) => n.code)).toContain(CONFLICT_CODE);
    rename(tab1.state, "From tab 1");
    tab1.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const reader = createProjectStore(shared);
    const afterPause = reader.load(id);
    expect(afterPause?.ok && afterPause.project.name).toBe("From tab 2");

    tab1.persistence.resolveConflict("keepMine");
    const afterKeep = reader.load(id);
    expect(afterKeep?.ok && afterKeep.project.name).toBe("From tab 1");
    expect(tab1.state.conflict.value).toBe(false);
  });

  it("loading the other tab's version replaces the in-memory project", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    vi.advanceTimersByTime(1000);
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "Theirs");
    tab2.persistence.flush();
    tab1.persistence.onExternalChange();
    tab1.persistence.resolveConflict("loadTheirs");
    expect(tab1.state.project.value.name).toBe("Theirs");
    expect(tab1.state.conflict.value).toBe(false);
  });

  it("shows an autosave-failed notice when the browser refuses the write", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const t = tab(store);
    t.persistence.start("");
    const id = t.state.project.value.id;
    storage.failOn = () => true;
    rename(t.state, "Too big to store");
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const notice = t.state.appNotices.value.find((n) => n.code === SAVE_FAILED_CODE);
    expect(notice?.message).toMatch(/^Autosave failed/);
    expect(t.state.project.value.name).toBe("Too big to store");
    const kept = store.load(id);
    expect(kept?.ok && kept.project.name).not.toBe("Too big to store");
    storage.failOn = () => false;
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(t.state.appNotices.value.map((n) => n.code)).not.toContain(SAVE_FAILED_CODE);
    const saved = store.load(id);
    expect(saved?.ok && saved.project.name).toBe("Too big to store");
  });

  it("keeps working without storage", () => {
    const store = createProjectStore(null);
    expect(store.available).toBe(false);
    const t = tab(store);
    t.persistence.start("");
    expect(t.state.appNotices.value.map((n) => n.code)).toContain(STORAGE_UNAVAILABLE_CODE);
    rename(t.state, "Offline");
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(t.replaceHash).toHaveBeenCalledTimes(2);
    expect(t.state.projects.value).toEqual([]);
  });

  it("debounces autosave and updates the URL hash", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    const before = t.replaceHash.mock.calls.length;
    rename(t.state, "Typing");
    t.persistence.scheduleSave();
    t.persistence.scheduleSave();
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(t.replaceHash.mock.calls.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(t.replaceHash.mock.calls.length).toBe(before + 1);
    expect(store.list()[0]?.name).toBe("Typing");
  });

  it("deletes the current project after confirmation and opens the next", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    vi.advanceTimersByTime(1000);
    const t = tab(store);
    t.persistence.start("");
    t.persistence.newProject();
    const fresh = t.state.project.value.id;
    t.confirm.mockReturnValueOnce(false);
    t.persistence.deleteProject(fresh);
    expect(store.list()).toHaveLength(2);
    t.persistence.deleteProject(fresh);
    expect(store.list().map((e) => e.id)).toEqual([a.id]);
    expect(t.state.project.value.id).toBe(a.id);
  });

  it("imports JSON as a project and keeps the current one on bad input", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    const current = t.state.project.value.id;
    expect(t.persistence.importJson("{ not json")).toBe(false);
    expect(t.state.project.value.id).toBe(current);
    expect(t.state.appNotices.value.map((n) => n.code)).toContain(OPEN_FAILED_CODE);
    const other = fixtureProject();
    expect(t.persistence.importJson(JSON.stringify(other))).toBe(true);
    expect(t.state.project.value.id).toBe(other.id);
  });

  it("flags newer-minor files and kept foreign components", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    const p = fixtureProject();
    t.persistence.openParsed(
      {
        ok: true,
        project: p,
        foreign: { components: [{ index: 0, raw: { kind: "dice", id: "zz" } }] },
        notices: [
          {
            level: "warning",
            code: SCHEMA_NOTICE_CODES.newerMinor,
            message: "Made with app 0.2.0",
          },
          {
            level: "warning",
            code: SCHEMA_NOTICE_CODES.foreignComponent,
            path: "/components/0",
            message: "Component 1 in the file uses features this app version doesn't know.",
          },
        ],
      },
      "file",
    );
    expect(t.state.needsConfirm.value).toBe(true);
    const codes = t.state.appNotices.value.map((n) => n.code);
    expect(codes).toContain(SCHEMA_NOTICE_CODES.newerMinor);
    expect(codes).toContain(SCHEMA_NOTICE_CODES.foreignComponent);
  });
});
