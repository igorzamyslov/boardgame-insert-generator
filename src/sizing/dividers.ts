import { chamferMinimums } from "../model/settings";
import type { Settings } from "../model/types";
import { DIVIDER_PLAY, DIVIDER_THICKNESS, MIN_SECTION } from "./constants";
import { ceilU, fromU, toU } from "./units";

/**
 * The thickness of a divider plate, mm: DIVIDER_THICKNESS, or what the bottom chamfer of a plate
 * needs where that is more (a plate is built as a level 0 solid, planTray). Always a whole 0.01 mm,
 * rounded up; splitDividers prints the plate this thick, the slot is DIVIDER_PLAY wider.
 */
export function dividerThickness(settings: Settings): number {
  return fromU(ceilU(Math.max(DIVIDER_THICKNESS, chamferMinimums(settings, 0).side)));
}

/** The width of a divider's slot in the floor, mm, whole 0.01 mm. */
export function dividerSlotWidth(settings: Settings): number {
  return fromU(ceilU(dividerThickness(settings) + DIVIDER_PLAY));
}

/**
 * The narrowest a well with `count` dividers can be along its stack, mm: the stack and the slots
 * (a divider takes the room of its slot out of the well), and never a section narrower than
 * MIN_SECTION, so a divider has room on both sides however thin the deck.
 */
export function dividedWidth(stack: number, count: number, settings: Settings): number {
  const slots = count * dividerSlotWidth(settings);
  return fromU(ceilU(Math.max(stack + slots, (count + 1) * MIN_SECTION + slots)));
}

/**
 * Where the slots of a well `width` units wide, from `x0`, are: the well's room less the slots is
 * shared evenly by `count` + 1 sections (a whole unit each; the few units over go to the last), and
 * a slot centre falls in the middle of each gap between them. Centres in units, in order. Even
 * spacing is the point: sections are what the user thinks in (per player, by card type).
 */
export function slotCentres(x0: number, width: number, count: number, slot: number): number[] {
  const section = Math.floor((width - count * slot) / (count + 1));
  return Array.from(
    { length: count },
    (_, i) => x0 + (i + 1) * section + i * slot + Math.floor(slot / 2),
  );
}

/**
 * The sections of a well `width` units wide, from `x0`, with `count` dividers (the same sharing as
 * slotCentres): `[start, end]` in units, in order, each one whole `section` wide between the slots
 * and the last taking the few units over. A section's centre is where a finger cut for its deck goes.
 */
export function sectionSpans(
  x0: number,
  width: number,
  count: number,
  slot: number,
): [number, number][] {
  const section = Math.floor((width - count * slot) / (count + 1));
  return Array.from({ length: count + 1 }, (_, k): [number, number] => {
    const start = x0 + k * (section + slot);
    return [start, k === count ? x0 + width : start + section];
  });
}

/** `toU` of a slot width, for realize. */
export function slotWidthU(settings: Settings): number {
  return toU(dividerSlotWidth(settings));
}
