// src/kit/StatusHeading.tsx
import type { ComponentChildren } from "preact";
import { Icon, type IconName } from "./icons";

export type StatusTone = "fit" | "info" | "warn" | "error" | "neutral";

const ICONS: Record<StatusTone, IconName> = {
  fit: "check",
  info: "arc",
  warn: "warn",
  error: "alert",
  neutral: "box",
};

export interface StatusHeadingProps {
  tone: StatusTone;
  /** The page's h1: one line, cut with an ellipsis, the whole of it in a `title`. */
  title: string;
  /** Muted, under the title. */
  line?: string;
  /** To the right, wrapping under on a narrow stage: segments, Keep searching, Stop. */
  extra?: ComponentChildren;
  /** The heading level: 1 on a page (there is one h1 per screen); the gallery shows several. */
  level?: 1 | 2 | 3;
}

/** The status of the plan: a tone's round icon, the h1 and a line (Main's "Everything fits"). */
export function StatusHeading({ tone, title, line, extra, level = 1 }: StatusHeadingProps) {
  const Heading = `h${level}` as const;
  return (
    <div class="k-status" data-tone={tone}>
      <div class="k-status__lead">
        <span class="k-status__icon" aria-hidden="true">
          <Icon name={ICONS[tone]} size={20} />
        </span>
        <div class="k-status__text">
          <Heading class="k-status__title ellipsis" title={title}>
            {title}
          </Heading>
          {line !== undefined ? <span class="k-status__line">{line}</span> : null}
        </div>
      </div>
      {extra !== undefined ? <div class="k-status__extra">{extra}</div> : null}
    </div>
  );
}
