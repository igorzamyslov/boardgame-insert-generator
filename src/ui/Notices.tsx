// src/ui/Notices.tsx
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { GEOMETRY_OLD_MESSAGE, STALE_MESSAGE } from "../app/state";
import type { Notice } from "../model/types";

const LEVEL_LABEL: Record<Notice["level"], string> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
};

const LEVEL_CLASS: Record<Notice["level"], string> = {
  error: "pf-notice pf-notice--error",
  warning: "pf-notice pf-notice--warn",
  info: "pf-notice",
};

/** Errors interrupt a screen reader, warnings are read when it is idle, notes are not announced. */
const ROLE: Record<Notice["level"], "alert" | "status" | undefined> = {
  error: "alert",
  warning: "status",
  info: undefined,
};

export interface NoticesProps {
  notices: readonly Notice[];
  onDismiss?: (code: string) => void;
  /** Hides the dismiss button of notices that must stay until they are resolved. */
  canDismiss?: (n: Notice) => boolean;
  renderAction?: (n: Notice) => ComponentChildren;
  label?: string;
  /** Extra classes of the list (the stage uses `stage-block` to order it on narrow screens). */
  class?: string;
  /**
   * How many notices to show before the rest fold behind a "Show all" button. Errors always
   * show, then the most severe of the others fill the limit; the original order is kept.
   */
  limit?: number;
}

const SEVERITY: Record<Notice["level"], number> = { error: 0, warning: 1, info: 2 };

/** The notices to show for a limit: every error, then the most severe others up to the limit. */
function visibleNotices(notices: readonly Notice[], limit: number): readonly Notice[] {
  const ranked = notices
    .map((n, i) => ({ n, i }))
    .sort((a, b) => SEVERITY[a.n.level] - SEVERITY[b.n.level] || a.i - b.i);
  const keep = new Set(
    ranked.filter((r, rank) => r.n.level === "error" || rank < limit).map((r) => r.i),
  );
  return notices.filter((_, i) => keep.has(i));
}

/** Messages with a sign that differs in shape (circle, triangle, octagon), a lead word, and an action. */
export function Notices({
  notices,
  onDismiss,
  canDismiss,
  renderAction,
  label = "Messages",
  class: extra,
  limit,
}: NoticesProps) {
  const [all, setAll] = useState(false);
  if (notices.length === 0) {
    return null;
  }
  const shown = limit !== undefined && !all ? visibleNotices(notices, limit) : notices;
  const hidden = notices.length - shown.length;
  return (
    <>
      <ul class={extra ? `notices ${extra}` : "notices"} aria-label={label}>
        {shown.map((n) => (
          <li
            key={`${n.code}|${n.path ?? ""}|${n.message}`}
            class={LEVEL_CLASS[n.level]}
            role={ROLE[n.level]}
          >
            <div>
              <strong class="notice-level">{LEVEL_LABEL[n.level]}:</strong>{" "}
              <span class="notice-text">{n.message}</span>
              {renderAction ? <span class="notice-action">{renderAction(n)}</span> : null}
              {onDismiss && (canDismiss ? canDismiss(n) : true) ? (
                <button
                  type="button"
                  class="notice-dismiss"
                  aria-label={`Dismiss: ${n.message}`}
                  onClick={() => onDismiss(n.code)}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                  </svg>
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p class="notices-more stage-block">
          <button type="button" class="quiet" onClick={() => setAll(true)}>
            {`Show all ${notices.length} messages`}
          </button>
          <span class="hint">{` ${hidden} more ${hidden === 1 ? "is" : "are"} hidden.`}</span>
        </p>
      ) : null}
      {limit !== undefined && all && notices.length > limit ? (
        <p class="notices-more stage-block">
          <button type="button" class="quiet" onClick={() => setAll(false)}>
            Show fewer messages
          </button>
        </p>
      ) : null}
    </>
  );
}

export interface PlanBannersProps {
  /** The plan is from before the latest changes (and nothing else is about to replace it). */
  stale: boolean;
  /** The plan was made under older tray geometry. */
  geometryOld: boolean;
  onUpdate: () => void;
  onReprint: () => void;
  onKeepOld: () => void;
}

/** The one banner under the header: it asks for a decision about the plan itself. */
export function PlanBanners(p: PlanBannersProps) {
  if (!p.stale && !p.geometryOld) {
    return null;
  }
  return (
    <>
      {p.geometryOld ? (
        <div class="pf-notice pf-notice--warn" role="status">
          <div>
            <span class="notice-text">{GEOMETRY_OLD_MESSAGE}</span>
            <span class="notice-action">
              <button type="button" onClick={p.onReprint}>
                Reprint everything
              </button>
              <button type="button" onClick={p.onKeepOld}>
                Use the old plan
              </button>
            </span>
          </div>
        </div>
      ) : null}
      {p.stale ? (
        <div class="pf-notice">
          <div>
            <span class="notice-text">{STALE_MESSAGE}</span>
            <span class="notice-action">
              <button type="button" onClick={p.onUpdate}>
                Make a new plan
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
