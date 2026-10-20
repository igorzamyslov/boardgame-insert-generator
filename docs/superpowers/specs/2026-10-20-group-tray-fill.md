# Group trays: less solid plastic (proposal, not built)

Date: 2026-10-20. Status: **for the owner to choose**. Builds on the groups spec
([2026-10-18-groups-design.md](2026-10-18-groups-design.md)) as of 0.7.0 (PR #19, not on `main` yet).

## 1. The problem

On the `harbour-kings-kit` seed, each Player kit copy is one `strip` tray, 159.5 × 69.7 × 70 mm:

| Well         | w × d (mm)  | floor z | What surrounds it         |
| ------------ | ----------- | ------- | ------------------------- |
| Starter deck | 45.5 × 66.5 | 63.8    | fills the row depth       |
| Resources ×3 | 25 × 25     | 50      | 41.5 mm of solid in depth |
| Hero pocket  | 31 × 31     | 31      | 35.5 mm of solid in depth |

The small wells are a third of the row deep and centred in it; everything around them is solid.
Resources has `growth` off on every axis in the seed (Auto made the tray wider, see §2), and a
minis pocket does not grow by default.

**How the numbers were made.** A throwaway test loaded the seed, took the first kit tray and ran
`summarize` (`src/layout/summarize.ts`) on it alone: grams at the seed's 15 % infill
(`filamentAtInfillG`) and hours from `printMinutes`, riser split out as the app prints it. That gives
359 g, 20.1 h per tray; the owner's figure from the app was 317 g, 18 h, so read the
**percentages**, which compare like with like. "Auto/Max today" are real optimizer runs
(`optimize`, the seed's layout seed). "Fill" and "columns" are the seed's tray with the wells edited
by hand to what the proposed rule would draw (no product code changed).

## 2. (a) Wells that fill the group tray

### Numbers, per kit tray (×4 copies)

| Variant                                                    | Tray (mm)             | Outer vol | Filament        | Print     |
| ---------------------------------------------------------- | --------------------- | --------- | --------------- | --------- |
| Today (seed: Resources off)                                | 159.5 × 69.7 × 70     | 778 cm³   | 359 g           | 20.1 h    |
| Resources Auto (today's engine)                            | **188.1** × 71.4 × 70 | 941 cm³   | 259 g −28 %     | 14.5 h    |
| Resources Max (today's engine)                             | **181.2 × 92.7** × 70 | 1176 cm³  | 312 g −13 %     | 17.5 h    |
| Resources + Hero Max (today's engine)                      | **181.2 × 92.7** × 70 | 1176 cm³  | 223 g −38 %     | 12.5 h    |
| **Fill the tray, length only** (d)                         | 159.5 × 69.7 × 70     | 778 cm³   | **176 g −51 %** | **9.8 h** |
| Fill the tray, length + height (floors down to the Hero's) | same                  | 778 cm³   | 140 g −61 %     | 7.8 h     |

Over the four copies, "fill, length only" saves about 730 g and 41 h.

Auto and Max today do fill the row depth (`rowDepthCapU`), but Auto also widens the bins
(34.5 mm each) and Max takes the layout's leftover in depth, so the tray grows 21 % / 51 %. That is
why the seed turned Resources off. (The whole set's totals move with the layout search: with
Resources on Auto the optimizer found a plan with fewer fillers, so set totals are not a clean
comparison and are left out.)

### Proposal

**A group member's bins and pockets fill the slack their group tray already has, and never make
the tray bigger.** Slack is what the tray's other members create: a row deeper than the well, a
column wider than it (§3), and in height the deepest member's floor. The tray's size is decided
exactly as today; only the wells inside it change.

Two ways to offer it; the owner picks:

- **A1. Always, for grouped bins and pockets (recommended).** No new control, no schema change.
  "Room for more" keeps its meaning (may the _tray_ get bigger for this item); the solid plastic
  around a small well is already paid for, so giving it to the well is not growth. Card and tile
  stacks are excluded (a deck needs its retention and spacer rules, minimal-trays spec §5), so the
  Starter deck is unchanged. Groups are not on `main` yet, so nothing saved changes meaning.
- **A2. A new growth mode "Fill its tray"**, offered only in a grouped item's Room for more.
  `GrowthMode` gains `"fill"`: schema PATCH (`SCHEMA_VERSION` 0.2.0 → 0.2.1, fixture, validate,
  reader), a choice and a "what it means" line in `GrowthOptions` (DESIGN's Max-line ruling), copy.
  More honest if the owner wants "off" to mean a snug well even in a group; one more control to learn.

Length (d) and width (w) by default; height (h) only if the owner wants it: a 39 mm deep scoop bin
for 2 mm tokens is reachable, but it is deep. Recommend d + w now, h as a later question.

### What changes (engine)

- `src/sizing/growth.ts`: a filling compartment is placed as elastic in d but adds nothing to
  `rowDepthCapU` / `rowWidthCapU` / `partGrowthCapU` (its cap is exactly `rowDepth − minD`, which
  those already subtract, so the layout sees no extra room and never grows the tray for it).
- `src/sizing/realize.ts` `layoutAt`: today a well is drawn `rowDepth` deep only when
  `req.elastic.d`; a filling well is drawn that deep too, at the row's top instead of centred. In
  width, a row's slack that would go to the walls goes to its filling wells first.
- `src/sizing/common.ts` / the group's requirement builder: mark grouped bins/pockets as filling
  (A1) or read `"fill"` (A2). Scoops and pocket cuts follow the new rect (`featureSpecs` already
  works from the allocated rect).
- Height (if chosen): `contentDepth` takes the deepest member's floor for filling wells.
- Tests: growth/realize unit tests, the kit seed refreshed (`npm run seeds`), a property test that
  a grouped tray's outer size is identical with fill on and off.

**Cost: S** (A1) / **M** (A2, adds schema, UI and copy). **Versions:** app MINOR (0.8.0, or folded
into 0.7.x before 0.7.0 merges); `GEOMETRY_VERSION` PATCH (0.8.2 → 0.8.3: wells change, outer size
and fit do not); A2 also `SCHEMA_VERSION` PATCH.

## 3. (b) A third arrangement: `columns`

### Rule

Walk the members' compartments in order (after `cutsFirst`). The column depth limit is the
deepest compartment's `minD`. Stack each compartment front to back in the current column while
it fits under the limit (with a divider between), else start the next column. Member order stays
the only control: the columns follow from it, as `rows2Break` does for `rows2`. Not free placement
(spec §2): no wells are moved out of order and nothing is chosen by hand.

On the kit (limit 66.5, the Starter deck): `[Starter deck] [Wood | Stone] [Grain | Hero]`.

### Numbers, per kit tray

| Variant                          | Tray (mm)             | Outer vol | Filament    | Print  |
| -------------------------------- | --------------------- | --------- | ----------- | ------ |
| Strip today                      | 159.5 × 69.7 × 70     | 778 cm³   | 359 g       | 20.1 h |
| Columns, wells at minimum        | **107.1** × 69.7 × 70 | 523 cm³   | 166 g −54 % | 9.3 h  |
| Columns + fill (length)          | 107.1 × 69.7 × 70     | 523 cm³   | 131 g −63 % | 7.4 h  |
| Columns + fill (length + height) | 107.1 × 69.7 × 70     | 523 cm³   | 111 g −69 % | 6.2 h  |

The tray is **52.4 mm narrower (−33 %)**. The four copies stand in one column of the box, so a
52 × 285 mm strip comes free. If nothing else uses it, it becomes a spare filler of about 38 g, 2.2 h
per copy (measured the same way), so the floor of the saving is "columns at minimum" ≈ 204 g, −43 %.
Whether the optimizer puts something there is only known once it can choose `columns`.

Trade-offs: the Hero's front cut would pass into the Grain bin's divider, which the cut rules do not
allow without a cut on both sides, so the Hero keeps only its back cut. A column of three or more
small wells puts the middle ones away from every outer wall (scoops still work; wall cuts don't).
The variant search rejects a columns tray whose cuts can't be placed, as it does today.

### What `realize.ts` and friends need

- `src/sizing/types.ts`: `arrangement: "strip" | "rows2" | "columns"`, plus `columnBreaks`.
- `src/sizing/arrange.ts`: `columnBreaks(compartments)`, the greedy rule above, unit-tested.
- `src/sizing/variants.ts`: add `"columns"` to `ARRANGEMENTS` (only when it makes at least one
  column of two or more; otherwise it equals `strip`).
- `src/sizing/outer.ts` `minLayoutU`/`rowsOf`: a column's width is its widest compartment, its
  depth the sum plus dividers; tray inner width is the columns' widths plus dividers.
- `src/sizing/realize.ts` `layoutAt`: today it places rows (Y) and items along each row (X). Columns
  are the same pass with the axes swapped per group: columns along X, items along Y inside each.
  The cleanest route is a second small placement function sharing `fillCapped`, the wall-absorb
  and `oneWall` handling; transposing the part and reusing `layoutAt` was considered, but feature
  sides (cuts, scoops, spacer axis) would all need rotating and back, which is riskier.
  `wallCutouts`/`CutWalls` need per-column front/back walls (today: per-row left/right).
- `src/sizing/growth.ts` / `src/layout/context.ts` `partGrowthCapU`: caps per column.
- Tests: arrange, realize, the variants snapshot, the property test over arrangements
  (`property.test.ts` checks `rows2`), the kit seed refreshed.

**Cost: L** (new placement path, cut walls, growth caps, the variant search, property tests).
**Versions:** app MINOR; `GEOMETRY_VERSION` PATCH (a new optional tray shape; stored plans stay
valid, and no schema change: arrangement is not stored).

## 4. Recommendation

1. **Build (a) as A1 now** (S, −51 % filament and print time per kit tray with the tray unchanged).
   It fixes what the owner saw without a new control, and it helps every group, whatever its
   arrangement.
2. **Then decide on (b)** with (a) in hand: it is L, it saves width more than plastic once (a) is in
   (131 g vs 176 g per tray, −25 % more), and its value depends on the box having a use for the
   freed strip. Worth it if narrower kit trays matter for fitting other things; otherwise defer.
3. Height fill as a follow-up question, not in the first cut.

## 5. Questions for the owner

1. (a): A1 (always, no control) or A2 (a "Fill its tray" choice)?
2. (a): length/width only, or deepen small wells to the tray's deepest floor too?
3. (b): build `columns` now, after (a), or not at all?
