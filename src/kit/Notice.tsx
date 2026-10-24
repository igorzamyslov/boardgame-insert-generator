// src/kit/Notice.tsx
import type { ComponentChildren } from "preact";
import { Button } from "./Button";
import { CloseButton } from "./IconButton";

export interface NoticeChoice {
  label: string;
  onClick: () => void;
}

export interface NoticeProps {
  tone: "info" | "warn";
  /** Said in bold first. */
  title: string;
  /** The words after it. */
  children?: ComponentChildren;
  primary?: NoticeChoice;
  secondary?: NoticeChoice;
  /** Present: a × closes the notice. Only for a note that blocks nothing (an error stays). */
  onClose?: () => void;
  /** The × button's name (default "Hide this note"). */
  closeLabel?: string;
}

/**
 * Main's banner: a bold title, its words and up to two small pills. It carries no `role`: a
 * visually hidden live region beside it says it (DEVELOPMENT, "MUST mount a live region").
 */
export function Notice({
  tone,
  title,
  children,
  primary,
  secondary,
  onClose,
  closeLabel = "Hide this note",
}: NoticeProps) {
  return (
    <div class="k-notice" data-tone={tone} data-closable={onClose ? "true" : undefined}>
      <span class="k-notice__text">
        <strong>{title}</strong> {children}
      </span>
      {primary !== undefined || secondary !== undefined ? (
        <span class="k-notice__actions">
          {primary !== undefined ? (
            <Button variant="primary" onClick={primary.onClick}>
              {primary.label}
            </Button>
          ) : null}
          {secondary !== undefined ? (
            <Button variant="secondary" onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          ) : null}
        </span>
      ) : null}
      {onClose ? (
        <span class="k-notice__close">
          <CloseButton label={closeLabel} onClick={onClose} />
        </span>
      ) : null}
    </div>
  );
}
