// src/ui/identity.ts
import { KIND_NAMES } from "../model/defaults";
import type { Component, TraySpec } from "../model/types";

/** How many identity tints the design system has (--tint-1 … --tint-8). */
const TINT_COUNT = 8;

/** The CSS colour of the nth component, matching its swatch in the list and its tray in the plan. */
export function tintVar(index: number): string {
  return `var(--tint-${(index % TINT_COUNT) + 1})`;
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
