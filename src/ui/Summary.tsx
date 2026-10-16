// src/ui/Summary.tsx
import type { RunState } from "../app/state";
import { PRINT_FLOW_MM3_PER_S } from "../layout";
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
  canOptimize: boolean;
  /** Components exist: when the optimizer is blocked, errors are the reason, not an empty project. */
  hasComponents: boolean;
  /** The errors that have no field on screen (`errorsWithoutField`). */
  hiddenErrors: readonly Notice[];
  /** The input sections that hold an error, so the summary can send the reader there. */
  problemSections: readonly { id: string; title: string }[];
  onShowSection: (id: string) => void;
  onRetry: () => void;
}

/**
 * A rough duration for the print-time readout: minutes (to 5) under an hour, else hours to the
 * half hour. The estimate is too loose for finer figures.
 */
export function formatPrintTime(minutes: number): string {
  const nearest5 = Math.max(5, Math.round(minutes / 5) * 5);
  if (nearest5 < 60) {
    return `${nearest5} min`;
  }
  return `${Math.round((minutes / 60) * 2) / 2} h`;
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
  return (
    <>
      <p class="visually-hidden" role="status">
        {liveText(p.run)}
      </p>
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
      {p.summary ? (
        <dl class="pf-readouts pf-readouts--strip stage-block">
          <Readout
            label="Slack left–right"
            value={p.summary.playX.toFixed(2)}
            unit="mm"
            warn={p.summary.playX > p.summary.playLimit}
          />
          <Readout
            label="Slack front–back"
            value={p.summary.playY.toFixed(2)}
            unit="mm"
            warn={p.summary.playY > p.summary.playLimit}
          />
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
          <Readout
            label="Print time (rough: nominal flow only)"
            value={`≈ ${formatPrintTime(p.summary.printMinutes)}`}
          />
          <Readout
            label="Longest single part"
            value={`≈ ${formatPrintTime(p.summary.longestPartMinutes)}`}
          />
        </dl>
      ) : null}
      {p.summary ? (
        <p class="hint stage-block">
          Slack is the sideways play the trays have in the box: twice the box clearance, plus one
          tray gap for each extra tray in a row. Above {p.summary.playLimit} mm (your Play limit, in
          Exact values) trays can shift when the box is moved.
          {` The filament estimate prints the first 3 perimeters and the top and bottom 5 layers of every part solid, whatever the infill, and only the interior beyond that at ${p.summary.infillPct} %. Walls, floors and thin parts are therefore counted solid, so it falls well below the 100 % figure only for thick blocks and raised floors. The estimate is rounded to the nearest gram, the 100 % figure up. The print time is that same plastic volume at a steady ${PRINT_FLOW_MM3_PER_S} mm³/s, and nothing else: travel, acceleration, cooling and slower outer walls are not modelled, so a real print usually takes longer, small parts much longer. Use it to compare, or to plan which parts go on one overnight plate.`}
        </p>
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
