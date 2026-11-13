// src/viewer/shades.ts: the colour of each part in 3D, from the same shades as the top view.
import type { Component, Group, TraySpec } from "../model/types";
import {
  SPACER_SHADE,
  componentIndexOfTray,
  groupShadeIndexOfTray,
  isGroupTray,
  memberShadeOfCompartment,
  shadeHex,
  shadeIndexOf,
} from "../ui/identity";
import type { ColorScheme } from "../ui/identity";
import { schemeNow } from "../ui/theme";

/**
 * The colour scheme the page shows now (ui/theme.ts). three.js can't read `light-dark()`, so the
 * scene asks for plain hex of the right scheme. Read in a render, it makes the view follow a change.
 */
export function pageScheme(): ColorScheme {
  return schemeNow.value;
}

/**
 * A part's colour in 3D: its component's shade of its kind's hue for a tray, one shared colour
 * for every spacer or divider (they belong to no component), and the same hatched neutral for a
 * part that holds nothing (a spare tray or a riser), as in the plan. A group's tray is the group's
 * neutral (spec §7.6): a mixed tray has no single kind. Its wells are drawn in `wellColorsOf`.
 */
export function shadeColorOf(
  spec: TraySpec,
  components: readonly Component[],
  scheme: ColorScheme,
  groups: readonly Group[] = [],
): string {
  if (spec.part === "spacer" || spec.part === "divider") {
    return SPACER_SHADE[scheme].fill;
  }
  if (isGroupTray(spec, { components, groups })) {
    return shadeHex("group", groupShadeIndexOfTray(spec, { components, groups }), scheme).fill;
  }
  const index = componentIndexOfTray(spec, components);
  const kind = index === null ? undefined : components[index]?.kind;
  if (index === null || kind === undefined) {
    return SPACER_SHADE[scheme].fill;
  }
  return shadeHex(kind, shadeIndexOf(components, index), scheme).fill;
}

/** The share of white a plan cell lays over its tile (`--cell-fill` in tokens.css). */
const CELL_WHITE: Record<ColorScheme, number> = { light: 0.38, dark: 0.12 };

/** `hex` with the scheme's share of white laid over it, as the plan composes a cell over its tile. */
function lightened(hex: string, scheme: ColorScheme): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): string =>
    Math.round(((n >> shift) & 255) * (1 - CELL_WHITE[scheme]) + 255 * CELL_WHITE[scheme])
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * The colour each compartment of a part is drawn in inside, as the plan draws its cells: a group
 * tray's well wears its member's kind fill, and any other well (a lone item's, a spare, one that
 * names no item) the tray's own colour with the plan's white laid over it. In the order of
 * `spec.compartments`.
 */
export function wellColorsOf(
  spec: TraySpec,
  components: readonly Component[],
  scheme: ColorScheme,
  groups: readonly Group[] = [],
): string[] {
  const body = shadeColorOf(spec, components, scheme, groups);
  const grouped = isGroupTray(spec, { components, groups });
  return spec.compartments.map((c) => {
    const member = grouped ? memberShadeOfCompartment(c, components) : null;
    return member === null
      ? lightened(body, scheme)
      : shadeHex(member.kind, member.index, scheme).fill;
  });
}
