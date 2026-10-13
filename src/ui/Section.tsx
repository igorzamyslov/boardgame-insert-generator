// src/ui/Section.tsx
import type { ComponentChildren } from "preact";

export interface SectionProps {
  id: string;
  /** The step number shown before the title; none for an Advanced-only section. */
  step?: number;
  title: string;
  /** One line shown while the section is folded: what is set in it. */
  summary: string;
  /** An error is inside: the summary says so in madder. */
  problem?: boolean;
  /** Only shown in Advanced mode: marked with the dotted edge. */
  advanced?: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ComponentChildren;
}

/** A rail section: one line when folded, its fields when open. The App keeps one open at a time. */
export function Section(p: SectionProps) {
  return (
    <details
      class={p.advanced ? "pf-acc pf-adv" : "pf-acc"}
      id={`section-${p.id}`}
      open={p.open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now !== p.open) {
          p.onToggle(now);
        }
      }}
    >
      <summary>
        <h2 class="pf-acc__title">
          {p.step !== undefined ? (
            <span class="pf-step" aria-hidden="true">
              {p.step}
            </span>
          ) : null}
          {p.title}
        </h2>
        <span class="visually-hidden">, </span>
        <span class="pf-acc__meta" data-problem={p.problem ? "true" : undefined}>
          {p.problem ? "Needs attention" : p.summary}
        </span>
      </summary>
      <div class="pf-acc__body">{p.children}</div>
    </details>
  );
}
