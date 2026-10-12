// src/app/state.ts
import { computed, signal } from "@preact/signals";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { isOlderGeometryLine } from "../geometry/version";
import { NOTICE_CODES, summarize } from "../layout";
import type { LayoutResult, LayoutSummary } from "../layout/types";
import { inputsHash } from "../model/hash";
import { noForeign } from "../model/schema";
import type { ForeignData, Notice, Project, StoredLayout } from "../model/types";
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
  undoSlot: Signal<StoredLayout | null>;
  selection: Signal<string | null>;
  appNotices: Signal<Notice[]>;
  /** Newer-minor file: automatic runs are skipped, a user run asks first (spec §9). */
  needsConfirm: Signal<boolean>;
  /** Another tab saved this project; autosave is paused (persistence). */
  conflict: Signal<boolean>;
  validation: ReadonlySignal<Notice[]>;
  currentHash: ReadonlySignal<string>;
  stale: ReadonlySignal<boolean>;
  sizingNotices: ReadonlySignal<Notice[]>;
  summary: ReadonlySignal<LayoutSummary | null>;
  layoutNotices: ReadonlySignal<Notice[]>;
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
  const validation = computed(() => validateProject(project.value));
  const currentHash = computed(() => inputsHash(project.value));
  const stale = computed(() => {
    const layout = project.value.layout;
    return layout !== undefined && layout.inputsHash !== currentHash.value;
  });
  const sizingNotices = computed(() => sizingNoticesOf(project.value));
  const summary = computed<LayoutSummary | null>(() => {
    const p = project.value;
    const layout = p.layout;
    if (!layout) {
      return null;
    }
    const r = lastResult.value;
    if (r && r.layout === layout && r.summary) {
      return r.summary;
    }
    return summarize(layout.trays, { box: p.box, settings: p.settings });
  });
  const layoutNotices = computed<Notice[]>(() => {
    const layout = project.value.layout;
    const r = lastResult.value;
    const out: Notice[] = [];
    if (r && (r.layout === null || r.layout === layout)) {
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
        message: "Inputs changed since this layout was made — re-optimize?",
      });
    }
    // An older compatibility line: an older MAJOR, or pre-1.0 an older 0.MINOR (spec §9).
    if (layout && isOlderGeometryLine(layout.geometryVersion)) {
      out.push({
        level: "warning",
        code: GEOMETRY_MAJOR_CODE,
        message: `This layout was made with tray geometry ${layout.geometryVersion}. Trays exported now won't mate with ones printed from it: reprint the whole insert.`,
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
    undoSlot: signal<StoredLayout | null>(null),
    selection: signal<string | null>(null),
    appNotices: signal<Notice[]>([]),
    needsConfirm: signal(false),
    conflict: signal(false),
    validation,
    currentHash,
    stale,
    sizingNotices,
    summary,
    layoutNotices,
  };
}

export function pushNotice(state: State, n: Notice): void {
  state.appNotices.value = [...state.appNotices.value.filter((x) => x.code !== n.code), n];
}

export function dismissNotice(state: State, code: string): void {
  state.appNotices.value = state.appNotices.value.filter((x) => x.code !== code);
}
