import type { CompartmentSpec } from "../model/types";
import { MIN_GRIP } from "./constants";

/** Spec §3 rule 8: a compartment with min(w, d) ≥ 25 mm or a wall cutout. */
export function hasGrip(compartments: readonly CompartmentSpec[]): boolean {
  return compartments.some(
    (c) => Math.min(c.w, c.d) >= MIN_GRIP || c.features.some((f) => f.type === "wallCutout"),
  );
}
