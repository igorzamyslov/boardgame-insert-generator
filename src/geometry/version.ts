/**
 * Semver of the tray geometry generator (spec §9).
 *
 * How to bump it: while MAJOR is 0, an additive change (new optional feature,
 * mesh-only change) bumps PATCH, and MINOR is a breaking change: trays
 * exported before and after would no longer mate (outer size, lip, insets,
 * compartment sizes), so they need a reprint. From 1.0 on, an additive change
 * bumps MINOR and a breaking change bumps MAJOR.
 */
export const GEOMETRY_VERSION = "0.1.0";
