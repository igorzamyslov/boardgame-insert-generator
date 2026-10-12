import type { CompartmentSpec } from "../model/types";
import { MIN_GRIP } from "./constants";
import type { TrayPartReq } from "./types";

/** Spec §3 rule 8: a compartment with min(w, d) ≥ 25 mm, a wall cutout or a curved floor (scoop). */
export function hasGrip(compartments: readonly CompartmentSpec[]): boolean {
  return compartments.some(
    (c) =>
      Math.min(c.w, c.d) >= MIN_GRIP ||
      c.features.some((f) => f.type === "wallCutout" || f.type === "scoop"),
  );
}

/**
 * Whether spec rule 8 applies to the part: some compartment asks for a finger cut or a curved
 * floor. A tray whose components all have both turned off is the user's opt-out.
 */
export function needsGrip(part: TrayPartReq): boolean {
  return part.compartments.some((c) =>
    c.features.some((f) => f.type === "wallCutout" || f.type === "scoop"),
  );
}
