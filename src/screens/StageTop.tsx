// src/screens/StageTop.tsx
// The top of the stage (UI rebuild Task 6): the plan banner, then Main's status row: the status
// heading (the page's one h1), the Layer and View switches and the one thing to press.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import {
  GEOMETRY_OLD_MESSAGE,
  MAKING_PLAN_MESSAGE,
  STALE_MESSAGE,
  type RunState,
} from "../app/state";
import { Button, Icon, IconButton, Notice, Segmented, StatusHeading } from "../kit";
import type { StatusTone } from "../kit";
import type { LockConflict } from "../layout/types";
import { mmUp } from "../layout/warnings";
import type { Component, Notice as NoticeData, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { layerLabel, mm } from "../ui/identity";
import type { Misfit } from "../ui/noFit";

// ---------------------------------------------------------------- what the status says

/** What a plan that matches the inputs holds: the line under "Everything fits". */
export interface Fits {
  trays: number;
  layers: number;
  height: number;
  /** The height below the space the box keeps free on top (where every stack reaches). */
  boxHeight: number;
}

/** Keep searching; "Make a plan" when there is no plan yet. */
interface KeepAction {
  kind: "keep";
  label: string;
}

/** One thing the status offers to do. The stage binds each kind to a handler. */
export type StatusAction =
  | KeepAction
  | { kind: "stop" }
  | { kind: "retry" }
  /** Opens a component's editor, the box's ("box") or Settings ("settings"). */
  | { kind: "show"; id: string; label: string }
  | { kind: "unpin"; conflict: LockConflict; label: string };

export interface Status {
  tone: StatusTone;
  /** The page's h1. */
  title: string;
  /** Muted, under the title. */
  line?: string;
  /** A list under the title, one per line (errors that have no field; the pins that conflict). */
  list?: { label: string; items: readonly string[] };
  actions: readonly StatusAction[];
  /** The words go out as an alert as well: a failure the person has to hear. */
  alert?: boolean;
  /**
   * A fit problem: the stage draws `FitProblem` (the attempt or the kept plan, and a panel with
   * these actions) in place of the plan's own controls.
   */
  fit?: "noFit" | "pins";
}

/** A part of the app that holds an error: the status offers a way to it. */
export interface ProblemArea {
  /** A component's id, "box" or "settings". */
  id: string;
  label: string;
}

export interface StatusInput {
  run: RunState;
  /** A run is scheduled or going: the plan is about to change by itself. */
  pending: boolean;
  hasComponents: boolean;
  /** Components exist and no input is in error. */
  canOptimize: boolean;
  hasLayout: boolean;
  /** What the plan holds; null when there is no plan. */
  fits: Fits | null;
  /** Searching on from this plan is right (it is not from older tray geometry). */
  canSearchMore: boolean;
  /**
   * The search found no layout; `misfit` is the component that most clearly does not fit, and
   * `shortfall` how far (mm per axis) the closest plan is short of the box: the engine's own
   * figure for the whole plan, not for one tray.
   */
  noFit: {
    misfit: Misfit | null;
    shortfall?: { x: number; y: number; z: number } | null;
  } | null;
  /** The pins the last run could not keep. */
  conflicts: readonly LockConflict[];
  /** The errors that have no field on screen (`errorsWithoutField`). */
  hiddenErrors: readonly NoticeData[];
  /** The parts of the app that hold an error. */
  problems: readonly ProblemArea[];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "Optimizer failed: <message>." without a second full stop when the message has its own. */
function sentence(message: string): string {
  return /[.!?…]$/.test(message) ? message : `${message}.`;
}

export const SEARCHING_TITLE = "Searching for a better plan…";
const FIX_ERRORS = "Fix the errors marked in the inputs";
const FAILED = "The plan couldn't be updated";
const LAST_GOOD = "The plan shown is the last good one, from before your latest change.";

const conflictSentence = (c: LockConflict): string =>
  c.kind === "size"
    ? `${c.name} doesn't fit with its size locked`
    : `${c.name} doesn't fit with your pins`;

/**
 * "The closest plan is 17.2 mm too tall." (a figure for each axis that is short, the largest first,
 * "17.2 mm too tall and 3.0 mm too wide"), or "" when no axis is.
 */
export function shortfallSentence(
  shortfall: { x: number; y: number; z: number } | null | undefined,
): string {
  if (shortfall === null || shortfall === undefined) {
    return "";
  }
  const short = (
    [
      [shortfall.z, "too tall"],
      [shortfall.x, "too wide"],
      [shortfall.y, "too long"],
    ] as const
  )
    .filter(([v]) => Number(mmUp(v)) > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([v, word]) => `${mmUp(v)} mm ${word}`);
  if (short.length === 0) {
    return "";
  }
  const last = short.pop();
  return `The closest plan is ${short.length === 0 ? "" : `${short.join(", ")} and `}${last}.`;
}

/**
 * The engine's reasons (phrases that continue "…because", no full stop), each once, as sentences:
 * "The pins together leave no layout that fits."
 */
export function conflictLine(conflicts: readonly LockConflict[]): string {
  const reasons = [...new Set(conflicts.map((c) => c.reason.trim()).filter((r) => r !== ""))];
  return reasons
    .map((r) => `${r.charAt(0).toUpperCase()}${r.slice(1)}${/[.!?…]$/.test(r) ? "" : "."}`)
    .join(" ");
}

/** What the editor still says of the plan when its status heading is not drawn: a failed run, no fit, or pins in the way. */
export interface EditorProblem {
  tone: "error" | "warn";
  title: string;
  /** The muted line and the list under the title, one string each. */
  lines: readonly string[];
  /** The run can be tried again (a failed run). */
  retry: boolean;
}

/**
 * The words of a status the editor must not lose (the status heading is not drawn beside the
 * stage sentence): the failed run, the tray that does not fit, the pins in the way. Errors in the
 * inputs are marked in the editor itself; the rest of the statuses are not problems.
 */
export function editorProblem(status: Status): EditorProblem | null {
  const problem = (status.tone === "error" && status.alert === true) || status.tone === "warn";
  if (!problem) {
    return null;
  }
  return {
    tone: status.tone === "error" ? "error" : "warn",
    title: status.title,
    lines: [...(status.line === undefined ? [] : [status.line]), ...(status.list?.items ?? [])],
    retry: status.actions.some((a) => a.kind === "retry"),
  };
}

/**
 * What the status heading says: its tone, the h1, the muted line and what to press. A fit problem
 * (no fit, pins in the way) is the heading of its own stage: `fit` says which, and the actions are
 * the cards of its panel, each one something the engine can do (DESIGN §6): Edit the tray that
 * does not fit and Keep searching; Unpin or Unlock size per conflict.
 */
export function statusOf(s: StatusInput): Status {
  const keep: KeepAction[] = s.canSearchMore ? [{ kind: "keep", label: "Keep searching" }] : [];
  if (s.run.status === "running") {
    return s.run.kind === "improve"
      ? {
          tone: "info",
          title: SEARCHING_TITLE,
          line: "This plan stays unless a better one turns up.",
          actions: [{ kind: "stop" }],
        }
      : { tone: "info", title: MAKING_PLAN_MESSAGE, actions: [{ kind: "stop" }] };
  }
  if (s.hasComponents && !s.canOptimize) {
    return {
      tone: "error",
      title: FIX_ERRORS,
      list:
        s.hiddenErrors.length > 0
          ? { label: "Errors without a field", items: s.hiddenErrors.map((n) => n.message) }
          : undefined,
      actions: s.problems.map((p) => ({ kind: "show", id: p.id, label: p.label })),
    };
  }
  if (s.run.status === "error") {
    return {
      tone: "error",
      title: FAILED,
      line: `${sentence(s.run.message)}${s.hasLayout ? ` ${LAST_GOOD}` : ""}`,
      actions: [{ kind: "retry" }],
      alert: true,
    };
  }
  if (s.pending) {
    return { tone: "info", title: MAKING_PLAN_MESSAGE, actions: [] };
  }
  const [first] = s.conflicts;
  if (first !== undefined) {
    return {
      tone: "warn",
      fit: "pins",
      title: conflictSentence(first),
      line: conflictLine(s.conflicts),
      actions: s.conflicts.map((c) => ({
        kind: "unpin",
        conflict: c,
        label: c.kind === "size" ? `Unlock size of ${c.name}` : `Unpin ${c.name}`,
      })),
    };
  }
  if (s.noFit !== null) {
    const misfit = s.noFit.misfit;
    const figure = shortfallSentence(s.noFit.shortfall);
    const line =
      misfit === null
        ? figure
        : misfit.reason === "bed"
          ? "It's too big for your printer's bed."
          : `There's no room left for it in the box.${figure === "" ? "" : ` ${figure}`}`;
    return {
      tone: "warn",
      fit: "noFit",
      title:
        misfit === null ? "Not everything fits yet" : `The ${misfit.name} tray doesn't fit yet`,
      line: line === "" ? undefined : line,
      actions: [
        ...(misfit === null
          ? []
          : [{ kind: "show", id: misfit.componentId, label: `Edit ${misfit.name}` } as const]),
        ...keep,
      ],
    };
  }
  if (s.fits !== null) {
    return {
      tone: "fit",
      title: "Everything fits",
      line: `${plural(s.fits.trays, "tray", "trays")} in ${plural(s.fits.layers, "layer", "layers")}, ${mm(s.fits.height)} of ${mm(s.fits.boxHeight)} mm high`,
      actions: keep,
    };
  }
  return {
    tone: "neutral",
    title: "No plan yet",
    actions: s.hasComponents ? [{ kind: "keep", label: "Make a plan" }] : [],
  };
}

/** The parts of the app that hold an error, in the order the errors come: a way to each. */
export function problemAreas(
  validation: readonly NoticeData[],
  components: readonly Component[],
): ProblemArea[] {
  const out: ProblemArea[] = [];
  const add = (area: ProblemArea): void => {
    if (!out.some((a) => a.id === area.id)) {
      out.push(area);
    }
  };
  for (const n of validation) {
    const path = n.path;
    if (n.level !== "error" || path === undefined) {
      continue;
    }
    if (path.startsWith("/box")) {
      add({ id: "box", label: "Change the box" });
    } else if (path.startsWith("/settings") || path.startsWith("/printer")) {
      add({ id: "settings", label: "Settings" });
    } else {
      const index = /^\/components\/(\d+)(?:\/|$)/.exec(path)?.[1];
      const component = index === undefined ? undefined : components[Number(index)];
      if (component !== undefined) {
        add({
          id: component.id,
          label: `Edit ${component.name === "" ? "(unnamed)" : component.name}`,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the switches

export type StageView = "plan" | "3d";

const WEBGL_REASON = "3D needs WebGL";

/** The Layer switch's value for "All" (the 3D view: nothing cut away). */
const ALL_LAYERS = "all";

/**
 * The Layer switch's options: "Layer 1 (bottom)", "Layer 2", "Layer 3 (top)" (`layerLabel`), with
 * no height: the status line gives the plan's. With `all` (the 3D view) a first option, "All",
 * cuts nothing away.
 */
export function layerOptions(trays: readonly TraySpec[], all = false) {
  const levels = levelsOf(trays);
  const layers = levels.map((_, i) => ({ value: String(i), label: layerLabel(i, levels.length) }));
  return all ? [{ value: ALL_LAYERS, label: "All" }, ...layers] : layers;
}

export interface StageTopProps extends StatusInput {
  /** The stored plan's trays (`layout.trays`), for the Layer switch; without them (no plan) there are no switches. */
  trays?: readonly TraySpec[];
  /** The layer the plan shows (0 = the bottom). */
  level: number;
  onLevelChange: (level: number) => void;
  /**
   * In 3D the switch cuts instead: the index of the highest layer drawn (layers 1 to it), or null
   * for All. The top view's `level` is left alone.
   */
  cut: number | null;
  onCutChange: (cut: number | null) => void;
  view: StageView;
  onViewChange: (view: StageView) => void;
  /** The browser can draw the 3D view. */
  webgl: boolean;
  /** Below 760 px: the segments take their own row (MobileWorkspace). */
  phone: boolean;
  onKeepSearching: () => void;
  onStop: () => void;
  onRetry: () => void;
  /** A component's id, "box" or "settings". */
  onShow: (id: string) => void;
}

/**
 * The status row: the heading (the page's one h1, with its tone's icon and a muted line), the
 * Layer and View switches, and the action. The Summary's jobs that belong here: the optimizer
 * error and Retry, the errors with no field, the jump links.
 */
export function StageTop(p: StageTopProps) {
  const status = statusOf(p);
  // Keep searching and Stop swap places: the one pressed hands the focus to the other.
  const row = useRef<HTMLDivElement>(null);
  const clicked = useRef<"keep" | "stop" | null>(null);
  useEffect(() => {
    const want = clicked.current;
    if (want === null) {
      return;
    }
    const toggle = row.current?.querySelector<HTMLElement>("[data-toggle]") ?? null;
    const active = document.activeElement;
    if (toggle !== null && active === toggle) {
      return; // still the button that was pressed
    }
    if (active !== null && active !== document.body) {
      clicked.current = null; // the focus went elsewhere on purpose
    } else if (toggle !== null && toggle.dataset.toggle !== want) {
      toggle.focus();
      clicked.current = null;
    }
  });

  // A fit problem's actions are the cards of its own panel (FitProblem), not pills in the heading.
  const actions = status.actions
    .filter((a) => a.kind !== "unpin")
    .map((a) => {
      switch (a.kind) {
        case "keep":
          // On a phone the heading has no room for the words beside it: a search icon, named.
          return p.phone && a.label === "Keep searching" ? (
            <IconButton
              key="keep"
              data-toggle="keep"
              label={a.label}
              variant="outlined"
              icon={<Icon name="search" size={18} />}
              onClick={() => {
                clicked.current = "keep";
                p.onKeepSearching();
              }}
            />
          ) : (
            <Button
              key="keep"
              data-toggle="keep"
              icon={a.label === "Keep searching" ? <Icon name="search" size={16} /> : undefined}
              onClick={() => {
                clicked.current = "keep";
                p.onKeepSearching();
              }}
            >
              {a.label}
            </Button>
          );
        case "stop":
          return (
            <Button
              key="stop"
              class="stage-stop"
              data-toggle="stop"
              onClick={() => {
                clicked.current = "stop";
                p.onStop();
              }}
            >
              Stop
            </Button>
          );
        case "retry":
          return (
            <Button key="retry" onClick={p.onRetry}>
              Retry
            </Button>
          );
        case "show":
          return (
            <Button key={a.id} title={a.label} onClick={() => p.onShow(a.id)}>
              <span class="ellipsis">{a.label}</span>
            </Button>
          );
      }
    });

  const in3d = p.view === "3d";
  const options = p.trays === undefined ? [] : layerOptions(p.trays, in3d);
  const layers = options.length - (in3d ? 1 : 0);
  const layerValue = in3d
    ? p.cut === null || p.cut >= layers
      ? ALL_LAYERS
      : String(Math.max(0, p.cut))
    : String(Math.max(0, Math.min(p.level, layers - 1)));
  const layer =
    layers > 1 ? (
      <Segmented
        label="Layer"
        tone="track"
        stretch={p.phone}
        options={options}
        value={layerValue}
        onChange={(v) =>
          in3d ? p.onCutChange(v === ALL_LAYERS ? null : Number(v)) : p.onLevelChange(Number(v))
        }
      />
    ) : null;
  const showView = p.trays !== undefined;
  const blocked = p.webgl ? undefined : WEBGL_REASON;
  const view = !showView ? null : p.phone ? (
    <Button
      aria-pressed={p.view === "3d"}
      blockedReason={blocked}
      onClick={() => p.onViewChange(p.view === "3d" ? "plan" : "3d")}
    >
      3D
    </Button>
  ) : (
    <Segmented
      label="View"
      tone="track"
      options={[
        { value: "plan", label: "Top" },
        { value: "3d", label: "3D", blockedReason: blocked },
      ]}
      value={p.view}
      onChange={p.onViewChange}
    />
  );

  // Desktop: the switches and the action in one group (Main); phone: the action alone, the switches under.
  const extra = p.phone ? actions : [layer, view, ...actions].filter((x) => x !== null);

  const line: ComponentChildren =
    status.list !== undefined ? (
      <>
        {status.line}
        <ul class="stage-list" aria-label={status.list.label}>
          {status.list.items.map((item, i) => (
            <li key={`${i}|${item}`}>{item}</li>
          ))}
        </ul>
      </>
    ) : (
      status.line
    );

  return (
    <>
      <div data-region="status" ref={row}>
        <StatusHeading
          tone={status.tone}
          title={status.title}
          line={line}
          extra={extra.length > 0 ? extra : undefined}
        />
      </div>
      {p.phone && (layer !== null || view !== null) ? (
        <div class="stage-segs" data-region="switches">
          {layer}
          {view}
        </div>
      ) : null}
      {showView && !p.webgl ? (
        <p class="stage-note">
          3D needs a browser with WebGL turned on. The top view works the same.
        </p>
      ) : null}
      {status.alert === true ? (
        <p class="visually-hidden" role="alert">
          {`${status.title}. ${status.line ?? ""}`}
        </p>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- the plan banner

export interface PlanBannerProps {
  /** The plan is from before the latest changes (and nothing else is about to replace it). */
  stale: boolean;
  /** The plan was made under older tray geometry. */
  geometryOld: boolean;
  onUpdate: () => void;
  onReprint: () => void;
  onKeepOld: () => void;
}

const SPLIT = GEOMETRY_OLD_MESSAGE.indexOf(". ") + 1;
/** "Made with an older version of the app." and the rest: the banner's bold lead and its words. */
const OLD_TITLE = GEOMETRY_OLD_MESSAGE.slice(0, SPLIT);
const OLD_BODY = GEOMETRY_OLD_MESSAGE.slice(SPLIT).trim();
const STALE_BODY = "Download is off until it is updated.";

/**
 * Above the status row: the one banner that asks for a decision about the plan itself (never two:
 * where the plan is both old and out of date, the older-geometry one speaks, `placeNotices`).
 * The banner carries no role; the visually hidden region beside it, always on the page, says it.
 */
export function PlanBanner(p: PlanBannerProps) {
  const text = p.geometryOld
    ? GEOMETRY_OLD_MESSAGE
    : p.stale
      ? `${STALE_MESSAGE} ${STALE_BODY}`
      : "";
  return (
    <>
      <div class="visually-hidden" role="status" data-live="banner">
        {text}
      </div>
      {p.geometryOld ? (
        <div data-region="banner">
          <Notice
            tone="warn"
            title={OLD_TITLE}
            primary={{ label: "Reprint everything", onClick: p.onReprint }}
            secondary={{ label: "Use the old plan", onClick: p.onKeepOld }}
          >
            {OLD_BODY}
          </Notice>
        </div>
      ) : null}
      {p.stale ? (
        <div data-region="banner">
          <Notice
            tone="info"
            title={STALE_MESSAGE}
            primary={{ label: "Make a new plan", onClick: p.onUpdate }}
          >
            {STALE_BODY}
          </Notice>
        </div>
      ) : null}
    </>
  );
}
