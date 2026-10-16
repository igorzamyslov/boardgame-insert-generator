// src/kit/Sheet.tsx
import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

export interface SheetProps {
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
  /** The editor is showing in the sheet: the styles drop the section titles around it. */
  editing?: boolean;
  /**
   * Folded, show the top of the content (196 px in all, `--sheet-peek`) and leave it within reach,
   * as MobileWorkspace's sheet does. Without it only the handle shows and the content is inert.
   */
  peek?: boolean;
  /** The handle, for an owner that hands the focus to it. */
  handleRef?: RefObject<HTMLButtonElement | null>;
  /** A button beside the handle, in reach while the sheet is folded. */
  action?: ComponentChildren;
  /** The `data-region` the screenshot harness finds the sheet by (the owner names it). */
  region?: string;
  /** The old look: the `.pf-sheet` classes of style.css, for the screens not rebuilt yet. Task 17 removes this. */
  legacy?: boolean;
  children: ComponentChildren;
}

const FOCUSABLE =
  "button, input, select, textarea, summary, [href], [tabindex]:not([tabindex='-1'])";

/**
 * A sheet fixed to the foot of a phone's screen: folded, only its 44 px handle shows (or the
 * peek); open, it covers most of the screen and scrolls inside. The handle is a real button with
 * `aria-expanded`. Folded content is inert, so Tab and a screen reader skip it (unless it peeks).
 * Opening moves the focus inside (unless something in there took it already); folding with
 * Escape puts it back on the handle.
 */
export function Sheet(p: SheetProps) {
  const bodyId = useId();
  const root = useRef<HTMLElement>(null);
  const ownHandle = useRef<HTMLButtonElement>(null);
  const handle = p.handleRef ?? ownHandle;
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
  const inert = { inert: !p.expanded && p.peek !== true } as Record<string, unknown>;
  const c = p.legacy ? "pf-sheet" : "k-sheet";
  return (
    <section
      class={c}
      ref={root}
      aria-label={p.label}
      data-expanded={p.expanded ? "true" : "false"}
      data-full={p.full ? "true" : undefined}
      data-editing={p.editing ? "true" : undefined}
      data-peek={p.peek ? "true" : undefined}
      data-region={p.region}
      onKeyDown={(e) => {
        if (e.key === "Escape" && p.expanded && !e.defaultPrevented) {
          e.preventDefault();
          p.onExpandedChange(false);
        }
      }}
    >
      <div class={`${c}__bar`}>
        <button
          type="button"
          class={`${c}__handle`}
          ref={handle}
          aria-expanded={p.expanded}
          aria-controls={bodyId}
          onClick={() => p.onExpandedChange(!p.expanded)}
        >
          <span class={`${c}__grip`} aria-hidden="true" />
          <span class={`${c}__title`}>{p.title}</span>
          {p.meta === undefined ? null : <span class={`${c}__meta`}>{p.meta}</span>}
          <svg
            class={`${c}__chevron`}
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
      <div class={`${c}__body`} id={bodyId} ref={body} {...inert}>
        {p.children}
      </div>
    </section>
  );
}
