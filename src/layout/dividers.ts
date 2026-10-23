import { socketOf } from "../model/lip";
import type { Settings, TraySpec } from "../model/types";
import { DIVIDER_END_PLAY, DIVIDER_PLAY, SPACER_TOP_GAP } from "../sizing/constants";
import { roundMm } from "./units";

/** The key of divider `n` (from 1) of a tray. */
export const DIVIDER_SUFFIX = ":divider:";

/**
 * The dividers to print for a stored layout (minimal-trays spec §5): one loose plate for every
 * `dividerSlot` in a tray's floor, standing in it. The plates are derived, not stored: the slots
 * are in the stored tray, and the plate that fits a slot is determined by it (as wide as the slot
 * less DIVIDER_PLAY, DIVIDER_END_PLAY short of the well's walls at each end, standing from the
 * bottom of the slot to SPACER_TOP_GAP below the rim), so a share link carries the slots and
 * nothing for the plates. Run after splitRisers, so a tray's height and floor are as printed.
 *
 * A plate is a solid part of its own, keyed `<trayKey>:divider:<n>` from 1 over the tray's
 * compartments in order and each one's slots from the front or left. Everything that isn't a tray
 * with slots is returned as it is, the plates following the tray they stand in. With `settings`,
 * a socketed tray's plates (the stepped base) stop SPACER_TOP_GAP under its contents' top, the
 * socket's depth under the rim, clear of the slab of the tray above.
 */
export function splitDividers(trays: readonly TraySpec[], settings?: Settings): TraySpec[] {
  return trays.flatMap((t): TraySpec[] => {
    if (t.part !== "tray") {
      return [t];
    }
    const plates: TraySpec[] = [];
    const socket = settings === undefined ? 0 : (socketOf(settings, t.lip)?.depth ?? 0);
    for (const c of t.compartments) {
      const slots = c.features
        .flatMap((f) => (f.type === "dividerSlot" ? [f] : []))
        .sort((a, b) => a.at - b.at);
      for (const f of slots) {
        const thick = roundMm(f.width - DIVIDER_PLAY);
        const standing = roundMm(f.depth + t.h - socket - c.floorZ - SPACER_TOP_GAP);
        // A slot along y (x: the plate is thin in x) spans the well's depth, one along x its width.
        const across = f.axis === "y";
        const start = roundMm((across ? c.y : c.x) + DIVIDER_END_PLAY);
        const length = roundMm((across ? c.d : c.w) - 2 * DIVIDER_END_PLAY);
        const at = roundMm(f.at - thick / 2);
        plates.push({
          key: `${t.key}${DIVIDER_SUFFIX}${plates.length + 1}`,
          part: "divider",
          path: "",
          stack: t.stack,
          level: t.level,
          x: roundMm(t.x + (across ? at : start)),
          y: roundMm(t.y + (across ? start : at)),
          z: roundMm(t.z + c.floorZ - f.depth),
          w: across ? thick : length,
          d: across ? length : thick,
          h: standing,
          rotated: false,
          wall: 0,
          floor: 0,
          lip: false,
          solid: true,
          compartments: [],
        });
      }
    }
    return [t, ...plates];
  });
}
