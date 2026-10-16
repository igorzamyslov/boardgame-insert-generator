// src/ui/StatusLine.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { RunState } from "../app/state";
import type { LockConflict } from "../layout/types";
import type { Misfit } from "./noFit";

export interface StatusLineProps {
  run: RunState;
  /** A run is scheduled or going: the plan is about to change by itself. */
  pending: boolean;
  /** Components exist and no input is in error (otherwise the inputs say what to fix). */
  canOptimize: boolean;
  hasLayout: boolean;
  /** What a plan that matches the inputs holds; null when the plan is out of date or absent. */
  fits: { trays: number; layers: number; height: number; boxHeight: number } | null;
  /** Searching on from this plan is right (it is not from older tray geometry). */
  canSearchMore: boolean;
  /** The search found no layout; `misfit` is the component that most clearly does not fit. */
  noFit: { misfit: Misfit | null } | null;
  /** The pins the last run could not keep. */
  conflicts: readonly LockConflict[];
  /** Keep searching, or Make a plan when there is no plan yet. */
  onKeepSearching: () => void;
  onStop: () => void;
  onEdit: (componentId: string) => void;
  onUnpin: (conflict: LockConflict) => void;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const mm = (v: number): string => String(Math.round(v * 10) / 10);

function Pill({ kind, children }: { kind: string; children: ComponentChildren }) {
  return (
    <div class="pf-status__pill" data-kind={kind}>
      {children}
    </div>
  );
}

/**
 * The line above the plan: what the plan is doing or what is wrong with it, with the one thing to
 * press. One pill per matter, each on a single line.
 */
export function StatusLine(p: StatusLineProps) {
  // Keep searching and Stop swap places in the line: the one pressed hands the focus to the other.
  const root = useRef<HTMLDivElement>(null);
  const clicked = useRef<"keep" | "stop" | null>(null);
  useEffect(() => {
    const want = clicked.current;
    if (want === null) {
      return;
    }
    const toggle = root.current?.querySelector<HTMLElement>("[data-toggle]") ?? null;
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
  // The percent only ever goes up during a run (the total can change under it) and stops at 100.
  const shown = useRef(0);
  const lastDone = useRef(0);
  let percent = 0;
  if (p.run.status === "running") {
    const raw = Math.floor((100 * p.run.done) / Math.max(1, p.run.total));
    // `done` never goes down within a run, so a lower one is a new run replacing this one.
    if (p.run.done < lastDone.current) {
      shown.current = 0;
    }
    lastDone.current = p.run.done;
    percent = Math.max(shown.current, Math.min(100, Math.max(0, raw)));
    shown.current = percent;
  } else {
    shown.current = 0;
    lastDone.current = 0;
  }
  if (!p.canOptimize) {
    return null;
  }
  const keepSearching = (cls = "") => (
    <button
      type="button"
      class={`pf-status__btn${cls}`}
      data-toggle="keep"
      onClick={() => {
        clicked.current = "keep";
        p.onKeepSearching();
      }}
    >
      Keep searching
    </button>
  );
  let pills: ComponentChildren = null;
  if (p.run.status === "running") {
    pills = (
      <Pill kind="busy">
        <span class="pf-status__text">Updating the plan…</span>
        <progress value={percent} max={100} aria-label="Updating the plan" />
        <span class="pf-status__percent" aria-hidden="true">{`${percent}%`}</span>
        <button
          type="button"
          class="pf-status__btn"
          data-toggle="stop"
          onClick={() => {
            clicked.current = "stop";
            p.onStop();
          }}
        >
          Stop
        </button>
      </Pill>
    );
  } else if (p.pending) {
    pills = (
      <Pill kind="busy">
        <span class="pf-status__text">Updating the plan…</span>
      </Pill>
    );
  } else if (p.conflicts.length > 0) {
    pills = p.conflicts.map((c) => (
      <Pill kind="problem" key={`${c.trayKey}|${c.kind ?? ""}`}>
        <span class="pf-status__text">
          {c.kind === "size"
            ? `${c.name} doesn't fit with its size locked`
            : `${c.name} doesn't fit with your pins`}
        </span>
        <button type="button" class="pf-status__btn" onClick={() => p.onUnpin(c)}>
          {c.kind === "size" ? `Unlock size of ${c.name}` : `Unpin ${c.name}`}
        </button>
      </Pill>
    ));
  } else if (p.noFit !== null) {
    const misfit = p.noFit.misfit;
    pills = (
      <Pill kind="problem">
        <span class="pf-status__text">
          {misfit === null
            ? "The trays don't fit the box yet"
            : misfit.reason === "bed"
              ? `${misfit.name} is too big for your printer's bed`
              : `${misfit.name} doesn't fit the box yet`}
        </span>
        {misfit === null ? null : (
          <button type="button" class="pf-status__btn" onClick={() => p.onEdit(misfit.componentId)}>
            {`Edit ${misfit.name}`}
          </button>
        )}
        {keepSearching(" pf-status__btn--phone-off")}
      </Pill>
    );
  } else if (p.fits !== null) {
    const f = p.fits;
    pills = (
      <Pill kind="fits">
        <span class="pf-status__text">
          <strong>Everything fits.</strong>{" "}
          {`${plural(f.trays, "tray", "trays")} in ${plural(f.layers, "layer", "layers")}, ${mm(f.height)} of ${mm(f.boxHeight)} mm high.`}
        </span>
        {p.canSearchMore ? keepSearching() : null}
      </Pill>
    );
  } else if (!p.hasLayout) {
    pills = (
      <Pill kind="idle">
        <span class="pf-status__text">No plan yet</span>
        <button
          type="button"
          class="pf-status__btn"
          data-toggle="keep"
          onClick={() => {
            clicked.current = "keep";
            p.onKeepSearching();
          }}
        >
          Make a plan
        </button>
      </Pill>
    );
  }
  if (pills === null) {
    return null;
  }
  return (
    <div class="pf-status stage-block" role="group" aria-label="Plan status" ref={root}>
      {pills}
    </div>
  );
}
