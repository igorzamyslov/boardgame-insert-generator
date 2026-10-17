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
import type { Component, Notice as NoticeData, TraySpec } from "../model/types";
import { levelsOf, traysAt } from "../plan/layers";
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
  /** Left out on a phone: the sheet's bar offers it there. */
  phoneOff?: boolean;
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
  /** The search found no layout; `misfit` is the component that most clearly does not fit. */
  noFit: { misfit: Misfit | null } | null;
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
 * What the status heading says: its tone, the h1, the muted line and what to press. Task 12 adds
 * the fit problems' fixes here.
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
  const [first, ...rest] = s.conflicts;
  if (first !== undefined) {
    return {
      tone: "warn",
      title: conflictSentence(first),
      list:
        rest.length > 0
          ? { label: "More pins in the way", items: rest.map(conflictSentence) }
          : undefined,
      actions: s.conflicts.map((c) => ({
        kind: "unpin",
        conflict: c,
        label: c.kind === "size" ? `Unlock size of ${c.name}` : `Unpin ${c.name}`,
      })),
    };
  }
  if (s.noFit !== null) {
    const misfit = s.noFit.misfit;
    return {
      tone: "warn",
      title:
        misfit === null ? "Not everything fits yet" : `The ${misfit.name} tray doesn't fit yet`,
      line:
        misfit === null
          ? undefined
          : misfit.reason === "bed"
            ? "It's too big for your printer's bed."
            : "There's no room left for it in the box.",
      actions: [
        ...(misfit === null
          ? []
          : [{ kind: "show", id: misfit.componentId, label: `Edit ${misfit.name}` } as const]),
        ...keep.map((a) => ({ ...a, phoneOff: true })),
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

/** The Layer switch's options: "Layer 1 (bottom) · 40 mm" (a phone drops the height). */
export function layerOptions(trays: readonly TraySpec[], phone: boolean) {
  const levels = levelsOf(trays);
  return levels.map((level, i) => {
    const label = layerLabel(i, levels.length);
    const height = Math.max(0, ...traysAt(trays, level).map((t) => t.h));
    return { value: String(i), label: phone ? label : `${label} · ${mm(height)} mm` };
  });
}

export interface StageTopProps extends StatusInput {
  /** The plan's parts, for the Layer switch; without them (no plan) there are no switches. */
  trays?: readonly TraySpec[];
  /** The layer the plan shows (0 = the bottom). */
  level: number;
  onLevelChange: (level: number) => void;
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
  onUnpin: (conflict: LockConflict) => void;
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

  const actions = status.actions
    .filter((a) => !(a.kind === "keep" && a.phoneOff === true && p.phone))
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
        case "unpin":
          return (
            <Button
              key={`${a.conflict.trayKey}|${a.conflict.kind ?? ""}`}
              title={a.label}
              onClick={() => p.onUnpin(a.conflict)}
            >
              <span class="ellipsis">{a.label}</span>
            </Button>
          );
      }
    });

  const options = p.trays === undefined ? [] : layerOptions(p.trays, p.phone);
  const layerValue = String(Math.max(0, Math.min(p.level, options.length - 1)));
  const layer =
    options.length > 1 ? (
      <Segmented
        label="Layer"
        tone="track"
        stretch={p.phone}
        options={options}
        value={layerValue}
        onChange={(v) => p.onLevelChange(Number(v))}
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
            <li key={`${i}|${item}`} class="ellipsis" title={item}>
              {item}
            </li>
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
