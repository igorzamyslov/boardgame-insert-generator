// src/ui/Notices.tsx
import type { ComponentChildren } from "preact";
import type { Notice } from "../model/types";

const LEVEL_LABEL: Record<Notice["level"], string> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
};

export interface NoticesProps {
  notices: readonly Notice[];
  onDismiss?: (code: string) => void;
  /** Hides the dismiss button of notices that must stay until they are resolved. */
  canDismiss?: (n: Notice) => boolean;
  renderAction?: (n: Notice) => ComponentChildren;
  label?: string;
}

export function Notices({
  notices,
  onDismiss,
  canDismiss,
  renderAction,
  label = "Messages",
}: NoticesProps) {
  if (notices.length === 0) {
    return null;
  }
  return (
    <ul class="notices" aria-label={label}>
      {notices.map((n) => (
        <li
          key={`${n.code}|${n.path ?? ""}|${n.message}`}
          class={`notice notice-${n.level}`}
          role={n.level === "error" ? "alert" : undefined}
        >
          <span class="notice-level">{LEVEL_LABEL[n.level]}:</span>{" "}
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
        </li>
      ))}
    </ul>
  );
}
