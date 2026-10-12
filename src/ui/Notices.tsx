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
  renderAction?: (n: Notice) => ComponentChildren;
  label?: string;
}

export function Notices({ notices, onDismiss, renderAction, label = "Messages" }: NoticesProps) {
  if (notices.length === 0) {
    return null;
  }
  return (
    <ul class="notices" aria-label={label} aria-live="polite">
      {notices.map((n) => (
        <li
          key={`${n.code}|${n.message}`}
          class={`notice notice-${n.level}`}
          role={n.level === "error" ? "alert" : undefined}
        >
          <span class="notice-level">{LEVEL_LABEL[n.level]}:</span>{" "}
          <span class="notice-text">{n.message}</span>
          {renderAction ? <span class="notice-action">{renderAction(n)}</span> : null}
          {onDismiss ? (
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
