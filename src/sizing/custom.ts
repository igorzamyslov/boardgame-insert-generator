import type { CustomComponent, Settings } from "../model/types";
import {
  compartment,
  cornerRelief,
  displayName,
  fingerPocket,
  mainClearance,
  type OptionsResult,
} from "./common";

/** Storage options for a custom component. Precondition: it passes validateComponent. */
export function customOptions(c: CustomComponent, s: Settings): OptionsResult {
  const clearance = mainClearance(c, s);
  const name = displayName(c);
  const blocks = Array.from({ length: c.count }, (_, i) => [
    compartment(
      {
        componentId: c.id,
        contents: c.count > 1 ? `${name} ${i + 1}/${c.count}` : name,
        kind: "well",
        w: c.w + clearance,
        d: c.d + clearance,
        h: c.h + clearance,
        features: [fingerPocket("front", 1, true), cornerRelief()],
      },
      s,
    ),
  ]);
  return { options: [{ id: "custom", blocks }], notices: [] };
}
