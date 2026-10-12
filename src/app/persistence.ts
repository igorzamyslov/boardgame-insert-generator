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

export type OpenSource = "link" | "file";
export type ConflictChoice = "keepMine" | "loadTheirs";

export interface PersistenceDeps {
  projectStore: ProjectStore;
  replaceHash: (hash: string) => void;
  confirm: (message: string) => boolean;
}

export interface PersistenceHooks {
  onClosing: () => void;
  onOpened: () => void;
}

export interface Persistence {
  scheduleSave(): void;
  flush(): void;
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let knownUpdatedAt: number | null = null;
  let written = "";
  let active = false;

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function entryOf(id: string) {
    return store.available ? store.list().find((e) => e.id === id) : undefined;
  }

  function refreshList(): void {
    state.projects.value = store.available
      ? [...store.list()].sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  }

  function writeHash(): void {
    const hash = encodeHash(state.project.value, state.foreign.value);
    written = hash;
    deps.replaceHash(hash);
  }

  function changedElsewhere(id: string): boolean {
    const entry = entryOf(id);
    return entry !== undefined && knownUpdatedAt !== null && entry.updatedAt !== knownUpdatedAt;
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

  function flush(): void {
    clearTimer();
    if (!active) {
      return;
    }
    writeHash();
    if (!store.available || state.conflict.value) {
      return;
    }
    const p = state.project.value;
    if (changedElsewhere(p.id)) {
      markConflict();
      return;
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
        message: `Autosave failed: ${reason}. Your work is still open here; use Export JSON or Copy link to keep it.`,
      });
      return;
    }
    dismissNotice(state, SAVE_FAILED_CODE);
    knownUpdatedAt = entryOf(p.id)?.updatedAt ?? null;
    refreshList();
  }

  function setCurrent(project: Project, foreign: ForeignData, notices: Notice[]): void {
    flush();
    hooks.onClosing();
    const kept = state.appNotices.value.filter((n) => n.code === STORAGE_UNAVAILABLE_CODE);
    batch(() => {
      state.project.value = project;
      state.foreign.value = foreign;
      state.undoSlot.value = null;
      state.lastResult.value = null;
      state.selection.value = null;
      state.run.value = { status: "idle" };
      state.conflict.value = false;
      state.needsConfirm.value =
        foreign.components.length > 0 ||
        notices.some((n) => n.code === SCHEMA_NOTICE_CODES.newerMinor);
      // Parse notices include one schema.foreignComponent warning per kept component.
      state.appNotices.value = [...kept, ...notices];
    });
    active = true;
    knownUpdatedAt = entryOf(project.id)?.updatedAt ?? null;
    flush();
    hooks.onOpened();
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
    if (existing && existing.ok) {
      const same =
        serializeProject(existing.project, existing.foreign) ===
        serializeProject(project, result.foreign);
      if (!same) {
        project = { ...project, id: newId(), name: `${project.name} (copy)` };
      }
    }
    setCurrent(project, result.foreign, result.notices);
    return true;
  }

  function openStoredOrNew(): void {
    const last = state.projects.value[0];
    const loaded = last && store.available ? store.load(last.id) : null;
    if (loaded && loaded.ok) {
      setCurrent(loaded.project, loaded.foreign, loaded.notices);
    } else {
      setCurrent(makeNewProject(), noForeign(), []);
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
            "Local storage is unavailable, so autosave and the project list are off. Use Copy link or Export JSON to keep your work.",
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
      setCurrent(makeNewProject(), noForeign(), []);
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
      try {
        store.remove(id);
      } catch (e) {
        pushNotice(state, {
          level: "warning",
          code: SAVE_FAILED_CODE,
          message: `Couldn't delete the project (${errorText(e)}).`,
        });
      }
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
      if (active && !state.conflict.value && changedElsewhere(state.project.value.id)) {
        markConflict();
      }
    },
    resolveConflict(choice) {
      const id = state.project.value.id;
      state.conflict.value = false;
      dismissNotice(state, CONFLICT_CODE);
      if (choice === "keepMine") {
        knownUpdatedAt = entryOf(id)?.updatedAt ?? null;
        flush();
        return;
      }
      const r = store.available ? store.load(id) : null;
      if (r && r.ok) {
        active = false;
        setCurrent(r.project, r.foreign, r.notices);
      }
    },
    dispose() {
      clearTimer();
    },
  };
}
