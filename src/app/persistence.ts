// src/app/persistence.ts
import { batch } from "@preact/signals";
import { newProject as makeNewProject } from "../model/defaults";
import { newId } from "../model/ids";
import { SCHEMA_NOTICE_CODES, noForeign, serializeProject } from "../model/schema";
import type { ForeignData, Notice, ParseResult, Project } from "../model/types";
import { StoreWriteError, decodeHash, encodeHash, importJsonText } from "../share";
import type { ProjectStore } from "../share";
import { errorText } from "../util/errors";
import { dismissNotice, pushNotice } from "./state";
import type { State } from "./state";

export const SAVE_DEBOUNCE_MS = 500;
export const STORAGE_UNAVAILABLE_CODE = "storage.unavailable";
export const CONFLICT_CODE = "storage.conflict";
export const OPEN_FAILED_CODE = "open.failed";
export const SAVE_FAILED_CODE = "storage.saveFailed";
export const UNSAVED_LEFT_CODE = "storage.unsavedLeft";

export type OpenSource = "link" | "file";
export type ConflictChoice = "keepMine" | "loadTheirs";

export interface PersistenceDeps {
  projectStore: ProjectStore;
  replaceHash: (hash: string) => void;
  confirm: (message: string) => boolean;
  /** Makes a new, empty project (default: the built-in defaults). */
  createProject?: () => Project;
}

export interface PersistenceHooks {
  onClosing: () => void;
  /** `run: false` after a silent load: show what is stored, don't start an optimizer run. */
  onOpened: (opts: { run: boolean }) => void;
}

export interface Persistence {
  scheduleSave(): void;
  /** Saves now; true when nothing is left unsaved here (saved, unchanged, or no storage to save to). */
  flush(): boolean;
  start(hash: string): void;
  openFromHash(hash: string): boolean;
  openParsed(result: ParseResult, source: OpenSource): boolean;
  openProject(id: string): void;
  newProject(): void;
  deleteProject(id: string): void;
  importJson(text: string): boolean;
  onExternalChange(): void;
  resolveConflict(choice: ConflictChoice): void;
  dispose(): void;
}

function isEmptyHash(hash: string): boolean {
  return hash === "" || hash === "#";
}

export function createPersistence(
  state: State,
  deps: PersistenceDeps,
  hooks: PersistenceHooks,
): Persistence {
  const store = deps.projectStore;
  const createProject = deps.createProject ?? makeNewProject;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // What this tab last saw in storage for the current project (serialized), or null.
  let lastSynced: string | null = null;
  let written = "";
  let active = false;

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function refreshList(): void {
    state.projects.value = store.available ? store.list() : [];
  }

  function writeHash(): void {
    const hash = encodeHash(state.project.value, state.foreign.value);
    written = hash;
    deps.replaceHash(hash);
  }

  /** The stored project as it loads, serialized; null when absent, "" when unreadable. */
  function storedSerialized(id: string): string | null {
    const r = store.available ? store.load(id) : null;
    if (!r) {
      return null;
    }
    return r.ok ? serializeProject(r.project, r.foreign) : "";
  }

  /** True when the stored content differs from what this tab last saw (a deleted project is no conflict). */
  function changedElsewhere(id: string): boolean {
    if (lastSynced === null) {
      return false;
    }
    const stored = storedSerialized(id);
    return stored !== null && stored !== lastSynced;
  }

  function markConflict(): void {
    state.conflict.value = true;
    pushNotice(state, {
      level: "warning",
      code: CONFLICT_CODE,
      message:
        "This project was changed in another tab. Autosave is paused here until you choose which version to keep.",
    });
  }

  function flush(): boolean {
    clearTimer();
    if (!active) {
      return true;
    }
    writeHash();
    if (!store.available) {
      return true;
    }
    if (state.conflict.value) {
      // Paused: an edit reaching this point means the notice with the choices must be on screen.
      if (!state.appNotices.value.some((n) => n.code === CONFLICT_CODE)) {
        markConflict();
      }
      return false;
    }
    const p = state.project.value;
    const current = serializeProject(p, state.foreign.value);
    if (current === lastSynced) {
      return true;
    }
    if (changedElsewhere(p.id)) {
      markConflict();
      return false;
    }
    try {
      store.save(p, state.foreign.value);
    } catch (e) {
      const reason =
        e instanceof StoreWriteError
          ? "the browser refused to store it (storage may be full)"
          : errorText(e);
      pushNotice(state, {
        level: "warning",
        code: SAVE_FAILED_CODE,
        message: `Autosave failed: ${reason}. Your work is still open here; use Save to file or Copy link to keep it.`,
      });
      return false;
    }
    dismissNotice(state, SAVE_FAILED_CODE);
    lastSynced = storedSerialized(p.id) || current;
    refreshList();
    return true;
  }

  /**
   * Keeps this tab's version of a conflicted project as its own copy before the
   * tab leaves it. `notice` is null when this tab has no changes of its own (it
   * still shows what it last saw), so no stray copy is made; `failed` when the
   * copy couldn't be stored.
   */
  function saveConflictedCopy(): { notice: Notice | null; failed: boolean } {
    clearTimer();
    const p = state.project.value;
    if (serializeProject(p, state.foreign.value) === lastSynced) {
      return { notice: null, failed: false };
    }
    const copy: Project = { ...p, id: newId(), name: `${p.name} (copy)` };
    try {
      store.save(copy, state.foreign.value);
    } catch {
      return {
        failed: true,
        notice: {
          level: "warning",
          code: CONFLICT_CODE,
          message: `“${p.name}” was changed in another tab and this tab's version couldn't be kept (the browser refused to store it).`,
        },
      };
    }
    refreshList();
    return {
      failed: false,
      notice: {
        level: "info",
        code: CONFLICT_CODE,
        message: `“${p.name}” was changed in another tab; this tab's version was kept as “${copy.name}”.`,
      },
    };
  }

  /**
   * Replaces the open project. A project whose latest edits can't be stored is only left
   * after the user agrees, and the notice then names it; returns false when the user declines
   * (nothing changes). A project another tab changed is kept as a copy instead (conflict).
   */
  function setCurrent(
    project: Project,
    foreign: ForeignData,
    notices: Notice[],
    opts: { run: boolean } = { run: true },
  ): boolean {
    const leaving = state.project.value;
    const unsaved = (): Notice[] => [
      {
        level: "warning",
        code: UNSAVED_LEFT_CODE,
        message: `“${leaving.name}” couldn't be saved: its latest changes were lost when you opened another project.`,
      },
    ];
    let extra: Notice[] = [];
    // flush() can discover a conflict nobody told this tab about yet; the check follows it.
    const saved = active && !state.conflict.value ? flush() : true;
    if (active && state.conflict.value) {
      const copy = saveConflictedCopy();
      if (
        copy.failed &&
        !deps.confirm(
          `“${leaving.name}” was changed in another tab and this tab's version can't be kept. Open the other project anyway?`,
        )
      ) {
        writeHash();
        return false;
      }
      extra = copy.notice ? [copy.notice] : [];
    } else if (!saved) {
      if (
        !deps.confirm(
          `“${leaving.name}” couldn't be saved, so leaving it now loses its latest changes. Open the other project anyway?`,
        )
      ) {
        return false;
      }
      extra = unsaved();
    }
    hooks.onClosing();
    const kept = state.appNotices.value.filter((n) => n.code === STORAGE_UNAVAILABLE_CODE);
    batch(() => {
      state.project.value = project;
      state.foreign.value = foreign;
      state.history.clear();
      state.lastResult.value = null;
      state.lockConflicts.value = [];
      state.selection.value = null;
      state.run.value = { status: "idle" };
      state.conflict.value = false;
      state.needsConfirm.value =
        foreign.components.length > 0 ||
        notices.some((n) => n.code === SCHEMA_NOTICE_CODES.newerMinor);
      // Parse notices include one schema.foreignComponent warning per kept component.
      state.appNotices.value = [...kept, ...notices, ...extra];
    });
    active = true;
    lastSynced = storedSerialized(project.id) || null;
    flush();
    hooks.onOpened(opts);
    return true;
  }

  function openParsed(result: ParseResult, source: OpenSource): boolean {
    if (!result.ok) {
      pushNotice(state, {
        level: "error",
        code: OPEN_FAILED_CODE,
        message: `Couldn't open this ${source}: ${result.error} Your current project is unchanged.`,
      });
      return false;
    }
    let project = result.project;
    const existing = store.available ? store.load(project.id) : null;
    // Never replace a stored project that differs or can't be read (damaged, or made by a newer app).
    if (
      existing &&
      (!existing.ok ||
        serializeProject(existing.project, existing.foreign) !==
          serializeProject(project, result.foreign))
    ) {
      project = { ...project, id: newId(), name: `${project.name} (copy)` };
    }
    return setCurrent(project, result.foreign, result.notices);
  }

  function openStoredOrNew(): void {
    const last = state.projects.value[0];
    const loaded = last && store.available ? store.load(last.id) : null;
    if (loaded && loaded.ok) {
      setCurrent(loaded.project, loaded.foreign, loaded.notices);
    } else {
      setCurrent(createProject(), noForeign(), []);
    }
  }

  return {
    scheduleSave() {
      if (!active) {
        return;
      }
      clearTimer();
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    flush,
    start(hash) {
      if (!store.available) {
        pushNotice(state, {
          level: "info",
          code: STORAGE_UNAVAILABLE_CODE,
          message:
            "Local storage is unavailable, so autosave and the project list are off. Use Copy link or Save to file to keep your work.",
        });
      }
      refreshList();
      const parsed = isEmptyHash(hash) ? null : decodeHash(hash);
      if (parsed && parsed.ok) {
        openParsed(parsed, "link");
        return;
      }
      openStoredOrNew();
      if (parsed) {
        openParsed(parsed, "link");
      }
    },
    openFromHash(hash) {
      if (isEmptyHash(hash) || hash === written) {
        return false;
      }
      return openParsed(decodeHash(hash), "link");
    },
    openParsed,
    openProject(id) {
      if (id === state.project.value.id) {
        return;
      }
      const r = store.available ? store.load(id) : null;
      if (!r) {
        pushNotice(state, {
          level: "error",
          code: OPEN_FAILED_CODE,
          message: "That project is no longer in this browser's list.",
        });
        refreshList();
        return;
      }
      if (!r.ok) {
        pushNotice(state, {
          level: "error",
          code: OPEN_FAILED_CODE,
          message: `Couldn't open that project: ${r.error}`,
        });
        return;
      }
      setCurrent(r.project, r.foreign, r.notices);
    },
    newProject() {
      setCurrent(createProject(), noForeign(), []);
    },
    deleteProject(id) {
      const name = state.projects.value.find((e) => e.id === id)?.name ?? "this project";
      if (!deps.confirm(`Delete “${name}” from this browser? This can't be undone.`)) {
        return;
      }
      const wasCurrent = id === state.project.value.id;
      if (wasCurrent) {
        clearTimer();
        active = false;
      }
      store.remove(id);
      refreshList();
      if (wasCurrent) {
        openStoredOrNew();
      }
    },
    importJson(text) {
      return openParsed(importJsonText(text), "file");
    },
    onExternalChange() {
      refreshList();
      const id = state.project.value.id;
      if (!active || state.conflict.value || !changedElsewhere(id)) {
        return;
      }
      // Nothing of this tab's own is at stake: it just shows the newer version.
      const theirs = serializeProject(state.project.value, state.foreign.value) === lastSynced;
      const r = theirs && store.available ? store.load(id) : null;
      if (r && r.ok) {
        // An idle tab doesn't run the optimizer on what it was handed: the editing tab's result
        // arrives with its next save, and a run here would save a second one and conflict again.
        setCurrent(r.project, r.foreign, r.notices, { run: false });
      } else {
        markConflict();
      }
    },
    resolveConflict(choice) {
      const id = state.project.value.id;
      if (choice === "keepMine") {
        if (storedSerialized(id) === "") {
          // The stored version is from a newer or unknown format: never overwrite it.
          const mine = state.project.value;
          const copy: Project = { ...mine, id: newId(), name: `${mine.name} (copy)` };
          state.conflict.value = false;
          dismissNotice(state, CONFLICT_CODE);
          active = false;
          setCurrent(copy, state.foreign.value, [
            {
              level: "info",
              code: CONFLICT_CODE,
              message: `The other tab's version of “${mine.name}” is from a newer or unknown format and was left untouched. This tab's version is saved as “${copy.name}”.`,
            },
          ]);
          return;
        }
        state.conflict.value = false;
        dismissNotice(state, CONFLICT_CODE);
        lastSynced = storedSerialized(id) || null;
        flush();
        return;
      }
      const r = store.available ? store.load(id) : null;
      if (r && r.ok) {
        state.conflict.value = false;
        dismissNotice(state, CONFLICT_CODE);
        active = false;
        setCurrent(r.project, r.foreign, r.notices);
        return;
      }
      // Their version is gone or unreadable: keep mine and the pending choice.
      pushNotice(state, {
        level: "error",
        code: OPEN_FAILED_CODE,
        message: r
          ? `Couldn't load the other tab's version: ${r.error} This tab's version is unchanged.`
          : "The other tab's version is no longer stored. This tab's version is unchanged; choose Keep mine to save it again.",
      });
    },
    dispose() {
      clearTimer();
    },
  };
}
