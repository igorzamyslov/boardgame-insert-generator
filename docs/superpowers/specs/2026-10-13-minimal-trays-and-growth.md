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

### Fewer fillers, and where they sit

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
   and takes a long single print, a failed print loses everything at once
   rather than one small strip, and friction over a long merged face can make
   the insert harder to get back out. Consider whether this should be a setting
   rather than always on, alongside "Unused space".

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

### Keeping one component's parts together

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
