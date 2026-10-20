// src/ui/identity.ts
import { KIND_NAMES } from "../model/defaults";
import { groupById, groupOfItem, parseTrayKey } from "../model/groups";
import type { Component, ComponentKind, Group, Project, TraySpec } from "../model/types";
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
    light: { fill: "#C0D3F7", line: "#335AA6", ink: "#22457E" },
    dark: { fill: "#263654", line: "#829FD9", ink: "#C3D2E9" },
  },
  bulk: {
    light: { fill: "#FBDEAB", line: "#8A5D08", ink: "#6E4C0E" },
    dark: { fill: "#584523", line: "#F6C465", ink: "#EFDEBD" },
  },
  tiles: {
    light: { fill: "#C1E7CB", line: "#2E6B41", ink: "#22552E" },
    dark: { fill: "#314938", line: "#8DCEA1", ink: "#C8E4CF" },
  },
  minis: {
    light: { fill: "#F0C2D6", line: "#964068", ink: "#74244B" },
    dark: { fill: "#4E2C3B", line: "#CE8DAB", ink: "#E7C5D6" },
  },
  custom: {
    light: { fill: "#D3CCED", line: "#5B4B9A", ink: "#45397A" },
    dark: { fill: "#36304B", line: "#9D91CA", ink: "#CFCAE2" },
  },
};

/**
 * How each further shade moves the fill within the hue: lightness points, saturation percent.
 * Lightness goes both ways (darker mostly, one a little lighter) and saturation barely falls: a
 * step toward white or toward grey washed the plan out (owner: "a bit pale").
 */
const SHADE_STEPS: readonly { l: number; s: number }[] = [
  { l: 0, s: 0 },
  { l: -8, s: 0 },
  { l: 3, s: 0 },
  { l: -12, s: -4 },
  { l: -17, s: -18 },
];

/** The same steps on a dark page, where the lighter fill is the one that stands out. */
const DARK_L_STEPS: readonly number[] = [0, 5, -4, 9, 13];

const DARK_FILL_MAX_L = 40;
const MIN_LINE_CONTRAST = 3.2;
const MIN_INK_CONTRAST = 4.8;

/**
 * A group's tray is neutral: a mixed tray has no single kind, so no kind hue stands for it. Light
 * mirrors `--sheet` (the fill) and `--muted-strong` (the line and the ink); the line keeps 3:1 on
 * the box and on the fill, the ink 4.5:1 on the fill. In 3D the body takes `fill`; the wells are
 * not tinted there.
 */
export const GROUP_SHADE: Record<ColorScheme, Shade> = {
  light: { fill: "#ffffff", line: "#3e413c", ink: "#3e413c" },
  dark: { fill: "#26241f", line: "#d6d3c8", ink: "#e6e3d9" },
};

/** What a shade is asked for: a component's kind, or "group" for the neutral of a group's tray. */
export type ShadeKind = ComponentKind | "group";

/**
 * The colours of the nth component of a kind, as hex for one colour scheme. Index 0 is the
 * kind's base hue; the next ones step lightness and saturation inside that hue (the other way
 * round on a dark page, where the lighter fill is the one that stands out), and then they
 * start over. The line is pushed until it keeps 3:1 on the box and on its own fill, and the ink
 * until it keeps 4.5:1 on the fill, so any shade can be used for outlines and for text.
 */
export function shadeHex(kind: ShadeKind, index: number, scheme: ColorScheme): Shade {
  if (kind === "group") {
    return { ...GROUP_SHADE[scheme] };
  }
  const base = KIND_BASES[kind][scheme];
  const slot = ((Math.trunc(index) % SHADE_COUNT) + SHADE_COUNT) % SHADE_COUNT;
  if (slot === 0) {
    return { ...base };
  }
  const step = SHADE_STEPS[slot] ?? { l: 0, s: 0 };
  // On a dark page the steps go the other way round (lighter stands out) and stop
  // where light ink still reads on the fill.
  const dL = scheme === "light" ? step.l : (DARK_L_STEPS[slot] ?? 0);
  const f = hexToHsl(base.fill);
  // Saturation never rises, and never falls so far that the hue is lost.
  const fill = hslToHex({
    h: f.h,
    s: Math.min(f.s, Math.max(f.s * 0.5, f.s * (1 + step.s / 100))),
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
export function shadeOf(kind: ShadeKind, index: number): Shade {
  const light = shadeHex(kind, index, "light");
  const dark = shadeHex(kind, index, "dark");
  return {
    fill: `light-dark(${light.fill}, ${dark.fill})`,
    line: `light-dark(${light.line}, ${dark.line})`,
    ink: `light-dark(${light.ink}, ${dark.ink})`,
  };
}

/** The shade of the nth component of a kind as CSS custom properties, for a row or a panel to take. */
export function shadeVars(kind: ShadeKind, index: number): Record<string, string> {
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

/** The component a compartment holds, by the id it names, else by its words; null for none. */
export function componentIndexOfCompartment(
  compartment: TraySpec["compartments"][number],
  components: readonly Component[],
): number | null {
  // Layouts from schema 0.1.2 on name the component outright, so two components called the
  // same thing (several unnamed "Cards", say) keep their own colour instead of collapsing
  // onto whichever one the text happened to match first.
  if (compartment.componentId !== undefined) {
    const byId = components.findIndex((c) => c.id === compartment.componentId);
    if (byId !== -1) {
      return byId;
    }
  }
  return componentIndexOfContents(compartment.contents, components);
}

/** The compartments of a tray that hold something of a component (not a spare well). */
const holding = (tray: TraySpec): TraySpec["compartments"] =>
  tray.compartments.filter((c) => c.kind !== "spare" && c.contents !== "");

/**
 * The component a tray takes its colour and name from: its first compartment's, else null (spare,
 * leftover, spacer). A tray can hold several (a group shares one): `componentIndexesOfTray` names
 * them all; this one is the first of them.
 */
export function componentIndexOfTray(
  tray: TraySpec,
  components: readonly Component[],
): number | null {
  const first = holding(tray)[0];
  return first === undefined ? null : componentIndexOfCompartment(first, components);
}

/**
 * Every component a tray holds, each once, in compartment order. A tray belongs to all of them: the
 * rail lights each one's row when the tray is chosen, each one's row names its layer and each one's
 * editor lifts the tray. The colour is the first's alone (`componentIndexOfTray`, `shadeIndexOf`).
 */
export function componentIndexesOfTray(tray: TraySpec, components: readonly Component[]): number[] {
  const out: number[] = [];
  for (const compartment of holding(tray)) {
    const at = componentIndexOfCompartment(compartment, components);
    if (at !== null && !out.includes(at)) {
      out.push(at);
    }
  }
  return out;
}

/** The ids of the components a tray holds (`componentIndexesOfTray`). */
export function componentIdsOfTray(tray: TraySpec, components: readonly Component[]): string[] {
  return componentIndexesOfTray(tray, components).flatMap((i) => components[i]?.id ?? []);
}

/**
 * What lights together with the component `id`: itself and every component that shares a tray with
 * it (a group's members), since the tray is one thing in the plan. A component with a tray to
 * itself, or none, is only itself.
 */
export function sharingTrayWith(
  id: string,
  trays: readonly TraySpec[],
  components: readonly Component[],
): Set<string> {
  const out = new Set([id]);
  for (const tray of trays) {
    const ids = componentIdsOfTray(tray, components);
    if (ids.includes(id)) {
      ids.forEach((other) => out.add(other));
    }
  }
  return out;
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
    case "minis": {
      const figures = c.figures.reduce((sum, f) => sum + f.count, 0);
      return `${figures} ${figures === 1 ? "figure" : "figures"}`;
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

/**
 * The group a tray belongs to: the one whose id is its key's stem (`<group id>:p<copy>:<part>`,
 * and the spacers, risers and dividers under it), else the one that holds the components it holds
 * (a stored plan keeps an item's own keys after the item joined a group). Undefined for a tray of
 * an ungrouped item and for a part that holds nothing.
 */
export function groupOfTray(
  tray: TraySpec,
  p: { components: readonly Component[]; groups?: readonly Group[] },
): Group | undefined {
  const stem = parseTrayKey(tray.key)?.stem;
  const byKey = stem === undefined ? undefined : groupById(p, stem);
  if (byKey !== undefined) {
    return byKey;
  }
  for (const id of componentIdsOfTray(tray, p.components)) {
    const group = groupOfItem(p, id);
    if (group !== undefined) {
      return group;
    }
  }
  return undefined;
}

/**
 * The trays of the plan that make up a group, every copy and every part of a split copy, in the
 * plan's order. Its spacers, risers and dividers are not trays and are left out. None without a plan.
 */
export function traysOfGroup(
  p: Pick<Project, "components" | "groups" | "layout">,
  groupId: string,
): TraySpec[] {
  return (p.layout?.trays ?? []).filter(
    (t) => t.part === "tray" && groupOfTray(t, p)?.id === groupId,
  );
}

/**
 * Whether a tray is a group's: a tray (not a spacer, riser, divider or spare) of a group. It is
 * drawn and shaded neutral everywhere (spec §7.6): a mixed tray has no single kind.
 */
export function isGroupTray(
  tray: TraySpec,
  p: { components: readonly Component[]; groups?: readonly Group[] },
): boolean {
  return tray.part === "tray" && (p.groups?.length ?? 0) > 0 && groupOfTray(tray, p) !== undefined;
}

/** What a compartment is drawn in: its member's kind, and the member's place among its kind. */
export interface MemberShade {
  kind: ComponentKind;
  /** The nth of its kind (`shadeIndexOf`): the argument `shadeHex` and `shadeOf` take. */
  index: number;
}

/** The member a compartment holds, for its colours; null for a spare well or one that names no item. */
export function memberShadeOfCompartment(
  compartment: TraySpec["compartments"][number],
  components: readonly Component[],
): MemberShade | null {
  if (compartment.kind === "spare") {
    return null;
  }
  const at = componentIndexOfCompartment(compartment, components);
  const member = at === null ? undefined : components[at];
  return at === null || member === undefined
    ? null
    : { kind: member.kind, index: shadeIndexOf(components, at) };
}

/**
 * A group tray's members as the tray bar's tiny tray draws them: one cell each, in compartment
 * order, as wide as the members' compartments are in all (the cells' area), so a deck's well reads
 * wider than a figure pocket.
 */
export function memberCellsOfTray(
  tray: TraySpec,
  components: readonly Component[],
): (MemberShade & { weight: number })[] {
  const out: (MemberShade & { id: string; weight: number })[] = [];
  for (const c of tray.compartments) {
    const at = c.kind === "spare" ? null : componentIndexOfCompartment(c, components);
    const member = at === null ? undefined : components[at];
    const shade = memberShadeOfCompartment(c, components);
    if (member === undefined || shade === null) {
      continue;
    }
    const area = Math.max(1, c.w * c.d);
    const have = out.find((m) => m.id === member.id);
    if (have === undefined) {
      out.push({ ...shade, id: member.id, weight: area });
    } else {
      have.weight += area;
    }
  }
  return out.map(({ kind, index, weight }) => ({ kind, index, weight }));
}
