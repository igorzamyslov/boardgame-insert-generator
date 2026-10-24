// src/ui/SelectedTrayBar.tsx
import { useMemo } from "preact/hooks";
import { toggleLock, toggleSizeLock, turnTray } from "../app/actions";
import type { MeshSource } from "../app/meshes";
import { trayNames } from "../instructions/naming";
import { buildSpecOf, numberParts, parentKey, partsByKey } from "../instructions/numbering";
import type { ForeignData, Project, TraySpec } from "../model/types";
import { isAddOn, levelsOf } from "../plan/layers";
import { lookOfTray } from "../plan/glyph";
import {
  compartmentWords,
  componentIndexOfTray,
  groupOfTray,
  memberCellsOfTray,
  shadeOf,
} from "./identity";
import { TrayBar } from "./TrayBar";

export interface SelectedTrayBarProps {
  project: Project;
  /** What the file kept of components this app doesn't read (for the Turn dry run). */
  foreign?: ForeignData;
  /** Where the parts' meshes come from, for the bar's filament line. */
  meshes?: MeshSource;
  /** The parts as they print (what the plan and the 3D view draw). */
  trays: readonly TraySpec[];
  selectedKey: string | null;
  /** The plan's: the focus goes back to the tray's tile; in 3D, to its canvas. */
  inPlan: boolean;
  /** The plan is out of date: the bar builds nothing for its filament line. */
  stale?: boolean;
  /** The tray a swap, or a put-on, is under way from, or null. */
  swapFrom: string | null;
  /** Which of the two `swapFrom` is. */
  pickMode?: "swap" | "putOn";
  edit: (fn: (p: Project) => Project) => void;
  onSelect: (key: string | null) => void;
  onSwapFromChange: (key: string | null, mode?: "swap" | "putOn") => void;
  /** Opens a component's editor. */
  onEditComponent: (id: string) => void;
  /** Opens a group's editor: Edit on a group's tray goes there, not to one of its members. */
  onEditGroup?: (groupId: string) => void;
}

/**
 * Where the focus goes when the bar closes: the tray it was for in the plan; in the 3D view, which
 * has no element per tray, its canvas, whose arrow keys step through the trays.
 */
function focusTray(key: string, inPlan: boolean): void {
  if (!inPlan) {
    document.querySelector<HTMLElement>(".viewer-canvas")?.focus();
    return;
  }
  const target = [...document.querySelectorAll<HTMLElement>(".plan-tile")].find(
    (el) => el.getAttribute("data-key") === key,
  );
  target?.focus();
}

/**
 * The dock of the selected tray, wired to the project: what it is called, which layer it is on,
 * and the edits Keep here, Rotate, Swap, Put on and Keep this size make. Nothing while no tray is
 * selected. Swap and Put on pick the other tray in the view that is showing, plan or 3D.
 */
export function SelectedTrayBar(p: SelectedTrayBarProps) {
  const { project, trays } = p;
  const parts = useMemo(() => numberParts(trays), [trays]);
  const names = useMemo(
    () => trayNames(parts, project.components, project.groups),
    [parts, project.components, project.groups],
  );
  const tray = p.selectedKey === null ? undefined : trays.find((t) => t.key === p.selectedKey);
  if (tray === undefined) {
    return null;
  }
  const key = tray.key;
  // The spec the viewer and the export build, so the filament line finds its mesh in the cache.
  const part = partsByKey(parts).get(key);
  const buildSpec =
    part === undefined
      ? tray
      : buildSpecOf(part, project.settings.engraveNames, names.get(key)?.short);
  const levels = levelsOf(trays);
  const at = levels.indexOf(tray.level);
  const owner = isAddOn(tray) ? names.get(parentKey(tray)) : undefined;
  const componentIndex = componentIndexOfTray(tray, project.components);
  const component = componentIndex === null ? undefined : project.components[componentIndex];
  // A group's tray is the group's: its look is neutral with its members' cells, and Edit opens the group.
  const look = lookOfTray(tray, project.components, project.groups);
  const group = look?.group === true ? groupOfTray(tray, project) : undefined;
  const cells =
    group === undefined
      ? undefined
      : memberCellsOfTray(tray, project.components).map((m) => ({
          shade: shadeOf(m.kind, m.index),
        }));
  const compartmentCount = tray.compartments.filter((c) => c.kind !== "spare").length;
  const onEditGroup = p.onEditGroup;
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
      {...(p.foreign === undefined ? {} : { foreign: p.foreign })}
      tray={tray}
      {...(p.meshes === undefined ? {} : { meshes: p.meshes })}
      buildSpec={buildSpec}
      stale={p.stale === true}
      name={names.get(key)?.full ?? "Tray"}
      layer={`Layer ${at >= 0 ? at + 1 : tray.level + 1}`}
      look={look}
      {...(cells === undefined ? {} : { cells })}
      layerCount={levels.length}
      carries={tray.part === "riser" ? (owner?.full ?? null) : null}
      compartments={
        group === undefined
          ? compartmentWords(tray, component)
          : `${compartmentCount} ${compartmentCount === 1 ? "compartment" : "compartments"}`
      }
      swapping={p.swapFrom === key && p.pickMode !== "putOn"}
      puttingOn={p.swapFrom === key && p.pickMode === "putOn"}
      onPin={() => withStored((stored) => (q) => toggleLock(q, stored))}
      onTurn={() => withStored((stored) => (q) => turnTray(q, stored))}
      onSwap={() =>
        p.onSwapFromChange(p.swapFrom === key && p.pickMode !== "putOn" ? null : key, "swap")
      }
      onPutOn={() =>
        p.onSwapFromChange(p.swapFrom === key && p.pickMode === "putOn" ? null : key, "putOn")
      }
      onToggleSizeLock={() => withStored((stored) => (q) => toggleSizeLock(q, stored))}
      onEdit={
        // G1 draws Edit on a group's tray; the group's editor is wired by the app (a no-op until it is)
        group !== undefined
          ? () => onEditGroup?.(group.id)
          : component === undefined
            ? undefined
            : () => p.onEditComponent(component.id)
      }
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
