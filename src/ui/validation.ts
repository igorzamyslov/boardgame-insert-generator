// src/ui/validation.ts
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Notice, Settings } from "../model/types";

/** All `validateProject()` notices of the current project; fields pick theirs by path. */
export const ValidationContext = createContext<Notice[]>([]);

export function useFieldNotices(path: string | undefined): Notice[] {
  const all = useContext(ValidationContext);
  if (path === undefined) {
    return [];
  }
  return all.filter((n) => n.path === path);
}

/** The `size()` notices of the current project (`state.sizingNotices`). */
export const SizingContext = createContext<Notice[]>([]);

export function useSizingNotices(path: string): Notice[] {
  return useContext(SizingContext).filter((n) => n.path === path);
}

/** The project's settings, for the derived sizes an editor shows (`derivedSizes`). */
export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);

/**
 * A whole list of a component, as a path ends it ("Add at least one deck."). The list has no field
 * of its own in the editors, so the status heading says it (it was the list's own notice).
 */
const LIST_PATH = /^\/components\/\d+\/(decks|items|figures)$/;

/**
 * The errors of `validateProject()` with no field on screen to show them, so the status heading
 * has to: lock and project-level errors, and an empty list. Every settings and printer field is on
 * screen.
 */
export function errorsWithoutField(notices: readonly Notice[]): Notice[] {
  return notices.filter((n) => {
    if (n.level !== "error") {
      return false;
    }
    const path = n.path;
    if (path === undefined || path === "/id" || path === "/components") {
      return true;
    }
    return path.startsWith("/locks") || LIST_PATH.test(path);
  });
}
