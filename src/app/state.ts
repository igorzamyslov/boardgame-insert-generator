// src/app/state.ts
import { computed, signal } from "@preact/signals";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { GEOMETRY_VERSION, isOlderGeometryLine } from "../geometry/version";
import { NOTICE_CODES, summarize } from "../layout";
import type { LayoutResult, LayoutSummary } from "../layout/types";
import { inputsHash } from "../model/hash";
import { noForeign } from "../model/schema";
import type { ForeignData, Lock, Notice, Project, StoredLayout } from "../model/types";
import { validateProject } from "../model/validate";
import type { ProjectListEntry } from "../share";
import { size } from "../sizing";
import { errorText } from "../util/errors";

export type Mode = "simple" | "advanced";
export type RunKind = "edit" | "improve";
export type RunState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done" }
  | { status: "error"; message: string };

/**
 * What undo restores: the layout before the last accepted run and, when that run pruned
 * locks it had to drop, the locks as they were, so the restored layout matches its inputs.
 */
export interface UndoSlot {
  layout: StoredLayout;
  locks?: Lock[];
}

export const STALE_CODE = "layout.stale";
export const CAPPED_CODE = NOTICE_CODES.capped;
export const GEOMETRY_MAJOR_CODE = "geometry.olderMajor";

export interface State {
  project: Signal<Project>;
  foreign: Signal<ForeignData>;
  projects: Signal<ProjectListEntry[]>;
  mode: Signal<Mode>;
  run: Signal<RunState>;
  lastResult: Signal<LayoutResult | null>;
  /** The inputs hash `lastResult` was computed for; its notices show only while it is current. */
  lastResultHash: Signal<string | null>;
  undoSlot: Signal<UndoSlot | null>;
  selection: Signal<string | null>;
  appNotices: Signal<Notice[]>;
  /** Newer-minor file: automatic runs are skipped, a user run asks first (spec §9). */
  needsConfirm: Signal<boolean>;
  /** Another tab saved this project; autosave is paused (persistence). */
  conflict: Signal<boolean>;
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

export function createState(initial: Project, foreign: ForeignData = noForeign()): State {
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
  const sizingNotices = computed(() => sizingNoticesOf(project.value));
  const summary = computed<LayoutSummary | null>(() => {
    const p = project.value;
    const layout = p.layout;
    if (!layout) {
      return null;
    }
    const r = lastResult.value;
    // The run's summary stands only for the inputs it ran on (anything that moves the riser split,
    // such as `leftover` or `fillToTop`, is in the hash) and for the infill, which is not.
    if (
      r &&
      r.layout === layout &&
      r.summary &&
      layout.inputsHash === currentHash.value &&
      r.summary.infillPct === p.settings.infill
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
        message: "Inputs changed since this plan was made — update the plan?",
      });
    }
    // An older compatibility line: an older MAJOR, or pre-1.0 an older 0.MINOR (spec §9).
    if (layout && geometryOld.value) {
      out.push({
        level: "warning",
        code: GEOMETRY_MAJOR_CODE,
        message: `This plan is out of date: it was made with tray geometry ${layout.geometryVersion}, and the app now uses ${GEOMETRY_VERSION}. Press “Update plan” to rebuild the trays with the current geometry. Trays exported from the old plan won't mate with the new ones, so reprint the whole insert.`,
      });
    }
    out.push(...sizingNotices.value);
    return dedupe(out);
  });

  return {
    project,
    foreign: signal(foreign),
    projects: signal<ProjectListEntry[]>([]),
    mode: signal<Mode>("simple"),
    run: signal<RunState>({ status: "idle" }),
    lastResult,
    lastResultHash,
    undoSlot: signal<UndoSlot | null>(null),
    selection: signal<string | null>(null),
    appNotices: signal<Notice[]>([]),
    needsConfirm: signal(false),
    conflict: signal(false),
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
