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
 * The errors of `validateProject()` with no field on screen to show them, so the summary has
 * to: lock and project-level errors. Every settings and printer field is on screen.
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
    return path.startsWith("/locks");
  });
}
