// src/app/store.ts
import { batch } from "@preact/signals";
import { newProject } from "../model/defaults";
import type { Notice, Project } from "../model/types";
import { STORAGE_PREFIX } from "../share";
import type { ProjectStore } from "../share";
import type { LayoutClient } from "./clients";
import { createPersistence } from "./persistence";
import type { ConflictChoice } from "./persistence";
import { createRunner } from "./runner";
import { createState, dismissNotice, pushNotice } from "./state";
import type { State } from "./state";

export interface AppDeps {
  projectStore: ProjectStore;
  loadLayoutClient: () => Promise<LayoutClient>;
  replaceHash: (hash: string) => void;
  confirm: (message: string) => boolean;
}

export interface AppStore {
  state: State;
  storageAvailable: boolean;
  edit(fn: (p: Project) => Project): void;
  undo(): void;
  /** Re-fits from the current layout: the normal budget when there is no layout or it is stale
   * (an edit), the bigger "keep searching" budget when the layout is current. */
  refit(): void;
  cancelRun(): void;
  retry(): void;
  start(hash: string): void;
  openFromHash(hash: string): void;
  openProject(id: string): void;
  newProject(): void;
  deleteProject(id: string): void;
  importJson(text: string): boolean;
  pushNotice(n: Notice): void;
  dismissNotice(code: string): void;
  resolveConflict(choice: ConflictChoice): void;
  onExternalChange(): void;
  flushSave(): void;
  dispose(): void;
}

export function createAppStore(deps: AppDeps): AppStore {
  const state = createState(newProject());
  const runner = createRunner(
    state,
    { loadLayoutClient: deps.loadLayoutClient, confirm: deps.confirm },
    { onAccepted: () => persistence.scheduleSave() },
  );
  const persistence = createPersistence(
    state,
    { projectStore: deps.projectStore, replaceHash: deps.replaceHash, confirm: deps.confirm },
    { onClosing: () => runner.cancel(), onOpened: (opts) => runner.afterOpen(opts) },
  );

  return {
    state,
    storageAvailable: deps.projectStore.available,
    edit(fn) {
      const before = state.currentHash.value;
      state.project.value = fn(state.project.value);
      persistence.scheduleSave();
      if (state.currentHash.value !== before) {
        runner.schedule();
      }
    },
    undo() {
      const previous = state.undoSlot.value;
      if (!previous) {
        return;
      }
      batch(() => {
        state.project.value = {
          ...state.project.value,
          layout: previous.layout,
          ...(previous.locks && { locks: previous.locks }),
        };
        state.undoSlot.value = null;
      });
      persistence.scheduleSave();
    },
    refit() {
      const current = state.project.value.layout !== undefined && !state.stale.value;
      void runner.runNow(current ? "improve" : "edit", "user");
    },
    cancelRun() {
      runner.cancel();
    },
    retry() {
      void runner.retry();
    },
    start(hash) {
      persistence.start(hash);
    },
    openFromHash(hash) {
      persistence.openFromHash(hash);
    },
    openProject(id) {
      persistence.openProject(id);
    },
    newProject() {
      persistence.newProject();
    },
    deleteProject(id) {
      persistence.deleteProject(id);
    },
    importJson(text) {
      return persistence.importJson(text);
    },
    pushNotice(n) {
      pushNotice(state, n);
    },
    dismissNotice(code) {
      dismissNotice(state, code);
    },
    resolveConflict(choice) {
      persistence.resolveConflict(choice);
    },
    onExternalChange() {
      persistence.onExternalChange();
    },
    flushSave() {
      persistence.flush();
    },
    dispose() {
      runner.dispose();
      persistence.dispose();
    },
  };
}

export function connectWindow(store: AppStore, win: Window): () => void {
  const onStorage = (e: StorageEvent): void => {
    // Other apps on the same origin share localStorage; null means it was cleared.
    if (e.key === null || e.key.startsWith(STORAGE_PREFIX)) {
      store.onExternalChange();
    }
  };
  const onHashChange = (): void => store.openFromHash(win.location.hash);
  const onPageHide = (): void => store.flushSave();
  win.addEventListener("storage", onStorage);
  win.addEventListener("hashchange", onHashChange);
  win.addEventListener("pagehide", onPageHide);
  return () => {
    win.removeEventListener("storage", onStorage);
    win.removeEventListener("hashchange", onHashChange);
    win.removeEventListener("pagehide", onPageHide);
  };
}
