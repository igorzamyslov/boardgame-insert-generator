import type { Json } from "./json";
import { isRecord } from "./json";

// The migration of schema 0.5.0, compatibility line "0.4" → "0.5.0": the two ways to fill spare room
// with walls, `wallAbsorb` (a number of mm per wall, 0 to 3) and `oneWall` (the room into one wall),
// became one choice, `thickerWalls`. Where a file used either, with the bigger-wells choice off, it
// now says thicker walls: the room still goes into walls and no spacer is printed, only without the
// old limits. A pure function on raw JSON: it never throws for a JSON object, never mutates its
// input and gives the same output for the same input. The stored plan is left as it is: its inputs
// hash changes with the setting, so it is stale once.

/** Schema line "0.4" → "0.5.0": `wallAbsorb`, `oneWall` (and the older `wallGrowth`) become `thickerWalls`. */
export function migrateTo050(raw: Json): Json {
  const out = structuredClone(raw);
  const settings = out.settings;
  if (!isRecord(settings)) {
    return out;
  }
  const absorb = [settings.wallAbsorb, settings.wallGrowth].some(
    (v) => typeof v === "number" && v > 0,
  );
  if ((settings.oneWall === true || absorb) && settings.biggerWells !== true) {
    settings.thickerWalls = true;
  }
  delete settings.wallAbsorb;
  delete settings.wallGrowth;
  delete settings.oneWall;
  return out;
}
