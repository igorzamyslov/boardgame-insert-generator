# Minimal trays, fillers between them, per-component growth

Status: §4 implemented (geometry 0.5.0, see §4.1), with its two cleanups (the in-tray spare
removed and `wallGrowth` renamed `wallAbsorb`: geometry 0.5.1, schema 0.1.8, see §4.2), the
"keeping one component's parts together" part of §6 (see §6.1) and "fewer fillers" (§6.2: merging,
the filler count term, and the perimeter lever, measured and dropped; schema 0.1.9, geometry stays
0.5.2); §5 is implemented (geometry 0.6.0, schema 0.1.12, see §5.1), dividers excepted, which are still proposed. Written 2026-10-13 for a later session.
Companion to `2026-10-11-boardgame-insert-generator-design.md`; that document is
authoritative for everything this one does not change.

## 1. The intent

A tray is generated as the **minimal geometry** its components and enabled
settings require. Trays are then **placed to minimise the number of fillers**
needed between them, and **risers** are added where a stack needs height. A tray
grows beyond its minimum **only where a setting says it should**, and only where
growing means more capacity rather than more slop.

The principle that ties the two halves together:

> A filler beside a tray is wasted space. Growing the tray instead converts that
> space into capacity — but only for components where extra room holds more
> pieces. Everywhere else, growing just makes the fit sloppy and the part look
> clunky, and a filler is the honest answer.

**Growth means giving a component's own contents more room — nothing else.** It
is not thicker walls, and it is not an empty pocket inside a tray that holds
none of that component's pieces. Both of those are absorption dressed up as
growth, and the user sees them as defects. Slack has exactly three honest
destinations: a **filler part** between trays, **more room for the contents**
where that means more pieces fit, or — below the printable filler minimum, where
there is no alternative — **wall thickness**.

**Vertical slack is a riser's job, never a taller tray.** A tray is only as deep
as its contents need. Height left over because the stack must reach the top
plane goes under the tray as a riser, not into the tray's own walls as a deep
empty well. This matters most for components lying flat, where a tray that is
taller than the stack it holds looks clunky and prints a lot of wall for
nothing. `splitRisers` already does this; the growth rules must not undo it by
making trays tall in the first place.

**Growth is bounded by retention.** More room is only useful while the contents
stay held. A deck well grown too far lets the cards fall over, which is worse
than the filler it replaced. So growth is never unbounded: it is either capped,
or the gained space is taken up by something removable (the `separators`
spacer or plates) that keeps the contents standing while still letting the
collection grow into it. Since §5.3 that something is only ever printed when the
user asks for it; without it, growth is capped at what the contents hold by
themselves.

## 2. What already behaves this way

Implemented as of GEOMETRY_VERSION 0.4.0 / SCHEMA_VERSION 0.1.7:

- **Leaf slack becomes a filler.** `axisExtent` no longer absorbs up to 12 mm
  into the neighbouring tray. Slack becomes a leftover part of any width down to
  `minFiller` (the narrowest part `planTray` will build, 2.4 mm at the default
  chamfer). Below that it is absorbed, because the slack must go somewhere or
  the trays shift laterally (rule 1).
- **Wall thickening is opt-in.** `settings.wallGrowth` (now `wallAbsorb`, §4.2; mm per wall, default 0)
  is the only thing that absorbs slack into walls.
- **Risers.** `splitRisers` takes each stack's raised floor out as its own part
  at print time. The stored layout is unchanged, which keeps share links small.
- **Per-component growth exists in two forms.** `stretch` grows an upright card
  or tile tray along its stack axis; `separators` then prints the slack as loose
  plates. Both default off.

## 3. The gap: one tray per stack level

`StackItem` (src/layout/tree.ts) names a real requirement part, and a stack is a
list of them — so **a level holds exactly one tray**. A tray stacked on a wider
tray is therefore stretched to the stack's footprint, and the excess goes into
its walls or into a spare compartment. There is nowhere to put a filler beside
it.

Observed in a real project (`geometryVersion` 0.4.0, `wallGrowth: 0`), three
identical miniature components, four 25×25×40 figures each:

| tray       | stack                        | footprint       | outer walls      |
| ---------- | ---------------------------- | --------------- | ---------------- |
| `d4ippxrd` | alone                        | 110 × **28.4**  | 1.2 mm (nominal) |
| `eiknzqrr` | on a Bits tray needing 37.65 | 110 × **37.65** | **5.82 mm**      |
| `10pfipd2` | on a Tiles tray              | 28.4 × 111.4    | 1.9 mm           |

Four pockets need 28.4 mm of depth. The tray that sits alone gets exactly that.
The stacked one is stretched by 9.25 mm, all of which goes into two walls.

The same cause, other axis, other outcome: a three-deck card tray (`pvfkpsqf`)
needs 91.9 mm but is stacked under a tiles tray needing 105.6, so it is widened
and the 13.7 mm excess exceeds `MIN_SPARE` + divider and becomes a spare pocket.
Identical mechanism; which side of an 11.2 mm threshold the slack lands on
decides whether the user sees fat walls or an empty pocket.

**So stacking currently dictates wall thickness.** Two identical components
differ because one happened to be stacked on something wider.

## 4. Required change

A stack level must be able to hold **one tray plus one or more fillers**.

Touches, in rough dependency order:

1. `StackItem` / the stack model in `src/layout/tree.ts` — a level becomes a
   tray plus zero or more filler rects, or the level gains its own sub-layout.
2. `src/layout/fill.ts` — `placeStack` must emit leftovers _within_ a level, not
   only beside the bottom tray. `axisExtent`'s rules apply per level.
3. `src/layout/stack.ts` — `stackMinFootprint`, `stackAllowed` and
   `stackHeights` must reason about a level's tray plus its fillers.
4. `src/layout/materialize.ts` — emit the in-level fillers as parts.
5. `src/layout/score.ts` — see §6.
6. `src/layout/risers.ts` — `splitRisers` walks a stack per level; in-level
   fillers must not block or distort the split (it already ignores spares, and
   must ignore these too).
7. `src/layout/locks.ts` and `src/layout/moves.ts` — frozen leaves, stack locks
   and the annealer's moves all assume one item per level.
8. `src/model/schema-read-layout.ts` — stored `TraySpec`s already carry
   `part: "leftover"`, `stack` and `level`, so the stored shape may not need to
   change. **Confirm this before assuming it**; if it does change, bump
   SCHEMA_VERSION and re-check the share-link guards in `src/app/link.test.ts`.

`GEOMETRY_VERSION` needs a MINOR bump: outer tray sizes change.

### 4.1 As implemented

A stack level holds one tray plus zero or more filler parts. The stack model in the tree did not
change: a leaf is still an ordered list of `StackItem`s, one per level. A level's fillers are
derived, not searched, so the annealer's moves, the stack and position locks and the warm start
needed no change, and the stored layout needed none either: a filler within a level is a `TraySpec`
with `part: "leftover"`, and the `stack`, `level` and `z` that the schema already stored (so no
SCHEMA_VERSION bump). `GEOMETRY_VERSION` is 0.5.0.

- **Stack minimum** (`levelMinFootprints`, `stack.ts`): tray k must hold its own requirement and the
  inset footprint of every tray above it, `max over j ≥ k of req_j + 2·(j − k)·inset`. Level 0's
  value is the old `stackMinFootprint`, so `stackAllowed` and the tree's minimum extents are
  unchanged: fillers only ever take slack, they never add to a minimum.
- **Per level** (`placeStack`, `fill.ts`): each tray chooses its size with `axisExtent` against the
  room of its own level (level 0: the leaf; level k: the tray below, inset), with its own
  absorbable slack (`levelAbsorb`), its own size lock (`levelLockCap`) and the bed. Slack it cannot
  or may not absorb becomes fillers beside it, and a gap too narrow to be a part
  (`minFillerUpper` for level 1 and up, which is wider than `minFiller` because an upper tray carries
  the larger upper chamfer) is absorbed by the tray. Trays are placed in the corner of the tray
  below, one inset in.
- **Filler height.** A filler beside the bottom tray stands the full box height, as before. A filler
  in level k stands from that level's floor to the top of the stack: the trays above are smaller and
  stand inside tray k, so nothing else would fill the space over it, and a stack must reach the top
  plane everywhere (hard rule 2). Its `z` is its level's `z`.
- **Risers** (`splitRisers`): an in-level filler (a leftover sharing a tray's stack, level above 0)
  follows its tray, moving up with it and giving up the height of every level from its own up, so
  its top stays on the plane. It does not take part in the split, as spares do not.
- **Hard-rule checker** (`test-hard-rules.ts`): level k must stand in the corner of level k − 1, one
  inset in and no larger than its inset footprint, not exactly its footprint; an in-level filler
  must be inside the tray below, apart from its level's tray, and run from its level's floor to the
  top of the stack.
- **Score.** No filler-count term was added: `WEIGHTS.trays` already charges 20 000 per printed
  part, fillers included, and the measurements showed no packing loss (§7 result below).

**Measured** on `cards-heavy`, `bits-heavy`, `tiles-minis`, `small-tiles`, seeds 1 to 6, 50 000
iterations: part counts, filler counts, fill %, filament and share-link length are unchanged on
every seed except `small-tiles` (filament up to 3.6 % higher on one seed and under 1 % on two others, link 1837 to 1913
characters, none of the three guarded fixtures over 1914), and nothing became infeasible. The
fixtures rarely stack onto a different footprint, so they mostly show that nothing regressed; the
real project of §3 shows the effect (below).

On the §3 project the two minis trays now both come out 110 × 28.4 with 1.2 mm walls (the stacked
one was 110 × 37.65 with 5.82 mm walls), with a 110 × 10.76 filler beside it in its level.

### 4.2 The two cleanups, as implemented (geometry 0.5.1, schema 0.1.8)

**The in-tray spare compartment is gone.** `realizeTray` no longer turns row slack into a
`kind: "spare"` compartment, neither at the end of a row nor as a spare row at the back: a tray
holds exactly the compartments its part asks for, and `placeCutouts` lost the "run into a spare"
case that only existed for it. Row and depth slack goes, in this order, to elastic bulk, to the one
spacer a deck or tile stack may have (however long, or as `separators` plates), to
`wallAbsorb`, and then evenly to the walls, because slack must go somewhere or the trays shift
laterally (hard rule 1). The `spare` compartment kind itself stays for open leftovers and fillers.
`splitRisers` keeps clamping a spare to the tray floor, because a layout stored before 0.5.1 can
still hold one.

- **Grip.** Checked, and the spare was never what gave a tray its grip. `hasGrip` is only a test
  oracle (the sizing layer does not choose variants by it), and a tray needs a grip only when a
  compartment asks for a wall cutout or a scoop, which then supplies it itself. Differentially, on
  the old code, over 169 000 realized trays (55 900 of them with a spare, across the property
  suite's arbitraries, with and without extra slack): none relied on its spare for a grip, and
  none lacked one. So rule 8 holds and no variant stops surviving.
- **Stretched decks.** A stretched card or tile tray keeps whatever slack it is given along its
  stack axis, and it now becomes a spacer (`spacerFits` has no upper limit: 30, 60 and 150 mm
  were tested) or `separators` plates. Two limits worth knowing. A tray prints one spacer, so in
  a two-row tray the second row's slack stays in its walls once the first row has the spacer.
  A spacer was first a solid block where the pocket had been hollow: the `small-tiles` fixture,
  which stretches three 199 mm trays, went from about 330 g to about 430 g of filament. Geometry
  0.5.2 (§4.3) prints it open instead.
- **Versioning.** `GEOMETRY_VERSION` 0.5.0 to 0.5.1, a PATCH: no outer size, lip, inset or well
  changes, so trays printed before and after still mate and stack, and layouts stored at 0.5.0 are
  not stale; only the inside of a tray that had slack to spare differs. (A MINOR would have told
  every user to reprint the whole insert for nothing.)
- **Share links.** A spacer is a stored part, so replacing a spare pocket by a spacer lengthened
  the link of `small-tiles` by 130 to 165 characters and pushed it past the 2 000 limit. The stored
  layout now leaves out what reading puts back (schema 0.1.8): the fields every spacer has the same
  value for, and the one default pocket of an open leftover. That took 35 and 70 characters off
  the small-tiles link, and about 60 off `tiles-minis`, whose links were over the limit before.

**`wallGrowth` is now `wallAbsorb`** (label "Thicker walls instead of a filler"; the hint says it
absorbs and gives the contents no room). The name says what happens to the slack, and `absorb` is
the word this spec already used for it. A file that only has `wallGrowth` keeps its value (the
reader accepts either key, `wallAbsorb` winning, and never reports the old one as unknown), the
hash still names it `wallGrowth` so that no saved plan goes stale, and SCHEMA_VERSION goes 0.1.7
to 0.1.8, a PATCH since nothing that read before stops reading.

### 4.3 The spacer is an open box, and the latent CutFitError (geometry 0.5.2, schema 0.1.8)

**A spacer follows `leftover`.** `openSpacers` (src/layout/spacers.ts), the last pass after
`splitRisers` and `splitSeparators`, turns a stored (solid) spacer into an open walled box with a
floor, as `riserSpec` does for a riser, unless `leftover` is `solid`. It is derived, so the stored
layout, the schema (stays 0.1.8) and the share link are unchanged; `summarize` applies it too, so
the filament figure matches what prints. Wall: the tray's `wall`, at least `SPACER_MIN_WALL`
(2 mm). Solid when the inside is under `MIN_SPARE` (10 mm) in either direction, the pocket is
under `MIN_SPACER` (5 mm) deep, or its finger notch would cut into the floor. Each separator
plate is judged on its own size, so thin plates are solid and thick ones open, whatever the style.
`planTray` used to build every spacer solid regardless of `solid`; it now honours it.
GEOMETRY_VERSION 0.5.1 to 0.5.2, a PATCH: outer size, lip, inset and wells are unchanged, so a
spacer printed before still fits the same well and trays still mate.

**Measured** (50 000 iterations, seeds 1 to 3, filament = solid upper bound `filamentG`):
`small-tiles` 449.2 / 446.5 / 384.0 g before, 379.0 / 376.3 / 334.1 g after, three 178 mm spacers
of 16.8 × 9.7 mm each going from 36 g to 12.5 g. About 70 g, not the 100 g that was hoped: a
spacer has its own floor and walls inside a well that has its own, where the old spare pocket was
one compartment of the tray. The rest is `stretch` itself (§5). The other fixtures have no spacer
and do not change. Link lengths are unchanged (nothing stored differs).

**CutFitError at a larger outer.** The property "realizes every variant part at a larger outer"
fails at 8 times its run count: `size()` keeps a part whose pockets all get a cut at `minOuter`, but
slack shifts the compartments a few hundredths of a millimetre and a pocket can lose its cut.
Three causes found and fixed, each with its exact input in `cutfit.regression.test.ts`:
(1) a run (the cuts of one compartment along one axis, plus twins) was dropped whole when one
member had no room, for example a front cut whose centre falls on the edge of the wells across or
in the 0.8 mm divider between two, so the pocket lost its back cut too; now the members that
cannot be cut are left out and the rest are placed (`placeRuns`). (2) A setting of an odd number
of hundredths (5.002 mm) is not a width a whole-unit cut can have, so a pocket exactly as wide as
the cut plus its posts was refused one unit short; the narrowest cut is now rounded down to an even
count (`narrowestCutMm`, shared with `planTray`, which accepts what sizing places). (3) A run
takes the first member's centre rounded to a unit, which can leave a twin's narrow pocket a unit
short; where that centre has too little room any whole-unit centre between the members' own is
tried. (4) Sequential channel placement could seal off the only way out of a pocket exactly as
wide as the cut plus its posts: a row-1 pocket's back channel leaves through the gap between two
row-2 pockets, which are too narrow for a front or back cut and could only be cut together, as
twins through that gap, and ended with no cut. `placeCutouts` now backs off: while an owner has
no cut, it gives up one cut of an owner that has another (the first in placement order that leaves
fewer owners uncut), and places everything again, repeating until none is uncut. A placement that
left every owner cut is never touched, so every tray that was cut before keeps exactly its cuts;
only a tray that used to throw (or whose variant was dropped) changes. The second counterexample
the property found once the first was fixed (seed 1: a custom well and three figure sizes, where
two channels each sealed a twin pair) needs two give-ups, hence the loop rather than one retry.
Inputs in `cutfit.regression.test.ts` (cases 4 and 5). **Measured:** the property at 1 000 runs
over seeds 1 to 12 passed 10 of 12 before (seeds 1 and 10 failed) and 12 of 12 after; the four
fixtures at seeds 1 to 4 (50 000 iterations) are identical before and after in parts, fillers,
fill, filament and link length. GEOMETRY_VERSION stays 0.5.2: no tray that was realized before
changes.

## 5. Growth policy per component kind

Growth is allowed by default, but **bounded**. A tray may take a reasonable
amount of extra room where that room means more pieces fit, and no more; past
that bound the slack is a filler. The user can then raise or remove the bound,
per axis, where they want it.

This is the correction to an earlier draft of this spec, which said nothing
grows by default. That went too far: a little growth is useful and invisible,
and only _unbounded_ growth produces the clunky trays in §3.

### The growth setting

Per component and per axis, growth is one of:

- `off` — never grow (the axis where extra room is only slop)
- `auto` — grow up to a conservative cap; the default wherever growth adds capacity
- a number — grow up to that many mm beyond the minimum
- `max` — take whatever is going

Expose it as three options in the user's own terms — roughly "more room for
width / length / height" — and map each to a physical axis from the component's
storage orientation. The user thinks in contents, not in the tray's frame: for
an upright deck, "more cards" is the stack axis, and which of w/d that is
depends on how the tray was packed and turned.

`stretch` is subsumed by this and should migrate to `auto` (not `max`).

### Defaults per kind

Whether extra room on an axis holds more pieces, or only adds slop:

| kind           | axis                        | extra room means                | default                  |
| -------------- | --------------------------- | ------------------------------- | ------------------------ |
| bulk (bits)    | all three                   | more loose pieces               | `auto`                   |
| minis, bulk    | all three                   | more figures                    | `auto`                   |
| cards, upright | stack axis (deck thickness) | more cards                      | `auto`                   |
| cards, flat    | height                      | more cards                      | `off` — see risers below |
| cards          | card width / length         | nothing; cards slide            | `off`, not offerable     |
| tiles, upright | stack axis                  | more tiles                      | `auto`                   |
| tiles, flat    | height                      | more tiles stacked              | `off` — see risers below |
| tiles          | tile footprint              | nothing                         | `off`, not offerable     |
| minis, pockets | pocket w/d                  | easier to grab, tolerance       | `off`, offerable         |
| minis, pockets | depth                       | nothing; figure height is fixed | `off`, not offerable     |
| custom         | all three                   | tolerance only                  | `off`, offerable         |

Axes marked "not offerable" should not appear in the UI at all — growing them
cannot help, and offering the choice teaches the wrong model.

### What `auto` means, concretely

The cap must be a defined quantity, not a feeling. Suggested starting point: the
lesser of half the content's own size on that axis and a fixed ceiling (25 mm is
a reasonable first guess), with the retention rule below overriding it for
upright stacks. Whatever is chosen, make it a named constant, state it in the
setting's hint, and sanity-check it against the fixtures — the point of `auto`
is that a user never has to think about it.

Note the asymmetry worth preserving: `auto` on a bits bin is what stops the
enormous scoop trays in §3 while still letting a bin absorb a few millimetres
rather than printing a 4 mm filler beside it. Setting bulk to `off` outright, as
an earlier draft did, would remove the optimizer's most flexible axis and is the
single biggest packing risk here — `auto` is the middle path, and `bits-heavy`
is still the fixture to watch in §7.

Once bins stop absorbing arbitrary space, **`packingFactor` becomes
load-bearing**: it largely decides how big a bin is, so a poor value shows up
directly as a bin that will not hold the pieces. Its hint should say so.

### Vertical growth and risers

Height is a legitimate axis to grow — more height holds more flat cards or tiles
— but it must not become the way the box's leftover height gets used. A flat
tray taller than the stack it holds is the clunky case this spec exists to
remove, and that height belongs to a riser under the tray.

So height defaults to `off` for flat storage, and the user can turn it on
explicitly when they want room for expansions. `splitRisers` keeps the rest.

### Retention bounds growth

More room is only useful while the contents stay held. A deck well grown too far
lets the cards fall over, which is worse than the filler it replaced. So:

- growth without anything holding the contents is capped at roughly the stack's
  own thickness, past which an upright stack starts to topple;
- growth beyond that requires something in the gained space — the `separators`
  plates, or dividers below — and may then go considerably further.

Treat "grow without plates" and "grow with plates" as two different limits. This
is what makes `separators` structural rather than a nicety.

(As built, §5.1 and §5.3: a second bound, reachability, applies beside retention to growth
without plates, and plates exist only when the user sets `separators`.)

### Dividers

Offer printing **dividers**: parts that subdivide a grown compartment into
sections. These are distinct from `separators` plates, and the distinction
matters:

- a **separator plate** takes up slack behind a deck so it stays snug, and is
  pulled out as the collection grows;
- a **divider** partitions space the user has deliberately grown into, so one
  well holds several groups (per player, by card type).

Dividers also raise the retention cap above, since a divided well holds its
contents upright in each section.

**How a divider is held** was left for implementation. It is a slot in the floor; see §5.2, which
also records what the "precedent" in the existing floor notch turned out to be.

### 5.1 As implemented (geometry 0.6.0, schema 0.1.12), and what it measured

The first measurement, at half the content and 25 mm, made `bits-heavy` materially worse (below), so
the constants were retuned to 1.0 and 50 mm and measured again; that is what is built.

**The setting.** `Component.growth`: `{ w?, d?, h?, stack? }`, each `"off" | "auto" | "max" | <mm>`.
`w`, `d`, `h` are the user's width, length and height of what is stored (bulk, minis, custom);
`stack` is a deck or a stack of tiles, whichever way it lies. Sizing maps the axes onto the tray's
own frame (`growthOf`, `defaultGrowth`, `growthAxesOf` in `model/defaults.ts`; the arithmetic in
`sizing/growth.ts`): an upright stack's `stack` is the compartment's width, a flat one's its height;
bulk and custom `w`, `d`, `h` are the compartment's own; minis pockets offer `w`, `d` only. The
layout turns the tray, and with it the caps (`stackLevels`). An axis a kind does not offer is not
shown and reads as `off` whatever a file says. `CompartmentReq` carries it as the existing `elastic`
flags plus `growth` (a cap in mm per axis; absent = no cap, which is `max`, so a requirement stays
JSON). **Defaults** are the table above, unchanged.

**What `auto` is.** `min(AUTO_GROWTH_FRACTION × content, AUTO_GROWTH_CEILING)`, with 1.0 and 50 mm
(constants in `sizing/constants.ts`, named in every hint), the content being the compartment's size on
that axis, rounded down to 0.01 mm: "up to its own size, never by more than 50 mm". It is still a
bound: it cannot produce the 168 × 219 mm bin that swallowed a roomy box. The spec's first guess,
half and 25 mm, left `bits-heavy` with two fillers and eight more parts (see below).

**Retention.** Along an upright stack a number or `max` is held to `UNPLATED_RETENTION` (1) stack
thickness, and to `PLATED_RETENTION` (6) when `separators` is above 1, where the plates fill the
gained room solid. `auto` is already below both. A flat stack cannot topple, so retention does not
apply to its height. The six is a judgement call: plates leave nothing to fall over, so the limit is
there for what a well that long is for, not for stability.

**Where the cap acts.** Layout (`axisExtent`, `fill.ts`): a gap up to cap plus `wallAbsorb` is
absorbed with no filler; past that the tray grows by its growth only and the rest is a filler, never
a tray with thicker walls and a filler as well. Realize (`layoutAt`): elastic compartments take slack
by water-filling up to their own caps (`fillCapped`), rows in depth by the least tolerant of their
compartments; a deck's spacer takes `min(slack, cap)`; whatever is left goes to the walls as before.
Height: `contentDepth` stops at the minimum plus the cap and the rest of the tray is a raised floor,
which a riser takes (`stackHeights` caps what a deeper-growing tray is given by the same rule).

**One addition the spec did not ask for: room a stack asks of a tray does not count against its
cap.** A tray under another is built at least as big as it (`levelMinFootprints`); a bin there simply
becomes that much bigger, which is not a choice, and the cap bounds the room given beyond it
(`RealizeOptions.stackMin`, `PlacedTray.needW/needD`). Without it a bin stacked under a wider tray got
thicker walls (its cap was spent) and the optimizer stopped stacking bins: `bits-heavy` 14.8 printed
parts instead of 13.0. A tray whose contents cannot grow still gets thicker walls for it, as before.

**Migration.** `stretch: true` reads as nothing set (an upright stack grows by `auto` by default,
which is what it now does; a flat deck, which never stretched, stays `off`); `stretch: false`
reads as `growth.stack: "off"`. Never `max`. The key is read, never written, and `growth` wins when a
file has both. A project that set `stretch: true` hashes differently, so its plan is stale once.

**Measured** on the four fixtures, seeds 1 to 6, 50 000 iterations; before is the commit this work
started from (fixtures with `stretch: true` as they were), after has every kind at its default and
`auto` at 1.0 and 50 mm. Printed parts after `mergeFillers`; filament is `filamentG`; link is the
whole share link on the real deploy URL.

| fixture       | printed parts | filler parts | fill %       | filament g   | link length            |
| ------------- | ------------- | ------------ | ------------ | ------------ | ---------------------- |
| `cards-heavy` | 13.7 to 13.7  | 1.7 to 1.7   | 99.7, same   | 608 to 608   | 1821-1891 to 1761-1823 |
| `bits-heavy`  | 8.0 to 9.0    | 0 to 0       | 99.9 to 99.8 | 427 to 450   | 1799-1822 to 1769-1905 |
| `tiles-minis` | 6.0 to 6.0    | 3.0 to 3.0   | 99.8, same   | 1220 to 1219 | 1958-2017 to 1941-1958 |
| `small-tiles` | 14.2 to 15.2  | 1.2 to 1.2   | 99.4 to 99.5 | 379 to 413   | 1874-1949 to 1877-1961 |

Nothing became infeasible. `bits-heavy` is 8 printed parts and no filler on five seeds in six,
and 14 on one (the optimizer splits a component across more trays); `small-tiles` is one part
more, from upright tiles no longer stretching without bound. Links include the compaction below.

At the first constants (0.5, 25 mm) it was: `bits-heavy` 13.0 printed parts, 2.0 fillers, 910 g,
2010-2222 characters (10, 12, 12, 16, 16, 12 per seed); `small-tiles` 15.0, 310 g, 1998-2075.
Without the room-a-stack-asks exception: `bits-heavy` 14.8 parts, 946 g.

**Why the first constants were worse, and what it was not.** The fixture's box is 300 × 220 and its
contents need well under half of it. Before, the bins took every millimetre and there was never a
filler; at half and 25 mm each bin took its cap and a large filler took the rest, which is the
policy doing what it is for in a box the contents do not fill. Packing as such was not worse: with a
tighter box (240 × 180) `auto` matched growth `max` (the old behaviour) at 8 parts and no filler;
at 200 × 150 and 170 × 140 it was a part or two worse at the first constants, with large variance
across seeds (6 to 14 parts).

**Share links.** The retune alone left `small-tiles` at 1974-2065 characters, over the 2 000 guard.
The guard and the fixture were left alone, and the stored layout was made smaller, losslessly, the
way schema 0.1.8 did: a part's `lip` of false, `level` and `z` of 0 are not written (reading puts
them back), a leftover's key is not written when it is `leftover:<n>` for its place among the
leftovers, and a spacer's key, stack and level are not written when they are its tray's (the tray
before it). Only values equal to what reading restores are dropped, and a file that spells them out
reads the same. That took 40 to 60 characters off every fixture; the longest links are now 1961
(`small-tiles`), 1958 (`tiles-minis`), 1905 and 1823. What is left in a layout is mostly the
coordinates and the finger-cut features, which are not derivable without re-running sizing;
`wall`, `floor` and a leftover's `h` and `solid` are derivable from settings but save only about 25
characters in total after deflate, and reading them back would need the project's settings inside
the layout reader.

### 5.2 Dividers, as implemented (geometry 0.7.0, schema 0.1.13)

**The option.** `Component.dividers`: a whole number 0 to 6 (`BOUNDS.maxDividers`; `field.dividers` and
`limit.dividers` at `/components/<i>/dividers`), absent for 0. It means **N dividers, giving N + 1
sections**: the number of parts a user will have in their hand is what they can predict, and "per
player" is then "players − 1". Where it is offered (`dividersOffered` in `model/defaults.ts`): a deck
or a stack of tiles that **stands up** (storage upright, or `auto`, whose flat variant simply gets
none) and whose `stack` growth is **not `off`**. Everything else reads as 0 whatever a file says, and
the form does not show it. Not offered, with reasons: flat stacks (they grow taller, not wider; a
partition is a riser's business), minis pockets and custom wells (one item each), and **bins**.
Bins were in the brief's list of places a partition might make sense; they are left out because they
are the one kind whose floor is not flat (a curved floor puts the scoop ramp under the slot) and
whose depth is itself elastic, so the floor under a slot is not a known thickness. If bins are
wanted, that is the place to start, and it needs the slot to follow the ramp or the ramp to leave
the slot's strip alone. No change to how compartments are modelled was needed.

**What is held, and how.** A divided well has `dividers` slots cut into its floor, across the
whole well (wall to wall, along y in the tray's own frame, turned with the tray), evenly spaced so
the `N + 1` sections between them are equal (`slotCentres`; the few hundredths over go to the last
section). The slot is `DIVIDER_THICKNESS` (3 mm, or what the bottom chamfer needs, `2 × (chamfer +
0.8)`, where that is more) plus `DIVIDER_PLAY` (0.4 mm) wide and `DIVIDER_GROOVE` (2 mm) deep. The
divider is a solid plate as wide as the slot less its play, `DIVIDER_END_PLAY` (0.2 mm) short of the
well's walls at each end, standing from the bottom of the slot to `SPACER_TOP_GAP` (5 mm) under the
rim. Built as a level 0 solid like a spacer (`planTray`), printed standing, no supports.

**The floor notch was a weaker precedent than the brief assumed, and this is the one place the
design departs from it.** `floorNotch` in `plan-cuts.ts` is a finger notch cut **through** the floor
(down to the bed), in a flat deck's well, beside a wall cutout; it is not a groove, and a plate
standing in a hole through a 1.2 mm floor would be held by 1.2 mm of it. What carried over is the
machinery and the rule: a feature of a compartment, planned in `planTray` against the bottom chamfer
(`MIN_FEATURE_MM` of material between it and the chamfer's slope), built as an open-topped prism in
`buildCutter`, so it prints with nothing overhanging. The slot is a **blind** groove, so the floor
under a divided well has to be thicker: **`floorExtra`** (`CompartmentReq`) adds `DIVIDER_GROOVE` to
the well's floor in `minLayoutU`, so the tray is up to 2 mm taller than it would have been, and **no
taller where its floor was raised anyway** (a stack padded to the top plane has floor to spare).
`splitRisers` reserves the slots' depth too (a riser may not take the floor under a slot).
Friction alone was not chosen (it loosens as the tray flexes, and a lean of a stack against a loose
plate is exactly the case dividers are for); slots in the walls were not (they pin a divider to
positions fixed by the wall cutouts, and wall cutouts are exactly where the fingers go).

**Derived, not stored: the slots are stored, the dividers are not.** The slots are a
`dividerSlot` feature (`axis`, `at`, `width`, `depth`) of the tray's compartment, in the stored
layout, because they are the tray. `splitDividers` (`layout/dividers.ts`, run after `splitRisers`,
wherever printable parts are listed) derives one `divider` part for each, keyed
`<trayKey>:divider:<n>`: the plate that fits a slot is fully determined by it and by the tray's own
height and floor. A divider is therefore **in the hash** (`dividers` is part of the component, which
hashes whole), **in the geometry version** (0.7.0, a MINOR: the tray itself changes) and **not
in the stored layout or the share link as a part**. Each slot costs roughly one feature in the
link, which deflates to a few characters (the tiles case below: eighteen slots, no measurable
change).

**Retention.** `UNPLATED_RETENTION` is an allowance of slack beyond the stack (growth up to
`stack × 1`), not a multiplier on the width. Undivided, cards lean across the whole slack
`W − T`. Divided into `N + 1` equal sections of `W / (N + 1)`, each holds `T / (N + 1)` of cards and
has slack `(W − T) / (N + 1)`, so the lean per section is the undivided lean over `N + 1`. Keeping each
section within the undivided allowance `A` gives **`W − T ≤ (N + 1) × A`**: the slack scales, the stack
`T` does not. `stackGrowthMm(mode, stack, plated, dividers)` implements exactly that (growth up to
`stack × UNPLATED_RETENTION × (dividers + 1)`; the slots' own width is in the well's minimum). The
plated limit is untouched and does not apply to a divided well. Pinned for N = 1 and 3 in
`sizing/dividers.test.ts`. (An earlier note here called this generous and doubted the total would
rise; the derivation above shows it does, by this factor.)

**Separators.** Mutually exclusive: with dividers the well has **no spacer**, so `separators` has
nothing to print and the form shows "Spacer plates are off while the well has dividers". Both answer
the same question, what holds the deck upright in room it was given; a spacer sits behind the last
deck, and dividers spaced through the same well would leave the slack in one section only. The
divided well grows itself (an elastic well, like a bin along its width), taking the room the layout
gives it up to its cap into the sections. A well is never narrower than the stack and its slots, and
never has a section under `MIN_SECTION` (5 mm), so a thin deck with many dividers is wider than its
cards need, not unbuildable.

**Assembly.** Dividers are `isAddOn` parts: numbered straight after their tray (and its spacers),
"Divider n" in the parts list, one step each ("Stand divider 2 #5 in its floor slot in tray #3"),
a badge on the instructions' plan, lifted clear of their tray in the 3D explode view, one 3MF or STL
each in the export, and their plastic in the filament estimate. Like spacers, they are not drawn as
rectangles on the main plan view (it shows trays), which is a gap shared with spacers and plates.

**Measured** on the four fixtures, seeds 1 to 6, 50 000 iterations, before (e5b4599) and after, at
the defaults (no dividers set). Nothing about a project without dividers changes: parts, fillers,
fill and filament are identical to the digit on every seed, the inputs hashes of all five fixtures
are the same as pinned, and only the link moves, by version-string noise (±6 characters).

| fixture       | printed parts | filler parts | fill %      | filament g | link length, before to after |
| ------------- | ------------- | ------------ | ----------- | ---------- | ---------------------------- |
| `cards-heavy` | 13.7, same    | 1.67, same   | 99.7, same  | 608, same  | 1761-1823 to 1758-1823       |
| `bits-heavy`  | 9.0, same     | 0, same      | 99.78, same | 450, same  | 1769-1905 to 1769-1905       |
| `tiles-minis` | 6.0, same     | 3.0, same    | 99.8, same  | 1219, same | 1941-1958 to 1935-1958       |
| `small-tiles` | 15.2, same    | 1.17, same   | 99.47, same | 413, same  | 1877-1961 to 1877-1958       |

The longest guarded links are 1958 (`small-tiles`, was 1961) and 1958 (`tiles-minis`): 42 characters
of margin on both. Nothing became infeasible. With dividers on, `small-tiles` forced upright (its
own baseline is 1986 to 2081 characters in that configuration) with two dividers a stack, 18 slots:
18 dividers printed (31 parts against 18), link 1991 to 2069 against 1986 to 2081 without, filament
404 to 475 g against 349 to 455, fill unchanged (99.4 %). `cards-heavy` cannot stand every deck up
in its box at all, with or without dividers.

**Not done.** Dividers in bins (above). A finger notch in the divider's top, as the spacer has for
the deck's finger channel (the channel is in the end walls; the divider sits clear of it).
Unequal sections.

### 5.3 No spacer unless asked for, and the deck stays reachable (geometry 0.7.2, schema 0.1.14)

**The rule.** A spacer, or the `separators` plates, is built only when the component sets
`separators`. Absent or 0 is none (`separatorsOf` in `model/defaults.ts` now defaults to 0, not 1);
1 is a single spacer block; more is that many plates. It was not a default anyone chose to want: the
spacer filled room that `auto` growth had only just made, and `auto` is already bounded by retention,
so the well widens by about as much as the stack can lean and the cards stand up unaided. What the
spacer cost was a printed part and its filament.

**What `separators` did before, checked.** `separators` defaulted to 1 and 1 meant a spacer block.
`cards.ts` and `tiles.ts` gave every upright stack that could grow `spacerAxis: "w"`; `realize.ts`
then turned the gained room into a stored `spacer` part when the row had no loose elastic
compartment, the spacer fitted (5 mm and over) and the tray had not yet printed one. So the default
path did print spacers: `small-tiles` printed 4 on every seed. Now the default path gives the deck
no `spacerAxis` and `elastic.w` only, so it is an ordinary compartment that takes its share of the
row's slack by water-filling like a bin (`realize.ts` unchanged); a requirement has a spacer axis
exactly when the component has `separators` of 1 or more. Test: no spacer for cards or tiles at any
growth setting and any amount of room (`realize.test.ts`), none stored by an optimized layout
(`layout/separators.test.ts`), and the same room is a spacer once `separators` is 1.

**Two side effects.**

- A deck in a row with bins now grows. The spacer branch ran only when the row had no loose
  elastic compartment, so beside a bin or a growing pocket the bins took all the slack and the deck
  never grew; now the deck is one of the elastic compartments and takes its capped share. That is
  what §5.1 says should happen (water-filling up to each one's own cap); the spacer path was the
  exception.
- A deck that has to be widened for its cut now can be. A 30-card deck between two bins at its
  minimum width is 14 mm wide, too narrow for a cut across the row (it needs 10 mm and two 3 mm
  posts), and the tray threw a `CutFitError`; grown by `auto` the same tray builds.

**Caps.** Along an upright stack, without plates (`stackGrowthMm`): the least of the growth setting,
`UNPLATED_RETENTION` stack thicknesses, and the reachability bound below. With `separators` set, to
any count (a single block fills the room solid as well as plates do; before, only counts above 1 did,
because 1 was the default): `PLATED_RETENTION`, as before. With dividers, as before (§5.2).
Growth is therefore never above what the contents hold, unless the user asked for plates. A number or
`max` past the cap is cut to it, not given a spacer: there is no fallback part.

**Reachability.** Without a spacer the stack is not pinned, it slides within the grown well, and one
finger cut is centred on the well. Which cut matters: an upright deck is reached by the channel
through its end walls (the walls the end cards' faces touch). That channel is centred on the card
length across the stack and its width runs across the stack, so it does not care where along the
well the stack stands; a stack away from an end wall leaves a gap the same channel opens into. It
is a different cut that moves: a deck with no free end wall (between bins that are not its twin, or
in a row of pockets) is cut across the row instead (`placeCutouts`, "the other axis"), through
the front and back walls, centred on the well along the stack, `fingerPocket.width` wide
(not scaled by `fit`; at most the well less two `POST_MM` posts). For that cut, with the stack T
thick in a well W wide, a cut of width C and the stack against one end, the stack lies over
`T − (W − C) / 2` of the cut. Requiring at least `MIN_REACH_OVERLAP` (M) of it:

    W ≤ C + 2 × (T − M),   i.e. room W − T ≤ C + T − 2M     (`reachGrowthMm`)

checked against the real placement (`cutouts.test.ts`): realized, with the stack standing against
the left and then the right end of a grown well, the cut overlaps it by M at the cap and by less one
millimetre more; its centre is the well's and its width the setting. Two refinements: a stack
under M + `POST_MM` thick is asked only for what a post-limited cut gives it (T − 3), else a thin
deck could not grow at all; and the bound is never negative.

**M is `MIN_REACH_OVERLAP` = 10 mm.** The least of the stack that has to lie under the cut for
fingertips to get onto the cards, taken as the fingertip width the cut rules already use
(`MIN_CUT_MM`, the narrowest cut a finger fits, 10 mm; a test holds the two equal). It is the
setting's own definition of "a fingertip", not a new number. At the default 25 mm cut the bound is
`T + 5 mm`, so retention (T) is already the tighter and nothing changes; reachability only binds
when the user narrows the cut, from 20 mm down (a 14 mm cut and a 23.5 mm stack: 17.5 mm of room,
not 23.5).

**Pre-change finding (geometry 0.7.1, the default `auto`, 25 mm cut), asked for in the brief.**
At the `auto` cap the stack is given room equal to its own thickness (T up to 50), so W = 2T, and the
worst overlap is `T − (2T − C) / 2 = C / 2` = 12.5 mm of the 25 mm cut, independent of T (for stacks
over 50 mm thick, T/2 − 12.5 or more). Measured on the fixtures before the change (seeds 1 to 6): wells
reached by the end-wall channel (all of `cards-heavy`, 24 of 30 of `small-tiles`) are not affected by
where the stack stands; `tiles-minis` had 30 wells cut across the row, each a 25 mm stack in a well
22.2 mm wider with no spacer, overlapping its 25 mm cut by 13.9 mm at worst; 6 `small-tiles` wells
cut across were not grown. So no default-grown deck was out of reach, and none was close: the margin
over M was 3.9 mm. It is not a live bug at defaults. It was one waiting for a narrower cut, which
the spacer had hidden: a deck beside a spacer is cut through the part of the well left of the spacer
(`besideSpacers`: centred on the cards), so the cut followed the stack. Without the spacer that
guard is gone, which is why the bound is added now.

**Limits.** The bound is on policy growth; room a tray is forced to give a stack (`levelMinFootprints`,
spec §5.1) is not counted against it, as it is not against retention, so a well in a tray under a
wider one can end up wider than the bound allows. After the change, on the fixtures, every
across-cut well still overlaps its cut by at least 13.0 mm at either end. Divided wells are not
bounded by it (each section would need its own); a divided well's cut is the end channel in
practice. Plated wells are not, the plates pin the stack and the cut is placed beside them.

**Flat storage.** Unaffected. A flat deck grows in height, where it is already held: its cards fill
the well's footprint (clearance only), so nothing slides and nothing leans; the cut is a half-round
through each long wall, centred on the long side and down to the floor, so it reaches the stack at
any height. Neither bound applies (retention was never applied to flat either); a test pins the
height growth unchanged under a narrow cut. Bulk and minis are untouched.

**Versions.** Geometry 0.7.1 to 0.7.2, a PATCH, on the 0.5.1 precedent: `planTray` is unchanged, a
tray realized from the same part at the same outer size has the same outer size, lip, inset and cuts
(only the well's inside differs: wider, nothing standing in it), so trays printed before and after
still mate and stack. The other candidate was a MINOR, but that line means "reprint the whole
insert", which is false here, and 0.6.0's reason (the same project lays out to other outer tray
sizes) does not hold: sizes follow the layout, not the spacer. Consequence: a stored 0.7.1 layout is
current and still has its spacers until its plan is run again; they print as before. Schema stays
0.1.14: no file this app writes changes, `separators` of 0 is accepted on reading but never written,
and an explicit 1 or more means what it did. The only difference is that an absent `separators` now
means none, which a default may do; and the inputs hash is unchanged for every project, so no plan
goes stale. The field's hint says so, and the growth hint names the finger cut.

**Measured** on the four fixtures, seeds 1 to 6, 50 000 iterations, before is commit a421b26.
Printed parts as `printedParts` counts them (a spacer is a part); link is the whole share link.

| fixture       | printed parts | spacers  | filler parts | fill %      | filament g   | link length            |
| ------------- | ------------- | -------- | ------------ | ----------- | ------------ | ---------------------- |
| `cards-heavy` | 14.0, same    | 0, same  | 2.0, same    | 99.70, same | 614, same    | 1791-1851 to 1790-1850 |
| `bits-heavy`  | 9.0, same     | 0, same  | 0, same      | 99.78, same | 450, same    | 1766-1903 to 1767-1903 |
| `tiles-minis` | 6.0, same     | 0, same  | 3.0, same    | 99.80, same | 1213 to 1219 | 1917-1966 to 1835-1889 |
| `small-tiles` | 15.0 to 10.0  | 4.0 to 0 | 1.0 to 1.3   | 99.47, same | 414 to 400   | 1871-1969 to 1738-1865 |

Nothing infeasible, and no fixture over 2 000 characters: the longest link is 1903 (`bits-heavy`, not
changed); `small-tiles`, which was 31 characters under, is now 135 under, because four spacers
fewer are stored. `small-tiles` drops 4 spacers on every seed (its 15 parts were 11 trays and
fillers plus those 4) and its fill is unchanged; `tiles-minis` is 6 g heavier (1219 against 1213),
its wells having grown with nothing to hold back.

**Not done.** A reachability bound for dividers' sections. Making the across cut follow the stack
in a grown well (an off-centre cut would remove the bound; it changes cut placement for every tray
with an across cut, so it was left). Stripping the spacers out of a stored 0.7.1 layout at print
time, which would hide them without re-running the plan.

## 6. The objective

The intent says _minimise the number of fillers_. Today `score.ts` charges
`WEIGHTS.trays` (20 000) per printed part among several competing terms, and
leftover volume separately. Filler count is therefore only implicitly
discouraged.

Decide deliberately whether filler **count** deserves its own term, and tune it
against the existing weights rather than inheriting them. Note that growing a
tray (where allowed) removes a filler entirely, so growth and the filler penalty
interact: with a growth option enabled, the scorer should prefer growing a tray
that gains capacity over printing a filler beside it.

### Fewer fillers, and where they sit (done: see §6.2)

The user's stated preference, in their words: _the less fillers I have to put
manually, the better_. So the objective is not filler volume but **how many
loose pieces a person has to place by hand**. Three levers, in the order they
are likely to pay off:

1. **Merge adjacent fillers.** Two leftover regions that are co-planar,
   level-aligned and share a full edge can be one part. This cuts the count with
   no downside to packing, and should be done before tuning any weight — it is
   the cheapest win here and may remove much of the complaint on its own.
   1b. **Merge further: fillers with each other, and with risers.** Lever 1 joins
   two strips that share an edge, but the idea generalises. All dead space in
   the box — every filler, and every riser under a stack — is one connected
   solid in many layouts, and could print as **one part per bed-full** instead
   of five small ones. In the worked example below, the right-hand edge strip
   and the two cross strips meet, forming a comb; the risers under each stack
   sit at the foot of it.

   The user's framing: they would rather fit one large piece than five small
   ones.

   Constraints that decide how far this can go:

   - **The print bed.** The merged part must fit, and a box larger than the bed
     in plan simply cannot have one piece. Merge greedily into the largest
     connected part that fits, then start another.
   - **Connectivity.** Only a single connected solid can be one part. Two
     strips meeting at a corner qualify; two separated by a tray do not.
   - **The tray gap.** Strips in different tree leaves are separated by
     `trayGap`; a merged part absorbs it, so the result is slightly larger than
     the sum.
   - **Risers are not co-planar with fillers.** A riser sits under a tray while
     a filler stands full height beside it, so merging them makes an L in
     elevation: a low shelf the tray drops onto, with a full-height wall
     alongside. That is printable and self-supporting, but it means a riser is
     no longer per-stack, which is a change to how `splitRisers` works.
   - **Assembly order.** A merged part must go in before every tray that rests
     on or against it. The instructions already order parts, so this is a
     numbering question, not a blocker.

   Risks worth weighing against the convenience: a large flat part warps more
   and takes a long single print, a failed print loses everything at once rather
   than one small strip, and friction over a long merged face can make the
   insert harder to get back out.

   **This is a user setting, not a default behaviour.** Two switches, beside
   "Unused space":

   - `mergeFillers` (suggest default on) — merge connected fillers into the
     largest part that fits the bed;
   - `mergeRisers` (suggest default off) — also fold risers into them, which is
     the step that produces the L-in-elevation parts and changes assembly order,
     so it earns its own opt-in.

   **Both are print-time decompositions, so neither belongs in `inputsHash`.**
   The stored layout keeps its individual leftovers and raised floors; merging
   happens where `splitRisers` and `splitSeparators` already run. Changing either
   switch must not mark a plan stale, trigger a re-optimize, or lengthen the
   stored layout and its share link. Same lesson as the riser work: derive the
   printable decomposition, never store it.

   Note the division of labour this creates. The _merge_ is print-time and free;
   the _scoring preferences_ in levers 2 and 3 are layout-time and do change the
   stored plan. Keep them separate — a layout should be arranged so that it
   merges well, and then merged.

2. **Count, not volume.** Give filler count its own score term, tuned against
   `WEIGHTS.trays`. One large filler should beat two small ones even when the
   volume is identical.
3. **Prefer the perimeter.** A filler against the box wall is easier to drop in
   than one wedged between trays, and it only has to be snug on the inner side.
   Reward leftover rects that touch the box boundary.

#### Worked example (Star Realms, 101 × 195 × 37)

A real layout that produces four fillers where two would do, and which the next
session can use as a test case:

| filler       | position                   | size          |
| ------------ | -------------------------- | ------------- |
| `leftover:0` | right edge, y 0–100.12     | 8.71 × 100.12 |
| `leftover:2` | right edge, y 100.26–194.3 | 8.71 × 94.04  |
| `leftover:1` | between the two stacks     | 91.45 × 8.53  |
| `leftover:3` | far end                    | 91.45 × 2.45  |

- **The two edge strips are the same strip.** Same x, same width, separated only
  by the 0.14 mm tray gap. They are two parts solely because they belong to
  different leaves of the guillotine tree (`path` "0" and "1"), and leftovers are
  emitted per leaf with no merge pass. Lever 1 fixes exactly this; note it must
  absorb the tray gap between them.
- **The interior strip should have been at the edge.** 8.53 mm sits between the
  two stacks and 2.45 mm at the far end. Pushing the stacks together would leave
  one 10.98 mm strip at the end instead of two. This is lever 3 doing real work.

Together the two levers take this layout from four fillers to two, which is what
the user asked for. Treat it as the acceptance case.

**Lever 3 is unproven and may fight lever 2** — pushing slack outward could
fragment it into several edge strips where it would otherwise have pooled into
one interior block. The user flagged their own uncertainty here. Measure count
and placement together before adopting it, and drop it if it raises the count.

### An escape hatch: let one wall take it

Some people would rather have a slightly odd tray than loose pieces to fit.
Offer a mode where, instead of a filler, the slack goes entirely into **one**
wall of the neighbouring tray.

This differs from `wallGrowth` today in two ways: it is one-sided (the current
code splits growth between both side walls with `Math.floor(slack / 2)`, so the
tray stays centred), and it would be uncapped or near-uncapped, since the point
is to eliminate the filler rather than to absorb a sliver.

The tray stays flush on its other side, which is what keeps this from looking
like the §3 defect: one thick wall against the box edge reads as deliberate,
where two symmetric fat walls read as a mistake. Prefer growing the wall that
faces the box wall or another tray's back, not one facing a finger cut.

Note this is in tension with the whole spec, and that is fine — it is an
explicit user choice to trade honest geometry for fewer parts, not a default.

### Keeping one component's parts together (done: see §6.1)

When a component is split across several trays (variants with parts `p0:0`,
`p0:1`, …), the optimizer treats each part independently. In the Star Realms
layout the three "Starter deck" trays end up in two different stacks, and one of
them is turned 90° while the other two are not. The user reads them as one
thing, so this looks like a mistake.

Two preferences worth adding to the score, in this order:

1. **Same orientation.** Parts of one requirement should prefer a common
   `rotated` value. In the example all three trays are square in plan
   (91.45 × 91.45), so this costs the packing nothing at all — it is a pure
   tiebreak, and the cheapest cohesion win available.
2. **Same stack**, where it fits. A _preference_, never a constraint — but note
   it is usually possible, and what prevents it is normally the score rather
   than geometry.

   In the Star Realms example the three starter decks _can_ all sit on the
   Counter. Minimum heights (floor + well, before any padding) are Counter 8.0,
   Deck 1 6.87, Deck 2 3.6, Deck 3 3.56 — 22.03 mm in one stack of four levels,
   inside both the 35 mm top plane and `MAX_LEVELS`, with the remaining 13 mm
   becoming a riser. Trade (28.4) then takes the other stack with a 6.6 mm
   riser. Both fit. An earlier draft of this spec claimed otherwise; it had
   summed the _padded_ heights of the current layout instead of the minimums.

   What rules it out today is `WEIGHTS.access` (200 000 per "often" tray with
   something stacked on it). "Starter deck" is marked _often_, and any ordering
   of three such trays buries two of them, costing 400 000. The current
   interleaving buries only one, at 200 000. So the optimizer is trading visual
   cohesion for reachability, deliberately, by exactly one access penalty.

   Two consequences for whoever implements this: a cohesion term must be weighed
   against `access` explicitly rather than bolted on; and for a user who wants
   cohesion more than reachability the honest answer may be to mark the
   component _sometimes_ — which suggests the access setting needs a hint saying
   what it costs.

So implement 1 unconditionally and 2 as a weak term, and make sure neither can
push a feasible layout into an infeasible one.

### 6.1 Keeping one component's parts together, as implemented

Two score terms, `WEIGHTS.unturned` and `WEIGHTS.apart` (`layout/score.ts`), both per requirement
and both over the parts of its active variant:

- **Same orientation** (`unturned`, 15 000): the parts turned unlike the majority, so
  `min(turned, not turned)`. Unconditional (it does not look at the footprint), but weak, so a tray
  that really packs better turned still wins: the parts of the trays are only near-square once
  slack has been absorbed into one of them, and a sliver of leftover is worth more than this.
- **Same stack** (`apart`, 10 000): the stacks a requirement's parts stand in beyond the first.

How the weights were set, against the neighbours (trays 20 000, stacked 50 000, access 200 000,
setup 15 000, moved 5 000): both are below `trays`, so neither ever buys a filler to be placed by
hand, and below `stacked`, so neither buys a stacked tray; far below `access`, so reachability
always wins, and they cannot override feasibility, because a requirement's whole contribution is
orders of magnitude under `OVERFLOW_WEIGHT` and a violation costs that per 0.01 mm. Both are above
`moved`, so a warm start can still regroup. Orientation weighs more than the stack because it is
the cheap win. There is a test for each of these relations, and one that grouping three "often"
trays (400 000 of access) loses to the interleaved layout (200 000), as §6 predicted.

One bias to know about: `apart` is 0 for a variant of one part, so it nudges the optimizer, by at
most 10 000 per extra part, towards variants with fewer parts. `trays` already charges 20 000 for
each part, so it points the same way.

**Result on the Star Realms project** (warm start from its stored layout, which is how the app
re-runs it; a cold run still does not find a layout, before or after, see the backlog): the three
Starter-deck trays now share an orientation on every seed (they did not before: one turned, two
not), and still stand in two stacks (the interleaving the spec predicted: one stack would bury two
"often" trays, 400 000, against one, 200 000, for a gain of 10 000). Marking the component
"sometimes" is still the way to get one stack.

### 6.2 Fewer fillers, as implemented (schema 0.1.9, geometry stays 0.5.2)

**Levers 1 and 1b: merging, at print time.** `mergeParts` (`src/layout/merge.ts`), the last step of
`printableParts` (`src/layout/printable.ts`: `splitRisers`, `splitSeparators`, `openSpacers`, then
the merge; the app, `summarize` and the exports all list these), joins connected fillers into the
fewest parts that fit the print bed. Two settings beside "Unused space", advanced mode:
`mergeFillers` (default on) and `mergeRisers` (default off; the form disables it while fillers are
not merged, and it does nothing without them). **Neither is in `inputsHash`, and the stored layout
is untouched**: the stored layout keeps its individual leftovers and raised floors, and the
share link is the same. (A setting is a field, so a switch set to a non-default value adds that
field to the link; at the defaults the writer leaves both out and reading puts them back, so a link
is byte for byte what it was.) Tests pin it: the hash is the same for all four combinations on every
fixture, and `optimize` returns a deep-equal layout and the same hash for all four.

- **A merged part** is a `leftover` with `merged` set (`TraySpec.merged`, never stored): its box is
  the bounding box of the union, `members` are the parts it joins, each built exactly as it would be
  alone, and `bridges` are solid boxes across the gaps between them. Key `merged:<n>`, ordered
  left to right. Geometry (`buildMerged`, `tray.ts`) unions the members and bridges.
- **Connected** means standing side by side across a gap of at most `trayGap` (between leaves, or
  between a tray and its filler) over at least `MIN_JOIN_MM` (2 mm) of edge and of height. A corner
  touch does not join; two strips with a tray between them do not. A merged part absorbs the tray
  gap, so it is slightly larger than the sum of its members. The in-level fillers of 10e2158, which
  stand from their level's floor to the top of the stack, take part like any other, by their own box.
- **The bridge reaches into both members** by as much as their rounded corner cuts away (the
  corner radius; at most the wall of an open member, at most half a solid one). A bridge only a gap
  thick (0.14 to 0.2 mm) would stand in the notch between two rounded corners, and at the foot
  beside the bottom chamfers, as a free-standing fin that cannot print: that was seen in
  `checkPrintability` on the first version, which failed with overhangs and a sub-0.8 mm feature,
  and the reaching bridge passes it (`tray.merged.test.ts`).
- **The bed.** The part's bounding box must fit the bed in plan, either way round, and in height.
  The box, not the exact shape, so a comb that would fit on a diagonal stays two parts. Growth is
  greedy, largest first, and every part is tried as the first seed with two ways of choosing what a
  group takes; the grouping with the fewest parts wins, then the smaller footprint, then the first
  found, so the result is deterministic. Star Realms' two right-hand strips, 100.12 and 94.04 mm,
  are one 194.3 mm strip that does not fit the 170 mm bed, so the best it can be is two parts.
- **The L (`mergeRisers`).** A riser, under a tray, joined to a full-height filler beside it, is a
  low shelf with a wall alongside, an L in elevation. It stands on the floor like both of its members,
  so it prints as it stands, and the assembled part self-supports (no overhang in
  `checkPrintability`, and its height is 16.4 mm over the riser and 35 mm over the wall in the
  test). The part goes in before the tray that stands on it.
- **Different floors: upside down.** A filler in a stack level (floor at the tray below's top)
  can sit against a ground filler. Printed as it stands its ledge would hang, but every filler runs
  to the same top plane, so printed upside down, top face on the bed, nothing does. That holds only
  when every member is solid (an open member's pocket would face the bed) and every top is level, so
  the merge refuses otherwise. `merged.flipped` says so; the export turns the mesh half a turn about
  X (a rotation, not a mirror, and back on the bed: `printMesh`), the viewer keeps it as it stands,
  and the details panel says "Print it upside down".
- **Assembly order.** A merged part goes in before every tray that rests on or stands against it:
  first, among the numbered parts. The exception is a part with a member that rests on a tray (a
  ledge on the tray below): it goes in after that tray, since nothing can slide under it, and
  before the trays above (`numbering.ts`, `mergedPosition`). Several merged parts keep key order.
  In the plan, the instructions and the details a merged part is drawn as the members of the layer
  shown (a riser folded in lies under a tray and is not drawn), with one number on the largest.
- **Filament** counts the members as they print alone plus the part of each bridge outside them.
  `LayoutSummary` gained `fillerCount` (filler parts to place by hand, after merging) and the two
  switches it was made under, so a cached run summary is dropped when either changes; the stored
  tray count and fill % stay on the stored trays.

**Lever 2: the count is a term** (`WEIGHTS.fillers`, 20 000, `score.ts`). Each leftover, in a
stack level too, costs it on top of the 20 000 every part costs: a filler is twice a tray. Measured
over 40 seeds (100 to 139) at 50 000 iterations the filler count after merging on `cards-heavy`
fell from 1.98 to 1.62 per layout (3.30 to 3.02 stored); on the other fixtures it did not move
(`bits-heavy` has none, `tiles-minis` stays at 3, `small-tiles` 1.10 to 1.18, inside the noise,
stored 3.35 to 3.12). Flat between 10 000 and 29 000 on `cards-heavy` and `small-tiles`, so the
value is set by its neighbours, not by the search: under `stacked` (50 000) with its part
(40 000), so avoiding a filler never buys a stacked tray, and above every cohesion preference
(15 000, 10 000), `setup` and `moved`, so none of them buys a filler. It counts stored leftovers,
not merged parts: the merge is a setting outside the hash, so the layout cannot depend on it. A
variant that counted connected groups instead did no better (below).

**Lever 3: prefer the perimeter, measured and dropped.** A term of 5 000 per ground filler that
does not touch the box wall (small against the 40 000 of a filler, so a tie-break that can never buy
a part), on top of lever 2 (then set at 25 000: the weight was settled at 20 000 afterwards, the
value being flat), over seeds 100 to 139, filler count after merging:

| fixture       | lever 2 only | lever 2 + 3 |
| ------------- | -----------: | ----------: |
| `cards-heavy` |         1.70 |        1.57 |
| `tiles-minis` |         3.00 |        3.00 |
| `small-tiles` |         1.15 |    **1.40** |

It raised the count on `small-tiles` by 0.25 (three standard errors), while saving 0.13 on
`cards-heavy` (one), and the three fixtures together went from 5.85 to 5.97: the fragmentation
this section warned of. Slack pushed outwards stops pooling into one block and becomes several edge
strips on different sides that cannot join. The brief said to drop it if it raised the count, and
it did, so it is gone from the code. Counting connected groups instead of leftovers in lever 2
(12 seeds: 1.83 on `cards-heavy`, 1.00 on `small-tiles`, with or without lever 3 2.00 and 1.00) was
no better than the plain count and would tie the layout to rules that live in the merge, so it was
not kept.

**The Star Realms project** (warm start from its stored layout, geometry 0.4.0, as the app
re-runs it). The stored layout has four fillers; after the warm start there are six, because of the
fillers within stack levels of §4.1 (91.45 × 4.36 on the tray below, 6.6 and 10.6 mm high). Printed:

| before                                              | after (`mergeFillers`)                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `leftover:0` right edge, 8.71 × 100.12 × 35         | `merged:0` 100.3 × 100.12 × 35 = `leftover:0` + `leftover:1` + `leftover:4` |
| `leftover:1` between the stacks, 91.45 × 8.53       |                                                                             |
| `leftover:2` right edge, 8.71 × 94.04 × 35          | `merged:1` 100.3 × 94.04 × 35 = `leftover:2` + `leftover:3` + `leftover:5`  |
| `leftover:3` far end, 91.45 × 2.45                  |                                                                             |
| `leftover:4` on the first stack, 91.45 × 4.36 × 6.6 |                                                                             |
| `leftover:5` on the second, 91.45 × 4.36 × 10.6     |                                                                             |

Six filler parts become two, both printed upside down (the ledge members stand on different
floors, all solid with level tops). Printed parts 12 to 8; fill 99.6 % and filament 378 g are
unchanged; the link 1815 to 1785 characters (lever 2 takes the stored fillers from six to five).
With `mergeRisers` the one riser folds into the part beside it and one ledge no longer merges (the
riser is open, the ledge needs an all-solid part), so it is three filler parts and no riser: the
same total. The two strips cannot be one part: the bed is 170 mm and the strip 194.3 mm. The interior
strip (8.53 mm) is not pushed to the edge, as §6 predicted: it merges into the part with the edge
strip instead, which is all that was wanted of it, and the layout is not changed by it.

**Measured** on the four fixtures, seeds 1 to 6, 50 000 iterations, plus Star Realms from its
warm start (seeds 1 to 4; all give the same result). Before is the commit this work started from;
`filament` is the solid upper bound `filamentG`; link length is the whole share link on the real
deploy URL. Nothing became infeasible on any of 160 further runs (seeds 100 to 139 on all four),
and no guarded fixture crossed 2 000 characters on any of them (`cards-heavy` 1 893 at most,
`bits-heavy` 1 803, `small-tiles` 1 955; without the term `small-tiles` reached 2 002 once, and
`tiles-minis`, which is not guarded and the largest, is within 14 characters of the limit, at 1 986).

| fixture       | printed parts (before to after) | filler parts (before to after) | fill %     | filament g (mean, before to after) | link length            |
| ------------- | ------------------------------- | ------------------------------ | ---------- | ---------------------------------- | ---------------------- |
| `cards-heavy` | 15.5 to 13.7                    | 3.50 to 1.67                   | 99.7, same | 631 to 608                         | 1817-1907 to 1767-1841 |
| `bits-heavy`  | 8 to 8                          | 0 to 0                         | 99.9, same | 425 to 427                         | 1749-1778 to 1749-1774 |
| `tiles-minis` | 6.2 to 6.0                      | 3.17 to 3.00                   | 99.8, same | 1223 to 1220                       | 1930-1985 to 1923-1986 |
| `small-tiles` | 16.3 to 14.2                    | 3.33 to 1.17                   | 99.3-99.5  | 364 to 379                         | 1861-1951 to 1865-1939 |
| Star Realms   | 12 to 8                         | 6 to 2                         | 99.6, same | 378 to 378                         | 1815-1817 to 1785-1786 |

With `mergeRisers` on as well, printed parts fall to 10, 6, 5, 9 and 8 (risers fold into the part
beside them; the filler column then counts the merged parts that hold a riser, 3, 1, 3, 1, 3).
`small-tiles` filament is up by 15 g on average because one seed's layout (seed 5) is a heavier
one (441 g, against 334 g) that has two stored fillers instead of three: the term chose it, which
is the trade it is for, and over 40 seeds the mean is unchanged (375 g to 374 g).

## 7. Risks, and what to measure before shipping

- **Part count will rise**, more sharply than it did for leaf slack: every
  stacked tray whose footprint differs from its neighbour's gains a filler.
- **The packer loses a degree of freedom.** Tray growth is currently a tiling
  tool; removing it may make some boxes pack worse. Fillers should absorb this,
  but it must be measured, not assumed.
- **Share links.** More parts means a longer stored layout. The 2000-character
  guard exists so a link fits a Discord message and has been hit twice.

Measure on `cards-heavy`, `bits-heavy`, `tiles-minis` and `small-tiles`, over
several seeds, before and after: printed part count, filler count, fill %,
filament at the configured infill, and full share-link length. No fixture may
become infeasible, and no guarded fixture may cross 2000 characters.

## 8. Out of scope

- Manual orientation and manual layer control (already in the design doc's
  "Not in v1" list), although the layer feature shares most of this machinery
  and should be built after, not before.
- Changing `minFiller`, which is derived from what `planTray` will build.
- Changing how `separators` plates work; they are the retention mechanism a
  grown deck already has, and this spec only makes them matter more often. (Dividers, §5.2, do
  not combine with them.)
  (§5.3 later made them opt-in instead of the default, without changing how a plate is made.)
