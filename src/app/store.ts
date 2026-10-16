// src/app/store.ts
import { batch } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import { newProject } from "../model/defaults";
import type { Lock, Notice, Project } from "../model/types";
import { STORAGE_PREFIX } from "../share";
import type { ProjectStore } from "../share";
import { removeLock } from "./actions";
import type { LockConflict } from "../layout/types";
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
  /** The clock edits are grouped by (default `Date.now`). */
  now?: () => number;
}

export const COALESCE_MS = 1000;

/** True while some lock still is the one a conflict is about. */
function lockStillThere(c: LockConflict, locks: readonly Lock[]): boolean {
  return locks.some(
    (l) =>
      (c.kind === undefined || l.kind === c.kind) &&
      (l.kind === "stack" ? l.trayKeys.includes(c.trayKey) : l.trayKey === c.trayKey),
  );
}

function sameComponents(a: Project, b: Project): boolean {
  return (
    a.components.length === b.components.length &&
    a.components.every((c, i) => c.id === b.components[i]?.id)
  );
}

export interface AppStore {
  state: State;
  storageAvailable: boolean;
  edit(fn: (p: Project) => Project): void;
  /** Steps back through the edits of the open project, restoring the whole project (inputs, plan, locks). */
  undo(): void;
  redo(): void;
  canUndo: ReadonlySignal<boolean>;
  canRedo: ReadonlySignal<boolean>;
  /**
   * Removes the locks on this tray (its pin, a stack lock it is in, its size lock; only those of
   * `kind` when given) and re-runs. For the pins a run reported in `state.lockConflicts`, which
   * it did not keep: pass the conflict's `kind` so the tray's other locks stay.
   */
  unpin(trayKey: string, kind?: Lock["kind"]): void;
  /** Re-fits from the current layout: the normal budget when there is no layout or it is stale
   * (an edit) or made under older geometry, the bigger "keep searching" budget when the layout is current. */
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
  const state = createState(newProject(), undefined, deps.now);
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

  /** Shows a project from the history. One without a current plan is re-planned, as after an edit. */
  function restore(project: Project | null): void {
    if (!project) {
      return;
    }
    batch(() => {
      state.project.value = project;
      // a run for the restored project reports its own conflicts
      state.lockConflicts.value = [];
    });
    persistence.scheduleSave();
    if (project.layout === undefined || state.stale.value) {
      runner.schedule();
    } else {
      runner.cancel();
    }
  }

  function edit(fn: (p: Project) => Project): void {
    const before = state.project.value;
    const beforeHash = state.currentHash.value;
    const next = fn(before);
    if (next === before) {
      return;
    }
    batch(() => {
      state.history.ensureBase(before);
      // Typing in a field is one step; adding or removing a component never merges into its neighbours.
      state.history.push(next, sameComponents(before, next) ? { coalesceMs: COALESCE_MS } : {});
      state.project.value = next;
      // A conflict whose lock the edit removed is settled now, not after the next run.
      if (next.locks !== before.locks && state.lockConflicts.value.length > 0) {
        state.lockConflicts.value = state.lockConflicts.value.filter((c) =>
          lockStillThere(c, next.locks),
        );
      }
    });
    persistence.scheduleSave();
    if (state.currentHash.value !== beforeHash) {
      runner.schedule();
    }
  }

  return {
    state,
    storageAvailable: deps.projectStore.available,
    canUndo: state.history.canUndo,
    canRedo: state.history.canRedo,
    edit,
    undo() {
      restore(state.history.undo());
    },
    redo() {
      restore(state.history.redo());
    },
    unpin(trayKey, kind) {
      edit((p) => removeLock(p, trayKey, kind));
    },
    refit() {
      const current =
        state.project.value.layout !== undefined && !state.stale.value && !state.geometryOld.value;
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
