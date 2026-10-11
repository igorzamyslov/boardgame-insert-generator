import type { Component, Settings } from "../model/types";
import { bulkOptions } from "./bulk";
import { cardOptions } from "./cards";
import { componentIsValid, type OptionsResult } from "./common";
import { customOptions } from "./custom";
import { minisOptions } from "./minis";
import { tileOptions } from "./tiles";

/**
 * Storage options for one component, by kind. An invalid component (one validateComponent gives an
 * error) has no options and no notices: validateProject already reports it, so sizing never
 * repeats validation. The per-kind functions assume a valid component.
 */
export function componentOptions(c: Component, s: Settings, index: number): OptionsResult {
  if (!componentIsValid(c, index)) {
    return { options: [], notices: [] };
  }
  switch (c.kind) {
    case "cards":
      return cardOptions(c, s, index);
    case "bulk":
      return bulkOptions(c, s);
    case "tiles":
      return tileOptions(c, s);
    case "minis":
      return minisOptions(c, s);
    case "custom":
      return customOptions(c, s);
    default: {
      const unreachable: never = c;
      return unreachable;
    }
  }
}

/** Loose contents fall out when not covered from above (spec §7.2 score term 2). */
export function isLoose(c: Component): boolean {
  return c.kind === "bulk" || c.kind === "tiles" || (c.kind === "minis" && c.storage === "bulk");
}
