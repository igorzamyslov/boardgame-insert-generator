// src/app/state.ts
import { computed, signal } from "@preact/signals";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { isOlderGeometryLine } from "../geometry/version";
import { NOTICE_CODES, summarize } from "../layout";
import type { LayoutResult, LayoutSummary, LockConflict } from "../layout/types";
import { inputsHash } from "../model/hash";
import { noForeign } from "../model/schema";
import type { ForeignData, Notice, Project } from "../model/types";
import { validateProject } from "../model/validate";
import type { ProjectListEntry } from "../share";
import { size } from "../sizing";
import { errorText } from "../util/errors";
import { createHistory } from "./history";
import type { History } from "./history";

export type RunKind = "edit" | "improve";
export type RunState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done" }
  | { status: "error"; message: string };

/** Where the autosave of the open project stands (persistence writes the inputs of this). */
export type SaveState = "saved" | "saving" | "paused" | "failed" | "unavailable";

export const STALE_CODE = "layout.stale";
export const CAPPED_CODE = NOTICE_CODES.capped;
export const GEOMETRY_MAJOR_CODE = "geometry.olderMajor";
/** The banner copy of the two plan notices (the UI shows these words). */
export const STALE_MESSAGE = "This plan is from before your last changes.";
export const GEOMETRY_OLD_MESSAGE =
  "Made with an older version of the app. Trays printed from it won't stack with trays you print now.";

export interface State {
  project: Signal<Project>;
  foreign: Signal<ForeignData>;
  projects: Signal<ProjectListEntry[]>;
  run: Signal<RunState>;
  lastResult: Signal<LayoutResult | null>;
  /** The inputs hash `lastResult` was computed for; its notices show only while it is current. */
  lastResultHash: Signal<string | null>;
  /**
   * The pins the last run could not keep, while no run has accepted a plan since. The run's plan
   * was not accepted (the previous one stays); `store.unpin` removes a pin and re-runs.
   */
  lockConflicts: Signal<LockConflict[]>;
  /** Undo and redo steps of the open project (whole projects). */
  history: History;
  selection: Signal<string | null>;
  appNotices: Signal<Notice[]>;
  /** Newer-minor file: automatic runs are skipped, a user run asks first (spec §9). */
  needsConfirm: Signal<boolean>;
  /** Another tab saved this project; autosave is paused (persistence). */
  conflict: Signal<boolean>;
  /** An edit's run is waiting out its debounce (the runner sets it). */
  runScheduled: Signal<boolean>;
  /**
   * True from the moment an edit schedules a run until that run settles (accepted, discarded,
   * cancelled or failed), so it also covers the run in flight; false when idle with nothing scheduled.
   */
  runPending: ReadonlySignal<boolean>;
  /** The browser can keep projects (persistence sets it once, from the store). */
  storageAvailable: Signal<boolean>;
  /** A save is waiting out its debounce (persistence sets it). */
  savePending: Signal<boolean>;
  /** The last write was refused, and none has succeeded since (persistence sets it). */
  saveFailed: Signal<boolean>;
  /**
   * "unavailable" without storage; "paused" while the other-tab conflict is open; "failed" after a
   * write error until the next success; "saving" while a save is scheduled; otherwise "saved".
   */
  saveState: ReadonlySignal<SaveState>;
  validation: ReadonlySignal<Notice[]>;
  currentHash: ReadonlySignal<string>;
  stale: ReadonlySignal<boolean>;
  /** The stored layout was made under an older compatibility line of the tray geometry: it needs re-running. */
  geometryOld: ReadonlySignal<boolean>;
  sizingNotices: ReadonlySignal<Notice[]>;
  summary: ReadonlySignal<LayoutSummary | null>;
  layoutNotices: ReadonlySignal<Notice[]>;
  /** The "short by" amounts of an infeasible run, while its inputs are the current ones. */
  shortfall: ReadonlySignal<{ x: number; y: number; z: number } | null>;
}

function sizingNoticesOf(p: Project): Notice[] {
  try {
    return size(p.components, p.settings).notices;
  } catch (e) {
    return [
      {
        level: "error",
        code: "sizing.failed",
        message: `Couldn't size the components: ${errorText(e)}`,
      },
    ];
  }
}

function dedupe(list: Notice[]): Notice[] {
  const seen = new Set<string>();
  return list.filter((n) => {
    const key = `${n.code}|${n.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function createState(
  initial: Project,
  foreign: ForeignData = noForeign(),
  now?: () => number,
): State {
  const project = signal(initial);
  const lastResult = signal<LayoutResult | null>(null);
  const lastResultHash = signal<string | null>(null);
  const validation = computed(() => validateProject(project.value));
  const currentHash = computed(() => inputsHash(project.value));
  const stale = computed(() => {
    const layout = project.value.layout;
    return layout !== undefined && layout.inputsHash !== currentHash.value;
  });
  const geometryOld = computed(() => {
    const layout = project.value.layout;
    return layout !== undefined && isOlderGeometryLine(layout.geometryVersion);
  });
  const runScheduled = signal(false);
  const run = signal<RunState>({ status: "idle" });
  const runPending = computed(() => runScheduled.value || run.value.status === "running");
  const conflict = signal(false);
  const storageAvailable = signal(true);
  const savePending = signal(false);
  const saveFailed = signal(false);
  const saveState = computed<SaveState>(() => {
    if (!storageAvailable.value) {
      return "unavailable";
    }
    if (conflict.value) {
      return "paused";
    }
    if (saveFailed.value) {
      return "failed";
    }
    return savePending.value ? "saving" : "saved";
  });
  const sizingNotices = computed(() => sizingNoticesOf(project.value));
  const summary = computed<LayoutSummary | null>(() => {
    const p = project.value;
    const layout = p.layout;
    if (!layout) {
      return null;
    }
    const r = lastResult.value;
    // The run's summary stands only for the inputs it ran on (anything that moves the riser split,
    // such as `leftover` or `fillToTop`, is in the hash) and for the infill and the two merge
    // switches, which are not.
    if (
      r &&
      r.layout === layout &&
      r.summary &&
      layout.inputsHash === currentHash.value &&
      r.summary.infillPct === p.settings.infill &&
      r.summary.mergeFillers === p.settings.mergeFillers &&
      r.summary.mergeRisers === p.settings.mergeRisers
    ) {
      return r.summary;
    }
    return summarize(layout.trays, {
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
    });
  });
  // An infeasible run has no layout to belong to: what it found stands only for its own inputs.
  const infeasible = computed<LayoutResult | null>(() => {
    const r = lastResult.value;
    return r && r.layout === null && lastResultHash.value === currentHash.value ? r : null;
  });
  const shortfall = computed(() => infeasible.value?.bestAttempt?.shortfall ?? null);
  const layoutNotices = computed<Notice[]>(() => {
    const layout = project.value.layout;
    const r = lastResult.value;
    const out: Notice[] = [];
    if (r && (r.layout === null ? r === infeasible.value : r.layout === layout)) {
      out.push(...r.notices);
    }
    if (layout?.capped && !out.some((n) => n.code === CAPPED_CODE)) {
      out.push({
        level: "info",
        code: CAPPED_CODE,
        message:
          "The optimizer stopped at its safety limit; this layout can't be reproduced from its seed. Try “Improve more”.",
      });
    }
    if (stale.value) {
      out.push({
        level: "info",
        code: STALE_CODE,
        message: STALE_MESSAGE,
      });
    }
    // An older compatibility line: an older MAJOR, or pre-1.0 an older 0.MINOR (spec §9).
    if (layout && geometryOld.value) {
      out.push({
        level: "warning",
        code: GEOMETRY_MAJOR_CODE,
        message: GEOMETRY_OLD_MESSAGE,
      });
    }
    out.push(...sizingNotices.value);
    return dedupe(out);
  });

  return {
    project,
    foreign: signal(foreign),
    projects: signal<ProjectListEntry[]>([]),
    run,
    lastResult,
    lastResultHash,
    lockConflicts: signal<LockConflict[]>([]),
    history: createHistory(undefined, now),
    selection: signal<string | null>(null),
    appNotices: signal<Notice[]>([]),
    needsConfirm: signal(false),
    conflict,
    runScheduled,
    runPending,
    storageAvailable,
    savePending,
    saveFailed,
    saveState,
    validation,
    currentHash,
    stale,
    geometryOld,
    sizingNotices,
    summary,
    layoutNotices,
    shortfall,
  };
}

export function pushNotice(state: State, n: Notice): void {
  state.appNotices.value = [...state.appNotices.value.filter((x) => x.code !== n.code), n];
}

export function dismissNotice(state: State, code: string): void {
  state.appNotices.value = state.appNotices.value.filter((x) => x.code !== code);
}
