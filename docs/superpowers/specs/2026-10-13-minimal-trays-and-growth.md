# Minimal trays, fillers between them, per-component growth

Status: proposed, not implemented. Written 2026-10-13 for a later session.
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
or the gained space is taken up by something removable (a spacer, or the
`separators` plates) that keeps the contents standing while still letting the
collection grow into it.

## 2. What already behaves this way

Implemented as of GEOMETRY_VERSION 0.4.0 / SCHEMA_VERSION 0.1.7:

- **Leaf slack becomes a filler.** `axisExtent` no longer absorbs up to 12 mm
  into the neighbouring tray. Slack becomes a leftover part of any width down to
  `minFiller` (the narrowest part `planTray` will build, 2.4 mm at the default
  chamfer). Below that it is absorbed, because the slack must go somewhere or
  the trays shift laterally (rule 1).
- **Wall thickening is opt-in.** `settings.wallGrowth` (mm per wall, default 0)
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

### Also remove: the in-tray spare compartment

`realizeTray` turns leftover row slack into a `kind: "spare"` compartment when
it is at least `MIN_SPARE` + a divider. That is an empty pocket holding none of
the component's pieces — absorption, not growth, and reported as a defect ("a
decks' holder with a pocket"). With a minimal tray there is no row slack to
begin with, so the mechanism becomes vestigial; delete it rather than leave it
to fire on the cases that slip through. Note `splitRisers` currently has to
ignore spares when sizing a riser; that workaround can go with it.

### Also rename: `wallGrowth`

The name says growth, but thickening a wall gives the contents nothing. Rename
it to something that says absorption (`wallAbsorb`, or similar) so the settings
do not teach the wrong model. Additive rename: keep reading the old key.

## 5. Growth policy per component kind

Growth should be allowed on the axis where extra room means **more pieces**, and
refused where it only means a looser fit. Current behaviour and the proposal:

| kind           | axis                        | extra room means                 | today                          | proposed default                                                       |
| -------------- | --------------------------- | -------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| bulk (bits)    | all three                   | more loose pieces                | elastic w/d/h with `minVolume` | **off by default** — size to the declared volume; opt-in capped growth |
| cards, upright | stack axis (deck thickness) | more cards                       | `stretch`, off                 | off, opt-in (unchanged)                                                |
| cards, flat    | height                      | more cards                       | not elastic                    | never by default — riser; opt-in only for expansion room               |
| cards          | card width / length         | nothing — cards slide            | fixed                          | never grow                                                             |
| tiles, upright | stack axis                  | more tiles                       | `stretch`, off                 | off, opt-in (unchanged)                                                |
| tiles, flat    | height                      | more tiles stacked               | not elastic                    | never by default — riser; opt-in only for expansion room               |
| tiles          | tile footprint              | nothing                          | fixed                          | never grow                                                             |
| minis, pockets | pocket w/d                  | easier to grab, tolerance        | fixed                          | off; opt-in at most                                                    |
| minis, pockets | depth                       | nothing — figure height is fixed | fixed                          | never grow                                                             |
| minis, bulk    | all three                   | more figures                     | elastic                        | **off by default**, as bulk above                                      |
| custom         | all three                   | tolerance only                   | fixed                          | off; opt-in at most                                                    |

**Nothing grows by default.** Every row above is off unless the user turns it
on, and every opt-in is capped. Bulk is the one that changes most: a bits bin is
elastic in all three axes today, which is why a box with spare room produces one
enormous scoop tray. That is the same clunkiness as a tall flat tray or a fat
wall, and the answer is the same — size the bin to the volume the user declared,
and let fillers and risers take the rest.

Two consequences of making bulk minimal, both worth stating plainly:

- **`packingFactor` becomes load-bearing.** Once a bin no longer absorbs spare
  space, that setting alone decides how big a bin is, so a poor value shows up
  directly as a bin that will not hold the pieces. Its hint should say so.
- **The packer loses its most flexible axis.** Bulk elasticity is what currently
  lets the optimizer fill awkward space. Removing it is the single biggest risk
  in this spec, and `bits-heavy` is the fixture to watch in §7.

A note on flat storage: height is where extra room would hold more flat cards or
tiles, so the capacity argument that justifies `stretch` upright applies in
principle. But it must not become the default. A flat tray taller than its stack
is the clunky case this spec exists to remove, and the box's leftover height
belongs to a riser under the tray. So treat height growth for flat storage as an
explicit opt-in for someone who wants room for expansions, capped, and never
something the packer reaches for to fill space.

### Shape of the setting

`stretch` is a boolean, which cannot express "grow, but not without limit" —
and unbounded growth is exactly what drops a deck on its side. Replace it with a
per-component growth option carrying a cap, e.g. `grow: { limit?: number }`,
defaulting off, where `limit` is the most the contents' room may exceed their
minimum. Migrate `stretch: true` to a capped grow, not an uncapped one.

Where no cap is given, derive a safe one from what keeps the contents retained
rather than letting it run: for an upright deck or tile stack, growth beyond
roughly the stack's own thickness is where it starts to topple, and anything
past that should need `separators` plates to fill it. Treat "grow without
plates" and "grow with plates" as the two real cases, and let the second go
further than the first.

Keep the axis implicit (derived per kind from the table above) rather than
asking the user to name an axis — they think in "fits more cards", not in w/d/h.

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
  grown deck already has, and this spec only makes them matter more often.
