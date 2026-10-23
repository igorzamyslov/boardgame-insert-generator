// src/plan/glyph.ts
import type { Component, ComponentKind, Group, TraySpec } from "../model/types";
import {
  componentIndexOfTray,
  groupShadeIndexOfTray,
  isGroupTray,
  memberShadeOfCompartment,
  shadeIndexOf,
  shadeOf,
} from "../ui/identity";
import type { Shade } from "../ui/identity";

/**
 * What a tray gives the plan: its kind (for the icon) and its own shade. A group's tray is neutral
 * (`group`): its first member's kind is kept for what asks, but no kind stands for it, so it has no
 * icon and takes the neutral shade; each of its cells wears its member's (`cellShadeOf`).
 */
export interface TrayLook {
  kind: ComponentKind;
  shade: Shade;
  group: boolean;
}

/**
 * The look of a tray: the kind of the component it holds, and that component's shade of the
 * kind's hue. A component's shade is its place among the components of the same kind, in
 * component order, so it does not change when components of other kinds come and go. A tray of a
 * group is neutral (`GROUP_SHADE`). Null for a spare tray, a filler, a spacer or a tray whose
 * contents match no component.
 */
export function lookOfTray(
  tray: TraySpec,
  components: readonly Component[],
  groups: readonly Group[] = [],
): TrayLook | null {
  if (tray.part !== "tray") {
    return null;
  }
  const index = componentIndexOfTray(tray, components);
  const component = index === null ? undefined : components[index];
  if (index === null || component === undefined) {
    return null;
  }
  if (isGroupTray(tray, { components, groups })) {
    return {
      kind: component.kind,
      shade: shadeOf("group", groupShadeIndexOfTray(tray, { components, groups })),
      group: true,
    };
  }
  return {
    kind: component.kind,
    shade: shadeOf(component.kind, shadeIndexOf(components, index)),
    group: false,
  };
}

/**
 * The colours a compartment of a group's tray is drawn in: its member's kind fill and line, as CSS.
 * Null for a spare well, which keeps the plain cell.
 */
export function cellShadeOf(
  compartment: TraySpec["compartments"][number],
  components: readonly Component[],
): Shade | null {
  const member = memberShadeOfCompartment(compartment, components);
  return member === null ? null : shadeOf(member.kind, member.index);
}
