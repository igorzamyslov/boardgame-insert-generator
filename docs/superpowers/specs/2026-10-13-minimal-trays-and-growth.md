# Minimal trays, fillers between them, per-component growth

Status: §4 implemented (geometry 0.5.0, see §4.1), with its two cleanups (the in-tray spare
removed and `wallGrowth` renamed `wallAbsorb`: geometry 0.5.1, schema 0.1.8, see §4.2) and the
"keeping one component's parts together" part of §6 (see §6.1); §5 and the rest of §6 are still
proposed. Written 2026-10-13 for a later session.
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
  And a spacer is a solid block where the pocket was hollow: the `small-tiles` fixture, which
  stretches three 199 mm trays, goes from about 330 g to about 430 g of filament. That is what
  `stretch` asks for until §5 bounds it, and bounding it is the real fix.
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
