// src/app/store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPrinter, renameProject, updateBox } from "./actions";
import { inputsHash } from "../model/hash";
import type { Lock } from "../model/types";
import { STORAGE_PREFIX, createPrefsStore, createProjectStore } from "../share";
import { encodeHash } from "../test-support/link";
import type { Printer } from "../model/types";
import { DEBOUNCE_MS, IMPROVE_FACTOR } from "./runner";
import { DEFAULT_ITERATIONS } from "../layout";
import { CONFLICT_CODE, SAVE_DEBOUNCE_MS } from "./persistence";
import { connectWindow, createAppStore } from "./store";
import { MemoryStorage } from "../test-support/memory-storage";
import {
  EMPTY_FOREIGN,
  fixtureProject,
  flush,
  makeLayout,
  makeResult,
  makeTray,
  stubLayoutClient,
  withoutLayout,
} from "./test-helpers";

function setup() {
  const stub = stubLayoutClient();
  const projectStore = createProjectStore(new MemoryStorage());
  const prefs = createPrefsStore(new MemoryStorage());
  const store = createAppStore({
    projectStore,
    prefs,
    loadLayoutClient: () => Promise.resolve(stub.client),
    clearHash: vi.fn(),
    confirm: () => true,
  });
  return { store, stub, projectStore, prefs };
}

const MY_PRINTER: Printer = { bedX: 180, bedY: 180, bedZ: 180, bedMargin: 3, layerHeight: 0.16 };

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

  it("re-optimizes after an input edit with the stored layout as warm start", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    const first = makeLayout(inputsHash(p));
    store.start(encodeHash({ ...p, layout: first }, EMPTY_FOREIGN));
    const loaded = store.state.project.value.layout;
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    expect(stub.calls[0]?.warmStart).toEqual(loaded);
  });

  it("undo after an edit restores the inputs and the plan, not stale", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    const first = makeLayout(inputsHash(p));
    store.start(encodeHash({ ...p, layout: first }, EMPTY_FOREIGN));
    const before = store.state.project.value;
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    const call = stub.calls[0];
    const next = makeLayout(call?.input.inputsHash ?? "");
    call?.resolve(makeResult(next));
    await flush();
    expect(store.state.project.value.layout).toBe(next);
    expect(store.canUndo.value).toBe(true);
    store.undo();
    expect(store.state.project.value.components).toEqual(before.components);
    expect(store.state.project.value.box).toEqual(before.box);
    expect(store.state.project.value.layout).toEqual(before.layout);
    expect(store.state.stale.value).toBe(false);
    expect(store.canUndo.value).toBe(false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await flush();
    expect(stub.calls).toHaveLength(1);
  });

  it("undo ends a swap under way, and clears a selection whose tray is not in the restored plan", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    const old = makeLayout(inputsHash(p), [makeTray({ key: "a:p0:0" })]);
    store.start(encodeHash({ ...p, layout: old }, EMPTY_FOREIGN));
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    const call = stub.calls[0];
    const next = makeLayout(call?.input.inputsHash ?? "", [
      makeTray({ key: "a:p0:0" }),
      makeTray({ key: "z:p0:0" }),
    ]);
    call?.resolve(makeResult(next));
    await flush();
    store.state.selection.value = "z:p0:0";
    store.state.swapFrom.value = "z:p0:0";
    store.undo();
    // z is not in the old plan: nothing is selected and no swap waits for a second tile
    expect(store.state.selection.value).toBeNull();
    expect(store.state.swapFrom.value).toBeNull();
    // redo, then a tray that is in both plans stays selected; only the swap ends
    store.redo();
    store.state.selection.value = "a:p0:0";
    store.state.swapFrom.value = "a:p0:0";
    store.undo();
    expect(store.state.selection.value).toBe("a:p0:0");
    expect(store.state.swapFrom.value).toBeNull();
  });

  it("redo reapplies the edit and its plan", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    store.start(encodeHash({ ...p, layout: makeLayout(inputsHash(p)) }, EMPTY_FOREIGN));
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    const edited = store.state.project.value.box;
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    const call = stub.calls[0];
    const next = makeLayout(call?.input.inputsHash ?? "");
    call?.resolve(makeResult(next));
    await flush();
    expect(store.canRedo.value).toBe(false);
    store.undo();
    expect(store.canRedo.value).toBe(true);
    store.redo();
    expect(store.state.project.value.box).toEqual(edited);
    expect(store.state.project.value.layout).toBe(next);
    expect(store.state.stale.value).toBe(false);
    expect(store.canRedo.value).toBe(false);
    expect(store.canUndo.value).toBe(true);
  });

  it("a new edit after undo drops what could be redone", () => {
    const { store } = setup();
    store.start(encodeHash(fixtureProject(), EMPTY_FOREIGN));
    store.edit((q) => renameProject(q, "One"));
    store.undo();
    expect(store.canRedo.value).toBe(true);
    store.edit((q) => renameProject(q, "Two"));
    expect(store.canRedo.value).toBe(false);
    store.redo();
    expect(store.state.project.value.name).toBe("Two");
  });

  it("a Keep searching result is one undo step", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    const first = makeLayout(inputsHash(p));
    store.start(encodeHash({ ...p, layout: first }, EMPTY_FOREIGN));
    expect(store.canUndo.value).toBe(false);
    store.refit();
    await flush();
    const call = stub.calls[0];
    const better = makeLayout(call?.input.inputsHash ?? "");
    call?.resolve(makeResult(better));
    await flush();
    expect(store.state.project.value.layout).toBe(better);
    store.undo();
    expect(store.state.project.value.layout).toEqual(first);
    expect(store.canUndo.value).toBe(false);
    store.redo();
    expect(store.state.project.value.layout).toBe(better);
  });

  it("edits made in quick succession are one undo step", async () => {
    const { store } = setup();
    const p = fixtureProject();
    store.start(encodeHash(p, EMPTY_FOREIGN));
    for (const name of ["A", "AB", "ABC"]) {
      store.edit((q) => renameProject(q, name));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(store.state.project.value.name).toBe("ABC");
    store.undo();
    expect(store.state.project.value.name).toBe(p.name);
    expect(store.canUndo.value).toBe(false);
    store.redo();
    expect(store.state.project.value.name).toBe("ABC");
  });

  it("removing a component right after another edit is its own undo step", async () => {
    const { store } = setup();
    const p = fixtureProject();
    const first = p.components[0];
    store.start(encodeHash(p, EMPTY_FOREIGN));
    store.edit((q) => renameProject(q, "Renamed"));
    await vi.advanceTimersByTimeAsync(100);
    store.edit((q) => ({ ...q, components: q.components.slice(1) }));
    expect(store.state.project.value.components).toHaveLength(p.components.length - 1);
    store.undo();
    expect(store.state.project.value.components[0]?.id).toBe(first?.id);
    expect(store.state.project.value.name).toBe("Renamed");
  });

  it("edits more than a second apart are separate undo steps", async () => {
    const { store } = setup();
    const p = fixtureProject();
    store.start(encodeHash(p, EMPTY_FOREIGN));
    store.edit((q) => renameProject(q, "First"));
    await vi.advanceTimersByTimeAsync(1500);
    store.edit((q) => renameProject(q, "Second"));
    store.undo();
    expect(store.state.project.value.name).toBe("First");
    store.undo();
    expect(store.state.project.value.name).toBe(p.name);
  });

  it("a step taken while an edit's run was pending gets the plan too, so undoing to it is not stale", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    store.start(encodeHash({ ...p, layout: makeLayout(inputsHash(p)) }, EMPTY_FOREIGN));
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1500);
    await flush();
    const call = stub.calls[0];
    store.edit((q) => renameProject(q, "Renamed while running"));
    const next = makeLayout(call?.input.inputsHash ?? "");
    call?.resolve(makeResult(next));
    await flush();
    expect(store.state.project.value.layout).toBe(next);
    store.undo();
    expect(store.state.project.value.name).toBe(p.name);
    expect(store.state.project.value.box.innerHeight).toBe(p.box.innerHeight + 2);
    expect(store.state.project.value.layout).toBe(next);
    expect(store.state.stale.value).toBe(false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);
    await flush();
    expect(stub.calls).toHaveLength(1);
  });

  it("history clears when another project opens", () => {
    const { store } = setup();
    store.start(encodeHash(fixtureProject(), EMPTY_FOREIGN));
    store.edit((q) => renameProject(q, "Edited"));
    store.undo();
    expect(store.canUndo.value || store.canRedo.value).toBe(true);
    store.newProject();
    expect(store.canUndo.value).toBe(false);
    expect(store.canRedo.value).toBe(false);
    const name = store.state.project.value.name;
    store.undo();
    store.redo();
    expect(store.state.project.value.name).toBe(name);
  });

  it("refit keeps searching (3x budget) on a current layout and runs the normal budget when stale or missing", async () => {
    const { store, stub } = setup();
    const p = fixtureProject();
    store.start(encodeHash({ ...p, layout: makeLayout(inputsHash(p)) }, EMPTY_FOREIGN));
    expect(store.state.stale.value).toBe(false);
    store.refit();
    await flush();
    expect(stub.calls[0]?.iterations).toBe(IMPROVE_FACTOR * DEFAULT_ITERATIONS);
    stub.calls[0]?.resolve(makeResult(makeLayout(stub.calls[0].input.inputsHash)));
    await flush();
    // an edit makes the layout stale; refit before the debounced run uses the normal budget
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    expect(store.state.stale.value).toBe(true);
    store.refit();
    await flush();
    expect(stub.calls[1]?.iterations).toBe(DEFAULT_ITERATIONS);
  });

  describe("unpin", () => {
    const locks: Lock[] = [
      { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
      { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] },
      { kind: "size", trayKey: "c:p0:0", w: 50, d: 40, h: 20 },
    ];
    const conflict = { trayKey: "a:p0:0", name: "Deck A ×40", reason: "it is on top of others" };

    async function conflicted() {
      const s = setup();
      const p = { ...fixtureProject(), locks };
      const first = makeLayout(inputsHash(p));
      s.store.start(encodeHash({ ...p, layout: first }, EMPTY_FOREIGN));
      s.store.refit();
      await flush();
      const call = s.stub.calls[0];
      call?.resolve(makeResult(makeLayout(call.input.inputsHash), { lockConflicts: [conflict] }));
      await flush();
      return { ...s, first };
    }

    it("keeps the pins and the plan, and lists the conflicts, until the user unpins", async () => {
      const { store, first } = await conflicted();
      expect(store.state.project.value.locks).toEqual(locks);
      expect(store.state.project.value.layout).toEqual(first);
      expect(store.state.lockConflicts.value).toEqual([conflict]);
      expect(store.canUndo.value).toBe(false);
    });

    it("forgets the conflicts when another project opens", async () => {
      const { store } = await conflicted();
      store.newProject();
      expect(store.state.lockConflicts.value).toEqual([]);
    });

    it("lists no conflict for a pin the moment it is removed, before the re-run is back", async () => {
      const { store, stub } = await conflicted();
      store.unpin("a:p0:0");
      expect(store.state.lockConflicts.value).toEqual([]);
      expect(stub.calls).toHaveLength(1);
    });

    it("removes only the conflicting kind of lock when given one", async () => {
      const s = setup();
      const p = { ...fixtureProject(), locks };
      const sizeConflict = {
        trayKey: "c:p0:0",
        kind: "size" as const,
        name: "Deck C",
        reason: "its contents no longer fit that size",
      };
      const both: Lock[] = [
        { kind: "position", trayKey: "c:p0:0", path: "1", rotated: false },
        locks[3] as Lock,
      ];
      const withBoth = { ...p, locks: both };
      s.store.start(
        encodeHash({ ...withBoth, layout: makeLayout(inputsHash(withBoth)) }, EMPTY_FOREIGN),
      );
      s.store.refit();
      await flush();
      const call = s.stub.calls[0];
      call?.resolve(
        makeResult(makeLayout(call.input.inputsHash), { lockConflicts: [sizeConflict] }),
      );
      await flush();
      expect(s.store.state.lockConflicts.value).toEqual([sizeConflict]);
      s.store.unpin("c:p0:0", "size");
      expect(s.store.state.project.value.locks).toEqual([both[0]]);
      expect(s.store.state.lockConflicts.value).toEqual([]);
    });

    it("removes a turn that conflicts with the pin on its tray, and keeps the pin", async () => {
      const s = setup();
      const both: Lock[] = [
        { kind: "position", trayKey: "c:p0:0", path: "1", rotated: false },
        { kind: "turn", trayKey: "c:p0:0", rotated: true },
      ];
      const withBoth = { ...fixtureProject(), locks: both };
      s.store.start(
        encodeHash({ ...withBoth, layout: makeLayout(inputsHash(withBoth)) }, EMPTY_FOREIGN),
      );
      s.store.refit();
      await flush();
      const turnConflict = {
        trayKey: "c:p0:0",
        kind: "turn" as const,
        name: "Deck C",
        reason: "it conflicts with the pin on the same tray",
      };
      const call = s.stub.calls[0];
      call?.resolve(
        makeResult(makeLayout(call.input.inputsHash), { lockConflicts: [turnConflict] }),
      );
      await flush();
      expect(s.store.state.lockConflicts.value).toEqual([turnConflict]);
      s.store.unpin("c:p0:0", "turn");
      expect(s.store.state.project.value.locks).toEqual([both[0]]);
      expect(s.store.state.lockConflicts.value).toEqual([]);
    });

    it("removes that tray's pin and the stack lock around it, then re-runs", async () => {
      const { store, stub } = await conflicted();
      store.unpin("a:p0:0");
      expect(store.state.project.value.locks).toEqual([locks[1], locks[3]]);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await flush();
      expect(stub.calls).toHaveLength(2);
      expect(stub.calls[1]?.input.locks).toEqual([locks[1], locks[3]]);
      const call = stub.calls[1];
      const next = makeLayout(call?.input.inputsHash ?? "");
      call?.resolve(makeResult(next));
      await flush();
      expect(store.state.lockConflicts.value).toEqual([]);
      expect(store.state.project.value.layout).toEqual(next);
      // undo brings the pins back, and the plan that came with them
      store.undo();
      expect(store.state.project.value.locks).toEqual(locks);
      expect(store.state.lockConflicts.value).toEqual([]);
    });
  });

  it("flushes on pagehide and does not follow a changed address bar", () => {
    const { store, projectStore } = setup();
    store.start("");
    const id = store.state.project.value.id;
    const win = Object.assign(new EventTarget(), { location: { hash: "" } });
    const disconnect = connectWindow(store, win as unknown as Window);
    win.location.hash = encodeHash(fixtureProject(), EMPTY_FOREIGN);
    win.dispatchEvent(new Event("hashchange"));
    expect(store.state.project.value.id).toBe(id);
    store.edit((q) => renameProject(q, "Before leaving"));
    win.dispatchEvent(new Event("pagehide"));
    expect(projectStore.list().find((e) => e.id === id)?.name).toBe("Before leaving");
    disconnect();
  });

  it("disconnect removes the window listeners", () => {
    const { store } = setup();
    const onExternalChange = vi.spyOn(store, "onExternalChange");
    const flushSave = vi.spyOn(store, "flushSave");
    const win = Object.assign(new EventTarget(), { location: { hash: "" } });
    const disconnect = connectWindow(store, win as unknown as Window);
    disconnect();
    win.dispatchEvent(Object.assign(new Event("storage"), { key: `${STORAGE_PREFIX}index` }));
    win.dispatchEvent(new Event("pagehide"));
    expect(onExternalChange).not.toHaveBeenCalled();
    expect(flushSave).not.toHaveBeenCalled();
  });

  it("reacts to storage events of this app only", () => {
    const shared = new MemoryStorage();
    const make = () =>
      createAppStore({
        projectStore: createProjectStore(shared),
        loadLayoutClient: () => Promise.resolve(stubLayoutClient().client),
        clearHash: vi.fn(),
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
        clearHash: vi.fn(),
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

  describe("printer preference", () => {
    it("a new insert uses my printer", () => {
      const { store, prefs } = setup();
      prefs.setPrinter(MY_PRINTER);
      store.newProject();
      expect(store.state.project.value.printer).toEqual(MY_PRINTER);
    });

    it("an app that starts without a stored project uses my printer", () => {
      const { store, prefs } = setup();
      prefs.setPrinter(MY_PRINTER);
      store.start("");
      expect(store.state.project.value.printer).toEqual(MY_PRINTER);
    });

    it("changing my printer leaves existing inserts alone until applied", async () => {
      const { store, stub, prefs } = setup();
      const p = fixtureProject();
      store.start(encodeHash(withoutLayout(p), EMPTY_FOREIGN));
      await flush();
      const before = store.state.project.value.printer;
      prefs.setPrinter(MY_PRINTER);
      expect(store.state.project.value.printer).toEqual(before);
      expect(before).not.toEqual(MY_PRINTER);

      const calls = stub.calls.length;
      store.edit((q) => applyPrinter(q, prefs.printer.value));
      expect(store.state.project.value.printer).toEqual(MY_PRINTER);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);
      await flush();
      expect(stub.calls.length).toBeGreaterThan(calls);
      store.undo();
      expect(store.state.project.value.printer).toEqual(before);
    });

    it("an opened file keeps its own printer", () => {
      const { store, prefs } = setup();
      prefs.setPrinter(MY_PRINTER);
      const p = fixtureProject();
      store.start(encodeHash(p, EMPTY_FOREIGN));
      expect(store.state.project.value.printer).toEqual(p.printer);
    });
  });
});
