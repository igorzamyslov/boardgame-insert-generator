import { binGrowthOf, binTogglesOf } from "../model/defaults";
import type { Component, Settings } from "../model/types";
import { binOptions, type Pieces } from "./bulk";
import type { StorageOption } from "./common";
import { flatFootprint } from "./tiles";

/** The pieces of a component that may fall back to a scoop bin, or null for one that may not. */
function binPieces(c: Component): readonly Pieces[] | null {
  switch (c.kind) {
    case "tiles": {
      const foot = flatFootprint(c.shape);
      return [{ name: "", count: c.count, w: foot.x, d: foot.y, h: c.thickness }];
    }
    case "minis":
      return c.storage === "pockets" ? c.figures : null;
    case "custom":
      return [{ name: "", count: c.count, w: c.w, d: c.d, h: c.h }];
    case "cards":
    case "bulk":
      return null;
    default: {
      const unreachable: never = c;
      return unreachable;
    }
  }
}

/**
 * The bulk fallback of a tiles, minis (pockets) or custom component none of whose variants gives
 * every compartment a finger cut (spec §7.1, roadmap §4.7): its pieces loose in scoop bins, the
 * `bulk-shallow` and `bulk-deep` options of minis bulk storage, with bulk's toggle defaults where
 * it set none (binTogglesOf). Null for cards and bulk, which have none.
 */
export function bulkFallback(c: Component, s: Settings): StorageOption[] | null {
  const pieces = binPieces(c);
  const modes = { w: binGrowthOf(c, "w"), d: binGrowthOf(c, "d"), h: binGrowthOf(c, "h") };
  return pieces === null ? null : binOptions(c, pieces, binTogglesOf(c), modes, s);
}
