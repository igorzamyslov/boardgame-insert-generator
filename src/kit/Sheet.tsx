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
  /**
   * The grip becomes a button of its own, named by these words ("Show everything"), and the title
   * with its count becomes the button inside an h2, as MobileWorkspace's head row is drawn.
   * Without it one handle holds the grip, the title and the chevron.
   */
  handleLabel?: string;
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
 * The workspace's disclosure sheet (the list, with its peek). The modal sheet of MobileTray, a
 * tray's, is not this: it is `Dialog placement="bottom"`.
 *
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
  const toggle = (): void => p.onExpandedChange(!p.expanded);
  const title = (
    <>
      <span class={`${c}__title`}>{p.title}</span>
      {p.meta === undefined ? null : <span class={`${c}__meta`}>{p.meta}</span>}
    </>
  );
  // MobileWorkspace draws the chevron 16 px; the legacy look keeps its 20.
  const size = p.legacy ? 20 : 16;
  const chevron = (
    <svg class={`${c}__chevron`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
  return (
    <section
      class={c}
      ref={root}
      aria-label={p.label}
      data-expanded={p.expanded ? "true" : "false"}
      data-full={p.full ? "true" : undefined}
      data-editing={p.editing ? "true" : undefined}
      data-peek={p.peek ? "true" : undefined}
      data-grip={p.handleLabel === undefined ? undefined : "button"}
      data-region={p.region}
      onKeyDown={(e) => {
        if (e.key === "Escape" && p.expanded && !e.defaultPrevented) {
          e.preventDefault();
          p.onExpandedChange(false);
        }
      }}
    >
      <div class={`${c}__bar`}>
        {p.handleLabel === undefined ? (
          <button
            type="button"
            class={`${c}__handle`}
            ref={handle}
            aria-expanded={p.expanded}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <span class={`${c}__grip`} aria-hidden="true" />
            {title}
            {chevron}
          </button>
        ) : (
          <>
            <button
              type="button"
              class={`${c}__grip ${c}__grip--button`}
              aria-label={p.handleLabel}
              aria-expanded={p.expanded}
              aria-controls={bodyId}
              onClick={toggle}
            />
            <h2 class={`${c}__head`}>
              <button
                type="button"
                class={`${c}__handle`}
                ref={handle}
                aria-expanded={p.expanded}
                aria-controls={bodyId}
                onClick={toggle}
              >
                {title}
                {chevron}
              </button>
            </h2>
          </>
        )}
        {p.action}
      </div>
      <div class={`${c}__body`} id={bodyId} ref={body} {...inert}>
        {p.children}
      </div>
    </section>
  );
}
