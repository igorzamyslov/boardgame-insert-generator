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
 * kept corner reliefs MIN_WALL_MM from the outer faces (a mesh-only change inside the wells).
 *
 * 0.2.0 gives minis pockets and custom wells the same wall cutout and drops the finger pocket
 * (FeatureSpec "fingerPocket", its reach band and U-slot): a stored 0.1.x tray with one is refused
 * (UnsupportedFeatureError), and their trays change size, so it is a breaking change. It also
 * rounds the cuts' top corners (mesh only).
 *
 * 0.3.0 cuts a minis pocket through its back wall as well as its front (and so asks for finger room
 * on both outer walls), and picks a compartment's scoop walls after its cuts: trays change size
 * and shape, so it is a breaking change.
 *
 * 0.4.0 stops absorbing leaf slack into thicker walls by default (new `wallGrowth` setting, 0) and
 * prints it as a filler part instead: outer tray sizes change, so it is a breaking change.
 *
 * 0.5.0 makes a stack level a tray plus fillers: a tray stacked on a wider tray is no longer
 * stretched to the stack's footprint (its walls used to take the excess), it keeps the size its own
 * contents need and the rest of its level is filler parts. Outer tray sizes change, so it is a
 * breaking change.
 *
 * 0.5.1 removes the empty spare compartment realizeTray used to add where a tray had row slack
 * (a pocket that held none of the component's pieces; the slack now goes to a spacer, the
 * `separators` plates, or the walls, and `wallGrowth` was renamed `wallAbsorb`). It is a PATCH, not a
 * new line: no outer size, lip, inset or well changes, so trays printed before and after still mate
 * and stack; only the inside of a tray that had slack to spare differs.
 *
 * 0.5.2 lets a spacer be an open walled box with a floor, as a riser may (planTray used to build
 * every spacer solid, whatever its `solid`; it now honours it, and the app prints a spacer open
 * under the `leftover` style: openSpacers), and accepts a wall cutout one hundredth of a
 * millimetre narrower than an odd-hundredths `fingerPocket.width` (narrowestCutMm). A PATCH: the
 * outer size, lip, inset and every well are unchanged, so spacers printed before and after still
 * fit the same wells and trays still mate; only a spacer's inside differs, and planTray accepts
 * everything it accepted before.
 */
export const GEOMETRY_VERSION = "0.5.2";

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
