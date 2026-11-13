// src/kit/FitText.tsx
// A one-line label that gets a slightly smaller font before it gets an ellipsis: the owner's rule
// for every name the page cuts to a width ("Spacer by Fa…" where a size down would show it whole).
import { useLayoutEffect, useRef } from "preact/hooks";
import { cx } from "./cx";

/** The smallest share of its own size a label shrinks to; below that it is cut with "…". */
export const FIT_MIN_RATIO = 0.8;
/** …and never below this, in CSS px: the smallest type the page sets (a 12 px caption) minus a notch. */
export const FIT_MIN_PX = 10;

/**
 * The font size, in px, a label needs to fit: `base` when its text at `base` (`textWidth`) fits the
 * room, else the size that fits it, but not below the floor (80 % of `base`, and never under
 * FIT_MIN_PX). At the floor a label that still doesn't fit is cut by its ellipsis. Width is taken
 * as proportional to the size, as it is for one line of text, and rounded down to a tenth of a px.
 */
export function fitFontSize(base: number, textWidth: number, room: number): number {
  if (textWidth <= room || textWidth <= 0 || room <= 0) {
    return base;
  }
  const floor = Math.min(base, Math.max(FIT_MIN_PX, base * FIT_MIN_RATIO));
  const fitted = Math.floor(((base * room) / textWidth) * 10) / 10;
  return Math.max(floor, Math.min(base, fitted));
}

/** Whether the element's text is wider than the element (the ellipsis is showing). */
const overflows = (el: HTMLElement): boolean => el.scrollWidth > el.clientWidth + 0.5;

/**
 * Sets the element's font size so its text fits it, at its natural size when it already does. The
 * element must be cut by CSS (`overflow: hidden; text-overflow: ellipsis`) and take its width from
 * its surroundings, not from its text. It is measured again when `box` (the element the width
 * comes from; its parent by default) changes size, and when the fonts have loaded.
 */
export function useFitFont<T extends HTMLElement>(
  text: string,
  box?: (el: HTMLElement) => HTMLElement | null,
) {
  const ref = useRef<T>(null);
  const boxOf = useRef(box);
  boxOf.current = box;
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) {
      return undefined;
    }
    const fit = (): void => {
      el.style.fontSize = "";
      if (!overflows(el)) {
        return;
      }
      const base = parseFloat(getComputedStyle(el).fontSize);
      if (!Number.isFinite(base)) {
        return;
      }
      let size = fitFontSize(base, el.scrollWidth, el.clientWidth);
      el.style.fontSize = `${size}px`;
      // text width is not exactly proportional (hinting): a notch down at a time, down to the floor
      const floor = fitFontSize(base, Number.POSITIVE_INFINITY, 1);
      for (let i = 0; i < 6 && overflows(el) && size > floor; i++) {
        size = Math.max(floor, size - 0.3);
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const watched = boxOf.current?.(el) ?? el.parentElement;
    const observer =
      watched !== null && typeof ResizeObserver === "function"
        ? new ResizeObserver(fit)
        : undefined;
    if (watched !== null) {
      observer?.observe(watched);
    }
    // a font that arrives late changes every width
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) {
        fit();
      }
    });
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [text]);
  return ref;
}

export interface FitTextProps {
  children: string;
  class?: string;
  title?: string;
  /** The element whose width the label takes, when it is not the label's parent. */
  box?: (el: HTMLElement) => HTMLElement | null;
}

/** A label cut to its width: a smaller font first (down to 80 %), an ellipsis only below that. */
export function FitText({ children, class: extra, title, box }: FitTextProps) {
  const ref = useFitFont<HTMLSpanElement>(children, box);
  return (
    <span ref={ref} class={cx(extra, "ellipsis")} title={title}>
      {children}
    </span>
  );
}
