// src/screens/StageTop.tsx
// The top of the stage (UI rebuild Task 6, then board 1 of the 2026-10-23 review): the plan banner,
// then the one toolbar row: the status (the page's one h1, with its sub-line) on the left, the Top / 3D
// switch and the ⋯ menu on the right; the Layer switch has a row of its own under it.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import {
  GEOMETRY_OLD_MESSAGE,
  MAKING_PLAN_MESSAGE,
  STALE_MESSAGE,
  type RunState,
} from "../app/state";
import { Button, MenuItem, MenuPanel, Notice, Segmented, StatusHeading } from "../kit";
import type { StatusTone } from "../kit";
import type { LockConflict } from "../layout/types";
import { mmUp } from "../layout/warnings";
import type { Component, Notice as NoticeData, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { mm } from "../ui/identity";
import { FitStrip } from "./FitStrip";
import { HeaderMenu } from "./Header";
import type { Misfit } from "../ui/noFit";
import type { VolumeNote } from "../ui/volumeFit";

// ---------------------------------------------------------------- what the status says

/** What a plan that matches the inputs holds: the line under "Everything fits". */
export interface Fits {
  trays: number;
  layers: number;
  height: number;
  /** The height below the space the box keeps free on top (where every stack reaches). */
  boxHeight: number;
}

/** Searching on for another plan (a menu item); "Make a plan" when there is no plan yet (a button). */
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
    /** What the items need against the box: over the box's volume, it speaks for the heading and no tray is named. */
    volume?: VolumeNote | null;
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

/** The volume is the binding reason: the items' trays need more than the tight share of the box (`volumeNote`). */
export const volumeBinds = (volume: VolumeNote | null | undefined): boolean =>
  volume !== null && volume !== undefined && volume.verdict !== "roomy";

export const SEARCHING_TITLE = "Searching…";
const FIX_ERRORS = "Fix the errors marked in the inputs";
const FAILED = "The plan couldn't be updated";
const LAST_GOOD = "The plan shown is the last good one, from before your latest change.";

const conflictSentence = (c: LockConflict): string =>
  c.kind === "size"
    ? `${c.name} doesn't fit with its size locked`
    : c.kind === "turn"
      ? `${c.name} doesn't fit the way it is turned`
      : `${c.name} doesn't fit with your pins`;

/** What the action of a conflict says it does: a size lock is unlocked, a turn let go, a pin unpinned. */
const conflictAction = (c: LockConflict): string =>
  c.kind === "size"
    ? `Unlock size of ${c.name}`
    : c.kind === "turn"
      ? `Let ${c.name} turn`
      : `Unpin ${c.name}`;

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
 * does not fit and Try another arrangement; Unpin or Unlock size per conflict.
 */
export function statusOf(s: StatusInput): Status {
  const keep: KeepAction[] = s.canSearchMore
    ? [{ kind: "keep", label: "Try another arrangement" }]
    : [];
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
        label: conflictAction(c),
      })),
    };
  }
  if (s.noFit !== null) {
    const volume = s.noFit.volume;
    const misfit = s.noFit.misfit;
    const figure = shortfallSentence(s.noFit.shortfall);
    const line =
      // needing more than the box has is no one tray's fault (App names none then), and no search will change it
      volume?.verdict === "over" && misfit === null
        ? `${volume.line} ${volume.judgement}`
        : misfit === null
          ? figure
          : misfit.reason === "bed"
            ? "It's too big for your printer's bed."
            : misfit.limit !== undefined && !volumeBinds(volume)
              ? // one dimension is the cause: say which, in the engine's own figures
                `${misfit.name} needs ${mmUp(misfit.limit.need)} mm of ${misfit.limit.axis}. The box has ${mm(misfit.limit.have)} mm.`
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
          : [
              {
                kind: "show",
                // a group's tray opens the group's editor, called by the group ("Edit Player kit")
                id: misfit.groupId ?? misfit.componentId,
                label: `Edit ${misfit.groupName ?? misfit.name}`,
              } as const,
            ]),
        ...keep,
      ],
    };
  }
  if (s.fits !== null) {
    return {
      tone: "fit",
      title: "Everything fits",
      line: `${plural(s.fits.trays, "tray", "trays")} · ${plural(s.fits.layers, "layer", "layers")} · ${mm(s.fits.height)} of ${mm(s.fits.boxHeight)} mm`,
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
 * The Layer switch's options, the same in the top view and in 3D (board 2): "Layer 1", "Layer 2" …
 * "Layer n" and "All", with no height (the status line gives the plan's) and no "(bottom)" or "(top)"
 * (the plan's caption names them). "Layer k" shows layers 1 to k; "All" shows every layer.
 */
export function layerOptions(
  trays: readonly TraySpec[],
  levels: readonly number[] = levelsOf(trays),
) {
  return [
    ...levels.map((_, i) => ({ value: String(i), label: `Layer ${i + 1}` })),
    { value: ALL_LAYERS, label: "All" },
  ];
}

/** The Layer switch's value for a pick (`null`: All), kept inside the layers there are. */
export function layerValueOf(pick: number | null, layers: number): string {
  return pick === null || pick >= layers ? ALL_LAYERS : String(Math.max(0, pick));
}

/**
 * The Top / 3D switch of the stage, the normal one's and the editor's: 3D is blocked, with its
 * reason, where the browser cannot draw it.
 */
export function ViewSwitch(p: {
  view: StageView;
  onViewChange: (view: StageView) => void;
  webgl: boolean;
}) {
  return (
    <Segmented
      label="View"
      tone="track"
      options={[
        { value: "plan", label: "Top" },
        { value: "3d", label: "3D", blockedReason: p.webgl ? undefined : WEBGL_REASON },
      ]}
      value={p.view}
      onChange={p.onViewChange}
    />
  );
}

/** Under the switches where the browser cannot draw 3D: why the 3D button is blocked. */
export function WebGlNote() {
  return (
    <p class="stage-note">3D needs a browser with WebGL turned on. The top view works the same.</p>
  );
}

/** What the Layer switch (and, on a phone, the 3D toggle) needs: a subset of the stage's props. */
export type StageSwitchesProps = Pick<
  StageTopProps,
  "trays" | "levels" | "layer" | "onLayerChange" | "view" | "onViewChange" | "webgl" | "phone"
>;

/**
 * The Layer switch's row (board 2): "Layer 1 | Layer 2 | All", the same in both views. On a desktop it
 * is the row under the toolbar; on a phone it is the row under the plan (board 9), with the one "3D"
 * toggle beside it, since the Top / 3D switch is not in a toolbar there.
 */
export function StageSwitches(p: StageSwitchesProps) {
  const options = p.trays === undefined ? [] : layerOptions(p.trays, p.levels);
  const layers = options.length - 1;
  const layerValue = layerValueOf(p.layer, layers);
  const layer =
    layers > 1 ? (
      <Segmented
        label="Layer"
        tone="track"
        stretch={p.phone}
        options={options}
        value={layerValue}
        onChange={(v) => p.onLayerChange(v === ALL_LAYERS ? null : Number(v))}
      />
    ) : null;
  const toggle =
    p.trays === undefined ? null : (
      <Button
        aria-pressed={p.view === "3d"}
        blockedReason={p.webgl ? undefined : WEBGL_REASON}
        onClick={() => p.onViewChange(p.view === "3d" ? "plan" : "3d")}
      >
        3D
      </Button>
    );
  if (p.phone) {
    return layer === null && toggle === null ? null : (
      <div class="stage-segs stage-segs--phone" data-region="switches">
        {layer}
        {toggle}
      </div>
    );
  }
  return layer === null ? null : (
    <div class="stage-segs" data-region="switches">
      <div class="stage-segs__layer">{layer}</div>
    </div>
  );
}

export interface StageTopProps extends StatusInput {
  /** The stored plan's trays (`layout.trays`), for the Layer switch; without them (no plan) there are no switches. */
  trays?: readonly TraySpec[];
  /** The plan's layers (`levelsOf(trays)`), the list the 3D view is given too; made from `trays` when absent. */
  levels?: readonly number[];
  /** The Layer switch's pick, the same for both views: the layer's index (layers 1 to it are shown), or null for All. */
  layer: number | null;
  onLayerChange: (layer: number | null) => void;
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

/** The menu item that searches on for another plan (the status's "keep" action). */
export const TRY_ANOTHER = "Try another arrangement";
const TRY_ANOTHER_LINE = "Searches for longer";

/**
 * The toolbar row: the status (the page's one h1, with its muted sub-line) on the left; on the right
 * what the status asks for (Retry, "Edit <tray>"), the Top / 3D switch and the ⋯ menu. While a search
 * runs, the title reads "Searching… Stop". The Layer switch has the row under it. The Summary's jobs
 * that belong here: the optimizer error and Retry, the errors with no field, the jump links.
 */
export function StageTop(p: StageTopProps) {
  const status = statusOf(p);
  // The menu item and Stop trade places: the one pressed hands the focus to the other (Stop after
  // the menu item, the ⋯ button after Stop).
  const row = useRef<HTMLDivElement>(null);
  const clicked = useRef<"keep" | "stop" | null>(null);
  useEffect(() => {
    const want = clicked.current;
    if (want === null) {
      return;
    }
    const stop = row.current?.querySelector<HTMLElement>("[data-toggle='stop']") ?? null;
    const more = row.current?.querySelector<HTMLElement>(".hd-menu > button") ?? null;
    const active = document.activeElement;
    const fell = active === null || active === document.body || active === more;
    if (want === "keep" && stop !== null && fell) {
      stop.focus();
    } else if (want === "stop" && fell) {
      more?.focus();
    }
    // else the focus went elsewhere on purpose
    if (want === "stop" || stop !== null || !fell) {
      clicked.current = null;
    }
  });

  const keep = status.actions.find((a) => a.kind === "keep");
  // "Make a plan" (no plan yet) is the one thing the row asks for; searching on is a menu item.
  const searchOn = keep !== undefined && keep.label !== "Make a plan";
  const stopping = status.actions.some((a) => a.kind === "stop");
  // No fit: the status row is the pinned problem strip (board 6), its two actions under the heading.
  const strip = status.fit === "noFit";
  // The pins' actions are the cards of FitProblem's panel, not pills in the heading.
  const actions = status.actions
    .filter((a) => a.kind !== "unpin")
    .map((a) => {
      switch (a.kind) {
        case "keep":
          return searchOn || strip ? null : (
            <Button
              key="keep"
              onClick={() => {
                p.onKeepSearching();
              }}
            >
              {a.label}
            </Button>
          );
        case "stop":
          return null;
        case "retry":
          return (
            <Button key="retry" onClick={p.onRetry}>
              Retry
            </Button>
          );
        case "show":
          return strip ? null : (
            <Button key={a.id} title={a.label} onClick={() => p.onShow(a.id)}>
              <span class="ellipsis">{a.label}</span>
            </Button>
          );
      }
    });

  const showView = p.trays !== undefined;
  const desktopView = !showView ? null : (
    <ViewSwitch view={p.view} onViewChange={p.onViewChange} webgl={p.webgl} />
  );

  // The menu is for what is not on screen already: in the no-fit strip its one entry is a button.
  const more = strip ? null : (
    <span key="more">
      <HeaderMenu
        label="Plan options"
        panelId="stage-menu"
        menuDot={false}
        phone={p.phone}
        menu={(close) => (
          <MenuPanel label="Plan options">
            <MenuItem
              class="stage-menu__item"
              blockedReason={
                searchOn ? undefined : stopping ? "Already searching" : "Nothing to try yet"
              }
              onClick={() => {
                clicked.current = "keep";
                close();
                p.onKeepSearching();
              }}
            >
              <span>{TRY_ANOTHER}</span>
              <span class="stage-menu__line">{TRY_ANOTHER_LINE}</span>
            </MenuItem>
          </MenuPanel>
        )}
      />
    </span>
  );

  const stop = stopping ? (
    <Button
      key="stop"
      class="stage-stop"
      variant="quiet"
      data-toggle="stop"
      onClick={() => {
        clicked.current = "stop";
        p.onStop();
      }}
    >
      Stop
    </Button>
  ) : undefined;

  const extra = [
    ...actions,
    !p.phone && desktopView !== null ? (
      <span key="view" data-region="view-switch">
        {desktopView}
      </span>
    ) : null,
    more,
  ];

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

  const stripEdit = status.actions.find((a) => a.kind === "show");
  const stripKeep = status.actions.find((a) => a.kind === "keep");
  return (
    <>
      <div data-region="status" ref={row} class={strip ? "stage-fit" : undefined}>
        <StatusHeading
          tone={status.tone}
          title={status.title}
          line={line}
          titleExtra={stop}
          extra={extra}
        />
        {strip ? (
          <FitStrip
            edit={
              stripEdit?.kind === "show"
                ? { label: stripEdit.label, onClick: () => p.onShow(stripEdit.id) }
                : undefined
            }
            keep={
              stripKeep === undefined
                ? undefined
                : { label: TRY_ANOTHER, onClick: p.onKeepSearching }
            }
            volume={p.noFit?.volume}
            phone={p.phone}
          />
        ) : null}
      </div>
      {p.phone ? null : <StageSwitches {...p} />}
      {showView && !p.webgl ? <WebGlNote /> : null}
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
