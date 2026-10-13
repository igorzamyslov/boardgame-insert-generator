// src/ui/Notices.tsx
import type { ComponentChildren } from "preact";
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
}

/** Messages with a sign that differs in shape (circle, triangle, octagon), a lead word, and an action. */
export function Notices({
  notices,
  onDismiss,
  canDismiss,
  renderAction,
  label = "Messages",
  class: extra,
}: NoticesProps) {
  if (notices.length === 0) {
    return null;
  }
  return (
    <ul class={extra ? `notices ${extra}` : "notices"} aria-label={label}>
      {notices.map((n) => (
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
                ×
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
