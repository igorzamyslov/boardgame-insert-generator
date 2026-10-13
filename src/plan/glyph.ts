// src/plan/glyph.ts
import { KIND_NAMES } from "../model/defaults";
import type { Component, ComponentKind, TraySpec } from "../model/types";

/** The names a component's tray contents can carry: its own, and its decks, items or figures. */
function namesOf(c: Component): string[] {
  const names = [c.name === "" ? KIND_NAMES[c.kind] : c.name];
  if (c.kind === "cards") {
    names.push(...c.decks.map((d) => d.name));
  } else if (c.kind === "bulk") {
    names.push(...c.items.map((i) => i.name));
  } else if (c.kind === "minis") {
    names.push(...c.figures.map((f) => f.name));
  }
  return names;
}

/**
 * The kind of the component a tray holds: its first compartment's contents name the component
 * (the longest matching name wins), as in tintOfTray. Null for a leftover, a spacer or a tray
 * whose contents match no component.
 */
export function kindOfTray(tray: TraySpec, components: readonly Component[]): ComponentKind | null {
  if (tray.part !== "tray") {
    return null;
  }
  const first = tray.compartments.find((c) => c.kind !== "spare" && c.contents !== "");
  if (!first) {
    return null;
  }
  let best: { kind: ComponentKind; length: number } | null = null;
  for (const c of components) {
    for (const name of namesOf(c)) {
      if (
        name !== "" &&
        first.contents.includes(name) &&
        (best === null || name.length > best.length)
      ) {
        best = { kind: c.kind, length: name.length };
      }
    }
  }
  return best === null ? null : (best as { kind: ComponentKind }).kind;
}
