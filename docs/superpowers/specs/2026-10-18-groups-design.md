# Groups: design

Date: 2026-10-18. Branch `claude/groups-spec`, cut from `main` at e635f7f (0.5.1). Design only: no
product code changes here.

Inputs: the owner's "Groups brainstorm decisions" and "Owner answers" (A) at the end of
`.superpowers/sdd/2026-10-16-ui-rebuild/progress.md`; the triage of points 13, 17 and clusters A and
D in `.superpowers/sdd/2026-10-16-ui-rebuild/feedback-0.5.0-triage.md`; the code as of 0.5.1;
`docs/DESIGN.md`; `docs/DEVELOPMENT.md` ("UI work").

Boards (in `docs/design/boards/`, PNGs in `png/`, canvas row "Groups"):

| Board                 | Size     | What it shows                                                                                   |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `GroupRail.dc.html`   | 1440×900 | G1: "Player kit ×4" as a framed card in the rail; the plan's "Player kit 1…4"; the tray bar     |
| `GroupEdit.dc.html`   | 1440×900 | G2: the group editor in the rail; the stage with the group's trays lifted                       |
| `GroupAdd.dc.html`    | 1440×900 | G3: the Add picker with Group as a sixth choice; a new, empty group card at the end of the list |
| `MobileGroup.dc.html` | 390×844  | G4: the phone sheet, opened, with a group card                                                  |

Section 12 lists every call in this document that the owner did not make.

## 1. Intent and why

In the owner's words: **a group is a context you add items into.** Player kits are one use, not
the definition. A group is a set of items that share one tray: mixed kinds are fine, and the tray
is laid out in the order the person puts the items in.

Why now. Groups today look broken (triage point 17) and can't do the one thing people most want
from them (point 13):

1. A group is a free-text `groupId` typed under More options. Nothing lists existing groups,
   nothing shows which rows share a tray, and a typo silently makes a second group.
2. The layout is free to split a group's members into separate trays, and in every probed case it
   did: a group had no visible effect.
3. "Per player" is refused inside a group (`src/model/validate.ts:428`), so a player kit (a deck, a
   few tokens and a figure, once per player) can't be made at all.
4. A tray's identity was its first compartment's item only, so a second member had no tray anywhere
   (fixed in 0.5.1 by `componentIdsOfTray` / `sharingTrayWith`; Edit still opens the first item).

The redesign makes a group a real thing in the project, with its own name, Copies and editor, and
makes the engine keep it in one tray.

## 2. Goals, non-goals, anti-goals

**Goals**

- A person can make a group (Add → Group), put items into it and take them out, by dragging or from
  the item's editor, and remove the group without losing its items.
- A group is one tray. It is printed as several only when no single tray fits (owner answer A).
- "Copies" replaces "Per player" everywhere, for items and groups. Copies always means that many
  identical, separate trays.
- The order of a group's members is the order of the compartments in its tray.
- A group's trays are named after the group ("Player kit 1" … "Player kit 4") in the plan, the 3D
  view, the tray bar, the download list, the packing guide and the engraving; Edit on any of them
  opens the group.
- Every saved project, file and old link keeps opening, with its groups and per-player items
  carried over.
- Reordering works from the keyboard and with a single pointer, and is announced.

**Non-goals** (not built, not drawn, no placeholder)

- Groups inside groups (nesting).
- Free placement of compartments inside a tray (drag a well to a spot, rows of my choosing). Member
  order is the only layout control.
- Per-tray pins inside a stack (pin one copy without its stack): that is Phase 3's layer lock.
- "Keep it next to" between separate trays: Phase 3.
- Reordering the ungrouped rows of the rail.
- Drag and drop on a phone.

**Anti-goals** (things this design must never do)

- A group that silently splits. If a group is printed as several trays, the reason is that one tray
  can't fit, and the plan says so in the tray names ("Player kit 1a", §6.6) and in the stage
  sentence.
- Settings that appear to work but are ignored. A member's own Copies and "How often you reach for
  it" are hidden while it is in a group and replaced by one line saying where they are set (§7.5).
  The group's "Extra room" is not shown until the engine honours it (§6.5).
- Silent changes to the number of pieces. Moving an item in or out of a group, or removing a group,
  never changes how many of each piece the insert holds without saying so (§7.5, §7.6).
- A second meaning for an existing word (§8).

## 3. The model

### 3.1 Shape: a `groups` table, not a container component

```ts
// src/model/types.ts
export interface Group {
  id: string; // same alphabet and namespace as component ids (newId); never equal to one
  name: string; // the tray name; "" shows as "Group"
  copies?: number; // 1..10; absent = 1
  access: Access; // "How often you reach for it"
  growth?: Partial<Record<"w" | "d" | "h", GrowthMode>>; // "Extra room"; absent = none
  memberIds: string[]; // component ids, in compartment order
}

export interface Project {
  // …unchanged…
  components: Component[];
  groups?: Group[]; // absent = []
  locks: Lock[];
}

export interface ComponentBase {
  // groupId and perPlayer are gone
  copies?: number; // 1..10, absent = 1; only on an item that is in no group
  // …everything else unchanged…
}
```

Chosen over a container component (`{ kind: "group", members: Component[] }` inside
`components`) because:

- Every reader of `components` stays as it is: validation paths (`/components/<i>/…`), error
  focus in the editors, `shadeIndexOf` (colour by place among items of a kind), foreign components
  from newer files, `inputsHash`, the link reader, `componentIdsOfTray`, the seeds. A container
  would move every member to `/components/<i>/members/<j>` and change every one of those.
- Moving an item in or out of a group is a change to `memberIds` only. The item object, its id and
  its colour are untouched, so its compartments' `componentId` and its pins' tray keys stay valid.
- Nesting is impossible by construction: `memberIds` name components, never groups.

The cost is referential checks, which validation does (§4.4).

### 3.2 What a member keeps, what the group owns

From the owner's decision, against the full option inventory of `ComponentBase` and the kinds:

| Option                                                      | Field                                        | While in a group                                                     |
| ----------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Name                                                        | `name`                                       | Member: names its compartments ("Holds" in the packing guide)        |
| Contents (cards and decks, pieces, tiles, figures, size)    | kind fields                                  | Member                                                               |
| Storage (cards stand, tiles stand, figures pockets or bulk) | `storage`                                    | Member                                                               |
| Sleeves, card thickness                                     | `sleeve`, `thickness`                        | Member                                                               |
| Room around the pieces                                      | `clearance`                                  | Member                                                               |
| Finger cuts, curved floor (scoop), corner reliefs           | `fingerCuts`, `curvedFloor`, `cornerReliefs` | Member                                                               |
| Spacer plates, removable dividers                           | `separators`, `dividers`                     | Member                                                               |
| Room for more of its own contents                           | `growth` (`stack`, or `w`/`d`/`h` of a bin)  | Member                                                               |
| How often you reach for it                                  | `access`                                     | **Group's** `access`. The member's value is kept, hidden, and unused |
| Copies                                                      | `copies`                                     | **Group's** `copies`. A member has none (validation error, §4.4)     |
| Extra room for the whole tray                               | (new)                                        | **Group's** `growth` (§6.5)                                          |
| Tray name, engraved name                                    | derived                                      | **Group's** `name` (§6.6)                                            |
| Pin, Turn 90°, Swap, Lock size                              | `locks` by tray key                          | Act on the group's tray (its stack, as today)                        |

The member's own `access` is kept so that taking it out of the group gives back what it had. It
is not in `inputsHash` while the item is grouped (§5.4).

### 3.3 Copies

`copies` is N identical, separate trays, each holding one copy of everything the item (or the
group) lists. The counts an item states are per copy, as "Per player" counts were. Copies is
always separate: there is no "combined" mode any more (§6.4).

## 4. Schema

### 4.1 Version

`SCHEMA_VERSION` goes from 0.1.16 to **0.2.0**. Per the README, while MAJOR is 0 an additive change
is a PATCH and a breaking one is a MINOR with a migration in `MIGRATIONS`. This change removes two
fields (`groupId`, `perPlayer`), so it is a MINOR. It is also the safer choice: as a PATCH, app
0.5.x would open a 0.1.17 file as a "newer minor", keep `groups` and `copies` as unknown fields,
and lay the insert out with no groups and one copy of everything: a setting that appears to work
but is ignored. As 0.2.0 it says "Update the app to open it."

This is the first entry in `MIGRATIONS` (`src/model/schema.ts`). Its comment ("Empty before 1.0")
is updated: the README rule already asks for a migration on a 0.x MINOR.

App version: MINOR (0.6.0). Geometry: no change unless the spare well of §6.5 needs one (a PATCH).

### 4.2 The migration, line "0.1" → "0.2.0"

A pure function on raw JSON, deterministic, run by `parseWith` before `readProject`:

1. **Text groups become real groups, in list order.** Walk `components` in order. Each distinct
   non-empty `groupId` (exact text, as `groupOf` compared it) becomes one group, in the order its
   text first appears. Its members are the components that carried it, in list order (the order
   `sizeBuckets` used). Then delete `groupId` from every component (an empty `groupId` meant no
   group and is just deleted).
   - `id`: the old text, if it is 1–40 characters of `[A-Za-z0-9_-]`, equals no component id and
     no earlier group id; otherwise `group-<n>` (n from 1, the first free one). Keeping the text
     keeps tray keys and pins: a pin on `setup:p0:0` still finds its tray (the 0.1.16 fixture has
     one).
   - `name`: the old text, trimmed.
   - `access`: the most frequent access among its members (`mostFrequentAccess`: what sizing used).
   - `copies`: absent, except as in rule 3.
   - `growth`: absent.
2. **`perPlayer: { players: N }` becomes `copies: N`** on an ungrouped item (absent when N is 1).
3. A grouped item with `perPlayer` was a validation error, but such a file may exist: the group
   takes the largest N among its members as its `copies`, and the members' `perPlayer` is deleted.
4. **Old combined plans go stale.** If the stored layout has a tray key containing `:pall:` (a
   "combined" per-player variant), set `layout.inputsHash` to `""` so it never matches: the plan
   banner offers "Make a new plan". **Migrated pins are kept** (controller's call): every lock,
   including those on `pall` keys, stays in `locks`. A pin that no longer fits the new plan is
   reported through the existing conflict path (`lockConflicts`, the status heading's "Unpin
   <name>"), never dropped by the migration or the reader.
5. `schemaVersion` becomes "0.2.0" (the migration loop sets it). The generic
   `schema.migrated` notice says the file was upgraded.

The reader (`schema-read.ts`, `schema-read-components.ts`) then reads `groups` (unknown fields kept
for a newer 0.2.x, as for components) and `copies`, and no longer reads `groupId` or `perPlayer`.

### 4.3 Fixtures

- `test/fixtures/schema/0.2.0.json`, new: two groups, one with Copies 4 whose member order differs
  from the list order and with `growth` set, one empty; an ungrouped item with Copies 3; a pin on a
  group's tray key. It must parse with no notices.
- The 0.1.x history files stay and must still load (through the migration). New tests over them:
  0.1.16's group "setup" becomes a group with id "setup" and its two members in list order, its pin
  `setup:p0:0` is kept, and its `perPlayer` item has `copies`.
- The current-version fixtures (`test/fixtures/*.json`, checked by "is at the current schema
  version") move to 0.2.0; `bits-heavy.json` uses `groupId` and `perPlayer` and is rewritten in the
  new shape.
- Migration unit tests: text-to-id rules (valid text, clashing text, odd characters), member
  order, the largest-N rule, `:pall:` staleness, an empty `groupId`.
- `src/test-support/link.ts`'s `encodeHash` (tests only) carries `groups`, so "decodes back from
  an old link" round-trips.

### 4.4 Validation

New checks in `validate.ts`, with notice codes in `VALIDATION_NOTICE_CODES`:

- `copies`: a whole number from 1 to `BOUNDS.maxCopies` (10, renamed from `maxPlayers`): "Copies
  must be at most 10." / "Copies must be a whole number of at least 1." (`limit.copies`,
  `field.copies`), on items and groups.
- A grouped item with `copies`: error `field.copiesInGroup`, "Copies are set on the group,
  <group name>."
- `memberIds` names a component that does not exist: error `invalid.groupMember` (file-level, it
  blocks opening, like other corrupt structure). A member that is a foreign component (from a newer
  0.2.x file) is not an error: it is kept and written back, and sizing leaves it out.
- An item in two groups, a repeated member, a group id equal to a component id or another group's
  id, or a group id with a character outside `[A-Za-z0-9_-]` (tray keys use `:`): error
  `invalid.group`.
- Group `growth` modes: as a component's (`off`, `auto`, a number ≥ 0, `max`).
- Groups count towards `BOUNDS.maxComponents` together with the items.
- An empty group is valid (it is not printed: §6.1).
- Deleting an item (Remove…) also removes its id from its group's `memberIds`, in the same undo
  step (`removeComponent` in `src/app/actions.ts`), so a dangling member can only come from a
  damaged file (controller's call).

## 5. inputsHash: what makes old plans stale

`inputsHash` (`src/model/hash.ts`) changes so that:

1. **Ungrouped items with Copies stay current.** An item's `copies: N` (N > 1) is hashed under
   the old name and shape, `perPlayer: { players: N }`, and `copies` 1 or absent adds nothing. A
   per-player plan made by 0.5.x (separate trays, keys `<id>:p<n>:0`) keeps its hash and stays
   current; the engine would lay the same thing out.
2. **Combined per-player plans go stale** through the migration's `inputsHash: ""` (§4.2, rule 4),
   not through the hash.
3. **Grouped plans go stale.** `groups` is hashed (without names: `withoutNames` already strips
   `name`) when it has at least one group, and members no longer carry `groupId`, so every project
   that had a group gets a new hash. This is wanted: most of those plans split the group into one
   tray per member (point 17), and "Make a new plan" is the fix.
4. A project with no groups and no Copies hashes exactly as before: nothing else moves.
5. Left out of the hash: group names (tray names only), **empty groups** (a group with no
   members is dropped before hashing, so adding one from Add never makes the plan stale), **the
   hidden fields of a grouped item** (its own `access`; it can't carry `copies`), and the order of
   `groups` in the array (sort by id before hashing). `groups` is hashed only when at least one
   group has a member. In the hash: `memberIds` order (it is the compartment order), `copies`,
   group `access`, group `growth` (controller's call on what is excluded).

DESIGN §2 "Data and versions" gets a sentence for rules 1 and 5.

## 6. Engine behaviour

### 6.1 Requirements

`sizeBuckets` (`src/sizing/group.ts`) builds one requirement per group and one per ungrouped item,
in the order each first appears in `components` (unchanged for migrated projects). A group's
members are taken in `memberIds` order, not list order. A group with no usable member (empty, or
every member invalid) has no requirement and prints nothing. `requirementOf` takes
`copies` from the group or the item, `access` from the group (`mostFrequentAccess` is only used by
the migration), and the key is the group id, as the text was before.

The "no finger slot" notice says `the group "<name>"`, not the key.

### 6.2 One tray per copy

`buildVariants` (`src/sizing/variants.ts`) with `copies = C`:

- Every variant has C copies of the same arrangement; copy c has tray keys `<key>:p<c>:<part>`
  (the existing `p<n>` tag, so 0.5.x per-player keys and pins still match). With C = 1 the tag is
  `p0`, as now.
- Each copy may be split into 1–3 parts (`MAX_SPLITS`), the same way in every copy:
  strip/rows2 × split1/2/3, at most 6 variants per storage option, still capped at
  `MAX_VARIANTS`. Today a per-player copy can never split, so a kit too big for the bed has no
  variant at all; now it splits when it must.
- Compartment contents no longer get " (P1)" suffixes: the tray name carries the copy (§6.6).

### 6.3 Split only when no single tray fits

The owner's answer A, for groups and items alike: keep a requirement in one tray (one per copy)
unless it can't fit.

- **Precompute** in the layout context (`src/layout/context.ts`) `wholeFits[req]`: true when some
  split1 variant of the requirement has a part whose minimum outer fits the printer bed (with its
  margin) in some orientation and whose minimum height fits under the top plane. This is the same
  test the "too big for your printer's bed" no-fit uses (`overBedKeys`).
- **Score term** `split` (`src/layout/score.ts`): for each requirement with `wholeFits`, the parts
  per copy minus one, of the variant the layout chose. Weight **300 000**: above a buried "often"
  tray (`access`, 200 000), `stacked` (50 000), a filler (40 000 in all) and the cohesion terms, so
  no packing preference ever buys a split; below `coverage` (500 000) and every hard-rule overflow,
  so a whole tray that cannot be placed still gives way to a split. A requirement with no fitting
  whole variant pays nothing for splitting.
- Variant order stays as is (split1 first), so the greedy start already prefers whole trays.
- Cost: S–M. No schema or geometry change; layouts change on the next run (stored plans stay
  current, §5).

`apart` and `unturned` still apply to the copies of one requirement, so copies prefer one
orientation and to sit together; nothing here changes that.

### 6.4 "Combined" per-player variants: removed

`splitCandidates`' `m: 1` mode (`pall` keys, `|combined` ids) is deleted. Copies always means
separate trays (owner). The reader never needs it: old combined plans go stale (§4.2) and are
re-planned. `VariantInput.players` becomes `copies`.

### 6.5 Member order drives compartment order

Today the order is lost twice: `cutsFirst` moves every compartment whose finger cut runs along the
row to the start of the row, and `rows2Order` assigns compartments to rows greedily by width.

The new rule, for a requirement's blocks (each member contributes its blocks in its own order, the
members in `memberIds` order):

- **strip:** the compartments stand in member order along the tray's width. `cutsFirst` applies
  inside one member's blocks only, never across members.
- **rows2:** the ordered list is cut once into two contiguous runs (front row first, then back row,
  each left to right as seen from the front of the unturned tray), at the cut that makes the wider
  row narrowest (the `splitBlocks` method on widths). No greedy reordering.
- **split** (only when the whole can't fit, §6.3): `splitBlocks` stays contiguous, and prefers cuts
  between members when one of those is as good as the best cut.
- **A finger cut that order blocks** (controller's call). If a member's compartment needs its cut
  along the row and member order puts it behind another member, the variant can't give it its cut
  (`cutFitError`). Order wins: sizing never reorders the members, and **the tray is never
  dropped**. A new "keep without cut" path in `size()` (`src/sizing/group.ts`): for a group, when
  `withCuts` would leave the requirement with no variant because of a member that order blocks,
  sizing keeps those variants and realizes them with that member's finger cuts off (its
  `wallCutout` features removed from those compartments only), instead of filtering them out or
  falling back to bins. `withCuts` therefore no longer removes a group's only variants. Variants
  that do give every cut still rank first. The notice is a warning (`sizing.noFingerSlot`, with
  the member's path), in the person's words: "Starter deck has no finger cut here. Move it to the
  start of Player kit for one." (§8). The order stays a promise, and the missing cut is said, not
  hidden.

**Group "Extra room"** (`Group.growth`, w/d/h, the owner's "extra width/length/height growth"): room
in the tray beyond what its members ask for, for things added later. Width and length become one
empty well (a `spare` compartment, the kind leftover trays already use) at the end of the strip,
up to the amount set (or as much as the layout leaves, for Max); height raises the tray (every well
deepens). Members' own growth is applied first; the group's comes on top. This is engine M
(`TrayRequirement` carries the extra, `fill.ts` gives it room, `realize.ts` draws the spare well).
**Until that work lands, the Extra room row is not shown** (DESIGN §3, "State engine limits
honestly"); the field may already exist in the schema.

### 6.6 Mixed kinds in one tray

- **Height:** the tray is as deep as its deepest compartment needs (as today for a group); every
  compartment's floor is at the tray floor unless the realizer raises it (unchanged).
- **Wells:** each member keeps its own compartment shapes and features (a card well with its cut,
  scoop bins, figure pockets). Nothing about a member's wells changes by being in a group.
- **Loose pieces:** a tray holding any loose member is loose (`loose`), as today.

**Names** (`trayNames`, `src/instructions/naming.ts`): a tray of a group is called by the group's
name, not "A + B + C". Copies are numbered in plan order, as several trays of one item are now:
"Player kit 1" … "Player kit 4". A group of one copy is "Player kit". A copy that had to split gets
a letter: "Player kit 2a", "Player kit 2b" (one copy split: "Player kit a", "Player kit b" — the
existing "<name> 1", "<name> 2" rule would collide with copy numbers). Short names follow the same
stem. An unnamed group is "Group".

### 6.7 Identity

`src/ui/identity.ts` gains `groupOfTray(tray, project)` (the group whose id is the tray key's stem,
else the one that holds its components) and `traysOfGroup`. Everything that today asks "which item
is this tray" asks "which group" first: the tray bar's Edit, the status heading's "Edit <name>",
the rail's pressed and lit rows, the editor's lift, the plan's look, the packing guide.

### 6.8 Large pieces of engine work

- Variants: copies with splits, member-order strip and rows2, combined removed (M).
- `split` score term and `wholeFits` (S–M), with calibration on the fixtures (the
  `optimize.calibrate` test) and the probes from the triage.
- Group Extra room as a spare well (M), shippable later.
- Migration, reader, validation and hash (M).
- Naming and identity for groups (S–M).

## 7. UI

Every screen follows its board. Strings not on a board are listed in §8 and need copy rulings in
`src/screens/copy-rulings.ts`.

### 7.1 The rail's group card (G1, look A)

- **Place in the list.** The rail lists `components` in order; a group's card stands where its
  first member (in list order) stands; an empty group stands at the end, in `groups` order. Moving
  an item into a group does not change `components` order (so no colour changes); the card may move
  up to the moved item's place, which reads as "the item became part of the group".
- **The card:** a frame (`--row` ground, 1 px `--rule`, `--r-card`, 4 px inside). Its first row is
  the header, a button that opens the group's editor: a 36 px neutral tile (`--icon-ground`,
  the box card's, with a `--muted-strong` glyph: a tray with two walls, the kit's new `GroupGlyph`), the name, "×4"
  in `--muted` when Copies > 1, and one line: "<n> items · <m> trays" ("· bottom layer" etc. added
  as on item rows when there are two layers or more; "Empty" for an empty group; "Doesn't fit" when
  `misfitOf` names one of its trays). Its accessible name: "Player kit, 4 copies".
- **Members inside, at full size:** the normal row (kind tile, name, what it holds), opening the
  item's editor, with a ⋮⋮ grip (the kit's new `GripIcon`, inline SVG, six dots; `--box-dash`) to
  its left. A member's line has no layer words: the header has them.
- **Pressed and lit:** choosing any of the group's trays presses the header (1.5 px `--muted-strong`
  edge, `--sheet` ground, G1). Pointing at or focusing the header or any member row lights every
  tray of the group, in the plan and in 3D.
- **Rules:** pins, turns and size locks on the group's trays show as chips beside the header (one
  per rule kind); a chip's × lifts that rule from every tray of the group, one undo step.
- **An empty group** (G3): the header ("Group" / "Empty") and under it a dashed drop area (`--line-strong`) with
  "Drag items here, or use Move to group… in an item." (13 px, `--muted`).

### 7.2 Add → Group (G3)

- The Add picker (`KindPicker`) gets a sixth tile, "Group", in a neutral tile with the group
  glyph. The six tiles are two columns of three, Something else no longer spans both; the panel is
  400 px wide and may overhang the stage (G3). The first visit keeps its five kinds: a group needs
  items first.
- Picking Group adds an empty group named "Group" ("Group 2", "Group 3" … if taken) at the end of
  the list, closes the picker and puts the focus on the new card's header. It does not open the
  group's editor: a group is made by putting items in it. One undo step. Its defaults are Copies 1
  and access "sometimes" (controller's call). Being empty, it changes nothing in the plan and is not
  in `inputsHash` (§5).

### 7.3 Moving items in and out

**By dragging** (desktop and tablet only; pointer events, no library):

- A grip is always shown on member rows; on ungrouped rows it shows on hover and on focus within the
  row. The drag starts on the grip only, after 4 px of movement; the row lifts (`--shadow-sheet`)
  and follows the pointer; Escape or a drop outside the list cancels; the list scrolls when the
  pointer nears its top or bottom edge.
- Drop targets: between two member rows of any group, or on an empty group's dashed area (into
  that group, at that place); anywhere else in the list (out of its group, back to its own list
  place). A 2 px `--focus` line shows the place; a group being entered takes `--focus-wash` and a
  dashed `--focus` edge.
- There is no reordering of ungrouped rows: dropping an ungrouped item between ungrouped rows does
  nothing.
- Each drop is one undo step through `store.edit` with a pure action
  (`moveToGroup(p, itemId, groupId, index)`, `takeOutOfGroup(p, itemId)`,
  `orderMember(p, groupId, itemId, index)` in `src/app/actions.ts`).

**From the item's editor:** the old "Group" text box under More options becomes the row "Group",
whose closed line is the group's name or "None". Opened:

- Not in a group: "Move to group…", which opens a small panel (the kit's `MenuPanel`, as the Add
  picker) listing each group by name (with "×N"), then "New group". "New group" makes a group named
  "Group" (or the next free "Group n") with this item as its only member. The new group inherits
  the item's Copies and its access (controller's call), so no pieces change and the tray reaches
  the same as before; no Copies note is shown.
- In a group: "In <group>" with "Edit <group>" (opens the group's editor) and "Take out of group".

**What happens to Copies and access** (anti-goal: no silent change to the number of pieces):

- Into a group: the item's own `copies` is removed, and it now has the group's. If the number
  changes, the editor's note (the stage slot's toast) says "<item> now has the group's <n> copies."
  (or "…the group's single copy."). Its own `access` is kept, hidden.
- Out of a group, by drag or "Take out of group": the item takes the group's Copies as its own (a
  member of "Player kit ×4" taken out becomes ×4), so no pieces vanish. Its own `access` comes back.
  Note: "<item> is out of <group>."

**What happens to pins and size locks** (controller's call). A change of membership changes tray
keys, so locks on keys that no longer exist would point at nothing. These edits drop the locks
whose tray keys disappear, in the same undo step: moving an item into a group or out of one (the
item's own keys, and for a group whose trays change, its keys), Remove group, lowering a group's or
an item's Copies (the keys of the copies that go: `p<c>` with c ≥ the new count), and the last
member leaving a group (all of its keys). A stack lock keeps the rest of its stack while two or
more trays remain, as `withoutKeys` in `src/app/actions.ts` already does. The undo step's toast
says what went, after its own note: "1 pin removed", "<n> pins removed", and for size locks "Size
unlocked on <n> trays" (§8). Undo brings the locks back with the membership. This is the only way
an edit removes a pin, and it is never silent (DESIGN §2 Flow).

### 7.4 The group editor (G2)

Opens from the card's header, the tray bar's Edit, the status heading's "Edit <name>", or "Edit
<group>" in a member's editor; it replaces the list as the item editor does (`EditorPanel`), on a
phone as MobileEdit's sheet. Top to bottom:

- Back link "What's inside".
- The group tile, "Group" over the name as an editable title (as the item editor's kind label over
  the name).
- **Copies**: the kit's `Stepper`, 1–10, with "Each copy is its own tray." under it.
- **How often you reach for it**: Often / Sometimes / Only at setup (the item editor's segment).
- **Order in the tray**: an `ol` in a frame; each member is a row: grip, its kind swatch, its name
  (a button that opens the item's editor; its back link then reads the group's name and returns
  here), "Move <name> up" and "Move <name> down" (44 px icon buttons, chevrons). The first's Up and
  the last's Down stay focusable with `aria-disabled` and a reason ("Hero is already last.").
  An empty group shows the dashed line of §7.1 instead.
- **Extra room** (a `DisclosureRow`, closed line "None" or what is set): Width, Length and Height,
  each None / A set amount / Max, with the amount field for a set amount. Shown only once the
  engine work of §6.5 lands.
- Foot: "Remove group…" (danger text button) and Done.

**Remove group…** asks in place, as Remove… does: "Remove the group “Player kit”? Its 3 items stay,
with 4 copies each." (the second clause only when Copies > 1), Remove group, Cancel. Removing gives
each member the group's Copies and takes it out of the group, then deletes the group; one undo
step; the note "Player kit removed. Its items are back in the list." (followed by "1 pin removed"
etc. when its trays had locks, §7.3) with "Undo removal" and Dismiss, in the same slot and style
as an item's removal.

**The stage** (G2): the stage sentence is the page's h1, in the existing forms: "<name> tray, <W> ×
<D> mm." for one tray, "<name>, <n> trays." for several ("Player kit, 4 trays."). The group's trays
are lifted (the editor's ring, in `--muted-strong` for a group), the rest dimmed. A tray split
because it can't fit adds " Too big for one tray, so it is split." (§8). The Layer switch behaves
as in the item editor.

### 7.5 A member's editor

The item editor, with three changes while the item is in a group:

- Under the name, the line "In <group>" as a link-button that opens the group's editor.
- Copies (formerly Per player) and "How often you reach for it" are not drawn. In their place, once,
  the line "Copies and how often you reach for it are set on <group>." Nothing hidden is ever
  silently used: the hidden `access` is not in the layout.
- The stage lifts the group's trays, and the member's own compartments get a 2 px ink outline, so
  the person sees which wells are theirs.

For an ungrouped item, the "Per player" row becomes "Copies" (the same `Stepper`, 1–10, "Each copy is
its own tray."), and "Counts are per player" is retired.

### 7.6 Plan, 3D and the tray bar

- **Tile look (G1):** a group's tray is neutral: `--sheet` ground, a 2 px `--muted-strong` line, the
  name pill in `--muted-strong`; each compartment is drawn in its member's kind fill with a 1.5 px
  line in the member's kind line, at its own place and size. A mixed tray has no single kind, so no
  kind hue stands for it; the cells say what is where. An ungrouped item's trays are unchanged.
- **Names:** "Player kit 1" … "Player kit 4" (§6.6), in the pill, the tray bar, the 3D pill, the
  download chips and file names, the packing guide and the engraving.
- **Selection:** a tile of a group selects that tray (one copy) and lights every copy; the tray bar
  (G1) shows a swatch drawn as a tiny tray with its members' colours in order, the name, and
  "<W> × <D> × <H> mm · <n> compartments · about <h> h, <g> g" (with the layer first when there are
  two). Pin, Turn 90°, More and Close act on that tray's stack, as for any tray. **Edit opens the
  group's editor.**
- **3D:** a group's tray body takes the neutral light colour (`shadeHex` gains a group entry;
  `--row`-like in light, the same in the exported colours). Compartments are not tinted in 3D.
- **Download dialog:** each tray chip of a group uses the neutral swatch.

### 7.7 The packing guide

Each copy is its own row, named "Player kit 1" … "Player kit 4" (with "Engraved as" when the short
name differs), its picture in the neutral look with tinted wells, and "Holds" listing its
compartments' contents in tray order (no " (P1)" suffixes). Nothing else changes.

### 7.8 Phone (G4)

- The sheet lists the group as a frame with a compact header row (neutral 14 px swatch, the name,
  "×4", "<n> items" on the right) and its members as compact rows indented under it with a 2 px
  `--rule` line on their left. The header opens the group's editor (MobileEdit's sheet), a member
  opens its own.
- No grips and no dragging. Ordering is the group editor's Up and Down; moving in and out is the
  item editor's "Move to group…" (its panel opens over the sheet, as Add's does) and "Take out of
  group".
- The sheet's count ("What's inside 5") counts items, not groups.
- The plan draws group trays in the neutral look with tinted cells (G4), at the phone's sizes.

### 7.9 Keyboard and accessibility

- The rail's grips are pointer conveniences: not tab stops, `aria-hidden`. The keyboard and
  single-pointer ways to do the same (WCAG 2.5.7) are the group editor's Move up / Move down and the
  item editor's Move to group… / Take out of group. This is ruled in DESIGN §7.
- Move up / Move down keep the focus on the pressed button as its row moves; at an end the focus
  stays and the button reads as blocked.
- Every move (button or drop) is announced in a polite live region in the rail, by names, never by
  position numbers: "Hero is now after Starter deck.", "Hero is now first.", "Hero moved to Player
  kit.", "Hero is out of Player kit."
- The card is a `role="group"` named "<name>, <n> copies" (or "<name>, empty"); its header button
  keeps the 44 px target and the focus ring; member rows keep theirs.
- The group editor's order list is an `ol` labelled by "Order in the tray".
- One h1 per screen still holds: the group editor's stage sentence is the h1, as the item editor's.

## 8. Words

Checked against DESIGN §2's Words table; none of these uses a "Not" word ("part" appears only
inside "compartments"; "keep" is avoided: "Its items stay").

**Table rows to add**

| Use                                                 | Not                                        |
| --------------------------------------------------- | ------------------------------------------ |
| Copies (items and groups); "×4" in a group's header | Per player, players, Counts are per player |
| Group (a set of items that share one tray)          | group id, bucket, kit (as a generic word)  |
| Take out of group                                   | Remove from group, ungroup                 |
| Room around the pieces (an item's `clearance` row)  | Extra room (now the group's tray room)     |

**Rename:** the item's `clearance` row is "Extra room" today (`CommonOptions.tsx`). The group's
whole-tray room is the owner's "extra width/length/height", drawn as "Extra room" on G2. One phrase
must not mean two things, so the item's row becomes "Room around the pieces" (it is a clearance
around the pieces, the same idea as Settings' "Room around trays and pieces").

**New ruled strings** (`copy-rulings.ts`; each a board literal or a ruling):

- Boards: "Group", "Copies", "Each copy is its own tray.", "Order in the tray", "Extra room",
  "None", "Remove group…", "Move <name> up", "Move <name> down", "<n> items · <m> trays",
  "Empty", "Drag items here, or use Move to group… in an item.", "×<n>", "<n> compartments",
  "Player kit, 4 trays." (the existing "<name>, <n> trays." form).
- Rulings (this document): "Move to group…", "New group", "In <group>", "Edit <group>",
  "Take out of group", "Copies and how often you reach for it are set on <group>.",
  "<item> now has the group's <n> copies.", "<item> now has the group's single copy.",
  "<item> is out of <group>.", "Remove the group “<name>”? Its <n> items stay, with <c> copies
  each.", "Remove group", "<name> removed. Its items are back in the list.", "<name> is already
  first.", "<name> is already last.", "<name> is now after <name>.", "<name> is now first.",
  "<name> moved to <group>.", "Too big for one tray, so it is split.",
  "<member> has no finger cut here. Move it to the start of <group> for one.", "1 pin removed",
  "<n> pins removed", "Size unlocked on <n> trays", "Copies are set on the group, <group>.", "Copies must be at most 10.", "Copies must
  be a whole number of at least 1.", "Room around the pieces", "Group <n>".
- Words-table check of the controller's strings: "<member> has no finger cut here…" uses "finger
  cut" (Settings' and the editor's word) and no retired word. "1 pin removed" / "<n> pins removed"
  use "pin" as the table asks (not "lock", "keep" or "let go"). "Size unlocked on <n> trays" is
  the size lock's own wording ("Unlock size", "size locked"); "unlocked" is not yet on the
  allow-list in `copy.test.ts`, so the builder adds it there with a decision-log row, as DESIGN §2
  requires.
- Retired: "Per player", "Counts are per player", "Not available for grouped items.", "Players",
  "e.g. tokens", "A grouped item can't be per player…", "Players must be…".

## 9. Engine limits and Phase 3 boundaries

- **§6 table** (DESIGN): "Per-player piles" becomes "Copies (items and groups): separate trays,
  split only when one can't fit". New row "Groups: one tray per copy, member order = compartment
  order; Extra room (empty well) — needs engine work until §6.5 lands". "Keep it next to" stays
  "Grouping merges into one tray; no adjacency" and stays Phase 3.
- **Pins inside a stack:** pinning a group's tray pins its stack, like any tray. Pinning one copy
  without the trays above or below it is Phase 3's layer lock; until then the chip's name says the
  stack, as today.
- **Free placement:** no "put Hero on the left" or rows of my choosing. Member order is the only
  control; strip or two rows is the engine's choice.
- **Fix suggestions:** a group that can't fit even split gets the existing no-fit heading and
  "Edit Player kit"; "try fewer copies" as an outcome-checked suggestion is Phase 3 (trial runs).
- **The split term is a preference, not a hard rule:** it outweighs everything but `coverage` and
  overflow. A case where staying whole costs a `coverage` violation splits the group; the tray names
  ("a"/"b") and the stage sentence say it.

## 10. What's left to the builder

- The exact `wholeFits` test (which margins, both bed orientations, lipped or not), and calibrating
  the 300 000 weight on the triage's probes (the "tokens" group, the flat three-deck item, 18b) and
  the optimizer calibration fixtures.
- The `rows2` cut and the member-boundary preference in `splitBlocks`, with property tests (order
  preserved, every compartment present).
- The spare-well mechanics of group Extra room (§6.5), and whether `realize.ts` needs a geometry
  PATCH; until then the row is hidden.
- Drag-and-drop internals: hit testing, auto-scroll speed, the lifted row's look in the kit,
  reduced-motion (no animation, a plain move).
- The neutral group colour in `identity.ts` (light and dark; 3:1 for the line on `--box`; a test in
  `identity.test.ts`) and in the 3D shades and exported colours.
- Seeds and screenshot states for the four boards (a "Harbour Kings" variant with a Player kit ×4)
  and `states.mjs` entries, then the usual pair review at 1440 and 390.
- Updating DESIGN (§2 Words, §5 rail, editor and phone sheet, §6 table, §7 rows for every call in
  §12) and README's description of groups, in the same commits as the code.
- Removing the old text-box code path, `setGroup`/`setPerPlayer`, `groupOf`, `perPlayerInGroup`.
- Plan the work in phases (controller's call). Phases are internal build steps: nothing is
  released between them, and groups ship together once the rail card works. (1) Schema, migration,
  validation, hash, Copies on items (replacing Per player), engine copies and the split term; the
  engine already reads groups here (key, copies, access, member order). A state where groups exist
  but can't be edited is acceptable on the branch only. (2) Groups in the engine (order, naming,
  identity, the keep-without-cut path) and the group editor. (3) The rail card and drag and drop:
  the release point. (4) Extra room, which may ship later, hidden until then (§6.5).

## 11. Testing notes

- Migration and fixtures as §4.3. Hash: a 0.1.16 ungrouped per-player project keeps its hash; a
  grouped one does not; a project with neither is unchanged (snapshot the hashes of every history
  fixture before and after).
- Sizing: member order is the strip order; Copies 4 gives 4 parts with keys `p0`…`p3`; a copy too
  big for the bed splits identically in every copy; an empty group gives no requirement.
- Layout: with `wholeFits`, the chosen variant is split1 on the triage probes; without it, splits
  are free.
- UI: the rail card, the editor's up/down with focus and announcements, Move to group… and Take out
  with the Copies notes, Remove group with undo, Edit from the tray bar opening the group, the
  phone sheet; `copy.test.ts` and the board copy check for every new string.

## 12. Calls made by the designer

Already marked as the designer's in the ledger:

1. Groups don't nest.
2. An item is in at most one group.
3. An empty group is not printed (and is valid, shown as "Empty").
4. Migration: text `groupId` becomes a real group in list order; `perPlayer` N becomes Copies N;
   old combined plans go stale.

Made in this document:

5. `groups: Group[]` with `memberIds`, not a container component (§3.1).
6. Schema 0.2.0 (MINOR, the first `MIGRATIONS` entry), not a PATCH (§4.1).
7. A migrated group keeps its old text as its id when it is safe, so pins on its trays survive
   (§4.2); a grouped `perPlayer` becomes the group's Copies, the largest N (§4.2 rule 3).
8. Per-player plans that were separate stay current (hashed under the old shape); grouped plans go
   stale (§5).
9. The split term weighs 300 000: above a buried "often" tray, below `coverage` (§6.3).
10. Member order wins over finger-cut placement; it is never fixed by reordering (§6.5). How a
    blocked cut is handled is call 25, the controller's.
11. rows2 keeps order by cutting the list into a front run and a back run (§6.5).
12. Group Extra room is an empty well (width, length) or a taller tray (height), on top of members'
    own growth, and is hidden until built (§6.5).
13. A split copy is lettered ("Player kit 2a"), so copy numbers never collide with part numbers
    (§6.6).
14. A group's tray is drawn neutral, each compartment in its member's kind colours (§7.6); 3D uses
    the neutral body only.
15. Rail order: a group card stands at its first member's place; an empty group at the end; no
    reordering of ungrouped rows (§7.1, §7.3).
16. Picking Group in Add makes an empty "Group" and focuses its card; it does not open the editor;
    the first visit keeps five kinds; the picker becomes 400 px wide (§7.2).
17. Copies follow the pieces: taking an item out, or removing the group, gives it the group's
    Copies; moving it in says when its number of copies changes (§7.3, §7.4).
18. A member's own access is kept hidden and restored on the way out; its Copies and access rows
    give way to one line naming the group (§3.2, §7.5).
19. Rail grips are pointer-only (not tab stops); the keyboard path is the editors' buttons;
    announcements use names, never positions (§7.9).
20. Member rows in the rail drop their layer words; the group header carries them (§7.1).
21. The item's clearance row is renamed "Room around the pieces" so "Extra room" has one meaning
    (§8).
22. A copy of a group selects alone but lights all copies; Edit on it opens the group (§7.6).

Made by the controller after the builder check (2026-10-18):

23. **Phases** are internal build steps; nothing is released between them, and groups ship together
    once the rail card (phase 3) works. A phase-1 branch state where groups exist but can't be
    edited is acceptable; phase 1 already reads groups in the engine (§10).
24. **New group defaults:** "New group" from an item inherits that item's Copies and access, so no
    pieces change; an empty group from Add is Copies 1, access "sometimes" (§7.2, §7.3).
25. **A finger cut blocked by member order** never drops the tray: a "keep without cut" path keeps
    the variant and prints it without that member's cut, so `withCuts` no longer removes a group's
    only variants; the warning reads "Starter deck has no finger cut here. Move it to the start of
    Player kit for one." (§6.5, §8).
26. **Locks when membership changes:** moving an item in or out, Remove group, lowering Copies and a
    group's last member leaving drop the locks whose keys disappear, and the undo step's toast says
    so ("1 pin removed"); deleting an item prunes it from its group's `memberIds`; migrated pins are
    kept and a pin that no longer fits is reported through the existing conflict path (§4.2, §4.4,
    §7.3).
27. **Hashing:** empty groups and a grouped item's hidden fields are left out of `inputsHash`, so
    adding an empty group doesn't make the plan stale (§5).
