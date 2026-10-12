// src/ui/validation.ts
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Notice } from "../model/types";

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

const PRINTER_ADVANCED_ONLY = new Set(["/printer/bedMargin", "/printer/layerHeight"]);

/**
 * The errors of `validateProject()` with no field on screen to show them, so the summary has
 * to: lock and project-level errors, and in simple mode the settings and printer fields
 * that only advanced mode shows (cross-field settings errors included).
 */
export function errorsWithoutField(notices: readonly Notice[], advanced: boolean): Notice[] {
  return notices.filter((n) => {
    if (n.level !== "error") {
      return false;
    }
    const path = n.path;
    if (path === undefined || path === "/id" || path === "/components") {
      return true;
    }
    if (path.startsWith("/locks")) {
      return true;
    }
    return !advanced && (path.startsWith("/settings/") || PRINTER_ADVANCED_ONLY.has(path));
  });
}
