// src/plan/glyph.ts
import type { Component, ComponentKind, TraySpec } from "../model/types";
import { componentIndexOfTray, shadeIndexOf, shadeOf } from "../ui/identity";
import type { Shade } from "../ui/identity";

/** What a tray's component gives it on the plan: its kind (for the icon) and its own shade. */
export interface TrayLook {
  kind: ComponentKind;
  shade: Shade;
}

/**
 * The look of a tray: the kind of the component it holds, and that component's shade of the
 * kind's hue. A component's shade is its place among the components of the same kind, in
 * component order, so it does not change when components of other kinds come and go. Null for a
 * spare tray, a filler, a spacer or a tray whose contents match no component.
 */
export function lookOfTray(tray: TraySpec, components: readonly Component[]): TrayLook | null {
  if (tray.part !== "tray") {
    return null;
  }
  const index = componentIndexOfTray(tray, components);
  const component = index === null ? undefined : components[index];
  if (index === null || component === undefined) {
    return null;
  }
  return { kind: component.kind, shade: shadeOf(component.kind, shadeIndexOf(components, index)) };
}
