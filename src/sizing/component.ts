import type { Component, Settings } from "../model/types";
import { bulkOptions } from "./bulk";
import { cardOptions } from "./cards";
import type { OptionsResult } from "./common";
import { customOptions } from "./custom";
import { minisOptions } from "./minis";
import { tileOptions } from "./tiles";

export function componentOptions(c: Component, s: Settings, index: number): OptionsResult {
  switch (c.kind) {
    case "cards":
      return cardOptions(c, s, index);
    case "bulk":
      return bulkOptions(c, s, index);
    case "tiles":
      return tileOptions(c, s, index);
    case "minis":
      return minisOptions(c, s, index);
    case "custom":
      return customOptions(c, s, index);
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
