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

**How a divider is held is a secondary problem** and should be settled during
implementation, not now. The options worth weighing: friction alone (simplest,
but loosens as the tray flexes), a notch in the floor (prints without supports
if the notch is a chamfered slot, and the floor is already notched for finger
cuts, so there is precedent), or slots in the facing walls (most positive, but
constrains where a divider may sit and interacts with wall cutouts). The floor
notch is the likeliest fit given what `planTray` already builds.

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
