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
 * everything it accepted before. Later in 0.5.2, placeCutouts backs off a channel that strands a
 * pocket: a tray that was cut before is unchanged, one that used to throw now gets its cuts.
 * Also in 0.5.2, and not a new version, the app prints connected fillers as one part (`mergeParts`,
 * built by joining the members and the bridges between them): every part is built exactly as
 * before, so nothing printed earlier stops mating, and a merged part is derived from the stored
 * layout and never stored.
 *
 * 0.6.0 bounds what a tray gives its contents (per-component `growth`, minimal-trays spec §5): a
 * bin, a deck or stack of tiles that stood up, and the rest no longer take whatever room a leaf
 * has (bins took all of it on every axis, an upright deck took all of it only when `stretch` was
 * on); each takes up to its growth cap (`auto`: half its size, at most 25 mm, and an upright
 * stack no more than its own thickness without spacer plates) and the rest of the room is a
 * filler beside it. The same project laid out again has other outer tray sizes, so trays printed
 * before and after would not mate: a breaking change, as 0.4.0 (slack becoming a filler) was.
 * planTray is unchanged, and so is every well, lip and inset of a tray that is realized at the
 * same size, so a stored 0.5.x layout still builds and is only flagged as an older line.
 *
 * 0.7.0 adds dividers (a component's `dividers`, minimal-trays spec §5): a well that has them is
 * wider by the room of their slots, its floor is thicker by the depth of the slots (so the tray
 * is taller where its floor is not raised anyway), and the slots themselves are cut into it
 * (FeatureSpec "dividerSlot"). A tray printed with dividers does not match one printed without,
 * and a stored 0.6.x tray with none is unchanged, but the line moves: a breaking change, as the
 * slots change the tray itself (unlike the `separators` plates, which are only derived).
 *
 * 0.7.1 engraves the part's number into one of its outer walls (`TraySpec.partNumber`, set by the
 * app when `settings.engraveNumbers` is on; engrave.ts): shallow recessed digits whose roof slopes
 * at more than 45°. A PATCH, as a mesh-only change is: the engraving only removes material
 * from a face's interior (outer size, lip, inset, wells and cuts are untouched, and it keeps 0.8
 * mm behind it), so parts printed before and after still mate and stack, and a spec without a
 * number builds exactly as before. A merged part carries it on one member.
 *
 * 0.7.2 stops printing a spacer nobody asked for (minimal-trays spec §5.3): a deck or stack of tiles
 * that grows now simply stands in a wider well, and a spacer (or the plates) is only built when its
 * component sets `separators`; without one, growth is also held to what leaves the stack under its
 * finger cut (`reachGrowthMm`). A PATCH, by the 0.5.1 precedent: planTray is unchanged and so is
 * every outer size, lip, inset and cut of a tray realized from the same part at the same size, so
 * trays printed before and after still mate and stack; what differs is the inside of a deck's
 * well (wider, no spacer to fill it). A stored 0.7.1 layout builds as before, with the spacers it
 * stored, until its plan is run again.
 *
 * 0.8.0 stacks trays flush (spec §6.1 "Locating lip"). With the lip on, a tray above level 0 gets a
 * groove along its outer bottom edge that takes the lip of the tray below, so a stack no longer
 * narrows by the lip's thickness and play at every level: the lip is now flush with the outer face
 * and has a sloped top, the upper tray has the same outer footprint and a thicker outer wall (2.25
 * mm at the defaults), and the groove's roof is a 45° face, so it prints without support. The inset
 * is gone from the layout. A breaking change on every count: a tray's outer size, wall and lip
 * shape differ, and a tray printed before (inset, inside the lip ring) would not mate with one
 * printed after (flush, in the groove), so trays printed before and after must not be mixed. With
 * the lip off nothing changes: a tray builds exactly as before. planTray is stricter too: a tray
 * above level 0 with the lip on needs the groove's wall, so a stored 0.7.x upper tray (inset, 1.6
 * mm wall) is refused until the plan is run again.
 *
 * 0.8.1 engraves the part's short name (`TraySpec.partName`, `settings.engraveNames`; capitals of a 3
 * by 5 block font) where 0.8.0 engraved its number (`partNumber`). A PATCH, as 0.7.1 was: the same
 * mesh-only recess on the same walls, so no outer size, lip, groove, well or cut moves and parts
 * printed before and after still mate and stack; a spec without a name builds exactly as before. A
 * name too long for any face at the least stroke is left off. A part with no room in the usual band
 * (a low one) is tried again in a tighter band before it is left plain; a part that was engraved
 * before is engraved just as before. Carried over from 0.8.0: a name on an upper tray with the lip
 * on is cut in a band that starts above the groove's roof, so it never touches the groove.
 * Also in 0.8.1 (both landed before 0.8.1 was released): the name goes on up to three faces, each that has room: the wall it already chose and the wall
 * opposite it (the same bands, and the thinnest feature kept between the two recesses), and the
 * underside, mirrored so it reads upright from below, centred, kept clear of the groove, the corner
 * arcs and any floor notch, as V grooves that close in a ridge (no flat roof, so no overhang)
 * cut at most 0.6 mm deep and never closer than 0.81 mm to the floor's top. A name that does not
 * fit a face is left off that face only; a part that fits none is plain, as before. Every cut is
 * still a recess in a face's interior, so the outer size, lip, groove, wells and cuts do not move
 * and parts printed before and after still mate and stack. A merged part carries its name on walls
 * only.
 *
 * 0.8.2 rounds a merged part once, after the merge. A merged part (`mergeParts`) used to be its
 * members, each built alone with rounded corners and a chamfer, joined by box bridges, so a step
 * was left at every seam (an open member's rounding is only filled as far as its wall: 0.35 mm at
 * the defaults) and the chamfer broke across it. It is now the union of the members' footprints
 * and the bridges, one outline per height, whose convex corners are rounded once with the radius
 * of the member that has the corner (concave corners stay sharp) and whose bottom edge is
 * chamfered once; each member's pocket, notch and engraving are then cut from the part, and only
 * from the part. Material only leaves convex corners and the bottom edge, so every outer size,
 * wall and pocket is as before: a PATCH, as 0.5.1 and 0.8.1 were, and parts printed before and
 * after still fit the same wells and trays. A part whose members stand on different floors
 * (`merged.flipped`, printed upside down), has a groove or lip, or has members with different
 * chamfers is still built from its members as before.
 *
 * 0.8.3 lets a group member's Max fill its tray (group-tray-fill spec §2): in a group, a well on
 * Max in length, width or height is drawn as deep as its row, takes the width slack the walls
 * would, and goes down to the tray's deepest floor, where it used to ask the tray to grow. Wells
 * change, outer size and fit do not (the layout sees no room for it), so it is a PATCH, as 0.5.1
 * was.
 *
 * 0.8.4 adds a third tray arrangement, columns (group-tray-fill spec §3 (b)): wells stacked front
 * to back in columns under the deepest well's depth, the columns side by side. A new optional
 * tray shape the layout may pick: every tray spec planTray accepted before it still accepts and
 * builds the same, and stored plans stay valid (the arrangement is not stored; a plan made again
 * may come out narrower). A PATCH, as 0.8.3 was.
 *
 * 0.8.5 prints a riser under a stack from 3 mm of padding, where it was 10 mm (the `minRiser`
 * setting, DESIGN §7, 2026-10-21; `splitRisers`). A stack that gave 6.4 mm or 9.5 mm of padding
 * kept it as a raised floor in its trays and now prints it as a riser under its bottom tray, solid
 * under 6.2 mm and an open walled box above it. The stack adds up to the same height, every outer
 * size, wall, lip, groove and well is as before, and a tray's well floor drops to the normal one,
 * so parts printed before and after still mate and stack: a PATCH, as 0.5.2 (the open riser) was.
 * The stored layout is the same, so no plan goes stale; a project saved before reads the setting
 * as 3 mm and prints the riser from its next export.
 *
 * 0.9.0 gives a riser the rim between layers (owner, 2026-10-23; `splitRisers`, `TraySpec.onRiser`).
 * With the lip on, a riser now carries the locating lip on its rim, as a lower tray does, and the
 * bottom tray on it has the groove under its edge, as any tray above a lipped one has: the first
 * layer locks as every other layer does, where the tray used to stand loose on a flat top. A riser
 * printed before has no lip and its tray no groove, so a riser printed now would hold an old tray
 * 2 mm high on its lip (and a new tray on an old riser is loose): trays printed before and after do
 * not mate, a new line, reprint everything. A tray that cannot take a groove (alone in its stack
 * its wall is 1.6 mm, a groove needs 2.56; or too low, or with cuts that leave too little of it)
 * keeps a plain riser, and with the lip off nothing differs. The heights are the same (a lip is
 * not part of a part's height). Also in 0.9.0 (the wells only; the layout makes them, so a stored plan
 * is as it was until it is made again): a well is as deep as its tray is without the stack's
 * padding, so the height a tray has beyond its cards, the 5 mm an upper tray must be and the
 * rounding up to a layer, is air above them and the floor is the Floor setting under every tray
 * (it was 1.26, 1.25 and 2.35 mm under three trays of one stack, a thicker floor wherever the tray
 * was taller than its cards), `RealizeOptions.padding`. And in 0.9.0 too (the layout only; planTray
 * accepted these heights before): an upper tray is only as high as its groove needs, `upperTrayMinH`
 * (3.65 mm at the defaults), where it was lip.height + 3 mm (5 mm); the height goes into the riser.
 *
 * 0.9.1 closes the slit in a merged part where three or four members meet at a corner (`mergeParts`,
 * `slitFills`; found in the owner's Star Realms file, the Trade deck's folded part). The members
 * stand a tray gap apart and a bridge joins one pair across the stretch they share, so the gap
 * square at a corner no bridge covers was a 0.2 mm hole through the part (genus 1): the part now
 * has a solid fill there, over the height it exists. A mesh-only fix in a printed filler or riser
 * part: outer size, fit and every tray are as before, and a single, unmerged part does not change.
 * A PATCH, as 0.8.2 (one rounding of a merged part) was.
 *
 * 0.9.2 adds the stepped base, a second joint between stacked parts (owner, 2026-10-23;
 * `settings.lip.kind` "step", model/lip.ts stepOf and socketOf). A part above another has a solid
 * slab under its floor, inset by the wall and the play, with a 45° step out to its outer face that
 * rests on the inner edge of the rim below, and the part below a socket: everything inside its wall
 * stops slab + play under its rim. The walls stay at the Wall setting. A stepped part's mesh has
 * z = 0 at its slab's bed face (its spec's z less the slab). It is opt-in, and with the rim (the
 * default, and every file that says nothing) every part builds exactly as before: a new optional
 * feature, a PATCH. planTray also caps a socketed part's corner radius and refuses one too low for
 * its socket, which no part made before can be.
 * 0.9.3 gives flat custom items and short minis the full-depth finger cut with a floor notch that
 * flat cards and tiles have (investigation "getting contents out", 2026-10-23; `pieceCutout`): a
 * piece under 20 mm tall (twice the 10 mm a fingertip needs of its side to take hold, the half a
 * half-deep cut shows) asks for the cut down to its well's floor and the notch, and a taller one
 * keeps the half-deep plain cut. A 2 mm board used to get a 1.5 mm cut and a 12 mm figure a 6.5
 * mm one, with the piece below the cut and no way under it; on a low upper tray a plain cut was
 * capped at 0.8 mm above the groove, so such a tray stood 4.45 mm high for a 0.8 mm cut and is now
 * as low as the groove allows (3.65 mm at the defaults), as a flat card's is. Sizing asks for
 * different cuts; `planTray` and the builder are unchanged, so every spec stored before builds
 * exactly as it did and `planTray` accepts everything it accepted. A layout made again has these
 * deeper cuts and, where an upper tray was raised for its plain cut, a lower tray with its height
 * in the riser under it (the stack adds up the same), so trays printed before and after still
 * mate and stack: a PATCH, as 0.8.3 (wells change, outer fit does not) was.
 *
 * 0.9.4 cuts a finger dip in each solid filler where it touches a tray (owner, 2026-10-23, from the
 * investigation "lifting trays"; `FeatureSpec` "fingerDip", `layout/dips.ts`, model/finger-dip.ts).
 * Trays tile the box a tray gap apart, so nothing on a tray's outside could be gripped, and a
 * filler wedged beside one had no grip either: a whole tray came out only by its contents. A dip is
 * a U cut from the top of the filler (the spacer notch's and the wall cutout's, `fingerPocket.width`
 * wide, a round bottom, open at the top: no overhang), run 15 mm into the filler where it is thick
 * and across the whole strip where it is thinner than a finger, about half the filler's height deep
 * and at most 20 mm, and stopping MIN_FEATURE_MM above the groove or step at the filler's foot. A
 * mesh-only addition to a printed filler (a derived part: nothing is stored): outer size, footprint,
 * fit and every tray are as before, and a filler without a dip builds exactly as before. A PATCH, as
 * 0.9.1 (the slit) was: a new optional feature that planTray only accepts on a solid filler. The
 * engraved name keeps clear of a dip that opens on its face.
 */
export const GEOMETRY_VERSION = "0.9.4";

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
