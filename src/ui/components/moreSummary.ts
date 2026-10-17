// src/ui/components/moreSummary.ts
import { curvedFloorOn, fingerCutsOn } from "../../model/defaults";
import type { Component } from "../../model/types";

/** How many of the options under More options the component sets: what a file or a person changed. */
export function optionsChanged(c: Component): number {
  const set: boolean[] = [
    c.access !== "sometimes",
    c.fingerCuts !== undefined,
    c.curvedFloor !== undefined,
    c.cornerReliefs !== undefined,
    c.separators !== undefined,
    c.dividers !== undefined,
    c.perPlayer !== undefined,
    c.groupId !== undefined,
    c.clearance !== undefined,
    ...Object.keys(c.growth ?? {}).map(() => true),
  ];
  if (c.kind === "cards") {
    set.push(
      c.storage !== "auto",
      c.thickness.mode === "measured" || c.thickness.scale !== undefined,
    );
  }
  return set.filter(Boolean).length;
}

/**
 * What is inside More options, in a few words (Edit's "Finger cuts on, stands upright · 2 changed"):
 * the finger cuts, how a stack of cards stands or whether a bin has a curved floor, whether it
 * leaves room to grow, and how many options are set.
 */
export function moreSummary(c: Component): string {
  const parts = [`Finger cuts ${fingerCutsOn(c) ? "on" : "off"}`];
  if (c.kind === "cards") {
    parts.push(
      c.storage === "flat"
        ? "lies flat"
        : c.storage === "auto"
          ? "stands either way"
          : "stands upright",
    );
  } else if (c.kind !== "tiles") {
    parts.push(`curved floor ${curvedFloorOn(c) ? "on" : "off"}`);
  }
  // only a choice made says so: a deck leaves room to grow unless told not to, so the default is no news
  const chosen = c.growth?.stack;
  if ((c.kind === "cards" || c.kind === "tiles") && chosen !== undefined && chosen !== "off") {
    parts.push("room to grow");
  }
  const changed = optionsChanged(c);
  return `${parts.join(", ")}${changed > 0 ? ` · ${changed} changed` : ""}`;
}
