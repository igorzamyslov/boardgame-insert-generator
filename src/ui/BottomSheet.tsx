// src/ui/BottomSheet.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

export interface BottomSheetProps {
  /** The sheet's name for assistive technology. */
  label: string;
  /** The handle's words. */
  title: string;
  /** A short line after the title that says what is inside (it stays when the sheet is folded). */
  meta?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** The content wants the whole screen (a phone's editor or box): the styles decide below 600 px. */
  full?: boolean;
  /** A button beside the handle, in reach while the sheet is folded. */
  action?: ComponentChildren;
  children: ComponentChildren;
}

const FOCUSABLE =
  "button, input, select, textarea, summary, [href], [tabindex]:not([tabindex='-1'])";

/**
 * A sheet fixed to the foot of a phone's screen: folded, only its 44 px handle shows; open, it
 * covers most of the screen and scrolls inside. The handle is a real button with `aria-expanded`.
 * Folded content is inert, so Tab and a screen reader skip it. Opening moves the focus inside
 * (unless something in there took it already); folding with Escape puts it back on the handle.
 */
export function BottomSheet(p: BottomSheetProps) {
  const bodyId = useId();
  const root = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const active = document.activeElement;
    if (p.expanded) {
      if (!(active instanceof Node && body.current?.contains(active))) {
        body.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      }
    } else if (
      active === document.body ||
      (active instanceof Node && root.current?.contains(active))
    ) {
      handle.current?.focus();
    }
  }, [p.expanded]);
  // `inert` is not in Preact's typings yet.
  const inert = { inert: !p.expanded } as Record<string, unknown>;
  return (
    <section
      class="pf-sheet"
      ref={root}
      aria-label={p.label}
      data-expanded={p.expanded ? "true" : "false"}
      data-full={p.full ? "true" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && p.expanded && !e.defaultPrevented) {
          e.preventDefault();
          p.onExpandedChange(false);
        }
      }}
    >
      <div class="pf-sheet__bar">
        <button
          type="button"
          class="pf-sheet__handle"
          ref={handle}
          aria-expanded={p.expanded}
          aria-controls={bodyId}
          onClick={() => p.onExpandedChange(!p.expanded)}
        >
          <span class="pf-sheet__grip" aria-hidden="true" />
          <span class="pf-sheet__title">{p.title}</span>
          {p.meta === undefined ? null : <span class="pf-sheet__meta">{p.meta}</span>}
          <svg
            class="pf-sheet__chevron"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>
        {p.action}
      </div>
      <div class="pf-sheet__body" id={bodyId} ref={body} {...inert}>
        {p.children}
      </div>
    </section>
  );
}
