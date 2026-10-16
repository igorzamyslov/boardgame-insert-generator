// src/viewer/shades.ts: the colour of each part in 3D, from the same shades as the top view.
import type { Component, TraySpec } from "../model/types";
import {
  SPACER_COLOR,
  SPARE_COLOR,
  componentIndexOfTray,
  shadeHex,
  shadeIndexOf,
} from "../ui/identity";
import type { ColorScheme } from "../ui/identity";

/**
 * The colour scheme the page shows now. three.js can't read `light-dark()`, so the scene asks
 * for plain hex of the right scheme: the page's own choice (`data-theme` on the root) wins over
 * the system's.
 */
export function pageScheme(): ColorScheme {
  if (typeof document !== "undefined") {
    const chosen = document.documentElement.getAttribute("data-theme");
    if (chosen === "light" || chosen === "dark") {
      return chosen;
    }
  }
  if (typeof matchMedia === "function") {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

/**
 * A part's colour in 3D: its component's shade of its kind's hue for a tray, one shared colour
 * for every spacer or divider (they belong to no component), and a neutral for a part that
 * holds nothing (a spare tray or a filler block).
 */
export function shadeColorOf(
  spec: TraySpec,
  components: readonly Component[],
  scheme: ColorScheme,
): string {
  if (spec.part === "spacer" || spec.part === "divider") {
    return SPACER_COLOR;
  }
  const index = componentIndexOfTray(spec, components);
  const kind = index === null ? undefined : components[index]?.kind;
  if (index === null || kind === undefined) {
    return SPARE_COLOR;
  }
  return shadeHex(kind, shadeIndexOf(components, index), scheme).fill;
}
