// Whether a part's name fits on it: the same plan the geometry worker follows when it builds the
// part, without building it. Pure, so the main thread may import it (it pulls in no kernel): the
// packing guide and the export panel say which parts are too small to carry their name.
import { carriesName } from "../model/part-name";
import type { Settings, TraySpec } from "../model/types";
import { planNamedEngravings, planNamedMerged } from "./engrave";
import { planTray } from "./plan";

/**
 * The version of the part's name that is engraved on it (`names`: the part's `partNames` or
 * `partName`), "" when the part carries none or is too small (or too thin) for any version on every
 * face (two opposite walls, the underside and the floor of a well); null when the part cannot be
 * planned at all (such a part is not built either, so nothing can be said of its name). The
 * kinds of the wells (`wellNames`) are no part of the answer.
 */
export function engravedName(
  spec: TraySpec,
  settings: Settings,
  names: readonly string[] | string,
  wellNames: readonly string[] = [],
): string | null {
  const choices = typeof names === "string" ? [names] : names.filter((n) => n !== "");
  if (!carriesName(spec.part) || choices.length === 0) {
    return "";
  }
  try {
    if (spec.merged) {
      const plans = spec.merged.members.map((member) => planTray(member, settings));
      return planNamedMerged(spec, spec.merged, plans, choices)?.name ?? "";
    }
    return planNamedEngravings(planTray(spec, settings), choices, wellNames)?.name ?? "";
  } catch {
    return null;
  }
}

/** Whether any version of `name` is engraved on the part (`engravedName`); null: it cannot be planned. */
export function engravesName(spec: TraySpec, settings: Settings, name: string): boolean | null {
  const chosen = engravedName(spec, settings, name);
  return chosen === null ? null : chosen !== "";
}
