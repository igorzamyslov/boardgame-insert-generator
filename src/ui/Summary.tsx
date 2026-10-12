// src/ui/Summary.tsx
import { STALE_CODE } from "../app/state";
import type { RunState } from "../app/state";
import { PLAY_LIMIT_MM } from "../layout";
import type { LayoutSummary } from "../layout/types";
import type { Notice } from "../model/types";
import { Notices } from "./Notices";

export interface SummaryProps {
  summary: LayoutSummary | null;
  run: RunState;
  notices: readonly Notice[];
  hasLayout: boolean;
  canUndo: boolean;
  canOptimize: boolean;
  shortfall: { x: number; y: number; z: number } | null;
  onReoptimize: () => void;
  onImprove: () => void;
  onUndo: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

/** A shortfall in mm rounded up to 0.1 mm, the rule of plan 4's `layout.doesNotFit` notice
 * (`mmUp`, roadmap §4.8): the line here and the notice below agree, and a positive shortfall
 * never reads 0.0. */
function mmUp(v: number): string {
  return (Math.ceil(Math.round(v * 100) / 10) / 10).toFixed(1);
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
  return parts.length > 0 ? `Doesn't fit: short by ${parts.join(" and ")}.` : null;
}

function Play({ label, mm }: { label: string; mm: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd class={mm > PLAY_LIMIT_MM ? "play-warn" : undefined}>{`${mm.toFixed(1)} mm`}</dd>
    </div>
  );
}

export function Summary(p: SummaryProps) {
  const running = p.run.status === "running";
  const shortfall = p.shortfall ? shortfallText(p.shortfall) : null;
  return (
    <section class="panel summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Summary</h2>
      {p.run.status === "running" ? (
        <div class="run-status" role="status">
          <progress value={p.run.done} max={p.run.total} aria-label="Optimizing" />
          <span>{`Optimizing… ${Math.floor((100 * p.run.done) / Math.max(1, p.run.total))}%`}</span>
          <button type="button" onClick={p.onCancel}>
            Cancel
          </button>
        </div>
      ) : null}
      {p.run.status === "error" ? (
        <div class="run-error" role="alert">
          <p>
            {`The optimizer failed: ${p.run.message}.`}
            {p.hasLayout ? " The last good layout is still shown." : ""}
          </p>
          <button type="button" onClick={p.onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {p.summary ? (
        <dl class="summary-grid">
          <div>
            <dt>Box filled</dt>
            <dd>{`${p.summary.fillPct.toFixed(0)} %`}</dd>
          </div>
          <div>
            <dt>Trays</dt>
            <dd>{p.summary.trayCount}</dd>
          </div>
          <div>
            <dt>Stacks</dt>
            <dd>{p.summary.stackCount}</dd>
          </div>
          <div>
            <dt>Filament</dt>
            <dd>
              {`≤ ${Math.ceil(p.summary.filamentG)} g `}
              <span class="hint">(upper bound: PLA at 100 % infill)</span>
            </dd>
          </div>
          <Play label="Play left–right" mm={p.summary.playX} />
          <Play label="Play front–back" mm={p.summary.playY} />
        </dl>
      ) : running ? null : (
        <p class="hint">
          {p.canOptimize
            ? "No layout yet."
            : "No layout yet. Enter the box size and add at least one component."}
        </p>
      )}
      {shortfall ? <p class="shortfall">{shortfall}</p> : null}
      <div class="button-row">
        <button type="button" onClick={p.onReoptimize} disabled={running || !p.canOptimize}>
          Re-optimize
        </button>
        <button
          type="button"
          onClick={p.onImprove}
          disabled={running || !p.hasLayout || !p.canOptimize}
        >
          Improve more
        </button>
        <button type="button" onClick={p.onUndo} disabled={running || !p.canUndo}>
          Undo layout
        </button>
      </div>
      <Notices
        notices={p.notices}
        label="Layout messages"
        renderAction={(n) =>
          n.code === STALE_CODE ? (
            <button type="button" onClick={p.onReoptimize} disabled={running || !p.canOptimize}>
              Re-optimize now
            </button>
          ) : null
        }
      />
    </section>
  );
}
