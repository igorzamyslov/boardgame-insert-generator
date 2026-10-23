// src/geometry/buildable.ts
// A yes or no from planTray for the layout, which may not hand out a part the geometry refuses. Pure
// numbers, no kernel (planTray plans, buildTray builds), so the page may import it, as it may
// geometry/engraves (eslint.config.mjs).
import type { Settings, TraySpec } from "../model/types";
import { TraySpecError, UnsupportedFeatureError } from "./errors";
import { planTray } from "./plan";

/**
 * Whether planTray builds every one of `specs` with `settings`. splitRisers asks before it puts the
 * lip on a riser and the groove under the tray on it: only where the tray's walls, height and cuts
 * allow it. A spec the geometry cannot read (a part or feature of a newer version, kept by an
 * older app) is a no as well: printableParts must not throw for a file it can show. Any error that
 * is not a verdict on the spec is rethrown.
 */
export function buildable(specs: readonly TraySpec[], settings: Settings): boolean {
  try {
    for (const spec of specs) {
      planTray(spec, settings);
    }
    return true;
  } catch (error) {
    if (error instanceof TraySpecError || error instanceof UnsupportedFeatureError) {
      return false;
    }
    throw error;
  }
}
