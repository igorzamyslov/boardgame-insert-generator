// src/ui/limits.ts
import { BOUNDS, LAYER_HEIGHT_MAX, LAYER_HEIGHT_MIN, MAX_VOLUME_ML } from "../model/validate";
import type { NumberRules } from "./NumberField";

// The bounds are the model's (`validateProject` enforces the same ones, spec §5): the forms
// import them instead of repeating the numbers.

/** A length in mm: above 0, at most `BOUNDS.maxLength`. */
export const LENGTH: NumberRules = { min: 0, minExclusive: true, max: BOUNDS.maxLength };
/** A length in mm that may be 0 (headroom, bed margin, clearance, sleeve thickness). */
export const OFFSET: NumberRules = { min: 0, max: BOUNDS.maxLength };
/** A number of cards or pieces. */
export const COUNT: NumberRules = { integer: true, min: 1, max: BOUNDS.maxCount };
/** A number of players (a per-player count). */
export const PLAYERS: NumberRules = { integer: true, min: 1, max: BOUNDS.maxPlayers };
/** A volume in ml. */
export const VOLUME_ML: NumberRules = { min: 0, minExclusive: true, max: MAX_VOLUME_ML };
/** The printable layer height in mm. */
export const LAYER_HEIGHT: NumberRules = { min: LAYER_HEIGHT_MIN, max: LAYER_HEIGHT_MAX };
