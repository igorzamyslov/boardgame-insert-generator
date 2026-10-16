import type { TraySpec } from "./types";

/**
 * Whether a part of this kind carries an engraved name (spec §6.1 "Part names"): the trays,
 * fillers and risers, whose outer walls stand in view. The plates (a card spacer or a divider) are
 * only a few millimetres thick and go inside another part, so they carry none.
 */
export function carriesName(part: TraySpec["part"]): boolean {
  return part === "tray" || part === "leftover" || part === "riser";
}
