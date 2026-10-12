import { parseSemver } from "../model/version";
import type { Semver } from "../model/version";

/**
 * Semver of the tray geometry generator (spec §9).
 *
 * How to bump it: while MAJOR is 0, an additive change (new optional feature,
 * mesh-only change) bumps PATCH, and MINOR is a breaking change: trays
 * exported before and after would no longer mate (outer size, lip, insets,
 * compartment sizes), so they need a reprint. Making planTray stricter, so
 * that stored specs it accepted before are rejected, is a breaking change
 * too. From 1.0 on, an additive change bumps MINOR and a breaking change
 * bumps MAJOR.
 *
 * 0.1.1 added the wall cutout (finger channels through walls and dividers), a new feature, and
 * keeps corner reliefs MIN_WALL_MM from the outer faces (slightly smaller reliefs beside thin outer
 * walls: a mesh-only change inside the wells that doesn't affect fit). Every spec 0.1.0 accepted is
 * still accepted, and trays still mate, so it is a PATCH.
 */
export const GEOMETRY_VERSION = "0.1.1";

/** A version's compatibility line: MAJOR from 1.0 on; pre-1.0, each 0.MINOR (spec §9). */
function line(v: Semver): [number, number] {
  return v.major === 0 ? [0, v.minor] : [v.major, 0];
}

/**
 * Whether a layout stored with geometry `stored` belongs to an older compatibility line than
 * `current` (GEOMETRY_VERSION; a parameter for tests): an older MAJOR, or pre-1.0 an older
 * 0.MINOR, which acts as a major line (spec §9). Its trays won't mate with trays exported now,
 * so the whole insert needs a reprint. False for the same or a newer line and for a version
 * parseSemver cannot read. Pure, so the main thread may import it.
 */
export function isOlderGeometryLine(stored: string, current: string = GEOMETRY_VERSION): boolean {
  const a = parseSemver(stored);
  const b = parseSemver(current);
  if (a === null || b === null) {
    return false;
  }
  const [aMajor, aMinor] = line(a);
  const [bMajor, bMinor] = line(b);
  return aMajor < bMajor || (aMajor === bMajor && aMinor < bMinor);
}
