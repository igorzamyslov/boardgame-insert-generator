import { growthOf, togglesOf } from "../model/defaults";
import type { CustomComponent, Settings } from "../model/types";
import { growthMm } from "./growth";
import {
  compartment,
  displayName,
  featuresOf,
  mainClearance,
  type OptionsResult,
  pieceCutout,
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
      // A centred cut through the front wall (spec §6.1): half the well deep, but down to the floor
      // with a floor notch for a short item, which a half-deep cut would leave below it.
      features: featuresOf(togglesOf(c), [pieceCutout("front", c.h)]),
    }),
  ]);
  return { options: [{ id: "custom", blocks }], notices: [] };
}
