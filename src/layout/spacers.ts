import { MIN_FEATURE_MM } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { wallFor } from "../sizing";
import { MIN_SPACER, MIN_SPARE, SPACER_MIN_WALL } from "../sizing/constants";
import { roundMm } from "./units";

/** What openSpacers reads from a project. */
export interface SpacerInputs {
  settings: Settings;
}

/**
 * The wall of a hollow spacer: the tray's own wall, and never under SPACER_MIN_WALL. The spacer
 * stands in a well whose walls and floor back every face but the two the deck presses on, so what
 * it must carry is the squeeze of the deck along its length, through its two long walls.
 */
export function spacerWall(settings: Settings): number {
  return roundMm(Math.max(wallFor(settings, false), SPACER_MIN_WALL));
}

/**
 * Whether a spacer part of this size is printed as an open box: not with `leftover: "solid"`, and
 * not when it is too small to open. The rule is riserSpec's (inner size under MIN_SPARE stays
 * solid), plus two a spacer needs: a pocket at least MIN_SPACER deep, and a notch that stays
 * clear of the floor. A separator plate is judged on its own size, so a thin plate is solid and a
 * thick one is open, whatever the style.
 */
function opens(t: TraySpec, settings: Settings): boolean {
  if (settings.leftover === "solid") {
    return false;
  }
  const wall = spacerWall(settings);
  if (Math.min(t.w, t.d) - 2 * wall < MIN_SPARE || t.h - settings.floor < MIN_SPACER) {
    return false;
  }
  return (t.features ?? []).every(
    (f) => f.type !== "spacerNotch" || t.h - f.depth >= settings.floor + MIN_FEATURE_MM,
  );
}

/**
 * The spacers to print, last pass (spec §6.2): a stored spacer is a solid block, but a solid block
 * is the heaviest way to fill a stretched tray's slack, so it follows the `leftover` style the way
 * a riser does: an open walled box with a floor, or solid when the style says so or the part is too
 * small to open (see `opens`). Run after splitRisers and splitSeparators, so each printed part,
 * a loose plate included, is judged by its own size. Derived, not stored: the stored layout is
 * the same with or without it. Everything that isn't a solid spacer is returned as it is.
 */
export function openSpacers(trays: readonly TraySpec[], o: SpacerInputs): TraySpec[] {
  const { settings } = o;
  return trays.map((t) => {
    if (t.part !== "spacer" || !t.solid || t.compartments.length > 0 || !opens(t, settings)) {
      return t;
    }
    const wall = spacerWall(settings);
    const floor = roundMm(settings.floor);
    return {
      ...t,
      wall,
      floor,
      solid: false,
      compartments: [
        {
          x: wall,
          y: wall,
          w: roundMm(t.w - 2 * wall),
          d: roundMm(t.d - 2 * wall),
          floorZ: floor,
          kind: "spare",
          contents: "",
          features: [],
        },
      ],
    };
  });
}
