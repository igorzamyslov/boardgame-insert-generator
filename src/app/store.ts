// src/app/store.ts
import { batch } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import { newProject } from "../model/defaults";
import type { Lock, Notice, Project } from "../model/types";
import { STORAGE_PREFIX, createPrefsStore } from "../share";
import type { PrefsStore, ProjectStore } from "../share";
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
  /** Removes the `#…` from the address bar after an old link was read at start. */
  clearHash: () => void;
  /** Registers the question "does leaving the page lose work?" (main.tsx hooks it to beforeunload). */
  guardLeaving?: (shouldWarn: () => boolean) => void;
  confirm: (message: string) => boolean;
  /** The preferences new inserts start from (default: kept in memory only; main.tsx passes the browser's). */
  prefs?: PrefsStore;
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

/**
 * Whether an edit changed no structure: the same items in the same order, and the same groups with
 * the same members. Only such an edit (a field typed into) may merge into the step before it; adding
 * or removing an item or a group, or moving an item into one, is a step of its own.
 */
function sameComponents(a: Project, b: Project): boolean {
  const groups = (p: Project): string =>
    (p.groups ?? []).map((g) => `${g.id}:${g.memberIds.join(",")}`).join(";");
  return (
    a.components.length === b.components.length &&
    a.components.every((c, i) => c.id === b.components[i]?.id) &&
    groups(a) === groups(b)
  );
}

export interface AppStore {
  state: State;
  storageAvailable: boolean;
  /** The preferences (my printer) new inserts start from. */
  prefs: PrefsStore;
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
  /** Opens the latest stored project, or the old `#1.` link given (read once; see `clearHash`). */
  start(hash: string): void;
  openProject(id: string): void;
  newProject(): void;
  deleteProject(id: string): void;
  importJson(text: string): boolean;
  pushNotice(n: Notice): void;
  dismissNotice(code: string): void;
  resolveConflict(choice: ConflictChoice): void;
  onExternalChange(): void;
  flushSave(): void;
  /** Call after the project was saved to a file: with no browser storage, that is what keeps it. */
  markSavedToFile(): void;
  dispose(): void;
}

export function createAppStore(deps: AppDeps): AppStore {
  const prefs = deps.prefs ?? createPrefsStore(null);
  /** A new insert starts on the printer from the preferences. */
  const createProject = (): Project => ({ ...newProject(), printer: { ...prefs.printer.value } });
  const state = createState(createProject(), undefined, deps.now);
  const runner = createRunner(
    state,
    { loadLayoutClient: deps.loadLayoutClient, confirm: deps.confirm },
    { onAccepted: () => persistence.scheduleSave() },
  );
  const persistence = createPersistence(
    state,
    {
      projectStore: deps.projectStore,
      clearHash: deps.clearHash,
      guardLeaving: deps.guardLeaving,
      confirm: deps.confirm,
      createProject,
    },
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
      // A "Swap with…" under way belongs to the plan it began in, and a selected tray that is not
      // in the restored plan has gone: either would act on a tray that is not there.
      state.swapFrom.value = null;
      const selected = state.selection.value;
      if (selected !== null && !project.layout?.trays.some((t) => t.key === selected)) {
        state.selection.value = null;
      }
    });
    persistence.scheduleSave();
    if (project.layout === undefined || state.stale.value) {
      runner.schedule();
    } else {
      runner.cancel();
    }
  }

  // Whether the step the history is on was a structural one (an item or a group added, removed or
  // moved): a field typed into just after it is a step of its own, not part of it.
  let lastWasStructural = false;

  function edit(fn: (p: Project) => Project): void {
    const before = state.project.value;
    const beforeHash = state.currentHash.value;
    const next = fn(before);
    if (next === before) {
      return;
    }
    batch(() => {
      state.history.ensureBase(before);
      // Typing in a field is one step; adding or removing a component never merges into its
      // neighbours, and a field edit never merges into a step like that (a rename just after an
      // Add → Group would take the group with it on Undo).
      const structural = !sameComponents(before, next);
      state.history.push(next, structural || lastWasStructural ? {} : { coalesceMs: COALESCE_MS });
      lastWasStructural = structural;
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
    prefs,
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
    markSavedToFile() {
      persistence.markSavedToFile();
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
  const onPageHide = (): void => store.flushSave();
  win.addEventListener("storage", onStorage);
  win.addEventListener("pagehide", onPageHide);
  return () => {
    win.removeEventListener("storage", onStorage);
    win.removeEventListener("pagehide", onPageHide);
  };
}
