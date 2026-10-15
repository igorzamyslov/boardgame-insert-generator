import { growthOf, togglesOf } from "../model/defaults";
import type { CustomComponent, Settings } from "../model/types";
import { growthMm } from "./growth";
import {
  compartment,
  displayName,
  featuresOf,
  mainClearance,
  type OptionsResult,
  wallCutout,
} from "./common";

/** Storage options for a custom component. Precondition: it passes validateComponent. */
export function customOptions(c: CustomComponent, s: Settings): OptionsResult {
  const clearance = mainClearance(c, s);
  const name = displayName(c);
  const blocks = Array.from({ length: c.count }, (_, i) => [
    compartment({
      componentId: c.id,
      contents: c.count > 1 ? `${name} ${i + 1}/${c.count}` : name,
      kind: "well",
      w: c.w + clearance,
      d: c.d + clearance,
      h: c.h + clearance,
      // Tolerance only, so only when asked.
      grow: {
        w: growthMm(growthOf(c, "w"), c.w),
        d: growthMm(growthOf(c, "d"), c.d),
        h: growthMm(growthOf(c, "h"), c.h),
      },
      // A centred cut through the front wall, half the well deep (spec §6.1).
      features: featuresOf(togglesOf(c), [wallCutout("front", 0.5, false)]),
    }),
  ]);
  return { options: [{ id: "custom", blocks }], notices: [] };
}
