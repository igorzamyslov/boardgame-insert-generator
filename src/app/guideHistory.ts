// src/app/guideHistory.ts
// The packing guide is a page of its own, so it is a step of the browser's history: the mouse's Back
// button, Alt+Left and a swipe leave it as the guide's own button does. The entry carries no URL
// (the address bar stays as it is); its state says which project's guide it is, so Forward can
// open it again.
import { useEffect, useMemo, useRef } from "preact/hooks";

interface GuideState {
  packingGuide: string;
}

function guideStateOf(state: unknown): string | null {
  const id = (state as Partial<GuideState> | null)?.packingGuide;
  return typeof id === "string" ? id : null;
}

/** Takes the guide's key off the current entry; whatever else its state carries stays. */
function forgetGuide(): void {
  const rest = { ...((window.history.state ?? {}) as Record<string, unknown>) };
  delete rest.packingGuide;
  window.history.replaceState(Object.keys(rest).length > 0 ? rest : null, "");
}

export interface GuideHistoryHandlers {
  /** The browser's Back left the guide: show the plan again. */
  onBackOut: () => void;
  /**
   * The browser's Forward came back to a guide's entry. Opens the guide and returns true, or
   * returns false when it cannot be opened (another project's, or no plan): the entry is then let go.
   */
  onForwardTo: (projectId: string) => boolean;
}

export interface GuideHistory {
  /** The guide opens: add its entry. */
  push: (projectId: string) => void;
  /**
   * The guide closes by its own button: take its entry off, once. The page the reader returns to
   * is the one the entry was added on, so the app has nothing more to do when the browser says so.
   */
  leave: () => void;
}

/**
 * `open` is the id of the project whose guide shows, or null. When the guide closes by another
 * way than Back (the layout went away), its entry is taken off the same way as by `leave`.
 */
export function useGuideHistory(open: string | null, handlers: GuideHistoryHandlers): GuideHistory {
  // The guide's entry is the current one: Back from it is a pop to take in.
  const entry = useRef(false);
  // A pop this code asked for: the app has already moved on, so the event is let go by.
  const expected = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const api = useMemo<GuideHistory>(() => {
    const leave = (): void => {
      if (entry.current) {
        entry.current = false;
        expected.current += 1;
        window.history.back();
      }
    };
    return {
      push: (projectId) => {
        window.history.pushState({ packingGuide: projectId } satisfies GuideState, "");
        entry.current = true;
      },
      leave,
    };
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent): void => {
      if (expected.current > 0) {
        expected.current -= 1;
        return;
      }
      const id = guideStateOf(e.state);
      if (id !== null) {
        if (openRef.current === null && !handlersRef.current.onForwardTo(id)) {
          // The guide stays shut, so this entry is not the guide's: take the guide off it.
          entry.current = false;
          forgetGuide();
        } else {
          entry.current = true;
        }
      } else if (openRef.current !== null) {
        entry.current = false;
        handlersRef.current.onBackOut();
      } else {
        entry.current = false;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A reload keeps the entry the guide was opened on, but the page shows the plan: the entry is
  // not the guide's any more, so Back and Forward from it start from the plan.
  useEffect(() => {
    if (openRef.current === null && guideStateOf(window.history.state) !== null) {
      forgetGuide();
    }
  }, []);

  // Closed without the entry being left (the layout went away, another project opened).
  useEffect(() => {
    if (open === null && entry.current) {
      api.leave();
    }
  }, [open, api]);

  return api;
}
