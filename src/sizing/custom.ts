import type { CustomComponent, Settings } from "../model/types";
import {
  compartment,
  componentIsValid,
  cornerRelief,
  displayName,
  fingerPocket,
  mainClearance,
  type OptionsResult,
} from "./common";

/** Storage options for a custom component; none (and no notices) when it fails validation. */
export function customOptions(c: CustomComponent, s: Settings, index: number): OptionsResult {
  if (!componentIsValid(c, index)) {
    return { options: [], notices: [] };
  }
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
