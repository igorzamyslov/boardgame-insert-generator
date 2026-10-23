// src/app/persistence.test.ts
import { effect } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { SCHEMA_NOTICE_CODES } from "../model/schema";
import { STORAGE_PREFIX, createProjectStore } from "../share";
import { encodeHash } from "../test-support/link";
import type { ProjectStore } from "../share";
import {
  CONFLICT_CODE,
  OPEN_FAILED_CODE,
  SAVE_DEBOUNCE_MS,
  SAVE_FAILED_CODE,
  STORAGE_UNAVAILABLE_CODE,
  UNSAVED_LEFT_CODE,
  createPersistence,
} from "./persistence";
import { createState } from "./state";
import { MemoryStorage } from "../test-support/memory-storage";
import { EMPTY_FOREIGN, fixtureProject, makeLayout } from "./test-helpers";

function tab(projectStore: ProjectStore, confirm = vi.fn(() => true)) {
  const state = createState(fixtureProject());
  const clearHash = vi.fn<() => void>();
  // the predicate a window's beforeunload handler would ask
  let warn: () => boolean = () => false;
  const guardLeaving = (shouldWarn: () => boolean): void => {
    warn = shouldWarn;
  };
  const hooks = { onClosing: vi.fn(), onOpened: vi.fn() };
  const persistence = createPersistence(
    state,
    { projectStore, clearHash, guardLeaving, confirm },
    hooks,
  );
  return { state, persistence, clearHash, warnsOnLeave: () => warn(), hooks, confirm };
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
    expect(t.clearHash).not.toHaveBeenCalled();
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

    rename(tab1.state, "From tab 1");
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(true);
    expect(tab1.state.appNotices.value.map((n) => n.code)).toContain(CONFLICT_CODE);
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

  it("a tab without edits silently shows what the other tab saved", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    const id = tab1.state.project.value.id;
    vi.advanceTimersByTime(1000);
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "Theirs");
    tab2.persistence.flush();
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(false);
    expect(tab1.state.appNotices.value.map((n) => n.code)).not.toContain(CONFLICT_CODE);
    expect(tab1.state.project.value.name).toBe("Theirs");
    // and keeps autosaving from there
    rename(tab1.state, "Mine, later");
    tab1.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const saved = createProjectStore(shared).load(id);
    expect(saved?.ok && saved.project.name).toBe("Mine, later");
  });

  it("a tab that edited and then undid its edit still shows the other tab's version silently", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    vi.advanceTimersByTime(1000);
    const original = tab1.state.project.value.name;
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "Theirs");
    tab2.persistence.flush();
    rename(tab1.state, "Edited");
    rename(tab1.state, original);
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(false);
    expect(tab1.state.project.value.name).toBe("Theirs");
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
    rename(tab1.state, "Mine");
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

  it("saveState is paused during a conflict and failed after a write error", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    vi.advanceTimersByTime(1000);
    expect(tab1.state.saveState.value).toBe("saved");
    rename(tab1.state, "Edited");
    tab1.persistence.scheduleSave();
    expect(tab1.state.saveState.value).toBe("saving");
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(tab1.state.saveState.value).toBe("saved");

    // a write error: failed until the next successful write, whatever is scheduled meanwhile
    shared.failOn = () => true;
    rename(tab1.state, "Too big");
    tab1.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(tab1.state.saveState.value).toBe("failed");
    rename(tab1.state, "Still too big");
    tab1.persistence.scheduleSave();
    expect(tab1.state.saveState.value).toBe("failed");
    shared.failOn = () => false;
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(tab1.state.saveState.value).toBe("saved");

    // the other tab saves: this tab is paused until the user chooses
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "From tab 2");
    tab2.persistence.flush();
    rename(tab1.state, "From tab 1");
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(true);
    expect(tab1.state.saveState.value).toBe("paused");
    tab1.persistence.scheduleSave();
    expect(tab1.state.saveState.value).toBe("paused");
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(tab1.state.saveState.value).toBe("paused");
    tab1.persistence.resolveConflict("keepMine");
    expect(tab1.state.saveState.value).toBe("saved");
  });

  it("saveState does not flicker when an edit reschedules a pending save", () => {
    const t = tab(createProjectStore(new MemoryStorage()));
    t.persistence.start("");
    vi.advanceTimersByTime(1000);
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(t.state.saveState.value);
    });
    rename(t.state, "One");
    t.persistence.scheduleSave();
    rename(t.state, "Two");
    t.persistence.scheduleSave();
    stop();
    expect(seen).toEqual(["saved", "saving"]);
  });

  it("saveState is unavailable without storage and saved after a project is opened", () => {
    const none = tab(createProjectStore(null));
    none.persistence.start("");
    expect(none.state.saveState.value).toBe("unavailable");
    rename(none.state, "Offline");
    none.persistence.scheduleSave();
    expect(none.state.saveState.value).toBe("unavailable");

    const storage = new MemoryStorage();
    const t = tab(createProjectStore(storage));
    t.persistence.start("");
    storage.failOn = () => true;
    rename(t.state, "Too big");
    t.persistence.flush();
    expect(t.state.saveState.value).toBe("failed");
    // opening another project starts clean: its own first write succeeds
    storage.failOn = () => false;
    t.persistence.newProject();
    expect(t.state.saveState.value).toBe("saved");
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
    expect(t.state.projects.value).toEqual([]);
  });

  it("says a file keeps the work when nothing can be stored", () => {
    const t = tab(createProjectStore(null));
    t.persistence.start("");
    const notice = t.state.appNotices.value.find((n) => n.code === STORAGE_UNAVAILABLE_CODE);
    expect(notice?.message).toContain("Save a file so your work is not lost");
    expect(notice?.message).not.toMatch(/link/i);
  });

  it("warns before leaving when nothing can be saved", () => {
    const t = tab(createProjectStore(null));
    t.persistence.start("");
    // nothing has been changed yet: a plan arriving on its own is no reason to hold the tab
    expect(t.warnsOnLeave()).toBe(false);
    t.state.project.value = { ...t.state.project.value, layout: makeLayout("some-run") };
    t.persistence.scheduleSave();
    expect(t.warnsOnLeave()).toBe(false);
    rename(t.state, "Offline");
    t.persistence.scheduleSave();
    expect(t.warnsOnLeave()).toBe(true);
    // a saved file is a copy of the work
    t.persistence.markSavedToFile();
    expect(t.warnsOnLeave()).toBe(false);
    rename(t.state, "Offline again");
    t.persistence.scheduleSave();
    expect(t.warnsOnLeave()).toBe(true);
    // a different project starts clean
    t.persistence.newProject();
    expect(t.warnsOnLeave()).toBe(false);
  });

  it("warns before leaving when storage exists but the last write failed", () => {
    const storage = new MemoryStorage();
    const t = tab(createProjectStore(storage));
    t.persistence.start("");
    expect(t.warnsOnLeave()).toBe(false);
    storage.failOn = () => true;
    rename(t.state, "Too big");
    t.persistence.flush();
    expect(t.state.saveFailed.value).toBe(true);
    expect(t.warnsOnLeave()).toBe(true);
    // a file is a copy of the work
    t.persistence.markSavedToFile();
    expect(t.warnsOnLeave()).toBe(false);
    rename(t.state, "Still too big");
    t.persistence.flush();
    expect(t.warnsOnLeave()).toBe(true);
    // the write works again: the browser keeps it
    storage.failOn = () => false;
    t.persistence.flush();
    expect(t.state.saveFailed.value).toBe(false);
    expect(t.warnsOnLeave()).toBe(false);
  });

  it("never warns before leaving when the browser keeps the work", () => {
    const t = tab(createProjectStore(new MemoryStorage()));
    t.persistence.start("");
    rename(t.state, "Stored");
    t.persistence.scheduleSave();
    expect(t.warnsOnLeave()).toBe(false);
  });

  it("clears the address bar once after reading an old link", () => {
    const t = tab(createProjectStore(new MemoryStorage()));
    t.persistence.start(encodeHash(fixtureProject(), EMPTY_FOREIGN));
    expect(t.clearHash).toHaveBeenCalledTimes(1);
    rename(t.state, "Edited");
    t.persistence.flush();
    expect(t.clearHash).toHaveBeenCalledTimes(1);
  });

  it("clears the address bar after a link that can't be read, and not when there is none", () => {
    const damaged = tab(createProjectStore(new MemoryStorage()));
    damaged.persistence.start("#1.this-is-not-a-valid-payload");
    expect(damaged.clearHash).toHaveBeenCalledTimes(1);
    const none = tab(createProjectStore(new MemoryStorage()));
    none.persistence.start("#");
    expect(none.clearHash).not.toHaveBeenCalled();
  });

  it("debounces autosave", () => {
    const store = createProjectStore(new MemoryStorage());
    const t = tab(store);
    t.persistence.start("");
    rename(t.state, "Typing");
    t.persistence.scheduleSave();
    t.persistence.scheduleSave();
    t.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(store.list()[0]?.name).not.toBe("Typing");
    vi.advanceTimersByTime(1);
    expect(store.list()[0]?.name).toBe("Typing");
  });

  it("deletes the current project (the screen asks first) and opens the next", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    vi.advanceTimersByTime(1000);
    const t = tab(store);
    t.persistence.start("");
    t.persistence.newProject();
    const fresh = t.state.project.value.id;
    t.persistence.deleteProject(fresh);
    expect(t.confirm).not.toHaveBeenCalled();
    expect(store.list().map((e) => e.id)).toEqual([a.id]);
    expect(t.state.project.value.id).toBe(a.id);
  });

  it("ends a swap and returns to the bottom layer when another project is opened", () => {
    const t = tab(createProjectStore(new MemoryStorage()));
    t.persistence.start("");
    t.state.selection.value = "a:p0:0";
    t.state.swapFrom.value = "a:p0:0";
    t.state.viewLayer.value = 2;
    t.persistence.newProject();
    expect(t.state.selection.value).toBeNull();
    expect(t.state.swapFrom.value).toBeNull();
    expect(t.state.viewLayer.value).toBeUndefined();
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

  it("opening the same project in a second tab or leaving without edits is no conflict", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    vi.advanceTimersByTime(1000);
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    tab2.persistence.flush();
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(false);
    vi.advanceTimersByTime(1000);
    tab2.persistence.flush();
    tab1.persistence.flush();
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(false);
    expect(tab1.state.appNotices.value.map((n) => n.code)).not.toContain(CONFLICT_CODE);
  });

  it("a file with the id of an unreadable stored project opens as a copy", () => {
    const storage = new MemoryStorage();
    const store = createProjectStore(storage);
    const p = fixtureProject();
    const key = `${STORAGE_PREFIX}project:${p.id}`;
    storage.setItem(key, "{ damaged, but the user may still want it");
    const t = tab(store);
    t.persistence.start("");
    expect(t.persistence.importJson(JSON.stringify(p))).toBe(true);
    expect(t.state.project.value.id).not.toBe(p.id);
    expect(t.state.project.value.name).toBe(`${p.name} (copy)`);
    expect(storage.getItem(key)).toBe("{ damaged, but the user may still want it");
  });

  it("a JSON file with an existing id and different content opens as a copy", () => {
    const store = createProjectStore(new MemoryStorage());
    const a = fixtureProject();
    store.save(a, EMPTY_FOREIGN);
    const t = tab(store);
    t.persistence.start("");
    const changed: Project = { ...a, name: "Imported" };
    expect(t.persistence.importJson(JSON.stringify(changed))).toBe(true);
    expect(t.state.project.value.id).not.toBe(a.id);
    expect(t.state.project.value.name).toBe("Imported (copy)");
    const original = store.load(a.id);
    expect(original?.ok && original.project.name).toBe(a.name);
  });

  function conflicted() {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    const id = tab1.state.project.value.id;
    vi.advanceTimersByTime(1000);
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    rename(tab2.state, "From tab 2");
    tab2.persistence.flush();
    rename(tab1.state, "From tab 1");
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(true);
    return { shared, tab1, id, reader: createProjectStore(shared) };
  }

  it("leaving a project during a conflict keeps this tab's version as a copy", () => {
    const { tab1, id, reader } = conflicted();
    tab1.persistence.newProject();
    const names = reader.list().map((e) => e.name);
    expect(names).toContain("From tab 1 (copy)");
    const theirs = reader.load(id);
    expect(theirs?.ok && theirs.project.name).toBe("From tab 2");
    expect(tab1.state.conflict.value).toBe(false);
    expect(tab1.state.appNotices.value.map((n) => n.message).join("\n")).toMatch(
      /From tab 1 \(copy\)/,
    );
  });

  it("loading theirs when their version is gone keeps mine and the conflict", () => {
    const { tab1, id, reader } = conflicted();
    reader.remove(id);
    tab1.persistence.resolveConflict("loadTheirs");
    expect(tab1.state.project.value.name).toBe("From tab 1");
    expect(tab1.state.conflict.value).toBe(true);
    expect(tab1.state.appNotices.value.map((n) => n.code)).toContain(OPEN_FAILED_CODE);
    tab1.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(reader.load(id)).toBeNull();
    tab1.persistence.resolveConflict("keepMine");
    const kept = reader.load(id);
    expect(kept?.ok && kept.project.name).toBe("From tab 1");
  });

  it("the project list shows the copy kept when leaving a conflicted project", () => {
    const { tab1, reader } = conflicted();
    const other: Project = { ...fixtureProject(), id: "other-project", name: "Other" };
    reader.save(other, EMPTY_FOREIGN);
    tab1.persistence.openProject(other.id);
    expect(tab1.state.project.value.id).toBe(other.id);
    expect(tab1.state.projects.value.map((e) => e.name)).toContain("From tab 1 (copy)");
  });

  it("a tab without edits leaves a conflict without saving a stray copy", () => {
    const shared = new MemoryStorage();
    const tab1 = tab(createProjectStore(shared));
    tab1.persistence.start("");
    vi.advanceTimersByTime(1000);
    const tab2 = tab(createProjectStore(shared));
    tab2.persistence.start("");
    vi.advanceTimersByTime(1000);
    const original = tab1.state.project.value.name;
    rename(tab2.state, "From tab 2");
    tab2.persistence.flush();
    rename(tab1.state, "Edited here");
    tab1.persistence.onExternalChange();
    expect(tab1.state.conflict.value).toBe(true);
    rename(tab1.state, original);
    tab1.persistence.newProject();
    const names = createProjectStore(shared)
      .list()
      .map((e) => e.name);
    expect(names.filter((n) => n.endsWith("(copy)"))).toEqual([]);
    expect(names).toContain("From tab 2");
  });

  it("keep mine never overwrites a stored version this app can't read", () => {
    const { shared, tab1, id, reader } = conflicted();
    const key = `${STORAGE_PREFIX}project:${id}`;
    const newer = "{ saved by a newer app in another tab";
    shared.setItem(key, newer);
    tab1.persistence.resolveConflict("keepMine");
    expect(shared.getItem(key)).toBe(newer);
    expect(tab1.state.project.value.id).not.toBe(id);
    expect(tab1.state.project.value.name).toBe("From tab 1 (copy)");
    expect(tab1.state.conflict.value).toBe(false);
    const saved = reader.load(tab1.state.project.value.id);
    expect(saved?.ok && saved.project.name).toBe("From tab 1 (copy)");
    const message = tab1.state.appNotices.value.map((n) => n.message).join("\n");
    expect(message).toMatch(/newer|unknown/);
    expect(message).toMatch(/untouched/);
  });

  it("puts the conflict notice back when an edit reaches a paused autosave", () => {
    const { tab1 } = conflicted();
    tab1.state.appNotices.value = [];
    rename(tab1.state, "Edited again");
    tab1.persistence.scheduleSave();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(tab1.state.conflict.value).toBe(true);
    expect(tab1.state.appNotices.value.map((n) => n.code)).toContain(CONFLICT_CODE);
  });

  describe("leaving a project whose last save failed", () => {
    function unsaved(confirm = vi.fn(() => false)) {
      const storage = new MemoryStorage();
      const store = createProjectStore(storage);
      const other: Project = { ...fixtureProject(), id: "other-project", name: "Other" };
      store.save(other, EMPTY_FOREIGN);
      const t = tab(store, confirm);
      t.persistence.start(encodeHash({ ...fixtureProject(), id: "mine" }, EMPTY_FOREIGN));
      vi.advanceTimersByTime(1000);
      storage.failOn = () => true;
      rename(t.state, "Unsaved edits");
      return { t, storage, store, other, confirm };
    }

    const paths: [string, (x: ReturnType<typeof unsaved>) => unknown][] = [
      ["opening another project", ({ t, other }) => t.persistence.openProject(other.id)],
      ["starting a new project", ({ t }) => t.persistence.newProject()],
      [
        "importing a file",
        ({ t }) => t.persistence.importJson(JSON.stringify({ ...fixtureProject(), id: "file" })),
      ],
    ];

    for (const [name, leave] of paths) {
      it(`asks before ${name} and stays on the project when declined`, () => {
        const x = unsaved();
        leave(x);
        expect(x.confirm).toHaveBeenCalledTimes(1);
        expect(x.confirm).toHaveBeenCalledWith(expect.stringContaining("Unsaved edits"));
        expect(x.t.state.project.value.id).toBe("mine");
        expect(x.t.state.project.value.name).toBe("Unsaved edits");
        expect(x.t.state.appNotices.value.map((n) => n.code)).toContain(SAVE_FAILED_CODE);
      });

      it(`leaves after ${name} when confirmed, and keeps a notice naming the project`, () => {
        const x = unsaved(vi.fn(() => true));
        leave(x);
        expect(x.t.state.project.value.id).not.toBe("mine");
        const left = x.t.state.appNotices.value.find((n) => n.code === UNSAVED_LEFT_CODE);
        expect(left?.message).toContain("Unsaved edits");
        expect(left?.level).toBe("warning");
      });
    }

    it("doesn't ask when the last save worked", () => {
      const x = unsaved();
      x.storage.failOn = () => false;
      x.t.persistence.newProject();
      expect(x.confirm).not.toHaveBeenCalled();
      expect(x.t.state.appNotices.value.map((n) => n.code)).not.toContain(UNSAVED_LEFT_CODE);
    });

    it("importJson reports a declined import as not opened", () => {
      const x = unsaved();
      expect(x.t.persistence.importJson(JSON.stringify({ ...fixtureProject(), id: "file" }))).toBe(
        false,
      );
    });

    it("asks too when the copy of a conflicted version can't be stored", () => {
      const { shared, tab1 } = conflicted();
      shared.failOn = () => true;
      const confirm = vi.mocked(tab1.confirm);
      confirm.mockReturnValue(false);
      tab1.persistence.newProject();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(tab1.state.project.value.name).toBe("From tab 1");
      expect(tab1.state.conflict.value).toBe(true);
    });

    it("treats a change another tab made unnoticed as a conflict and keeps this tab's edits", () => {
      const shared = new MemoryStorage();
      const tab1 = tab(createProjectStore(shared));
      tab1.persistence.start("");
      vi.advanceTimersByTime(1000);
      const tab2 = tab(createProjectStore(shared));
      tab2.persistence.start("");
      vi.advanceTimersByTime(1000);
      rename(tab2.state, "From tab 2");
      tab2.persistence.flush();
      rename(tab1.state, "From tab 1");
      // no storage event reached tab 1: leaving must still not drop its edits
      tab1.persistence.newProject();
      const names = createProjectStore(shared)
        .list()
        .map((e) => e.name);
      expect(names).toContain("From tab 1 (copy)");
      expect(names).toContain("From tab 2");
    });
  });
});
