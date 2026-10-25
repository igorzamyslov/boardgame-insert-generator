import type { Json } from "./json";
import { isRecord } from "./json";
import { DEFAULT_SETTINGS, OLD_CARD_CLEARANCE, OLD_CARD_STACK_CLEARANCE } from "./settings";

// The migration of schema 0.4.0 (owner, 2026-10-25), compatibility line "0.3" → "0.4.0": the card
// clearance defaults became comfortable (footprint 1.5 → 3 mm, stack allowance 1 → 2 mm). A stored
// value that still equals the old default moves to the new one; a value the person changed stays.
// A pure function on raw JSON: it never throws for a JSON object, never mutates its input and
// gives the same output for the same input. The stored plan is left as it is: its inputs hash
// changes with the settings, so it is stale once, as sizing on the new clearances makes different
// trays.

/** Schema line "0.3" → "0.4.0": the two card clearances that equal the old defaults take the new. */
export function migrateTo040(raw: Json): Json {
  const out = structuredClone(raw);
  const settings = out.settings;
  if (!isRecord(settings)) {
    return out;
  }
  if (settings.cardClearance === OLD_CARD_CLEARANCE) {
    settings.cardClearance = DEFAULT_SETTINGS.cardClearance;
  }
  if (settings.cardStackClearance === OLD_CARD_STACK_CLEARANCE) {
    settings.cardStackClearance = DEFAULT_SETTINGS.cardStackClearance;
  }
  return out;
}
