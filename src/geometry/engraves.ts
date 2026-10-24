// Whether a part's name fits on it: the same plan the geometry worker follows when it builds the
// part, without building it. Pure, so the main thread may import it (it pulls in no kernel): the
// packing guide and the export panel say which parts are too small to carry their name.
import { carriesName } from "../model/part-name";
import type { Settings, TraySpec } from "../model/types";
import { hasEngraving, planEngravings, planMergedEngraving, planMergedInside } from "./engrave";
import { planTray } from "./plan";

/**
 * True when the part is of a kind that carries a name and `name` has room on at least one of its
 * faces (two opposite walls, the underside and the floor of a well); false when it
 * carries none or is too small (or too thin) for every face; null when the part cannot be planned at all
 * (such a part is not built either, so nothing can be said of its name).
 */
export function engravesName(spec: TraySpec, settings: Settings, name: string): boolean | null {
  if (!carriesName(spec.part) || name === "") {
    return false;
  }
  try {
    if (spec.merged) {
      const plans = spec.merged.members.map((member) => planTray(member, settings));
      return (
        planMergedEngraving(spec, spec.merged, plans, name) !== null ||
        planMergedInside(spec.merged, plans, name) !== null
      );
    }
    return hasEngraving(planEngravings(planTray(spec, settings), name));
  } catch {
    return null;
  }
}
