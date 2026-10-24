// src/ui/components/TraySettings.tsx
import type { ComponentChildren } from "preact";
import { useContext, useId } from "preact/hooks";
import { DisclosureRow } from "../../kit";
import type { Component } from "../../model/types";
import { SettingsContext } from "../validation";
import { useOpenOnError } from "./controls";
import { useItemGroup } from "./GroupRow";
import { SETTINGS_GROUP_TITLES, changedIn, groupSummary } from "./moreSummary";
import type { SettingsGroupId } from "./moreSummary";

/**
 * The settings under an item's basics: a short list of rows (Reach, Shape, Room, Copies and group),
 * each saying what it holds now and opening in place. Replaces the long "More options" scroll.
 */
export function TraySettings({ children }: { children: ComponentChildren }) {
  return (
    <section class="ed-groups" aria-label="Tray settings">
      <h3 class="ed-groups__title">Tray settings</h3>
      <div class="ed-groups__list">{children}</div>
    </section>
  );
}

export interface SettingsGroupProps {
  id: SettingsGroupId;
  component: Component;
  /** Validation paths of the fields inside; an error at one (or below it) opens the row. */
  errorPaths?: readonly string[];
  children: ComponentChildren;
}

/**
 * One row of the tray settings. Closed it shows its value in a line under its title, and "n changed"
 * when options inside differ from their default; an error inside opens it, and it stays open once
 * an error brought it up.
 */
export function SettingsGroup({ id, component: c, errorPaths = [], children }: SettingsGroupProps) {
  const settings = useContext(SettingsContext);
  const group = useItemGroup();
  const [open, setOpen] = useOpenOnError(errorPaths);
  const panelId = useId();
  return (
    <div class="ed-tray-row">
      <DisclosureRow
        plain
        title={SETTINGS_GROUP_TITLES[id]}
        hint={groupSummary(id, c, settings, group)}
        changed={changedIn(id, c, settings, group !== undefined)}
        open={open}
        controls={panelId}
        onClick={() => setOpen(!open)}
      />
      {open ? (
        <div class="ed-tray-row__panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
