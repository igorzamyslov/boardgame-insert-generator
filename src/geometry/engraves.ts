// Whether a part's name fits on it: the same plan the geometry worker follows when it builds the
// part, without building it. Pure, so the main thread may import it (it pulls in no kernel): the
// packing guide and the export panel say which parts are too small to carry their name.
import { carriesName } from "../model/part-name";
import type { Settings, TraySpec } from "../model/types";
import { planEngraving, planMergedEngraving } from "./engrave";
import { planTray } from "./plan";

/**
 * True when the part is of a kind that carries a name and `name` has room on it; false when it
 * carries none or is too small (or too thin) for it; null when the part cannot be planned at all
 * (such a part is not built either, so nothing can be said of its name).
 */
export function engravesName(spec: TraySpec, settings: Settings, name: string): boolean | null {
  if (!carriesName(spec.part) || name === "") {
    return false;
  }
  try {
    if (spec.merged) {
      const plans = spec.merged.members.map((member) => planTray(member, settings));
      return planMergedEngraving(spec, spec.merged, plans, name) !== null;
    }
    return planEngraving(planTray(spec, settings), name) !== null;
  } catch {
    return null;
  }
}
