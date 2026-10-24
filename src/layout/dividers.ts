import { socketOf } from "../model/lip";
import { MIN_CUT_MM, MIN_FEATURE_MM } from "../model/settings";
import type { CompartmentSpec, PlateNotch, Settings, TraySpec } from "../model/types";
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
 * A flat well has plates of another kind: one loose horizontal plate for every `separatorPlate`
 * feature, lying across the well on top of the group of cards below it (the stack's groups are
 * lifted out with the plate under them). Slot plates are numbered first, then these, bottom up.
 *
 * A plate is a solid part of its own, keyed `<trayKey>:divider:<n>` from 1 over the tray's
 * compartments in order and each one's slots from the front or left. Everything that isn't a tray
 * with slots is returned as it is, the plates following the tray they stand in. With `settings`,
 * a socketed tray's plates (the stepped base) stop SPACER_TOP_GAP under its contents' top, the
 * socket's depth under the rim, clear of the slab of the tray above.
 */
/** The half-round finger cut of a standing plate's top edge, or none where the plate is too small. */
function topNotch(length: number, standing: number, pocket: number): PlateNotch[] {
  const r = Math.min(pocket / 2, standing - 3, length / 4);
  return r >= MIN_CUT_MM / 2 ? [{ face: "top", at: roundMm(length / 2), r: roundMm(r) }] : [];
}

/**
 * The half-round cuts of a flat plate, one for each of its well's wall cutouts: centred where the
 * wall's cut is, as wide as it, and no wider than the plate leaves a rim for.
 */
function sideNotches(c: CompartmentSpec, w: number, d: number): PlateNotch[] {
  return c.features.flatMap((f): PlateNotch[] => {
    if (f.type !== "wallCutout") {
      return [];
    }
    const alongX = f.side === "front" || f.side === "back";
    const span = alongX ? w : d;
    const at = roundMm(f.at - (alongX ? c.x : c.y) - DIVIDER_END_PLAY);
    const r = Math.min(f.width / 2, at, span - at, span / 2 - MIN_FEATURE_MM);
    return r >= MIN_CUT_MM / 2 ? [{ face: f.side, at, r: roundMm(r) }] : [];
  });
}

export function splitDividers(trays: readonly TraySpec[], settings?: Settings): TraySpec[] {
  return trays.flatMap((t): TraySpec[] => {
    if (t.part !== "tray") {
      return [t];
    }
    const plates: TraySpec[] = [];
    const socket = settings === undefined ? 0 : (socketOf(settings, t.lip)?.depth ?? 0);
    const pocket = settings?.fingerPocket.width ?? 25;
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
          // a hand lifts it by the half-round cut in its top edge, mid-length
          notches: topNotch(length, standing, pocket),
        });
      }
      // A flat well's plates lie across the whole well, each on the group below it, bottom first.
      const lying = c.features
        .flatMap((f) => (f.type === "separatorPlate" ? [f] : []))
        .sort((a, b) => a.at - b.at);
      const w = roundMm(c.w - 2 * DIVIDER_END_PLAY);
      const d = roundMm(c.d - 2 * DIVIDER_END_PLAY);
      for (const f of lying) {
        plates.push({
          key: `${t.key}${DIVIDER_SUFFIX}${plates.length + 1}`,
          part: "divider",
          path: "",
          stack: t.stack,
          level: t.level,
          x: roundMm(t.x + c.x + DIVIDER_END_PLAY),
          y: roundMm(t.y + c.y + DIVIDER_END_PLAY),
          z: roundMm(t.z + c.floorZ + f.at),
          w,
          d,
          h: f.thickness,
          rotated: false,
          wall: 0,
          floor: 0,
          lip: false,
          solid: true,
          compartments: [],
          // lined up with the tray's side cuts, so a hand reaches the plate where it reaches the cards
          notches: sideNotches(c, w, d),
        });
      }
    }
    return [t, ...plates];
  });
}
