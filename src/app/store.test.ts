// src/app/store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject, updateBox } from "./actions";
import { inputsHash } from "../model/hash";
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
});
