# Groups, Copies, turn-only lock and flat-deck dividers (0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship app 0.7.0: groups as real things in the project (rail card, editor, drag and
keyboard moves), "Copies" in place of "Per player", a Turn that doesn't pin, and removable
dividers for flat decks. All four file-format changes land in one schema bump (0.2.0) with one
migration.

**Architecture:** `Project.groups: Group[]` with `memberIds` (spec §3.1). Members stay in
`components`. One migration (`"0.1"` → `"0.2.0"`) in `MIGRATIONS` turns text `groupId` and
`perPlayer` into groups and `copies`. The engine builds one requirement per group in member
order, one tray per copy, and splits only when no single tray fits. It reuses the items' split
term from 0.5.3. A new lock kind `turn` fixes a tray's rotation without pinning it. Cards get
`flatDecks: "dividers"`: one flat well, with removable dividers between the decks. The UI follows
boards G1–G4. Phases are internal: nothing ships until the final task.

**Tech Stack:** Vite, TypeScript, Preact 11 with signals, Vitest, Playwright (screenshot
harness `npm run shots`), manifold in a worker.

**Spec:** [docs/superpowers/specs/2026-10-18-groups-design.md](../specs/2026-10-18-groups-design.md)
(read it whole; section numbers below are its own). Boards: `docs/design/boards/GroupRail.dc.html`
(G1), `GroupEdit.dc.html` (G2), `GroupAdd.dc.html` (G3), `MobileGroup.dc.html` (G4), PNGs in
`docs/design/boards/png/`. Binding owner decisions are in the SDD ledger
(`.superpowers/sdd/2026-10-19-groups-copies/progress.md`, which is git-ignored; the build session copies it in
from the plan worktree) and in "Rulings" below.

---

## Before you start: what 0.5.3 and 0.6.0 must have delivered

This plan is written against main at 4acf786 (0.5.2). Building starts after **0.5.3** (engine
and editor fixes) and **0.6.0** (layout and phone) are both merged. Task 0 checks each item
below against the merged code. Wherever a name differs, it records the real name in the ledger
and the later tasks use that name. If an item is missing, stop and ask the controller.

| From  | What                                                                                                                                                                                                                                               | Used by        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 0.5.3 | **Score term "keep an item in one tray unless it can't fit"**: a precomputed `wholeFits[req]` (or equivalent) in `src/layout/context.ts` and a per-requirement split penalty in `src/layout/score.ts` (spec §6.3 calls it `split`, weight 300 000) | Task 4         |
| 0.5.3 | **Score term "keep split trays of one item in one stack"** (~2 000 000 per extra stack, above `coverage`, below overflow)                                                                                                                          | Task 4         |
| 0.5.3 | **Lock resolver fix**: a shared tray key (`:p0:0`) maps to the right variant in `resolveLocks` (`src/layout/locks.ts`); stack-lock height check                                                                                                    | Task 5         |
| 0.5.3 | **DESIGN rule "a control stays where it first appeared"** and the Decks home fix in `CardsEditor.tsx`; blocked-with-reason rows (dividers, spacer plates)                                                                                          | Tasks 12, 13   |
| 0.5.3 | Auto storage: up to 8 variants **per storage option** (`MAX_VARIANTS` meaning, `src/sizing/variants.ts`)                                                                                                                                           | Task 3         |
| 0.6.0 | **Resizable rail** 300–480 px, remembered per browser (owner answer C); its token/pref names                                                                                                                                                       | Tasks 8, 9, 14 |
| 0.6.0 | **The wider plan** (plan box no longer capped at 582 px); the `planWidth`/`minPlanWidth` harness checks it changed                                                                                                                                 | Tasks 8, 10    |
| 0.6.0 | **The phone sheet** as 0.6.0 left it (peek height, compact rows, sheet count): its component name and its compact-row line format (G4 shows "30 pieces")                                                                                           | Task 15        |
| 0.6.0 | The new `planWidth` / `minPlanWidth` values in `states.mjs`                                                                                                                                                                                        | Tasks 8, 10    |
| both  | `SCHEMA_VERSION` is still 0.1.16. If either made it 0.1.17, add that history fixture; the migration line "0.1" still covers it                                                                                                                     | Task 1         |
| 0.5.3 | The names of the blocked-row component and its reason text (dividers, spacer plates)                                                                                                                                                               | Tasks 12, 13   |

The groups half of "keep in one tray" and "keep split trays in one stack" for group copies are
this plan's work (Task 4). The items half is 0.5.3's work.

## Global Constraints

- App version **0.7.0** (`package.json`). The spec's "App version: MINOR (0.6.0)" was written
  before 0.6.0 was taken by the layout release. Ruling R1.
- `SCHEMA_VERSION` **0.2.0** (`src/model/version.ts`). This is the only schema bump in the
  release. Every file-format change (groups, copies, the `turn` lock, `flatDecks`, `Group.growth`)
  goes into it, with **one** migration whose `from: "0.1"` and `to: "0.2.0"`.
- `GEOMETRY_VERSION`: no bump, unless flat dividers need slot spacing that the current slot
  feature can't express. Then it is a PATCH with a history paragraph (Task 6 decides, ruling R8).
- `BOUNDS.maxCopies` = 10 (renamed from `maxPlayers`). Copies is 1–10, absent = 1.
- Group ids and migrated ids: 1–40 characters of `[A-Za-z0-9_-]`, unique across components and
  groups.
- Every visible string is a board literal or appears in `src/screens/copy-rulings.ts`
  (`copy.board.test.tsx`). Spec §8 lists the strings. The Words table rows in §8 go into DESIGN §2.
- No string uses a "Not" word from DESIGN §2 Words ("Per player", "players", "ungroup", "Remove from
  group", "lock" as a verb, "keep" in notes).
- `src/layout/` stays deterministic (seeded PRNG). Everything that crosses a worker stays
  structured-cloneable.
- Names (component and group) stay out of `inputsHash`. A project with no groups, no Copies > 1,
  no turn lock and no `flatDecks` hashes exactly as in 0.5.x/0.6.x.
- Pin conflicts are reported, never dropped (`lockConflicts`).
- Every UI task passes a screenshot gate at 1440 and 390 px, beside its board (DEVELOPMENT "UI
  work"). The reviewer answers three questions: does it match, what is extra, what is missing.
- Commit messages carry no `Co-Authored-By:` or any other trailer. Never use `pkill`.
- `npm run verify` is the gate before the PR (several minutes; run it in the background).

## Review Focus

1. **Opening an old file or autosave.** A 0.5.x/0.6.x project with text groups, per-player items,
   pins on group trays, or a stored "combined" plan opens. It shows the `schema.migrated` notice,
   keeps every pin, and shows the "Make a new plan" banner only where §5 says it should. Owned by
   Task 1, tests `migrates every history fixture` and `autosave from 0.6 opens through the
migration`.
2. **Copies lowered or an item moved while trays are pinned.** No pin silently points at nothing.
   Locks on keys that disappear are removed, and the toast counts them. Undo brings them back.
   Owned by Task 7, test `lowering copies drops the vanished copies' pins and says so`.
3. **A group too big for the bed, or whose member order blocks a finger cut.** It still prints,
   split and lettered ("Player kit 2a"), or without that cut and with the warning. It never shows
   a no-fit or vanishes. Owned by Task 3, test `a group that must split prints lettered parts in
every copy`, and Task 3, test `order-blocked cut keeps the tray and warns`.
4. **Turn on a tray inside a stack, then Pin (before the run ends), then Unpin.** Only the chosen
   tray is turned. The Pin agrees with the turn. The turn survives the unpin. Turn on a pinned stack
   flips the pins and keeps them. Owned by Task 5, tests
   `turn survives pin then unpin`, `pin after turn agrees` and `a turned tray may share a stack with any other`.
5. **Flat decks of different counts in one well with dividers.** The well is as high as the
   tallest stack. Every divider slot sits between two decks. Every deck, middle ones too, can be
   reached with a finger (R21). Switching back to Fixed walls gives the 0.6 layout (same hash).
   Owned by Task 6, test `flat decks of 12/30/12 share one well with 2 slots`.

---

## Rulings made while planning (the owner left these to the planner)

Each one is also a "Ruling:" line in the ledger. The owner's three answers from 2026-10-19 come
first (O1–O3). Rulings marked "(review)" were changed by the plan review
(`.superpowers/sdd/2026-10-19-groups-copies/plan-review.md`).

- **O1 (owner).** Flat decks: a choice "Between decks: Fixed walls / Removable dividers". Fixed
  walls is the default, so saved inserts don't change.
- **O2 (owner).** The group's Extra room ships later. The 0.2.0 format carries `Group.growth`
  (reader, writer, validation), but the row is not drawn and the engine ignores the field. G2's
  "Extra room" row is omitted with no placeholder.
- **O3 (owner).** The plan PR merges after 0.5.3 and 0.6.0, at the next patch above main.
- **R1.** App version 0.7.0. The spec's "0.6.0" predates the 0.6.0 layout release.
- **R2 (review).** Lock kind `{ kind: "turn"; trayKey: string; rotated: boolean }`. Turn writes
  **one** turn lock, on the chosen tray only, with `rotated: !current`, where current is the
  rotation of the tray's existing turn lock, else the tray's `rotated` in the plan. In the engine,
  every tray of a stack has its own rotation (`rotateItem`, `moves.ts:208-229`), so the trays the
  person didn't choose stay free. On a pinned stack, Turn also flips the stack's position locks
  as today (`turnLocks`, `dryRun.ts:42-73`). On a pinned stack only the chosen tray gets a turn
  lock.
- **R3.** Pin and Unpin never add or remove turn locks, so a turn survives an unpin.
  `toggleLock` (Pin) takes `rotated` from an existing turn lock on that tray, so a Pin written
  before the turned plan arrives still agrees. The rail rules chip "Turned" and its × ("Let
  <name> turn") remove that tray's turn lock in one undo step. "Clear all my choices" clears
  turn locks too, like every lock.
- **R4.** Old position locks with `rotated: true` (old Turns) stay position locks. The migration
  can't tell a Turn from a Pin, and keeping them is the safe reading.
- **R5 (review).** Engine: `ResolvedLocks` gains `turns: ReadonlyMap<partId, boolean>`. A
  turn-locked part is in `rotationFixed`, and every place that creates a `StackItem` honours the
  map: `completeTree` (`locks.ts:513-517`), the variant-change move (`moves.ts:190-196`), the
  greedy start and the warm start. A turn lock goes through `resolveLocks` step 1 like other
  locks, so **it also fixes its requirement's variant**, as a pin or size lock does, until the
  person lets it go. A turn conflict (kind `"turn"`) exists only when a position or size lock on
  **the same tray** disagrees with its turn lock. There is no rule about stacks. A turned tray may
  share a stack with any other. `LockConflict.kind` gains `"turn"`, and
  `store.unpin(trayKey, "turn")` removes it.
- **R6.** Tray bar wording: the Told line reads "Turned" (unpinned and turned), "Pinned, turned"
  (as today) or "Pinned". The Turn 90° button is unchanged.
- **R7 (review).** Field `CardsComponent.flatDecks?: "walls" | "dividers"`. Absent means walls.
  It is in `inputsHash` only when `"dividers"`. It acts only with 2 or more decks and when the
  storage chosen is flat (Flat, or Auto picking flat). One cards item has one card size, and its
  decks differ only in count (`types.ts:90-104`). The one well is `L + clearance` deep and as high
  as the tallest deck's stack. Its width is `Σ(S + clearance) + (decks − 1) × dividerSlotWidth`.
  It has `floorExtra: DIVIDER_GROOVE`, as divided upright wells have, and `decks − 1` **floor
  slots** (`dividerSlot`, `types.ts:240-243`, `realize.ts:208-222`) one centred in each gap between two decks.
  The decks are all the same width, so the existing even `slotCentres` already place them.
- **R8 (re-review).** No new slot field: the existing `slotCentres` places the slots. The
  geometry version follows DEVELOPMENT. If the printed mesh of any existing spec changes, it is a
  PATCH with a history paragraph. If only new specs use the feature, there is no bump. This matches
  the owner's "no version bump" for #1.
- **R9 (review).** The "Between decks" row lives in the Cards editor's basics, directly under
  Storage. It is shown whenever the item has 2 or more decks, so it never jumps (0.5.3's rule).
  With upright storage it is blocked with the reason "Only flat decks can share one well.". Under
  Auto it reads as it is set, and applies when Auto picks flat. 0.5.3's blocked "Removable
  dividers" row (dividers along an upright stack) keeps its own meaning. While Flat is chosen,
  its blocked reason reads "For flat decks, see Between decks." (a ruling string), so the two
  rows never offer one idea twice.
- **R10.** Screenshot gates use 0.6.0's default rail width and plan size. The boards predate
  0.6.0's widths (rail 300 px, plan 582 px), so a pair is judged on regions, order, proportions
  and what is present or absent, not on pixels. The plan's **arrangement** must still match
  (see R12).
- **R11.** G4's phone header (share icon, "Saved in this browser") is older than the 0.5.0
  rulings. The phone header stays as 0.6.0 left it. Only the sheet's group card is judged against
  G4.
- **R12 (review).** Harness seeds:
  - `harbour-kings-kit` is G1's project. The Player kit group has Copies 4 and access **"often"**
    (G2). Its members are Starter deck (12 cards), Resources (3 kinds, 30 pieces) and Hero
    (1 figure), in that order, followed by Market deck (80 cards, sleeved) and Hex tiles (24).
  - `make-seeds` asserts G1's arrangement: 1 layer, 6 trays, the four "Player kit 1…4" trays
    sharing one x, Market deck and Hex tiles in the other column. It tries search seeds until
    that holds and records the seed, as `planWidth` does for Main. If no seed gives it, stop and
    ask the controller.
  - `harbour-kings-kit-loose` holds the same five items with no group, in G3's list order. It is
    the seed for `kit-add`.
- **R13 (review).** Groups do **not** count toward `BOUNDS.maxComponents` (100), so no old
  100-item file is refused after migration. A separate `BOUNDS.maxGroups` = 100 applies, with
  `limit.groups` and "Too many groups (<n>); the maximum is 100.". The sheet count and "What's
  inside N" count items only (spec §7.8).
- **R14.** Drag and drop has no board. Its look (lifted row with `--shadow-sheet`, 2 px
  `--focus` line, `--focus-wash` on the group being entered) is judged against spec §7.3. Its gate
  is a Chromium probe in `shots.mjs` (`drag-into-group`), not a pair.
- **R15.** States with no board of their own name a `nearest` board:
  - the member's editor and Move to group… → Edit (`editor-more`);
  - Remove group… → G2;
  - the item's Copies row → G2's Copies;
  - the Turned chip → Main `workspace-rules`;
  - Between decks → Edit/EditKinds;
  - the split group → G1.
- **R16.** A membership or Copies edit drops turn locks on keys that disappear, as it does pins.
  The toast doesn't count them: "pin" is the only lock word the toast uses, and a gone tray has
  no rotation to keep.
- **R17 (review).** The rail rules note is worded by which locks exist. With pins or size locks
  the note is as today. With turns only it reads "Turned trays keep their direction when the plan
  updates.". With both it reads the pin sentence followed by that one. Each is a ruling string
  with a decision-log row.
- **R18 (review).** The migration keeps every pin. It reserves every safe group text as an id
  before it hands out any `group-<n>`. Where a group's id differs from its old text, it rewrites
  every lock key (`trayKey`, `trayKeys`) and every stored layout tray key that starts with
  `<old>:` to `<new>:`, spacers included.
- **R19 (review).** The migration strips `/ \(P\d+\)$/` from stored layout compartment
  `contents`. `contents` is not hashed, and this keeps a still-current per-player plan's packing
  guide free of " (P1)" (spec §7.7). An item with `perPlayer {players: 1}` becomes an item with no
  copies, so its plan goes stale ("Make a new plan"). This is accepted and noted in DESIGN.
- **R20 (review).** In the `harbour-kings-long` fixture, the "Crew" text group
  (`harbourKings.ts:187`) is removed, so the Main states (`workspace-long`) keep their boards. Group
  coverage lives in the kit seeds.
- **R21 (owner, 2026-10-19). Flat-deck finger access: one finger cut per deck, through the front
  wall, centred on each deck's section.** It uses the existing wall-cutout feature at a position,
  with no new plate geometry. The dividers are loose solid plates (`splitDividers`,
  `src/layout/dividers.ts:8-55`), so a side-wall channel would stop at the first one. The owner
  rejected notched plates (geometry PATCH) and low plates.

---

## What the boards don't show (and who owns it)

| Thing                                                                                                  | Decision                                             | Task      |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------- |
| G2's "Extra room" row                                                                                  | Omitted (O2), no placeholder                         | 11        |
| G4's phone header (share icon, "Saved in this browser")                                                | Not built; header as 0.6.0 (R11)                     | 15        |
| G3's "Tap a tray for details." hint above the plan                                                     | Only if 0.6.0's workspace still has it; not added    | 9         |
| A member's editor ("In <group>", the hidden Copies/access line, ink outline on own wells)              | Spec §7.5 strings; nearest board Edit                | 12        |
| Move to group… panel, New group, Take out of group                                                     | Spec §7.3; kit `MenuPanel` like the Add picker       | 12        |
| Remove group… confirm and its toast                                                                    | Spec §7.4; RowRemove's look                          | 11        |
| Item Copies row (old Per player)                                                                       | G2's Copies stepper and line                         | 12        |
| Drag in progress (lifted row, drop line, group being entered)                                          | Spec §7.3; probe gate (R14)                          | 14        |
| Live-region announcements                                                                              | Spec §7.9 strings; unit tests                        | 11, 14    |
| A split copy ("Player kit 2a") and the stage's " Too big for one tray, so it is split."                | Spec §6.6, §7.4; state `workspace-kit-split`         | 10        |
| The order-blocked finger cut warning                                                                   | Spec §6.5 sentence, in the existing notice placement | 3, 12     |
| Group trays in 3D (neutral body, untinted wells)                                                       | Spec §7.6; state `workspace-kit-3d` nearest Main 3D  | 10        |
| Download chips and packing guide rows for a group                                                      | Spec §7.6, §7.7; nearest Export boards               | 10        |
| Turned chip in the rail rules, "Turned" in the tray bar                                                | R3, R6; nearest Main `workspace-rules`               | 13        |
| "Between decks" row in the Cards editor                                                                | R9; nearest EditKinds/Edit                           | 13        |
| "Room around the pieces" (renamed "Extra room" row of items)                                           | Spec §8 rename                                       | 12        |
| Retired: "Per player", "Counts are per player", the Group text box, "Not available for grouped items." | Deleted; Task 16 greps for them                      | 12, 16    |
| Lock-removal toasts ("1 pin removed", "Size unlocked on <n> trays")                                    | Spec §7.3 strings                                    | 7, 11, 12 |
| Kit gallery (`kit` state) still drawing "Per player" (`Gallery.tsx:595`)                               | Becomes Copies                                       | 12        |
| `editor-more-changed` step that clicks `/^Extra room/` (`states.mjs:304`)                              | Step renamed to `/^Room around the pieces/`          | 12        |
| `App.groups.test.tsx`: a group tray "keeps the colour of the first" item                               | Rewritten to the neutral look                        | 10        |

## Board regions → owning task

| Board region                                                           | `data-region`           | Task                       |
| ---------------------------------------------------------------------- | ----------------------- | -------------------------- |
| G1 rail: group card (frame, header, ×4, "3 items · 4 trays")           | `rail` > `group-card`   | 9                          |
| G1 rail: member rows with grips                                        | `group-card` > `member` | 9 (grips drawn), 14 (drag) |
| G1 plan: neutral group trays, tinted wells, "Player kit 1…4" pills     | `plan`                  | 10                         |
| G1 tray bar: tiny-tray swatch, "<n> compartments", Edit → group        | `tray-bar`              | 10                         |
| G2 rail: group editor (title, Copies, access, Order in the tray, foot) | `rail` > `group-editor` | 11                         |
| G2 stage: sentence h1 "Player kit, 4 trays.", lifted trays             | `stage`                 | 11                         |
| G3 Add picker: six tiles, Group, 400 px panel                          | `kind-picker`           | 9                          |
| G3 rail: empty group card with the dashed drop area                    | `group-card`            | 9                          |
| G4 sheet: group frame, compact header, indented members                | `sheet` > `group-card`  | 15                         |
| G4 plan: neutral trays at phone size                                   | `plan`                  | 10 (look), 15 (gate)       |

## Harness: seeds and states

Task 8 adds them. Later tasks add steps to them as their screens appear.

| State                   | Board / nearest              | Seed                      | Viewport | Steps (summary)                                                                                                      | Task   |
| ----------------------- | ---------------------------- | ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| `kit-rail`              | GroupRail                    | `harbour-kings-kit`       | 1440     | select "Player kit 2" in the plan                                                                                    | 9, 10  |
| `kit-add`               | GroupAdd (rail and plan)     | `harbour-kings-kit-loose` | 1440     | Add → Group (focus on the new card)                                                                                  | 9      |
| `kit-picker`            | GroupAdd (picker region)     | `harbour-kings-kit-loose` | 1440     | Add open                                                                                                             | 9      |
| `kit-edit`              | GroupEdit                    | `harbour-kings-kit`       | 1440     | click the "Player kit" header                                                                                        | 11     |
| `m-kit`                 | MobileGroup                  | `harbour-kings-kit`       | 390      | open the sheet                                                                                                       | 15     |
| `kit-member`            | nearest Edit (`editor-more`) | `harbour-kings-kit`       | 1440     | open Hero; More options                                                                                              | 12     |
| `kit-move-panel`        | nearest Edit                 | `harbour-kings-kit`       | 1440     | open Market deck; Group row; Move to group…                                                                          | 12     |
| `kit-remove`            | nearest GroupEdit            | `harbour-kings-kit`       | 1440     | header; Remove group…                                                                                                | 11     |
| `workspace-kit-split`   | nearest GroupRail            | `harbour-kings-kit-split` | 1440     | none (Hero figure tall enough that a kit splits)                                                                     | 10     |
| `workspace-kit-3d`      | nearest Main 3D              | `harbour-kings-kit`       | 1440     | 3D; needsWebGL                                                                                                       | 10     |
| `kit-download`          | nearest Export               | `harbour-kings-kit`       | 1440     | Download                                                                                                             | 10     |
| `kit-packing-guide`     | nearest Export packing guide | `harbour-kings-kit`       | 1440     | Download; packing guide                                                                                              | 10     |
| `workspace-turned`      | nearest Main workspace-rules | `harbour-kings`           | 1440     | select Market deck; Turn 90°; wait for plan                                                                          | 13     |
| `editor-flat-decks`     | nearest EditKinds            | `harbour-kings-flat`      | 1440     | open Starter deck (3 decks, Flat)                                                                                    | 13     |
| `m-kit-edit`            | nearest MobileEdit           | `harbour-kings-kit`       | 390      | sheet; Player kit                                                                                                    | 11, 15 |
| `m-kit-member`          | nearest MobileEdit           | `harbour-kings-kit`       | 390      | sheet; Hero                                                                                                          | 12     |
| `m-turned`              | nearest MobileWorkspace      | `harbour-kings`           | 390      | select Market deck; Turn 90°                                                                                         | 13     |
| probe `drag-into-group` | spec §7.3                    | `harbour-kings-kit`       | 1440     | drag Market deck's grip between Starter deck and Resources; assert order, live region, one undo step; Escape cancels | 14     |

Seeds added to `make-seeds.mjs` (from fixtures in `src/test-support/harbourKings.ts`):
`harbour-kings-kit` and `harbour-kings-kit-loose` (R12), `harbour-kings-kit-split` (the kit with
the Hero tall or wide enough that one copy can't fit the bed; asserts the names "Player kit
1a"/"1b"), and `harbour-kings-flat` (a cards item with 3 flat decks of 12, 30 and 12 cards,
`flatDecks: "dividers"`). R20 removes the "Crew" group from the long fixture.

---

## File structure

| File                                                                                                      | Change                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/types.ts`                                                                                      | `Group`, `Project.groups?`, `ComponentBase.copies?` (drop `groupId`, `perPlayer`), `Lock` turn kind, `CardsComponent.flatDecks?` |
| `src/model/version.ts`                                                                                    | `SCHEMA_VERSION = "0.2.0"`                                                                                                       |
| `src/model/migrate-0.2.ts` (new)                                                                          | `migrateTo020(raw: Json): Json`: the one migration                                                                               |
| `src/model/schema.ts`                                                                                     | `MIGRATIONS = [{ from: "0.1", to: "0.2.0", migrate: migrateTo020 }]`; comment updated; `toSerializable` writes `groups`          |
| `src/model/schema-read.ts`, `schema-read-components.ts`                                                   | read `groups`, `copies`, turn locks, `flatDecks`; stop reading `groupId`, `perPlayer`                                            |
| `src/model/validate.ts`                                                                                   | spec §4.4 checks; turn lock; `flatDecks`; `maxCopies`                                                                            |
| `src/model/hash.ts`                                                                                       | spec §5 rules; turn locks hashed; `flatDecks` only when `"dividers"`                                                             |
| `src/model/groups.ts` (new)                                                                               | pure lookups: `groupOfItem`, `groupById`, `nextGroupName`, `requirementKeyOf`                                                    |
| `src/model/defaults.ts`                                                                                   | drop `groupOf`; `newGroup`                                                                                                       |
| `src/sizing/group.ts`, `variants.ts`, `types.ts`, `cards.ts`                                              | requirements from groups, copies, member order, keep-without-cut, flat one-well                                                  |
| `src/layout/context.ts`, `score.ts`                                                                       | split term covers groups; copies' parts in one stack                                                                             |
| `src/layout/locks.ts`, `moves.ts`                                                                         | turn lock                                                                                                                        |
| `src/sizing/realize.ts` (+ geometry if R8)                                                                | flat dividers' slots                                                                                                             |
| `src/app/actions.ts`, `dryRun.ts`, `store` unpin                                                          | group actions, Copies, turn, lock pruning                                                                                        |
| `src/instructions/naming.ts`                                                                              | group tray names, lettered splits                                                                                                |
| `src/ui/identity.ts`                                                                                      | `groupOfTray`, `traysOfGroup`, neutral group shade                                                                               |
| `src/screens/Rail.tsx`, `rail.css`, `KindPicker.tsx`                                                      | group card, empty card, sixth tile                                                                                               |
| `src/ui/components/GroupCard.tsx`, `GroupEditor.tsx`, `GroupRow.tsx`, `useRailDrag.ts` (new)              | card, editor, item editor's Group row, drag                                                                                      |
| `src/ui/components/CommonOptions.tsx`, `CardsEditor.tsx`, `EditorPanel.tsx`                               | Copies row, Group row, member changes, Between decks                                                                             |
| `src/plan/PlanView.tsx`, `plan.css`, `src/ui/TrayBar.tsx`, 3D shades, `ExportPanel.tsx`, `instructions/*` | neutral group look, names                                                                                                        |
| `src/screens/copy-rulings.ts`, `src/ui/copy.test.ts`                                                      | strings                                                                                                                          |
| `scripts/design/make-seeds.mjs`, `states.mjs`, `shots.mjs`, `src/test-support/harbourKings.ts`            | seeds, states, drag probe                                                                                                        |
| `test/fixtures/schema/0.2.0.json`, `test/fixtures/*.json`                                                 | new fixture; current fixtures to 0.2.0                                                                                           |
| `docs/DESIGN.md`, `docs/DEVELOPMENT.md`, `README.md`                                                      | Words, §5, §6 table, §7 rows, groups text                                                                                        |

---

## Phase 1: data and engine (no UI changes visible except where noted)

### Task 0: Rebase onto 0.5.3 + 0.6.0 and check the contracts

**Files:** none changed in product code. Ledger only.

- [ ] **Step 1:** Branch `claude/groups-copies` from `origin/main` after both releases merged.
      Confirm `package.json` is ≥ 0.6.0 and `git log` shows the 0.5.3 and 0.6.0 merges.
- [ ] **Step 2:** For each row of "Before you start", find the real symbol (`grep -n` in
      `src/layout/score.ts`, `context.ts`, `locks.ts`, `CardsEditor.tsx`, the rail CSS and prefs,
      `scripts/design/states.mjs`). Write one ledger line per row: `Contract: <row> = <file:symbol>`.
- [ ] **Step 3:** Run `npm test` and `npm run shots -- workspace m-workspace editor` on the base.
      Expected: all pass. The base is green before any change.
- [ ] **Step 4:** Copy the plan worktree's ledger
      (`.superpowers/sdd/2026-10-19-groups-copies/progress.md`) in and add `Task 0: BASE <sha>`.

### Task 1: Schema 0.2.0: types, the migration, reader, writer, fixtures

**Files:**

- Modify: `src/model/types.ts`, `src/model/version.ts`, `src/model/schema.ts`,
  `src/model/schema-read.ts`, `src/model/schema-read-components.ts`, `src/model/defaults.ts`
- Create: `src/model/migrate-0.2.ts`, `src/model/migrate-0.2.test.ts`,
  `test/fixtures/schema/0.2.0.json`, `src/model/groups.ts` (`mostFrequentAccess` moved from
  `src/sizing/group.ts`, `groupOfItem`, `copiesOf`; Task 2 adds the rest),
  `test/fixtures/legacy/` (generated, see Step 0)
- Modify: `test/fixtures/*.json` (to 0.2.0; `bits-heavy.json` rewritten in the new shape),
  `src/test-support/link.ts` (`encodeHash` carries `groups`), `src/test-support/sample.ts`,
  `src/test-support/harbourKings.ts` (any `groupId`/`perPlayer`)
- Test: `src/model/schema-versions.test.ts` (history fixtures), `schema.test.ts`, the new migration test

**Interfaces:**

- Produces (types.ts):
  ```ts
  export interface Group {
    id: string;
    name: string;
    copies?: number;
    access: Access;
    growth?: Partial<Record<"w" | "d" | "h", GrowthMode>>;
    memberIds: string[];
  }
  // Project: groups?: Group[]   ComponentBase: copies?: number (groupId, perPlayer removed)
  // Lock adds: | { kind: "turn"; trayKey: string; rotated: boolean }
  // CardsComponent adds: flatDecks?: "walls" | "dividers"
  ```
  `GrowthMode` is the existing per-axis growth value type (`off`, `auto`, number, `max`). Use its
  real name from `types.ts`.
- Produces: `migrateTo020(raw: Json): Json` (pure, deterministic, never throws on JSON
  objects). `newGroup(name: string): Group` in `defaults.ts` (Copies absent, access
  `"sometimes"`, `memberIds: []`, id from `newId`).

- [ ] **Step 0: Generate legacy fixtures with main's code, before any change** (M1 of the review:
      the history fixtures all carry group "setup" and `perPlayer`, and none has a stored layout).
      Write a small script (`scripts/make-legacy-fixtures.mjs`, run once, kept for reference) that
      uses the 0.6 code to save into `test/fixtures/legacy/`:
  - `per-player.json`: ungrouped, one item `perPlayer {players: 3}`, a stored layout, and a pin
    on `<id>:p1:0`;
  - `grouped-space.json`: a group text "Player kit" (with a space) of two members, a stored
    layout, a position pin and a stack pin on its trays;
  - `combined.json`: a stored layout whose variant is the combined one (`:pall:` keys);
  - `plain.json`: no groups and no per-player.
    Record each one's `inputsHash` in `test/fixtures/legacy/hashes.json`. Commit these first.
- [ ] **Step 1: Write the failing migration tests** (`migrate-0.2.test.ts`), one per spec §4.2
      rule, using small raw objects:
  - `text groups become groups in first-appearance order`: components `[a{groupId:"setup"},
b, c{groupId:"kit"}, d{groupId:"setup"}]` → `groups` ids `["setup","kit"]`, `setup.memberIds`
    `["a","d"]`, no component has `groupId`.
  - `unsafe text gets group-<n>`: `"my kit!"` → id `"group-1"`, name `"my kit!"`. A text equal to
    a component id → `"group-1"`. Two unsafe texts → `group-1`, `group-2`. An existing `group-1`
    id is skipped.
  - `empty groupId means no group`: `groupId: ""` → deleted, no group.
  - `group access is the members' most frequent`: members `often, often, setup` → `"often"`.
    Ties go the way `mostFrequentAccess` breaks them. Move `mostFrequentAccess` from `src/sizing/group.ts` to `src/model/groups.ts` (the model must not import sizing); sizing re-imports it.
  - `perPlayer becomes copies`: `{players:3}` → `copies: 3`; `{players:1}` → no `copies`.
  - `grouped perPlayer: the group takes the largest N`: members with players 2 and 4 → group
    `copies: 4`, members have neither field.
  - `combined plans go stale`: `layout.trays[*].key` containing `":pall:"` → `layout.inputsHash
=== ""`. Without one, `inputsHash` is unchanged.
  - `pins are kept`: every `locks` entry, including a `pall` key, is still there.
  - `renamed groups carry their pins` (R18): `grouped-space.json` → group id `group-1`. Its
    position and stack locks and its stored tray keys now start with `group-1:`.
  - `safe texts are reserved first`: an unsafe text appearing before a group whose text is
    literally "group-1" → the safe one keeps `group-1`, and the unsafe one gets `group-2`. The pins
    stay with their own groups.
  - `text equal to a member id` → `group-1`, with its keys rewritten.
  - `(P1) suffixes are stripped` (R19): `per-player.json`'s stored `contents` lose " (P1)".
  - `deterministic`: same input twice → deep-equal output. Input not mutated.
- [ ] **Step 2: Add history tests in `schema-versions.test.ts`:**
  - `migrates every history fixture`: each `test/fixtures/schema/0.1.*.json` parses `ok`, with
    exactly one `schema.migrated` notice and `schemaVersion === "0.2.0"`.
  - `0.1.16's group "setup"`: becomes group id `"setup"` with its two members in list order. The
    pin `setup:p0:0` is in `locks`. The `perPlayer` item has `copies`.
  - `0.2.0 fixture parses with no notices`, and it round-trips (`serializeProject` →
    `parseProject` deep-equal).
  - `autosave from 0.6 opens through the migration`: `parseStoredProject` on a 0.1.16 autosave
    object → ok, migrated.
  - `newer 0.2.x keeps unknown group fields` (a `groups[0].future: 1` is written back).
  - `a 0.2.0 file in a 0.1 app is refused` with the existing "Update the app to open it." text
    (`parseProject(raw, "0.1.16")`). This also covers the other-tab case: an old tab facing a
    0.2.0 save ends safely (`persistence.ts:425-445`, review L7).
  - The member-order case across groups lives in the new 0.2.0 fixture. `bits-heavy.json` has
    only `perPlayer` (review L9).
- [ ] **Step 3:** Run `npx vitest run src/model` → FAIL (no migration, no types).
- [ ] **Step 4: Implement.** `migrate-0.2.ts` per spec §4.2. `MIGRATIONS` gets the one entry,
      and its comment now says a 0.x MINOR also needs a migration (README rule). The readers read
      `groups` (with foreign-field preservation, like components), `copies`, the `turn` lock
      (`trayKey`, `rotated`) and `flatDecks`. `toSerializable` writes `groups` only when non-empty.
      `SCHEMA_VERSION = "0.2.0"`. Write `test/fixtures/schema/0.2.0.json` per spec §4.3, plus one
      `turn` lock and one cards item with `flatDecks: "dividers"`. Move the current-version fixtures
      to 0.2.0. Delete `groupOf` from `defaults.ts` and switch its callers to `groupOfItem`.
      **The branch stays green** (review H4): `validate.ts` (413-431, 768-786) checks `copies` in place
      of `perPlayer` and drops the `groupId` checks. Task 2 adds the group checks. Sizing reads
      groups through `groupOfItem` and `copiesOf`, so grouped fixtures still size as one bucket in
      list order (Task 3 adds member order). In `actions.ts`, `setGroup` is removed and
      `setPerPlayer` becomes `setCopies` on the item. In the UI, the Per player row reads `copies`
      (relabelled in Task 12) and the Group text box is removed (CommonOptions, moreSummary,
      optionNotes). Rewrite or delete the tests that use the removed fields: `App.groups.test.tsx`,
      editors/controls/changedOptions tests, the sizing group/index/property/realize/cutfit/grip/
      toggles/cutouts tests, validate/defaults tests, `harbourKings.test.ts:102`. Keep each test's
      intent, written in the new shape.
- [ ] **Step 5:** `npm test` (all) → PASS. `npm run typecheck` → PASS. **From here on, every
      task's gate is the full `npm test` + `npm run typecheck`, not one folder.**
- [ ] **Step 6: Commit** `0.7.0 task 1: schema 0.2.0 with groups, copies, turn locks and flat decks; one migration from 0.1`

### Task 2: Validation, hash and group lookups

**Files:**

- Modify: `src/model/groups.ts` (from Task 1); Create: `src/model/groups.test.ts`
- Modify: `src/model/validate.ts`, `src/model/validate.test.ts`, `src/model/hash.ts`,
  `src/model/hash.test.ts`, `src/ui/limits.ts` (`BOUNDS.maxPlayers` → `maxCopies`, in `validate.ts`)

**Interfaces:**

- Produces (`groups.ts`):
  `groupOfItem(p: Project, itemId: string): Group | undefined`;
  `groupById(p: Project, id: string): Group | undefined`;
  `requirementKeyOf(p: Project, c: Component): string` (group id, else item id; replaces
  `requirementKey` in `actions.ts`);
  `nextGroupName(p: Project): string` ("Group", then "Group 2", "Group 3" …);
  `copiesOf(p: Project, c: Component): number` (group's copies if grouped, else the item's, default 1).
- Produces: notice codes `limit.copies`, `field.copies`, `field.copiesInGroup`,
  `invalid.groupMember`, `invalid.group`, `field.turnLock` (if needed), `field.flatDecks`. The old
  `field.groupId` and `field.perPlayerInGroup` are removed.

- [ ] **Step 1: Failing tests** (`validate.test.ts`), each asserting code, path and exact message:
  - Copies 11 on an item → `limit.copies`, "Copies must be at most 10.". Copies 0 or 1.5 →
    `field.copies`, "Copies must be a whole number of at least 1.". The same on `/groups/0/copies`.
  - A grouped item with `copies` → `field.copiesInGroup`, "Copies are set on the group, Player kit."
  - A missing member id → `invalid.groupMember`, and `parseProject` refuses the file.
  - A foreign member (component kind unknown, from a newer 0.2.x) → no notice.
  - An item in two groups, a repeated member, a group id equal to a component id, a duplicate
    group id, a group id `"a:b"` → `invalid.group`.
  - 100 items + 3 groups → valid, because groups don't count toward `maxComponents` (R13). 101
    groups → `limit.groups`, "Too many groups (101); the maximum is 100.".
  - Group `growth` modes: `w: -1` → invalid. `off`, `auto`, `5`, `max` → valid (spec §4.4, review L5).
  - An empty group → valid.
  - A turn lock with an empty `trayKey` → invalid, as a position lock's is today.
  - `flatDecks: "sideways"` → `field.flatDecks`.
- [ ] **Step 2: Failing hash tests** (`hash.test.ts`):
  - `legacy hashes`: against `test/fixtures/legacy/hashes.json` (Task 1 Step 0), `plain` and
    `per-player` are equal after migration, and `grouped-space` differs.
  - `copies N hashes as perPlayer N`: an item with `copies: 3` hashes like the old
    `perPlayer: {players: 3}`. `copies: 1` hashes like no field.
  - `a grouped project gets a new hash`.
  - `empty groups, group names, group order and a member's hidden access don't change the hash`.
  - `member order, group copies, access and growth do`.
  - `a turn lock changes the hash; flatDecks "walls" doesn't; "dividers" does`.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: Implement** per spec §4.4 and §5. In `hash.ts`, map `copies` (N > 1) to the
      old key and shape before hashing, so a per-player project's hash string stays byte-identical.
      Drop empty groups, sort groups by id, strip `name`, and delete a grouped item's `access`.
      Hash `groups` only when one has a member.
- [ ] **Step 5:** Run `npx vitest run src/model` → PASS.
- [ ] **Step 6: Commit** `0.7.0 task 2: validation and inputsHash for groups, copies, turn locks and flat decks`

### Task 3: Sizing: requirements from groups, copies, member order, keep-without-cut

**Files:**

- Modify: `src/sizing/group.ts` (`sizeBuckets`, `requirementOf`, `size`, `withCuts`),
  `src/sizing/variants.ts` (`buildVariants`, `splitCandidates`, `separateCandidates`),
  `src/sizing/arrange.ts` (`rows2Order`, `cutsFirst`, `splitBlocks`), `src/sizing/types.ts` (`VariantInput.players` →
  `copies`; key comments)
- Test: `src/sizing/group.test.ts`, `variants.test.ts`, `arrange.test.ts`, `property.test.ts`,
  `cutfit.regression.test.ts`, `index.test.ts`

**Interfaces:**

- Consumes: `groupOfItem`, `copiesOf`, `requirementKeyOf` (Task 2). Also 0.5.3's per-storage
  variant cap.
- Produces: tray keys `<key>:p<c>:<part>`, with c from 0 to copies−1. Parts are numbered per copy
  from 0. The `pall` keys and `|combined` ids are gone. `TrayRequirement` for a group carries
  `memberIds` order and `access` from the group. A new warning `sizing.noFingerSlot` with path
  `/components/<i>` and the message "<member> has no finger cut here. Move it to the start of
  <group> for one.".

- [ ] **Step 1: Failing tests:**
  - `member order is the strip order`: group [Hero, Starter deck, Resources] → the strip
    compartments' `componentId`s are in that order, whatever `components` order is.
  - `cutsFirst stays inside a member`: two members with cut-along-row wells don't swap.
  - `rows2 keeps order as two contiguous runs`: the front run followed by the back run equals
    member order, and the wider row is the narrowest possible (property test over random widths).
  - `Copies 4 gives 4 copies keyed p0…p3`, identical arrangements.
  - `a group that must split prints lettered parts in every copy`: a copy too big for the bed →
    every copy has the same number of parts (`p0:0`, `p0:1`, `p1:0`, …), with no part beyond the
    bed. (The letters are Task 7's; this test checks the keys.)
  - `combined variants are gone`: no key contains `pall`, no id contains `|combined`.
  - `an empty group gives no requirement`. A group whose members are all invalid gives none.
  - `order-blocked cut keeps the tray and warns`: a deck member placed second with its cut along
    the row → the requirement has variants, that member's compartments have no `wallCutout`, and
    the notice is `sizing.noFingerSlot` with the exact sentence. Variants that give every cut
    rank first when any exist.
  - `ungrouped copies keep 0.6's whole-tray variants`: the split1 variants of a `copies: 3`
    item have the same keys (`p0:0`…`p2:0`) and arrangements as 0.6's per-player variants
    (snapshot from main). The new split2/3 variants are extra (review M7).
  - The "no finger slot" group notice names `the group "<name>"`, not the key.
- [ ] **Step 2:** Run `npx vitest run src/sizing` → FAIL.
- [ ] **Step 3: Implement** per spec §6.1, §6.2, §6.4, §6.5 (not Extra room, O2). In
      `splitBlocks`, prefer a cut between members when it is as good as the best cut (ties go to the
      member boundary).
- [ ] **Step 4:** Run `npx vitest run src/sizing src/layout` → PASS. The `optimize.calibrate`
      test is allowed to move only where its fixture has a group or per-player item. Record the
      before and after values in the ledger.
- [ ] **Step 5: Commit** `0.7.0 task 3: groups size as one requirement in member order; copies are separate trays that split only together`

### Task 4: Layout: groups stay whole; a group's copies keep their parts in one stack

**Depends on 0.5.3:** the items' `wholeFits` + split term, and the "split trays of one item in
one stack" term (Task 0's contract lines).

**Files:**

- Modify: `src/layout/context.ts`, `src/layout/score.ts` (only if 0.5.3's terms are keyed in a
  way that misses group requirements or copies)
- Test: `src/layout/score.test.ts`, a new `src/layout/groups.layout.test.ts`

- [ ] **Step 1: Failing tests:**
  - `a group that fits whole is never split`: the triage's "tokens" probe as a group (two bulk
    members that split2 used to separate) → the chosen variant is split1 for every copy.
  - `split is free when no whole variant fits`: the `harbour-kings-kit-split` project → each copy's
    parts are chosen, and there is no score penalty from the split term.
  - `a copy's parts share one stack when possible`: the same project → the parts of `p0` sit in
    one stack, as 0.5.3 does for an item's parts. The term counts per copy, not per requirement.
    Four copies in four stacks is not a penalty.
  - `stored 0.6 per-player plans stay current`: `test/fixtures/legacy/per-player.json` opens
    with a current plan (no banner), and `grouped-space` and `combined` open stale.
- [ ] **Step 2:** Run → FAIL where 0.5.3's terms treat all copies as one item's parts.
- [ ] **Step 3: Implement.** `wholeFits` is per requirement and per copy (all copies are the same).
      The split penalty is `(parts per copy − 1)` once per copy. The one-stack term groups parts by
      `<key>:p<c>`, not by `<key>`. Use 0.5.3's weights unchanged. Re-run the calibration fixtures
      and the triage probes, and record the scores in the ledger.
- [ ] **Step 4:** Run `npx vitest run src/layout` → PASS.
- [ ] **Step 5: Commit** `0.7.0 task 4: a group stays one tray per copy; a split copy keeps its parts in one stack`

### Task 5: The turn-only lock (engine and actions)

**Depends on 0.5.3:** the lock resolver fix.

**Files:**

- Modify: `src/layout/locks.ts` (`resolveLocks`, `conflictOf`, `rotationFixed`, start tree),
  `src/layout/moves.ts` (stacking compatibility), `src/app/dryRun.ts` (`turnLocks`, `canTurn`),
  `src/app/actions.ts` (`turnTray`, `toggleLock`, `unpinTrays`, new `freeTurn`), the store's
  `unpin`, `src/layout/types.ts` (`LockConflict.kind` adds `"turn"`)
- Test: `src/layout/locks.test.ts`, `src/app/dryRun.test.ts`, `src/app/actions.test.ts`

**Interfaces:**

- Produces: `turnLocks(p, trayKey): Lock[] | null` returns one turn lock on that tray (R2). On a
  pinned stack it also flips the stack's position locks. `freeTurn(p: Project, trayKey: string):
Project` removes that tray's turn lock (R3). `turnedKeys(p: Project): Set<string>`.
  `ResolvedLocks.turns: ReadonlyMap<number, boolean>` (part id → rotated) (R5).

- [ ] **Step 1: Failing tests:**
  - `turn does not pin`: `turnTray` on an unpinned tray in a 2-stack writes 1 turn lock (that
    tray only), with no position lock and no stack lock.
  - `turn on a pinned stack flips its pins` (today's behaviour, kept) and adds one turn lock.
  - `turn twice returns to the first rotation`: the second Turn flips the existing turn lock's
    `rotated`, not the stale plan's.
  - `pin after turn agrees`: Turn, then `toggleLock` on the same stored plan → the position
    lock's `rotated` equals the turn lock's, and `resolveLocks` reports no conflict.
  - `turn survives pin then unpin` (R3): turn, `toggleLock`, `unpinTrays` → the turn lock stays.
  - `freeTurn removes that tray's turn lock only`.
  - `a turn lock fixes rotation from the start`: with `turns` set, `completeTree`, the
    variant-change move, the greedy start and the warm start create that part with the locked
    rotation. A run over 50 seeds never places it otherwise.
  - `a turn lock fixes the variant` (R5), as other locks do.
  - `a turned tray may share a stack with any other`: there is no stack rule.
  - `a pin that disagrees with a turn on the same tray is a conflict` of kind `turn`, and
    `store.unpin(key, "turn")` clears it.
  - `canTurn` keeps its sentences and dry-runs the new locks.
  - `lockedKeys` (pins) does not include turned trays.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** R2–R5 in `locks.ts` (`resolveLocks` step 1, `rotationOf`,
      `completeTree`), `moves.ts` (the variant-change move), the greedy and warm starts,
      `dryRun.ts` and `actions.ts`. `moves.ts` gets no stacking rule.
- [ ] **Step 4:** Run `npx vitest run src/layout src/app` → PASS.
- [ ] **Step 5: Commit** `0.7.0 task 5: Turn fixes a tray's rotation without pinning it`

### Task 6: Flat decks in one well with removable dividers (engine)

**Files:**

- Modify: `src/sizing/cards.ts` (`deckCompartment`, flat branch), `src/model/defaults.ts` (`dividersOffered` stays for upright; new
  `flatDecksOffered(c: CardsComponent): boolean`, true with ≥ 2 decks), `src/sizing/realize.ts`
  (front cuts per section, R21), `src/geometry/version.ts` only per R8
- Test: `src/sizing/cards.test.ts`, `src/sizing/realize.test.ts`, `src/geometry/tray.cases.test.ts`

- [ ] **Step 1: Failing tests:**
  - `flat decks of 12/30/12 share one well with 2 slots`: one compartment.
    Its inner depth is `L + clearance`. Its inner width is `3 × (S + clearance) + 2 ×
dividerSlotWidth`. Its height is set by the 30-card stack. It has `floorExtra ===
DIVIDER_GROOVE`. It has two floor slots, each centred in the gap between two decks
    (`slotCentres`).
  - `every deck has finger access` (R21): three front-wall cuts, each centred on one deck's section and clear of the slots. The test also checks that the plates (`splitDividers`) leave each deck reachable.
  - `walls default unchanged`: the same item without `flatDecks` gives the 0.6 compartments
    (snapshot from main).
  - `auto picks flat → the one well`. With Auto picking upright, `flatDecks` is ignored.
  - `one deck → flatDecks ignored`.
  - The geometry case renders, and its divider plates fit their slots (the existing slot-fit
    check). Existing specs' meshes are byte-identical, which decides the R8 PATCH question.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** R7, R8 and R21.
- [ ] **Step 4:** Run `npx vitest run src/sizing src/geometry` → PASS.
- [ ] **Step 5: Commit** `0.7.0 task 6: flat decks can share one well with removable dividers`

### Task 7: Group actions, names, identity and the neutral look's data

**Files:**

- Modify: `src/app/actions.ts`, `src/instructions/naming.ts`, `src/ui/identity.ts`, the 3D shade
  table (`shadeHex` and the exported colours), `src/ui/copy.test.ts` (allow "unlocked" for "Size
  unlocked on <n> trays", with its DESIGN decision-log row: review L4)
- Test: `src/app/actions.test.ts`, `src/instructions/naming.test.ts`, `src/ui/identity.test.ts`

**Interfaces (all pure, `Project → Project` or lookups; each UI edit is one `store.edit`):**

- `addGroup(p): { project: Project; groupId: string }`: an empty group named `nextGroupName(p)`,
  Copies 1, access sometimes, at the end of `groups`.
- `newGroupWith(p, itemId): { project; groupId }`: inherits the item's Copies and access (spec §7.3).
- `moveToGroup(p, itemId, groupId, index): EditResult`, `takeOutOfGroup(p, itemId): EditResult`,
  `orderMember(p, groupId, itemId, index): Project`, `removeGroup(p, groupId): EditResult`,
  `setCopies(p, itemId, n): EditResult`, `setGroupCopies(p, groupId, n): EditResult`,
  `setGroupAccess`, `renameGroup`.
- `EditResult = { project: Project; notes: string[] }`: notes in spec §8 words, in order. The
  Copies note comes first ("Hero now has the group's 4 copies.", "Hero is out of Player kit.",
  "Player kit removed. Its items are back in the list."), then the lock notes ("1 pin removed",
  "3 pins removed", "Size unlocked on 2 trays").
- `removeComponent` also prunes `memberIds` (spec §4.4).
- naming: `trayNames` gives a group's trays "<group> <c+1>" (or "<group>" with one copy). A split
  copy gets "<group> <c+1>a/b/c", or "<group> a/b" with one copy. An unnamed group is "Group".
  Short names follow the same stem.
- identity: `groupOfTray(tray, p): Group | undefined`, `traysOfGroup(p, groupId): TraySpec[]`,
  `GROUP_SHADE` light and dark (line at 3:1 or more on `--box`).

- [ ] **Step 1: Failing tests:**
  - Copies follow the pieces: `takeOutOfGroup` from ×4 → item `copies: 4`, its old `access` back.
    `removeGroup` gives every member the group's Copies. `moveToGroup` removes the item's
    `copies` and its note says the change only when the number changes.
  - `lowering copies drops the vanished copies' pins and says so`: a group ×4 with pins on `p2`
    and `p3` → `setGroupCopies(…, 2)` drops both and returns "2 pins removed". A stack lock keeps
    the rest while two or more trays remain.
  - Lock pruning on move in, move out, removing a group, and the last member leaving (spec §7.3).
    Size locks give "Size unlocked on <n> trays". Turn locks on gone keys are dropped too, with
    no note (R16).
  - `removeComponent` prunes membership in the same step.
  - `orderMember` moves, at both ends, and with an out-of-range index clamped.
  - naming: "Player kit 1"…"4"; "Player kit 2a"/"2b"; "Player kit a"/"b" with one copy;
    "Group"; ungrouped trays unchanged (snapshot).
  - identity: `groupOfTray` by key stem; `traysOfGroup` lists all copies; the contrast test for
    `GROUP_SHADE`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Delete `setGroup`, `setPerPlayer` and `perPlayerInGroup` here (their
      UI callers were removed in Task 1).
- [ ] **Step 4:** Run `npx vitest run src/app src/instructions src/ui/identity.test.ts` → PASS.
- [ ] **Step 5: Commit** `0.7.0 task 7: group actions that say what they change; group tray names; group identity`

### Task 8: Harness: seeds, states and the drag probe skeleton

**Depends on 0.6.0:** the rail width and the plan size checks in `states.mjs`.

**Files:** `src/test-support/harbourKings.ts` (`harbourKingsKit`, `harbourKingsKitSplit`,
`harbourKingsFlat`), `scripts/design/make-seeds.mjs`, `scripts/design/states.mjs`,
`scripts/design/shots.mjs` (`PROBES['drag-into-group']`, failing until Task 14),
`docs/design/seeds/*.json`

- [ ] **Step 1:** Add the fixtures (R12): `harbourKingsKit`, `harbourKingsKitLoose`,
      `harbourKingsKitSplit` and `harbourKingsFlat`. Remove "Crew" from the long fixture (R20).
      `make-seeds` asserts G1's arrangement for the kit (R12), the split seed's "Player kit 1a", and
      the flat seed's single well.
- [ ] **Step 2:** `npm run seeds` → the three new seed files are written, and the older seeds are
      byte-identical except where a fixture changed under Task 1's migration (list them in the ledger).
- [ ] **Step 3:** Add every state from "Harness: seeds and states" with its board or `nearest`.
      States whose screen doesn't exist yet are listed in the ledger as "expected to fail until
      Task N".
- [ ] **Step 4:** `npm run shots -- kit-rail kit-add kit-edit m-kit` → the board side renders. The
      app side shows today's UI, which is the expected gap.
- [ ] **Step 5: Commit** `0.7.0 task 8: seeds and screenshot states for groups, turns and flat decks`
- [ ] **Step 6: STOP — owner checkpoint (end of phase 1, review L8).** Send the owner the plans of
      `harbour-kings-kit`, `harbour-kings-kit-split` and `harbour-kings-flat`, and a before/after of
      `test/fixtures/legacy/grouped-space.json`'s plan (0.6 vs now), rendered with the 0.6 UI (the
      top view shows the trays). Wait for a nod before Task 9.

---

## Phase 2: groups in the UI

Carry into every UI task brief: the task's boards (open the PNG and the `.dc.html`), the rows of
"What the boards don't show" and "Board regions" it owns, R10, `data-region` on its regions,
its `states.mjs` steps, and the copy rulings for each new string.

### Task 9: The rail's group card, the empty card and Add → Group (G1, G3)

**Boards:** G1 (`GroupRail`), G3 (`GroupAdd`). **Depends on 0.6.0:** the resizable rail. The
card fills the rail at every width from 300 to 480 px.

**Files:** Create `src/ui/components/GroupCard.tsx`, `GroupCard.test.tsx`. Modify
`src/screens/Rail.tsx`, `rail.css`, `src/screens/KindPicker.tsx`, the kit (`GroupGlyph`,
`GripIcon`, inline SVG), `src/ui/components/ComponentList.tsx` (list order with cards),
`src/screens/copy-rulings.ts`.

**Interfaces:** `GroupCard({ group, members, trays, pressed, onEdit, onEditItem, onLight })`.
`railEntries(p): ({ kind: "item"; id } | { kind: "group"; id })[]`, a pure function. A card
stands at its first member's list place. Empty groups go at the end in `groups` order.

- [ ] **Step 1: Failing tests** (`GroupCard.test.tsx`, `Rail.test.tsx`, `railEntries` unit tests):
      `railEntries` order (first member's place; empty groups at the end; moving an item in doesn't
      change `components`). The header's accessible name is "Player kit, 4 copies" / "Group, empty".
      The line reads "3 items · 4 trays", "Empty", or "Doesn't fit" when `misfitOf` names a group tray;
      layer words appear on the header only. Member rows open the item's editor. The header is pressed
      when a group tray is selected. Hovering or focusing the header or a member lights every group
      tray. A rules chip × lifts that rule from every group tray in one undo step. The empty card shows
      "Drag items here, or use Move to group… in an item.". Add shows six tiles, the first visit
      five. Picking Group → `addGroup`, the picker closes, and focus moves to the new header (one undo
      step; the plan is not stale).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement layout first** (frame, header, members, empty area) from G1 and G3's
      tokens (`--row`, `--rule`, `--r-card`, 4 px inset, 36 px `--icon-ground` tile, `--muted`
      "×4", the pressed 1.5 px `--muted-strong` edge on `--sheet`). Then the behaviour. The grips are
      drawn, `aria-hidden`, not tab stops. Dragging is Task 14.
- [ ] **Step 4:** Run the tests → PASS. `npm run shots -- kit-rail kit-add kit-picker
workspace-long m-workspace m-kit`. At 390 the sheet shows the card in its unstyled pre-Task-15
      form; that is recorded in the gate, not judged.
- [ ] **Step 5: Screenshot gate.** Put `kit-rail.pair.png` beside G1, `kit-add.pair.png` beside
      G3 (rail and plan), and `kit-picker.pair.png` beside G3 (picker). A reviewer answers: does it match, what is extra, what is missing.
      The plan side of `kit-rail` is Task 10's and is not judged here.
- [ ] **Step 6: Commit** `0.7.0 task 9: groups in the rail as framed cards; Add makes a group`
- [ ] **Step 7: STOP — owner checkpoint (the rail card).** Send the owner `kit-rail.pair.png`,
      `kit-add.pair.png` and a running app link or instructions. Wait for a nod before Task 10. Log
      `CHECKPOINT G1: …` in the ledger.

### Task 10: Group trays in the plan, tray bar, 3D, Download and the packing guide (G1)

**Boards:** G1 plan and tray bar; nearest Main 3D and the Export boards. **Depends on 0.6.0:** the
wider plan. Tile look and proportions are judged against G1, not its pixel size (R10).

**Files:** `src/plan/PlanView.tsx`, `plan.css`, `src/plan/tileText.ts`, `src/ui/TrayBar.tsx`,
`trayBar.css`, the 3D view's shade use, `src/ui/ExportPanel.tsx`, `src/instructions/render.ts`,
`AssemblyPage.tsx`, `src/screens/EditorStage.tsx` (stage sentence for split trays).

- [ ] **Step 1: Failing tests:** A group tray tile has `--sheet` ground, a 2 px `--muted-strong`
      line and a `--muted-strong` pill. Each cell uses its member's kind fill and a 1.5 px kind line,
      and ungrouped tiles are unchanged (snapshot). Selecting "Player kit 2" selects one tray and
      lights four. The tray bar shows the tiny-tray swatch (members' colours in order), "Player kit 2",
      "<W> × <D> × <H> mm · <n> compartments · about <h> h, <g> g" (assert the format, not G1's
      numbers), and Edit calls `onEditGroup`. The download file names use "Player kit 1"…
      (review L5). `App.groups.test.tsx`'s colour test is rewritten to the neutral look. The 3D body uses `GROUP_SHADE` with untinted wells. Download chips use the
      neutral swatch. Packing-guide rows read "Player kit 1"…"4", "Holds" in tray order, no " (P1)".
      A split copy's stage sentence adds " Too big for one tray, so it is split.".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run → PASS. Then `npm run shots -- kit-rail workspace-kit-split
workspace-kit-3d kit-download kit-packing-guide workspace m-kit m-download`.
- [ ] **Step 5: Screenshot gate:** `kit-rail` beside G1 (plan and tray bar), `m-kit` beside G4
      (plan region only), and the nearest-board states against their boards' regions. Three
      questions per pair.
- [ ] **Step 6: Commit** `0.7.0 task 10: group trays are neutral with tinted wells, named Player kit 1–4 everywhere`

### Task 11: The group editor and Remove group (G2)

**Boards:** G2 (`GroupEdit`). **Omitted:** the Extra room row (O2).

**Files:** Create `src/ui/components/GroupEditor.tsx`, `GroupEditor.test.tsx`. Modify
`EditorPanel.tsx` (open a group or an item), `EditorStage.tsx` (lift group trays with a
`--muted-strong` ring), `RemovedToast.tsx` (a group's removal), the rail live region,
`copy-rulings.ts`.

- [ ] **Step 1: Failing tests:** The back link "What's inside". "Group" over the editable name.
      Copies `Stepper` 1–10 with "Each copy is its own tray.". The access segment Often / Sometimes /
      Only at setup. "Order in the tray" `ol` with grip, swatch, name button (opens the item; its
      back link reads "Player kit" and returns here), "Move Hero up" and "Move Hero down" buttons
      (44 px). At an end the button stays focusable, with `aria-disabled` and the title "Hero is
      already last.". Focus stays on the pressed button as the row moves. Announcements: "Hero is now
      after Starter deck.", "Hero is now first.". No "Extra room" text anywhere. Remove group… asks
      "Remove the group “Player kit”? Its 3 items stay, with 4 copies each." → Remove group gives
      one undo step and the toast "Player kit removed. Its items are back in the list." plus the lock
      notes, with "Undo removal". The stage h1 is "Player kit, 4 trays." and the group trays are
      lifted, the rest dimmed. The Layer switch works as in the item editor (review L5). The editor
      opens from the card header, the tray bar's Edit, the status heading's "Edit Player kit", and a
      member's "Edit Player kit".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement layout first from G2**, then the behaviour.
- [ ] **Step 4:** Run → PASS. `npm run shots -- kit-edit kit-remove m-kit-edit`.
- [ ] **Step 5: Screenshot gate:** `kit-edit` beside G2 (rail and stage), and `m-kit-edit` beside
      MobileEdit (nearest). The only allowed
      difference is the missing Extra room row (O2). Say so in the review.
- [ ] **Step 6: Commit** `0.7.0 task 11: the group editor: copies, reach, order in the tray, remove`

### Task 12: Item editors: Copies, the Group row, a member's editor, Room around the pieces

**Boards:** nearest Edit (`editor-more`); G2's Copies for the stepper.

**Files:** Create `src/ui/components/GroupRow.tsx`, `GroupRow.test.tsx`. Modify
`CommonOptions.tsx`, `moreSummary.ts`, `optionNotes.ts`, `EditorPanel.tsx`, `EditorStage.tsx`
(the member's own wells get a 2 px ink outline), `copy-rulings.ts`, `src/ui/copy.test.ts`
(allow "unlocked", with a DESIGN decision-log row).

- [ ] **Step 1: Failing tests:** An ungrouped item shows "Copies" (Stepper 1–10, "Each copy is its
      own tray."). There is no "Per player" and no "Counts are per player". The Group row's closed
      line is "None" or the group name. Open: "Move to group…" lists groups by name with "×N", then
      "New group". "New group" → `newGroupWith`, with no Copies note. Moving into a group with a
      different count → the toast "Market deck now has the group's 4 copies.". In a group: "In Player
      kit", "Edit Player kit", "Take out of group" → "Hero is out of Player kit.". A member's editor
      shows "In Player kit" under the name (opens the group). Copies and access are not drawn, and
      the line "Copies and how often you reach for it are set on Player kit." is. The item clearance
      row reads "Room around the pieces". The order-blocked cut warning shows with the existing
      notice placement. A member's own wells get the 2 px ink outline on the stage (review L5). The
      kit gallery shows Copies, not Per player. The `editor-more-changed` state's step clicks
      `/^Room around the pieces/`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Respect 0.5.3's "a control stays where it first appeared" rule: the
      Group row keeps its place whether open or closed, and the Copies row doesn't move when the
      item joins a group (its slot shows the line instead).
- [ ] **Step 4:** Run → PASS. `npm run shots -- kit-member kit-move-panel editor editor-more
editor-more-changed kit kit-phone m-edit m-kit-member`.
- [ ] **Step 5: Screenshot gate** against Edit (nearest). Extra text beyond spec §8's list fails.
- [ ] **Step 6: Commit** `0.7.0 task 12: Copies replaces Per player; items move in and out of groups from their editor`

### Task 13: Turned in the UI; Between decks in the Cards editor

**Boards:** nearest Main `workspace-rules` and `workspace-tray`; nearest EditKinds / Edit.

**Files:** `src/ui/TrayBar.tsx` (`Told`), `src/screens/Rail.tsx` (rules chips), the rules note
(`Rail.tsx:55`), `src/ui/components/CardsEditor.tsx`, `copy-rulings.ts`, DESIGN §6 table (Turn
row).

- [ ] **Step 1: Failing tests:** Turn 90° on an unpinned tray → the tray bar reads "Turned" and the
      Pin button still reads "Pin". The rules show a "Turned" chip whose × is named "Let Market deck
      turn" and calls `freeTurn`. The rules note follows R17 (turns only: "Turned trays keep their
      direction when the plan updates."). While Flat is chosen, 0.5.3's blocked "Removable
      dividers" row gives the reason "For flat decks, see Between decks." (R9). A turn conflict
      shows in the status heading with "Let <name> turn" as its action (the existing conflict path
      with kind `turn`). The Cards editor with 2+ decks shows "Between decks" under Storage, with
      "Fixed walls" / "Removable dividers". With upright storage it is blocked with "Only flat decks
      can share one well.". With one deck it is absent. It doesn't move when storage changes.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run → PASS. `npm run shots -- workspace-turned editor-flat-decks
workspace-rules editor-tokens m-turned m-edit`.
- [ ] **Step 5: Screenshot gate** against the nearest boards.
- [ ] **Step 6: Commit** `0.7.0 task 13: Turn shows as Turned and can be let go; flat decks can share a well`

### Task 14: Drag and drop in the rail

**Boards:** none (R14); spec §7.3. **Depends on 0.6.0:** the resizable rail (the drag must not
start a rail resize, and the resize handle must not start a drag).

**Files:** Create `src/ui/components/useRailDrag.ts`, `useRailDrag.test.ts`. Modify
`GroupCard.tsx`, `Rail.tsx`, `rail.css`, `scripts/design/shots.mjs` (complete
`drag-into-group`).

**Interfaces:** `useRailDrag({ entries, onDrop })`, where `onDrop` is
`(itemId, target: { groupId: string; index: number } | { out: true })`. It uses pointer events,
starts after 4 px of movement on a grip, and Escape cancels. A drop outside the list cancels. It
auto-scrolls near the edges, with no animation under reduced motion.

- [ ] **Step 1: Failing tests:** The pure hit-test function returns the target: between two
      members of any group, on an empty group's area, or anywhere else meaning out. An ungrouped
      item dropped among ungrouped rows → no change. Each drop is one undo step and is announced
      ("Hero moved to Player kit.", "Hero is out of Player kit."). 3 px of movement doesn't start a
      drag. Escape restores. The grip on an ungrouped row shows on hover and focus-within only.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run → PASS. `npm run shots -- kit-rail` with the `drag-into-group` probe →
      PASS. Prove the probe by a deliberate break (comment out `onDrop`, see it fail, restore).
- [ ] **Step 5: Gate:** the probe passes, and a reviewer views the probe's mid-drag screenshot
      against spec §7.3's look.
- [ ] **Step 6: Commit** `0.7.0 task 14: drag items into, out of and within groups`

### Task 15: Phone (G4)

**Boards:** G4 (`MobileGroup`); nearest MobileEdit. **Depends on 0.6.0:** the phone sheet as it
left it.

**Files:** the sheet's list (`WhatsInside.tsx` or 0.6.0's equivalent), `rail.css` phone rules,
`GroupEditor.tsx` in MobileEdit's sheet, the Move to group… panel over the sheet.

- [ ] **Step 1: Failing tests:** The sheet shows the group frame, a compact header (14 px neutral
      swatch, name, "×4", "3 items" on the right) and indented member rows with a 2 px `--rule` line.
      There are no grips. The header opens the group editor in the sheet, a member opens its own. The
      count "What's inside 5" counts items. Move to group… opens over the sheet. Up and Down work in
      the sheet's group editor.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run → PASS. `npm run shots -- m-kit m-kit-edit m-workspace m-edit`.
- [ ] **Step 5: Screenshot gate:** `m-kit` beside G4 (sheet region; R11 for the header).
- [ ] **Step 6: Commit** `0.7.0 task 15: groups on the phone`

### Task 16: Removal sweep, docs, version, verify, final review

**Files:** `docs/DESIGN.md` (§2 Words rows from spec §8; §2 Data and versions sentence from spec §5;
§5 rail, editor, phone sheet; §6 table rows for Copies, Groups, Turn and flat decks; §7 decision log
rows for spec §12 calls and R1–R21), `docs/DEVELOPMENT.md` (the migration recipe: a 0.x MINOR
needs a `MIGRATIONS` entry), `README.md` (groups and Copies in "What the app does"; the
`MIGRATIONS` note in "How to add a kind of item"), `package.json` → **0.7.0**.

- [ ] **Step 1: Sweep.** `grep -rnw "perPlayer\|groupId\|maxPlayers\|setGroup\|setPerPlayer\|groupOf\|perPlayerInGroup\|pall" src scripts`
      and `grep -rn "Per player\|Counts are per player\||combined" src` → only `migrate-0.2.ts`, its
      tests, `scripts/make-legacy-fixtures.mjs` and the fixtures match. Allowed hits elsewhere:
      `"combined"` as the 3MF kind (`ExportPanel.tsx`) and `groupIds` in `locks.ts` (a local name).
- [ ] **Step 2:** Update the docs (list above) in the same commit as any code they describe that
      is still uncommitted.
- [ ] **Step 3:** `npm run verify` (background) → PASS. `npm run shots` (all states) → PASS,
      including the jump checks.
- [ ] **Step 4: Final review** (Opus, whole branch): spec coverage, the Review Focus list, and
      "If every task passed, does each screen look like its board?" answered with the pairs.
      Fix rounds as needed.
- [ ] **Step 5: STOP — owner checkpoint before the PR.** Send the owner the G1–G4 pairs, the
      `workspace-turned` and `editor-flat-decks` shots, and a short list of rulings made during the
      build. Wait for a nod.
- [ ] **Step 6:** Commit `0.7.0: groups, Copies, a Turn that doesn't pin, and flat decks in one
well`. Push and open the PR. Merge when CI is green (standing permission).

---

## Self-review notes (planner)

- Spec coverage: §3 → T1. §4 → T1, T2. §5 → T2, T4. §6.1–6.4 → T3, T4. §6.5 → T3 (Extra room
  deferred, O2). §6.6 → T3, T7. §6.7 → T7. §7.1–7.2 → T9. §7.3 → T7, T12, T14. §7.4 → T11.
  §7.5 → T12. §7.6–7.7 → T10. §7.8 → T15. §7.9 → T11, T14. §8 → T9–T13, T16. §9 → T16. §11 → in
  each task.
- Out of the spec but in scope: the turn lock (T5, T13) and flat dividers (T6, T13), both in the
  one schema bump (T1).
