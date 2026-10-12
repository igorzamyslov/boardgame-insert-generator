// src/app/store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject, updateBox } from "./actions";
import { NOTICE_CODES } from "../layout";
import { inputsHash } from "../model/hash";
import type { Lock, Notice } from "../model/types";
import { STORAGE_PREFIX, createProjectStore, encodeHash } from "../share";
import { DEBOUNCE_MS } from "./runner";
import { CONFLICT_CODE, SAVE_DEBOUNCE_MS } from "./persistence";
import { connectWindow, createAppStore } from "./store";
import { MemoryStorage } from "../test-support/memory-storage";
import {
  EMPTY_FOREIGN,
  fixtureProject,
  flush,
  makeLayout,
  makeResult,
  stubLayoutClient,
  withoutLayout,
} from "./test-helpers";

function setup() {
  const stub = stubLayoutClient();
  const projectStore = createProjectStore(new MemoryStorage());
  const store = createAppStore({
    projectStore,
    loadLayoutClient: () => Promise.resolve(stub.client),
    replaceHash: vi.fn(),
    confirm: () => true,
  });
  return { store, stub, projectStore };
}

describe("app store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never re-optimizes on load when a layout is stored, even if stale", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    store.start(encodeHash({ ...p, layout: makeLayout("not-the-current-hash") }, EMPTY_FOREIGN));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);
    await flush();
    expect(stub.calls).toHaveLength(0);
    expect(store.state.stale.value).toBe(true);
  });

  it("optimizes a project without a layout right after loading", async () => {
    const { store, stub } = setup();
    store.start(encodeHash(withoutLayout(fixtureProject()), EMPTY_FOREIGN));
    await flush();
    expect(stub.calls).toHaveLength(1);
  });

  it("renaming saves but does not re-optimize", async () => {
    const { store, stub, projectStore } = setup();
    const p = fixtureProject();
    store.start(encodeHash({ ...p, layout: makeLayout(inputsHash(p)) }, EMPTY_FOREIGN));
    store.edit((q) => renameProject(q, "Renamed"));
    await vi.advanceTimersByTimeAsync(Math.max(DEBOUNCE_MS, SAVE_DEBOUNCE_MS) * 2);
    await flush();
    expect(stub.calls).toHaveLength(0);
    expect(projectStore.list().find((e) => e.id === p.id)?.name).toBe("Renamed");
  });

  it("re-optimizes after an input edit and undo restores the previous layout", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    const first = makeLayout(inputsHash(p));
    store.start(encodeHash({ ...p, layout: first }, EMPTY_FOREIGN));
    const loaded = store.state.project.value.layout;
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    const call = stub.calls[0];
    expect(call?.warmStart).toEqual(loaded);
    const next = makeLayout(call?.input.inputsHash ?? "");
    call?.resolve(makeResult(next));
    await flush();
    expect(store.state.project.value.layout).toBe(next);
    store.undo();
    expect(store.state.project.value.layout).toEqual(first);
    expect(store.state.undoSlot.value).toBeNull();
    expect(store.state.stale.value).toBe(true);
  });

  it("undo restores the locks a run pruned, so the restored layout is fresh", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    const locks: Lock[] = [
      { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
      { kind: "size", trayKey: "b:p0:0", w: 50, d: 40, h: 20 },
    ];
    const withLocks = { ...p, locks };
    const first = makeLayout(inputsHash(withLocks));
    store.start(encodeHash({ ...withLocks, layout: first }, EMPTY_FOREIGN));
    store.reoptimize();
    await flush();
    const call = stub.calls[0];
    const notice: Notice = {
      level: "warning",
      code: NOTICE_CODES.lockDropped,
      message: "dropped",
      path: "/locks/1",
    };
    call?.resolve(makeResult(makeLayout(call.input.inputsHash), { notices: [notice] }));
    await flush();
    expect(store.state.project.value.locks).toEqual([locks[0]]);
    store.undo();
    expect(store.state.project.value.locks).toEqual(locks);
    expect(store.state.project.value.layout).toEqual(first);
    expect(store.state.stale.value).toBe(false);
  });

  it("opens a pasted link on hashchange and flushes on pagehide", () => {
    const { store, projectStore } = setup();
    store.start("");
    const other = fixtureProject();
    const win = Object.assign(new EventTarget(), { location: { hash: "" } });
    const disconnect = connectWindow(store, win as unknown as Window);
    win.location.hash = encodeHash(other, EMPTY_FOREIGN);
    win.dispatchEvent(new Event("hashchange"));
    expect(store.state.project.value.id).toBe(other.id);
    store.edit((q) => renameProject(q, "Before leaving"));
    win.dispatchEvent(new Event("pagehide"));
    expect(projectStore.list().find((e) => e.id === other.id)?.name).toBe("Before leaving");
    disconnect();
  });

  it("disconnect removes the window listeners", () => {
    const { store } = setup();
    const onExternalChange = vi.spyOn(store, "onExternalChange");
    const openFromHash = vi.spyOn(store, "openFromHash");
    const flushSave = vi.spyOn(store, "flushSave");
    const win = Object.assign(new EventTarget(), { location: { hash: "" } });
    const disconnect = connectWindow(store, win as unknown as Window);
    disconnect();
    win.dispatchEvent(Object.assign(new Event("storage"), { key: `${STORAGE_PREFIX}index` }));
    win.dispatchEvent(new Event("hashchange"));
    win.dispatchEvent(new Event("pagehide"));
    expect(onExternalChange).not.toHaveBeenCalled();
    expect(openFromHash).not.toHaveBeenCalled();
    expect(flushSave).not.toHaveBeenCalled();
  });

  it("reacts to storage events of this app only", () => {
    const shared = new MemoryStorage();
    const make = () =>
      createAppStore({
        projectStore: createProjectStore(shared),
        loadLayoutClient: () => Promise.resolve(stubLayoutClient().client),
        replaceHash: vi.fn(),
        confirm: () => true,
      });
    const mine = make();
    mine.start("");
    const id = mine.state.project.value.id;
    vi.advanceTimersByTime(1000);
    const other = make();
    other.start("");
    vi.advanceTimersByTime(1000);
    other.edit((q) => renameProject(q, "From the other tab"));
    other.flushSave();
    mine.edit((q) => renameProject(q, "From this tab"));
    const win = Object.assign(new EventTarget(), { location: { hash: "" } });
    const disconnect = connectWindow(mine, win as unknown as Window);
    win.dispatchEvent(Object.assign(new Event("storage"), { key: "some-other-app:key" }));
    expect(mine.state.conflict.value).toBe(false);
    win.dispatchEvent(
      Object.assign(new Event("storage"), { key: `${STORAGE_PREFIX}project:${id}` }),
    );
    expect(mine.state.conflict.value).toBe(true);
    expect(mine.state.appNotices.value.map((n) => n.code)).toContain(CONFLICT_CODE);
    disconnect();
  });

  describe("two tabs on one project, one of them idle", () => {
    function tab(shared: MemoryStorage) {
      const stub = stubLayoutClient();
      const store = createAppStore({
        projectStore: createProjectStore(shared),
        loadLayoutClient: () => Promise.resolve(stub.client),
        replaceHash: vi.fn(),
        confirm: () => true,
      });
      const win = Object.assign(new EventTarget(), { location: { hash: "" } });
      connectWindow(store, win as unknown as Window);
      const storageEvent = (id: string): void => {
        win.dispatchEvent(
          Object.assign(new Event("storage"), { key: `${STORAGE_PREFIX}project:${id}` }),
        );
      };
      return { store, stub, storageEvent };
    }

    const stored = (shared: MemoryStorage, id: string) => {
      const r = createProjectStore(shared).load(id);
      return r?.ok ? r.project : null;
    };

    it("never runs the optimizer or saves after silently loading what the other tab saved", async () => {
      const shared = new MemoryStorage();
      const start = encodeHash(fixtureProject(), EMPTY_FOREIGN);
      const idle = tab(shared);
      idle.store.start(start);
      const editing = tab(shared);
      editing.store.start(start);
      await vi.advanceTimersByTimeAsync(1000);
      await flush();
      const id = idle.store.state.project.value.id;
      const idleCalls = idle.stub.calls.length;

      // Timing 1: the other tab saves an edit while its own run has no layout yet.
      editing.store.edit((q) => renameProject(q, "From the editing tab"));
      editing.store.flushSave();
      idle.storageEvent(id);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
      await flush();
      expect(idle.store.state.project.value.name).toBe("From the editing tab");
      expect(idle.store.state.conflict.value).toBe(false);
      expect(idle.stub.calls).toHaveLength(idleCalls);
      expect(idle.store.state.run.value.status).toBe("idle");

      // A result of the idle tab's older run arriving late must not be accepted either.
      for (const call of idle.stub.calls) {
        call.resolve(makeResult(makeLayout(call.input.inputsHash)));
      }
      await flush();
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);
      expect(idle.store.state.project.value.layout).toBeUndefined();
      expect(stored(shared, id)?.layout).toBeUndefined();
      editing.storageEvent(id);
      expect(editing.store.state.conflict.value).toBe(false);

      // Timing 2: the editing tab's run finishes and saves its layout.
      const call = editing.stub.calls[0];
      const layout = makeLayout(call?.input.inputsHash ?? "");
      call?.resolve(makeResult(layout));
      await flush();
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);
      expect(stored(shared, id)?.layout?.inputsHash).toBe(layout.inputsHash);
      idle.storageEvent(id);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
      await flush();
      expect(idle.store.state.project.value.layout?.inputsHash).toBe(layout.inputsHash);
      expect(idle.store.state.conflict.value).toBe(false);
      expect(idle.stub.calls).toHaveLength(idleCalls);
      editing.storageEvent(id);
      expect(editing.store.state.conflict.value).toBe(false);
      expect(stored(shared, id)?.name).toBe("From the editing tab");
    });
  });
});
