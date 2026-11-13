// src/ui/trayActions.ts
// The three edits of a tray's ⋯ menu that change the project (Keep here, Rotate 90°, Keep this
// size), for both places that offer them: the tray dock and an item's editor. Swap and Put on are
// not here: they pick a second tray, and each place starts that its own way.
import { toggleLock, toggleSizeLock, turnTray } from "../app/actions";
import type { Project, TraySpec } from "../model/types";

export interface TrayEdits {
  onPin: () => void;
  onTurn: () => void;
  onToggleSizeLock: () => void;
}

/** Locks are written against the stored plan's trays, so each edit finds the stored one by key. */
export function trayEdits(
  project: Project,
  key: string,
  edit: (fn: (p: Project) => Project) => void,
): TrayEdits {
  const withStored = (fn: (stored: TraySpec) => (q: Project) => Project): void => {
    const stored = project.layout?.trays.find((t) => t.key === key);
    if (stored) {
      edit(fn(stored));
    }
  };
  return {
    onPin: () => withStored((stored) => (q) => toggleLock(q, stored)),
    onTurn: () => withStored((stored) => (q) => turnTray(q, stored)),
    onToggleSizeLock: () => withStored((stored) => (q) => toggleSizeLock(q, stored)),
  };
}
