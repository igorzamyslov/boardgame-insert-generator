// src/ui/Summary.tsx
import { useRef } from "preact/hooks";
import type { RunState } from "../app/state";
import { NOTICE_CODES, PLAY_LIMIT_MM, REPEAT_FACTOR, mmUp } from "../layout";
import type { LayoutSummary } from "../layout/types";
import type { Notice } from "../model/types";
import { Notices } from "./Notices";

/** Layout messages shown before the rest fold behind "Show all", so the results stay in view. */
export const LAYOUT_NOTICES_SHOWN = 3;

export interface SummaryProps {
  summary: LayoutSummary | null;
  run: RunState;
  notices: readonly Notice[];
  hasLayout: boolean;
  /** The inputs changed since the layout was made: the sentence about it would be out of date. */
  stale: boolean;
  /** The layout was made under older tray geometry: it needs re-running even though the inputs match. */
  geometryOld?: boolean;
  /** The number of layers (levels) and of spare trays in the layout, for the sentence. */
  layers: number;
  spares: number;
  canUndo: boolean;
  canOptimize: boolean;
  /** Components exist: when the optimizer is blocked, errors are the reason, not an empty project. */
  hasComponents: boolean;
  /** The errors that have no field on screen (`errorsWithoutField`). */
  hiddenErrors: readonly Notice[];
  /** Advanced mode is on: it adds the slack and the filament to the results. */
  advanced: boolean;
  /** The input sections that hold an error, so the summary can send the reader there. */
  problemSections: readonly { id: string; title: string }[];
  onShowSection: (id: string) => void;
  shortfall: { x: number; y: number; z: number } | null;
  /** Re-fit from the current layout (the label says which kind of run it is). */
  onRefit: () => void;
  onUndo: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

/** The "short by" line; null when no axis is short (a part over the bed or a locked size is the
 * reason: the doesNotFit notice in the list below says which, naming the tray). */
function shortfallText(s: { x: number; y: number; z: number }): string | null {
  const parts: string[] = [];
  if (s.x > 0) {
    parts.push(`${mmUp(s.x)} mm left–right`);
  }
  if (s.y > 0) {
    parts.push(`${mmUp(s.y)} mm front–back`);
  }
  if (s.z > 0) {
    parts.push(`${mmUp(s.z)} mm in height`);
  }
  return parts.length > 0 ? `Closest attempt so far is short by ${parts.join(" and ")}.` : null;
}

function Readout({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value: string | number;
  unit?: string;
  warn?: boolean;
}) {
  return (
    <div class="pf-readout">
      <dt class="pf-eyebrow">{label}</dt>
      <dd class={warn ? "pf-readout__value play-warn" : "pf-readout__value"}>
        {value}
        {unit ? <span class="pf-readout__unit">{` ${unit}`}</span> : null}
      </dd>
    </div>
  );
}

/** "Optimizer failed: <message>." — without a second full stop when the message has its own. */
function sentence(message: string): string {
  return /[.!?…]$/.test(message) ? message : `${message}.`;
}

/** What the screen-reader live region says: only the start and the end of a run, never the
 * percent (it would be read out at every step). */
function liveText(run: RunState): string {
  if (run.status === "running") {
    return "Updating the plan…";
  }
  return run.status === "done" ? "Plan updated." : "";
}

export function Summary(p: SummaryProps) {
  const running = p.run.status === "running";
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
  // A layout made for the current inputs: pressing the button searches on, rather than catching up.
  const layoutCurrent = p.hasLayout && !p.stale && !p.geometryOld;
  const shortfall = p.shortfall ? shortfallText(p.shortfall) : null;
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const verdict =
    p.summary && !p.stale && p.run.status !== "running"
      ? `${plural(p.summary.trayCount, "tray", "trays")}${
          p.spares > 0 ? ` (${p.spares === 1 ? "1 is a spare" : `${p.spares} are spares`})` : ""
        } in ${plural(Math.max(1, p.layers), "layer", "layers")}, ${p.summary.fillPct.toFixed(0)}% of the box used.`
      : null;
  const playTooLoose =
    p.summary !== null && (p.summary.playX > PLAY_LIMIT_MM || p.summary.playY > PLAY_LIMIT_MM);
  return (
    <>
      <p class="visually-hidden" role="status">
        {liveText(p.run)}
      </p>
      {verdict ? (
        <p class="pf-verdict stage-block">
          <strong>Everything fits.</strong> {verdict}
        </p>
      ) : null}
      {p.run.status === "running" ? (
        <div class="pf-notice stage-block">
          <div class="run-status">
            <strong>Updating the plan…</strong>
            <progress value={percent} max={100} aria-label="Updating the plan" />
            <span aria-hidden="true">{`${percent}%`}</span>
            <button type="button" onClick={p.onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {p.run.status === "error" ? (
        <div class="pf-notice pf-notice--error stage-block" role="alert">
          <div>
            <strong class="notice-level">Error:</strong>{" "}
            {`The plan couldn't be updated. ${sentence(p.run.message)}`}
            {p.hasLayout
              ? " The plan shown is the last good one, from before your latest change."
              : ""}{" "}
            <button type="button" onClick={p.onRetry}>
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {!p.canOptimize && !running && p.hasComponents ? (
        <div class="optimizer-blocked stage-block">
          <p>
            Fix the errors marked in the inputs.
            {p.problemSections.map((sec) => (
              <>
                {" "}
                <button type="button" class="quiet" onClick={() => p.onShowSection(sec.id)}>
                  {`Show ${sec.title}`}
                </button>
              </>
            ))}
          </p>
          {p.hiddenErrors.length > 0 ? (
            <ul aria-label="Errors without a field">
              {p.hiddenErrors.map((n) => (
                <li key={`${n.code}|${n.path ?? ""}|${n.message}`}>{n.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {shortfall ? <p class="shortfall stage-block">{shortfall}</p> : null}
      {p.summary && (p.advanced || playTooLoose) ? (
        <dl class="pf-readouts pf-readouts--strip stage-block">
          <Readout
            label="Slack left–right"
            value={p.summary.playX.toFixed(2)}
            unit="mm"
            warn={p.summary.playX > PLAY_LIMIT_MM}
          />
          <Readout
            label="Slack front–back"
            value={p.summary.playY.toFixed(2)}
            unit="mm"
            warn={p.summary.playY > PLAY_LIMIT_MM}
          />
          {p.advanced ? (
            <>
              <Readout
                label={`Filament (estimate: PLA, ${p.summary.infillPct} % infill)`}
                value={`≈ ${Math.round(p.summary.filamentAtInfillG)}`}
                unit="g"
              />
              <Readout
                label="Filament (upper bound: PLA, 100 % infill)"
                value={`≤ ${Math.ceil(p.summary.filamentG)}`}
                unit="g"
              />
            </>
          ) : null}
        </dl>
      ) : null}
      {p.summary && (p.advanced || playTooLoose) ? (
        <p class="hint stage-block">
          Slack is the sideways play the trays have in the box: twice the box clearance, plus one
          tray gap for each extra tray in a row. Above {PLAY_LIMIT_MM} mm trays can shift when the
          box is moved.
          {p.advanced
            ? ` The filament estimate prints the first 3 perimeters and the top and bottom 5 layers of every part solid, whatever the infill, and only the interior beyond that at ${p.summary.infillPct} %. Walls, floors and thin parts are therefore counted solid, so it falls well below the 100 % figure only for thick blocks and raised floors. The estimate is rounded to the nearest gram, the 100 % figure up.`
            : ""}
        </p>
      ) : null}
      {p.hasComponents ? (
        <>
          <div class="button-row stage-block">
            <button
              type="button"
              onClick={p.onRefit}
              disabled={running || !p.canOptimize}
              aria-describedby="hint-refit"
            >
              {layoutCurrent ? "Keep searching" : "Update plan"}
            </button>
            <button type="button" onClick={p.onUndo} disabled={running || !p.canUndo}>
              Undo layout
            </button>
          </div>
          <p class="hint stage-block">
            <span id="hint-refit">
              {p.notices.some((n) => n.code === NOTICE_CODES.doesNotFit)
                ? `Searches again for a fit, about ${REPEAT_FACTOR} times longer than the last search.`
                : layoutCurrent
                  ? "Searches on from this layout for a tighter arrangement; it never throws the layout away."
                  : p.geometryOld && !p.stale
                    ? "Rebuilds the trays with the current geometry, starting from this layout; it never throws it away."
                    : "Re-fits the trays to your current inputs, starting from this layout; it never throws it away."}
            </span>
          </p>
        </>
      ) : null}
      <Notices
        notices={p.notices}
        label="Layout messages"
        class="stage-block"
        limit={LAYOUT_NOTICES_SHOWN}
      />
    </>
  );
}
