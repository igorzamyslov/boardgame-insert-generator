import type { CompartmentSpec } from "../model/types";
import { MIN_GRIP, SCOOP_REACH } from "./constants";
import type { TrayPartReq } from "./types";

/**
 * Spec §3 rule 8: a compartment with min(w, d) ≥ 25 mm, a wall cutout, or a curved floor you
 * can still reach.
 *
 * `trayH` is the tray's own height; with the compartment's floor it gives the depth of the
 * well. A curved floor grips only while a hand can get down to it, so in a bin (`kind: scoop`,
 * whose depth the generator chooses) it counts only within SCOOP_REACH — otherwise the ramp is
 * at the bottom of a pit and the tray would pass rule 8 holding a grip nobody can use. A well
 * or pocket keeps the depth its contents fix, so its ramp is the best grip available either
 * way, and a wall cutout has no limit at all: you reach in from the side.
 */
export function hasGrip(compartments: readonly CompartmentSpec[], trayH: number): boolean {
  return compartments.some((c) => {
    if (Math.min(c.w, c.d) >= MIN_GRIP || c.features.some((f) => f.type === "wallCutout")) {
      return true;
    }
    const reachable = c.kind !== "scoop" || trayH - c.floorZ <= SCOOP_REACH;
    return reachable && c.features.some((f) => f.type === "scoop");
  });
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
