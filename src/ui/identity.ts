// src/ui/identity.ts
import { KIND_NAMES } from "../model/defaults";
import type { Component, ComponentKind, TraySpec } from "../model/types";
import { contrast, hexToHsl, hslToHex } from "./color";

/** How many identity tints the design system has (--tint-1 … --tint-8). */
const TINT_COUNT = 8;

/** The CSS colour of the nth component, matching its swatch in the list and its tray in the plan. */
export function tintVar(index: number): string {
  return `var(--tint-${(index % TINT_COUNT) + 1})`;
}

export type ColorScheme = "light" | "dark";

/** One component's colours: the face of its trays, their outline, and text laid on the face. */
export interface Shade {
  fill: string;
  line: string;
  ink: string;
}

/** How many shades a kind has before they start over. */
export const SHADE_COUNT = 5;

/** The box floor the trays are drawn on: outlines keep 3:1 against it. Mirrors --box. */
export const BOX_COLOR: Record<ColorScheme, string> = { light: "#D3CDBF", dark: "#3A372F" };

/** Each kind's base hue, index 0 of its shades. Mirrors --cards-fill … --custom-ink in tokens.css. */
const KIND_BASES: Record<ComponentKind, Record<ColorScheme, Shade>> = {
  cards: {
    light: { fill: "#DCE6FA", line: "#335AA6", ink: "#22457E" },
    dark: { fill: "#263654", line: "#829FD9", ink: "#C3D2E9" },
  },
  bulk: {
    light: { fill: "#FBE9C9", line: "#8A5D08", ink: "#6E4C0E" },
    dark: { fill: "#584523", line: "#F6C465", ink: "#EFDEBD" },
  },
  tiles: {
    light: { fill: "#D8EEDE", line: "#2E6B41", ink: "#22552E" },
    dark: { fill: "#314938", line: "#8DCEA1", ink: "#C8E4CF" },
  },
  minis: {
    light: { fill: "#F5DCE7", line: "#964068", ink: "#74244B" },
    dark: { fill: "#4E2C3B", line: "#CE8DAB", ink: "#E7C5D6" },
  },
  custom: {
    light: { fill: "#E7E3F4", line: "#5B4B9A", ink: "#45397A" },
    dark: { fill: "#36304B", line: "#9D91CA", ink: "#CFCAE2" },
  },
};

/** How each further shade moves the fill within the hue: lightness points, saturation points. */
const SHADE_STEPS: readonly { l: number; s: number }[] = [
  { l: 0, s: 0 },
  { l: -7, s: 0 },
  { l: -15, s: -8 },
  { l: 4, s: -12 },
  { l: -10, s: -26 },
];

const DARK_FILL_MAX_L = 34;
const MIN_LINE_CONTRAST = 3.2;
const MIN_INK_CONTRAST = 4.8;

/**
 * The colours of the nth component of a kind, as hex for one colour scheme. Index 0 is the
 * kind's base hue; the next ones step lightness and saturation inside that hue (the other way
 * round on a dark page, where the lighter fill is the one that stands out), and then they
 * start over. The line is pushed until it keeps 3:1 on the box and on its own fill, and the ink
 * until it keeps 4.5:1 on the fill, so any shade can be used for outlines and for text.
 */
export function shadeHex(kind: ComponentKind, index: number, scheme: ColorScheme): Shade {
  const base = KIND_BASES[kind][scheme];
  const slot = ((Math.trunc(index) % SHADE_COUNT) + SHADE_COUNT) % SHADE_COUNT;
  if (slot === 0) {
    return { ...base };
  }
  const step = SHADE_STEPS[slot] ?? { l: 0, s: 0 };
  // On a dark page the steps go the other way round (lighter stands out), more gently, and stop
  // where light ink still reads on the fill.
  const dL = scheme === "light" ? step.l : -step.l * 0.7;
  const f = hexToHsl(base.fill);
  // Fills stay pastel like the base hue: saturation never rises, and never falls so far that the
  // hue is lost.
  const fill = hslToHex({
    h: f.h,
    s: Math.min(f.s, Math.max(f.s * 0.5, f.s + step.s)),
    l: scheme === "light" ? f.l + dL : Math.min(DARK_FILL_MAX_L, f.l + dL),
  });
  // Away from the box and the fill: darker on a light page, lighter on a dark one.
  const away = (hex: string, against: readonly string[], need: number): string => {
    const hsl = hexToHsl(hex);
    const short = (): boolean => against.some((g) => contrast(hslToHex(hsl), g) < need);
    for (let i = 0; i < 100 && short(); i++) {
      hsl.l += scheme === "light" ? -1 : 1;
    }
    return hslToHex(hsl);
  };
  const l = hexToHsl(base.line);
  const line = away(
    hslToHex({ h: l.h, s: l.s, l: l.l + dL * 0.3 }),
    [BOX_COLOR[scheme], fill],
    MIN_LINE_CONTRAST,
  );
  const ink = away(base.ink, [fill], MIN_INK_CONTRAST);
  return { fill, line, ink };
}

/**
 * The same colours as CSS: `light-dark(…)` per colour, so one inline style (or custom property)
 * follows the page's scheme. Needs `color-scheme: light dark` on the page (tokens.css has it).
 *
 * Only for the page's own CSS. `light-dark()` means nothing outside it: the 3D view (three.js),
 * the PNG and SVG export (a standalone SVG, `svgDataUrl` in instructions/png.ts) and anything
 * printed must use plain hex, `shadeHex(kind, index, "light")`: paper is always light.
 */
export function shadeOf(kind: ComponentKind, index: number): Shade {
  const light = shadeHex(kind, index, "light");
  const dark = shadeHex(kind, index, "dark");
  return {
    fill: `light-dark(${light.fill}, ${dark.fill})`,
    line: `light-dark(${light.line}, ${dark.line})`,
    ink: `light-dark(${light.ink}, ${dark.ink})`,
  };
}

/** The shade of the nth component of a kind as CSS custom properties, for a row or a panel to take. */
export function shadeVars(kind: ComponentKind, index: number): Record<string, string> {
  const shade = shadeOf(kind, index);
  return { "--shade-fill": shade.fill, "--shade-line": shade.line, "--shade-ink": shade.ink };
}

/**
 * Every card spacer is this one colour, in the 3D view and on the assembly page: a spacer
 * belongs to no component, and they all do the same job, so telling them apart by colour
 * would say something that isn't there.
 */
export const SPACER_COLOR = "#f7e3c4";

/** A part with no component of its own: a spare tray, a filler block or a riser. */
export const SPARE_COLOR = "#dfe2e7";

/** The index of the component whose name appears in tray contents text such as "Deck ×50". */
export function componentIndexOfContents(
  contents: string,
  components: readonly Component[],
): number | null {
  let best: { index: number; length: number } | null = null;
  components.forEach((c, index) => {
    const names = [c.name === "" ? KIND_NAMES[c.kind] : c.name];
    if (c.kind === "cards") {
      names.push(...c.decks.map((d) => d.name));
    } else if (c.kind === "bulk") {
      names.push(...c.items.map((i) => i.name));
    } else if (c.kind === "minis") {
      names.push(...c.figures.map((f) => f.name));
    }
    for (const name of names) {
      if (name !== "" && contents.includes(name) && (best === null || name.length > best.length)) {
        best = { index, length: name.length };
      }
    }
  });
  const found = best as { index: number; length: number } | null;
  return found === null ? null : found.index;
}

/** The tint of tray contents text such as "Deck ×50": the component whose name appears in it. */
export function tintOfContents(contents: string, components: readonly Component[]): string | null {
  const index = componentIndexOfContents(contents, components);
  return index === null ? null : tintVar(index);
}

/** The component a tray holds: its first compartment's component, else null (spare, leftover, spacer). */
export function componentIndexOfTray(
  tray: TraySpec,
  components: readonly Component[],
): number | null {
  const first = tray.compartments.find((c) => c.kind !== "spare" && c.contents !== "");
  if (first === undefined) {
    return null;
  }
  // Layouts from schema 0.1.2 on name the component outright, so two components called the
  // same thing (several unnamed "Cards", say) keep their own colour instead of collapsing
  // onto whichever one the text happened to match first.
  if (first.componentId !== undefined) {
    const byId = components.findIndex((c) => c.id === first.componentId);
    if (byId !== -1) {
      return byId;
    }
  }
  return componentIndexOfContents(first.contents, components);
}

/** The tint of a tray: its first compartment's component, else null (spare, leftover, spacer). */
export function tintOfTray(tray: TraySpec, components: readonly Component[]): string | null {
  const index = componentIndexOfTray(tray, components);
  return index === null ? null : tintVar(index);
}

/** For each component (by index), the numbers of the trays that hold it, in plan order. */
export function trayNumbersByComponent(
  parts: readonly { number: number; spec: TraySpec }[],
  components: readonly Component[],
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const part of parts) {
    if (part.spec.part !== "tray") {
      continue;
    }
    const index = componentIndexOfTray(part.spec, components);
    if (index !== null) {
      out.set(
        index,
        [...(out.get(index) ?? []), part.number].sort((x, y) => x - y),
      );
    }
  }
  return out;
}

const mm = (v: number): string => String(Math.round(v * 10) / 10);

/** One line about a component for its collapsed row: what and how much. */
export function componentSummary(c: Component): string {
  switch (c.kind) {
    case "cards": {
      const n = c.decks.reduce((sum, d) => sum + d.count, 0);
      return `${n} cards · ${mm(c.shortSide)} × ${mm(c.longSide)} mm`;
    }
    case "bulk": {
      const n = c.items.length;
      return n === 1 ? "1 kind of bit" : `${n} kinds of bits`;
    }
    case "tiles": {
      const size =
        c.shape.type === "rect"
          ? `${mm(c.shape.w)} × ${mm(c.shape.d)} mm`
          : `${mm(c.shape.flatToFlat)} mm hex`;
      return `${c.count} tiles · ${size}`;
    }
    case "minis": {
      const n = c.figures.reduce((sum, f) => sum + f.count, 0);
      return `${n} miniatures`;
    }
    case "custom":
      return `${c.count} × ${mm(c.w)} × ${mm(c.d)} × ${mm(c.h)} mm`;
  }
}

/** Which shade of its kind's hue the component at `index` takes: how many of its kind come before it. */
export function kindIndexOf(components: readonly Component[], index: number): number {
  const kind = components[index]?.kind;
  return components.slice(0, index).filter((c) => c.kind === kind).length;
}

/** "Layer 1 (bottom)", "Layer 2", … "Layer n (top)"; a single layer is just "Layer 1". */
export function layerLabel(level: number, count: number): string {
  const end = count < 2 ? "" : level === 0 ? " (bottom)" : level === count - 1 ? " (top)" : "";
  return `Layer ${level + 1}${end}`;
}
