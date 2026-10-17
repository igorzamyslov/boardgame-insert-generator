// src/ui/SelectedTrayBar.tsx
import { useMemo } from "preact/hooks";
import { toggleLock, toggleSizeLock, turnTray } from "../app/actions";
import { trayNames } from "../instructions/naming";
import { numberParts, parentKey } from "../instructions/numbering";
import type { Project, TraySpec } from "../model/types";
import { isAddOn, levelsOf } from "../plan/layers";
import { layerLabel } from "../plan/PlanView";
import { componentIndexOfTray } from "./identity";
import { TrayBar } from "./TrayBar";

export interface SelectedTrayBarProps {
  project: Project;
  /** The parts as they print (what the plan and the 3D view draw). */
  trays: readonly TraySpec[];
  selectedKey: string | null;
  stale: boolean;
  /** The plan's: a swap is made there only, so the 3D view's bar has no Swap with…. */
  inPlan: boolean;
  /** The tray a swap is under way from, or null. */
  swapFrom: string | null;
  edit: (fn: (p: Project) => Project) => void;
  onSelect: (key: string | null) => void;
  onSwapFromChange: (key: string | null) => void;
  /** Opens a component's editor. */
  onEditComponent: (id: string) => void;
}

/** Where the focus goes when the bar closes: the tray it was for, in whichever view shows it. */
function focusTray(key: string, inPlan: boolean): void {
  const selector = inPlan ? ".plan-tile" : ".tray-picker button";
  const target = [...document.querySelectorAll<HTMLElement>(selector)].find(
    (el) => el.getAttribute("data-key") === key,
  );
  target?.focus();
}

/**
 * The tray bar of the selected tray, wired to the project: what it is called, which layer it is
 * on, and the edits Pin, Turn, Swap and Lock size make. Nothing while no tray is selected.
 */
export function SelectedTrayBar(p: SelectedTrayBarProps) {
  const { project, trays } = p;
  const names = useMemo(
    () => trayNames(numberParts(trays), project.components),
    [trays, project.components],
  );
  const tray = p.selectedKey === null ? undefined : trays.find((t) => t.key === p.selectedKey);
  if (tray === undefined) {
    return null;
  }
  const key = tray.key;
  const levels = levelsOf(trays);
  const at = levels.indexOf(tray.level);
  const owner = isAddOn(tray) ? names.get(parentKey(tray)) : undefined;
  const componentIndex = componentIndexOfTray(tray, project.components);
  const component = componentIndex === null ? undefined : project.components[componentIndex];
  // Locks are written against the stored plan's trays.
  const withStored = (fn: (stored: TraySpec) => (q: Project) => Project): void => {
    const stored = project.layout?.trays.find((t) => t.key === key);
    if (stored) {
      p.edit(fn(stored));
    }
  };
  return (
    <TrayBar
      project={project}
      tray={tray}
      name={names.get(key)?.full ?? "Tray"}
      layer={at >= 0 ? layerLabel(at, levels.length) : `Layer ${tray.level + 1}`}
      relation={
        owner === undefined
          ? null
          : { label: tray.part === "riser" ? "Carries" : "Sits on", name: owner.full }
      }
      stale={p.stale}
      swapping={p.swapFrom === key}
      onPin={() => withStored((stored) => (q) => toggleLock(q, stored))}
      onTurn={() => withStored((stored) => (q) => turnTray(q, stored))}
      onSwap={p.inPlan ? () => p.onSwapFromChange(p.swapFrom === key ? null : key) : undefined}
      onToggleSizeLock={() => withStored((stored) => (q) => toggleSizeLock(q, stored))}
      onEdit={component === undefined ? undefined : () => p.onEditComponent(component.id)}
      onClose={() => {
        // A swap from this tray ends with the bar.
        p.onSwapFromChange(null);
        p.onSelect(null);
        // The bar leaves with the selection: hand the focus back to the tray it was for.
        requestAnimationFrame(() => focusTray(key, p.inPlan));
      }}
    />
  );
}
