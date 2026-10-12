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
