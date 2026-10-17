// src/ui/identity.ts
import { KIND_NAMES } from "../model/defaults";
import type { Component, ComponentKind, TraySpec } from "../model/types";
import { contrast, hexToHsl, hslToHex } from "./color";

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
 * follows the page's scheme. The page is light only for now (`color-scheme: light` in tokens.css), so
 * it reads the light value; the dark opt-in (UI rebuild Task 16) will set `color-scheme: dark`.
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
 * A part with no component of its own (a spacer, a divider, a spare tray or a riser) is one
 * hatched warm neutral everywhere: they all do the same job, so telling them apart by colour would
 * say something that isn't there. In the plan this is `--spacer-fill`, `--spacer-hatch` and
 * `--spacer-dash`; this mirrors them for what can't read CSS: the 3D view (the scheme asked for)
 * and the packing guide (paper, always "light").
 */
export const SPACER_SHADE: Record<ColorScheme, { fill: string; hatch: string; dash: string }> = {
  light: { fill: "#e9e5db", hatch: "#ddd8cc", dash: "#6e695c" },
  dark: { fill: "#2e2c26", hatch: "#3a372f", dash: "#9a9688" },
};

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

/**
 * Which shade of its kind's hue a component takes: its place among the components of the same
 * kind, in component order. The top view and 3D both use it, so a tray is the same colour in both.
 */
export function shadeIndexOf(components: readonly Component[], index: number): number {
  const kind = components[index]?.kind;
  let before = 0;
  for (let i = 0; i < index; i++) {
    if (components[i]?.kind === kind) {
      before += 1;
    }
  }
  return before;
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

/** A length in mm to one decimal, without a trailing zero: "285", "63.5". */
export const mm = (v: number): string => String(Math.round(v * 10) / 10);

/**
 * The short line under a component's name in the rail (Main's "80 cards, sleeved", "4 decks of 12",
 * "4 kinds, 96 pieces", "24 tiles", "6 figures"): what it is and how much, in a handful of words.
 * Sizes and sleeves live in the editor.
 */
export function componentSummary(c: Component): string {
  switch (c.kind) {
    case "cards": {
      const [first, ...more] = c.decks;
      if (first !== undefined && more.length > 0) {
        const n = c.decks.reduce((sum, d) => sum + d.count, 0);
        return c.decks.every((d) => d.count === first.count)
          ? `${c.decks.length} decks of ${first.count}`
          : `${n} cards in ${c.decks.length} decks`;
      }
      const n = first?.count ?? 0;
      return c.sleeve === "none" ? `${n} cards` : `${n} cards, sleeved`;
    }
    case "bulk": {
      const kinds = c.items.length;
      const counts = c.items.map((item) => ("count" in item ? item.count : undefined));
      // Only pieces that were counted can be added up: an item given by volume has no count.
      const pieces = counts.every((n) => n !== undefined)
        ? counts.reduce((sum: number, n) => sum + (n ?? 0), 0)
        : undefined;
      if (pieces === undefined) {
        return `${kinds} ${kinds === 1 ? "kind" : "kinds"}`;
      }
      return kinds === 1 ? `${pieces} pieces` : `${kinds} kinds, ${pieces} pieces`;
    }
    case "tiles":
      return `${c.count} tiles`;
    case "minis":
      return `${c.figures.reduce((sum, f) => sum + f.count, 0)} figures`;
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

/**
 * The rail's words for a layer, as Main writes them: "bottom layer", "top layer", and "layer 2"
 * between. A single layer has no name. (`layerLabel` is the layer switch's and the tray bar's.)
 */
export function layerWords(level: number, count: number): string {
  if (count < 2) {
    return "";
  }
  return level === 0 ? "bottom layer" : level === count - 1 ? "top layer" : `layer ${level + 1}`;
}

/**
 * What a tray's compartments are called, one and many: the phone sheet's "6 figure pockets"
 * (MobileTray). The board's "scooped bins" is not ours: a tray holds things in compartments, and
 * "bin" is one of the Words table's Not-words.
 */
export const COMPARTMENT_WORDS = {
  card: ["card well", "card wells"],
  tile: ["tile stack", "tile stacks"],
  scoop: ["scooped compartment", "scooped compartments"],
  figure: ["figure pocket", "figure pockets"],
  other: ["compartment", "compartments"],
} as const;

/**
 * What a tray's compartments are, with their count: "1 card well", "4 scooped compartments", "6 figure
 * pockets". The compartment's own kind says scoop or pocket; a well is a card well or a tile stack
 * by what it holds. Null for a tray with none.
 */
export function compartmentWords(tray: TraySpec, component: Component | undefined): string | null {
  const own = tray.compartments.filter((c) => c.kind !== "spare");
  const first = own[0];
  if (first === undefined) {
    return null;
  }
  const words =
    first.kind === "scoop"
      ? COMPARTMENT_WORDS.scoop
      : first.kind === "pocket"
        ? COMPARTMENT_WORDS.figure
        : component?.kind === "cards"
          ? COMPARTMENT_WORDS.card
          : component?.kind === "tiles"
            ? COMPARTMENT_WORDS.tile
            : COMPARTMENT_WORDS.other;
  return `${own.length} ${own.length === 1 ? words[0] : words[1]}`;
}
