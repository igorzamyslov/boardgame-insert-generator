# UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's UI with one built from the design boards, so that each screen looks and reads like its board. The engine stays untouched.

**Architecture:**

- Every screen is rebuilt from its board's markup, layout first, on a small kit of primitives taken from the boards.
- The new UI keeps the existing state layer (`src/app/state.ts`, `store.ts`, `actions.ts`) and the existing pure view logic (`src/ui/identity.ts`, `derived.ts`, `validation.ts`, `noticePlacement.ts`, `noFit.ts`, `historyKeys.ts`, `limits.ts`, `settingsFields.ts`, `src/plan/layers.ts`, `tileText.ts`, `glyph.ts`, `src/viewer/scene.ts`, `shades.ts`).
- Each task deletes the old UI it replaces. Removal is planned: see "What the boards don't show".
- Task 0 builds a screenshot harness. Every UI task ends with stacked board/app pairs, 1:1 region crops and a numbers report.

**Tech Stack:** Vite 8, TypeScript, Preact 11, @preact/signals, vitest + jsdom + @testing-library/preact. Playwright (new devDependency) for screenshots only.

**Spec and authority (in this order when they conflict):**

1. `docs/DESIGN.md` hard rules (§2), the Words table and the engine boundaries (§6).
2. The rulings in this plan and in the ledger (`.superpowers/sdd/2026-10-16-ui-rebuild/progress.md`).
3. The boards in `docs/design/boards/*.dc.html` (index: `canvas.json`): layout, look and copy.
4. The old app's copy.

- Original argument: `docs/superpowers/specs/2026-10-16-ux-redesign.md`. Why this plan exists: `docs/retros/2026-10-16-ux-redesign.md`. UI rules: `docs/DEVELOPMENT.md` → "UI work".

**How tasks run:**

- Tasks run strictly in order, one at a time. No parallel tasks. Almost every task touches `src/app/App.tsx` and the workspace CSS.
- Each task brief MUST carry: this plan's Global Constraints, the rows of "What the boards don't show" and "Board regions → owning task" that name the task, and the task itself. An implementer sees nothing else.
- Each screen task owns its screen at both widths (1440 and 390). Task 15 is a final pass for the tablet width and cross-cutting phone behaviour, not where the phone gets built.
- Per-task shots go to `.superpowers/sdd/2026-10-16-ui-rebuild/shots/` (gitignored). Only board PNGs, seeds and the final pairs (Task 17) are committed.

---

## What the boards don't show

Every existing feature or text that no board shows, with its fate and owning task. "§7 row" means the task adds a decision-log row to `docs/DESIGN.md` in the same commit.

| #   | Existing item                                                                                                                    | Fate                                                                                                                                                                                                                                                                                                                      | Task  |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Footer (version, build id, "Third-party licenses")                                                                               | Drop the footer. The last two items of the project menu become a muted line "Insert Generator 0.5.0 (<build id>)" and a link "Licences" (owner decision). §7 row replaces "Footer is version, build id and licences".                                                                                                     | 4     |
| 2   | Redo button                                                                                                                      | Desktop: kept beside Undo, as on EditKinds. Phone: a "Redo" item at the top of the project menu (the phone header shows Undo only). §7 row.                                                                                                                                                                               | 4     |
| 3   | Menu "Send file" (phone only)                                                                                                    | Leaves the menu. Phone header icon button "Send file" (MobileWorkspace) and a secondary button in the phone Download dialog (MobileDownload).                                                                                                                                                                             | 4, 13 |
| 4   | Menu "Delete…" and its confirmation                                                                                              | Leaves the menu. Delete stays per row in Your inserts, which already lists the open insert. §7 row.                                                                                                                                                                                                                       | 4     |
| 5   | Your inserts page (`InsertsList`) and its Delete confirmation                                                                    | Kept, as a page inside the menu panel. No board: judged against the Main menu panel.                                                                                                                                                                                                                                      | 4     |
| 6   | Menu notices (another tab, storage blocked or full) and the dot                                                                  | Kept, as the Main board's `menuNote` box inside the menu, with the dot on the menu button. Older geometry is NOT a menu note: it stays a plan banner (ruling).                                                                                                                                                            | 4     |
| 7   | Saved status states other than "Saved in this browser" and "Saving paused" (saving, failed, blocked)                             | Kept in the header's saved slot, same style, existing words.                                                                                                                                                                                                                                                              | 4     |
| 8   | Rename the insert in place                                                                                                       | Kept. The board's name button (name plus pencil) turns into an inline input; Enter commits, Escape reverts, blur trims (existing tests).                                                                                                                                                                                  | 4     |
| 9   | Numbered accordion (`Section.tsx`) and the section headings                                                                      | Deleted.                                                                                                                                                                                                                                                                                                                  | 5     |
| 10  | `AddKinds` buttons under the list                                                                                                | Replaced by the board's "Add" pill beside the h2, which opens a kind picker: a panel of five KindTiles (styled as Empty's), no board of its own.                                                                                                                                                                          | 5     |
| 11  | Any per-row control in the list other than rule chips                                                                            | Moves to the editor ("Remove…").                                                                                                                                                                                                                                                                                          | 5     |
| 12  | `ListNotices` (sizing notices in the list)                                                                                       | Routed to the stage notes slot with the layout notices; `ListNotices.tsx` deleted.                                                                                                                                                                                                                                        | 6     |
| 13  | Summary figures: slack, upper-bound filament, assumptions, longest part                                                          | Dropped. §7 row replaces "Summary sits below the plan…".                                                                                                                                                                                                                                                                  | 6     |
| 14  | Summary: filament and print time                                                                                                 | Moved to the Download dialog (first plainly in Task 6, as the board's stat tiles in Task 13).                                                                                                                                                                                                                             | 6, 13 |
| 15  | Summary: run announcer (`data-live="run"`)                                                                                       | A visually hidden live region in the stage, beside the status heading. Same messages and timing.                                                                                                                                                                                                                          | 6     |
| 16  | Summary: optimizer error and Retry                                                                                               | The status heading in its error tone, with a Retry pill.                                                                                                                                                                                                                                                                  | 6     |
| 17  | Summary: "Fix the errors marked in the inputs" and the Show links                                                                | The status heading in its error tone; the links become pills: "Edit <name>" (opens that editor), "Change the box" (opens the box editor), "Settings".                                                                                                                                                                     | 6     |
| 18  | Summary: errors with no field on screen                                                                                          | Listed under the error heading's muted line, one per line.                                                                                                                                                                                                                                                                | 6     |
| 19  | Summary: layout notices (over bed, capped, coverage, play) with "Show all"                                                       | The stage notes slot under the plan caption, styled as Main's banner, the first 3 then "Show all".                                                                                                                                                                                                                        | 6     |
| 20  | Status progress bar while searching                                                                                              | Dropped (Main shows none). Stop and the announcer stay. §7 row.                                                                                                                                                                                                                                                           | 6     |
| 21  | "Making a new plan…" and "No plan yet"                                                                                           | The status heading: info tone (Main's searching icon) and a neutral tone, h1 only.                                                                                                                                                                                                                                        | 6     |
| 22  | Hint paragraphs under the plan                                                                                                   | Deleted.                                                                                                                                                                                                                                                                                                                  | 3     |
| 23  | Plan / 3D `tablist`                                                                                                              | The board's "Top" / "3D" segment with `aria-pressed`.                                                                                                                                                                                                                                                                     | 6     |
| 24  | Width and length chips around the workspace plan                                                                                 | Dropped from the workspace (Main shows none). Kept only on first visit (Empty).                                                                                                                                                                                                                                           | 7     |
| 25  | three.js 3D view, its "Show axes" toggle and its tray picker                                                                     | Kept inside the same box frame (Main's 3D is only a CSS tilt). No board: judged against Main's box frame.                                                                                                                                                                                                                 | 7     |
| 26  | Tray bar: Swap with…, Lock size                                                                                                  | Behind a quiet "More" in the bar (owner decision). "Swap with…" keeps `aria-pressed`.                                                                                                                                                                                                                                     | 8     |
| 27  | Tray bar rows: Layer, Size, Joins, Holds, To print, Sits on, Carries                                                             | One meta line: "<layer> · <W × D × H mm> · about <h> h, <g> g". Spacer: the board's spacer line. Riser: "Carries <name>" (existing words). Joins and Holds dropped (the tray name already names a group).                                                                                                                 | 8     |
| 28  | Spare trays, spacers and risers with every action blocked                                                                        | No actions, only Close (board). §5 and §7 amended.                                                                                                                                                                                                                                                                        | 8     |
| 29  | Old first-visit block ("Fit your game into its box.", h3s)                                                                       | Replaced by Empty / MobileStart.                                                                                                                                                                                                                                                                                          | 9     |
| 30  | `DerivedSizes`, `GrowthOptions` and `CommonOptions` hint lines                                                                   | Dropped, except the derived card size line ("63.5 × 88 mm"), which Edit shows. Option changes speak through the note toast.                                                                                                                                                                                               | 10    |
| 31  | Remove toast (after removing an item)                                                                                            | Kept, styled as Edit's note toast, in the stage slot above the box. No board: judged against Edit's toast.                                                                                                                                                                                                                | 10    |
| 32  | Box field hints other than the board's                                                                                           | Dropped.                                                                                                                                                                                                                                                                                                                  | 11    |
| 33  | Settings: "Unused space", "One thick wall instead of a spacer"                                                                   | Under Exact numbers, in a group "Spacers and space" (owner decision: first screen = board).                                                                                                                                                                                                                               | 14    |
| 34  | Settings: printer form fields (margin, layer height, bed height, own size), folding risers, "Apply to this insert" with its hint | Owner decision (N8): "Apply to this insert" becomes a visible row at the top of My printer, shown only when this insert's printer differs from the browser's: "This insert uses another printer" + "Apply". Margin, layer height, own bed size and folding risers go in the board's "Printer details" disclosure. §7 row. | 14    |
| 35  | Settings hint text beyond the board's                                                                                            | Dropped.                                                                                                                                                                                                                                                                                                                  | 14    |
| 36  | Download: parts count text, "Open the packing guide" button                                                                      | Replaced by the board's tray chips, subtitle and Packing guide card.                                                                                                                                                                                                                                                      | 13    |
| 37  | Download: build finished message                                                                                                 | Exporting's done phase: "All <n> parts are ready", "One file with every part.", "Back to the plan". No second download button. §7 row.                                                                                                                                                                                    | 13    |
| 38  | Packing guide (`AssemblyPage`)                                                                                                   | Kept and restyled. No board: judged against Export (cards, type, radii).                                                                                                                                                                                                                                                  | 13    |
| 39  | "Swap with…" in progress (pick the other tray)                                                                                   | Kept. The bar's "More" stays open with "Swap with…" pressed; the stage slot shows the existing prompt. No board: judged against Main's tray bar.                                                                                                                                                                          | 8     |
| 40  | Long names, many items (25 components, 60 trays)                                                                                 | One line with ellipsis and `title` everywhere; the rail list scrolls inside the rail; no page scroll on desktop. State `workspace-long`. No board: judged against Main.                                                                                                                                                   | 5, 7  |
| 41  | Tablet width 820                                                                                                                 | States `workspace-820`, `editor-820`, against Main and Edit rendered at 820.                                                                                                                                                                                                                                              | 15    |
| 42  | Dark theme                                                                                                                       | Opt-in from the project menu, default light. State `workspace-dark`, judged against Main.                                                                                                                                                                                                                                 | 16    |
| 43  | Estimates written "≈ 42 g"                                                                                                       | "about 42 g" / "about 3 h" (owner decision). §2 Claims amended.                                                                                                                                                                                                                                                           | 6     |

**Board items the app does NOT build** (Phase 3 or unbacked, DESIGN §6). No placeholder, no disabled stand-in:

- "To other layer" / "To top layer" and its reason line (Main, MobileTray). Task 8.
- "Keep it next to: Choose…" (Edit). Task 10.
- "Still fits" and its dot and line in the Settings footer; the footer keeps Done. Task 14.
- Fix suggestions with outcomes: "Lay the figures down", "Make the top layer shallower", "Keep them loose in one bin", "Let Dice go on any layer", outcome lines, the "Best" chip, the "needs 6 mm more height" figure. Task 12.
- "Use 70 mm" in the first-visit error card. Task 9.
- "Turn back" (needs a relative turn). "Turn 90°" stays. Task 8.
- Exporting's "Copy a report", "Download without <name> (that tray will be missing)", "Start again" (ruling: plain "Not exported" + Try again). Task 13.
- The phone editor's position sentence ("It's on the bottom layer, front right."): no engine phrase. Task 10.
- PinConflict's conflict area (the dashed warn box "Hex tiles need 95 × 140 mm. 95 × 95 is free.") and the outcome sentence "Unpin one and everything fits.": the engine has no free-space figure and no outcome. Task 12.

---

## Board regions → owning task

"Nearest board" states are judged this way: built only from kit primitives and tokens; spacing, type and radii as in the named board; no text beyond its rulings.

| Board / state                                      | Region                                                                                                                          | Task          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Main                                               | Header: logo, wordmark, divider, name button, saved, Undo (+ Redo), menu button with dot, Download                              | 4             |
| Main                                               | Project menu panel and `menuNote`                                                                                               | 4             |
| Main                                               | Rail: box card                                                                                                                  | 5             |
| Main                                               | Rail: h2 "What's inside" + Add pill                                                                                             | 5             |
| Main                                               | Rail: list rows, selected style, icon tiles, rule chips with ×                                                                  | 5             |
| Main                                               | Rail: "These stay as you set them…" + "Clear all my choices"                                                                    | 5             |
| Main                                               | Rail footer: "Printer bed 256 × 256 mm · Settings"                                                                              | 5             |
| Main                                               | Stage: plan banner (`notice=outdated`)                                                                                          | 6             |
| Main                                               | Stage: status heading (fit, searching), Layer and View segments, Keep searching / Stop, the no-WebGL line                       | 6             |
| Main                                               | Stage: box frame, tiles, cells, name pills, pinned badge, tag, dimming, selected ring, caption, "Spacers fill the gaps again…"  | 7             |
| Main                                               | Stage: 52 px slot with "Tap a tray for details."                                                                                | 7             |
| Main                                               | Stage: tray bar (`sel`)                                                                                                         | 8             |
| Empty                                              | Header (Open file only), rail steps, fields, error card, kind tiles, example link, saved line; stage h1, line, chips, empty box | 9             |
| Edit                                               | Rail: back link, identity row, count stepper, card size chips, sleeves segment, More options and its groups, Remove…, Done      | 10            |
| Edit                                               | Stage: 52 px slot (stage sentence h1 or note toast), lifted tray, others at 0.5, caption                                        | 10            |
| EditKinds                                          | The tokens and dice, tiles and something-else editors                                                                           | 10            |
| Box                                                | Rail panel; stage side view                                                                                                     | 11            |
| NoFit                                              | Status heading (warn), dimmed attempt, culprit tile, culprit row, "Ways to make it fit" panel                                   | 12            |
| PinConflict                                        | Status heading (warn), pinned badges, "Unpin one" panel, Undo link, rule chips (the conflict area is not built)                 | 12            |
| Export                                             | Dialog: title, subtitle, chips, stat tiles, primary, caption, Packing guide card, Other formats, support row                    | 13            |
| Exporting                                          | Building: title, subtitle, progress bar, Stop. Done and partial phases.                                                         | 13            |
| Settings                                           | Drawer: header, tabs, sections, Exact numbers, footer with Done; printer tab                                                    | 14            |
| MobileStart                                        | Phone first visit                                                                                                               | 9             |
| MobileWorkspace                                    | Phone header (Undo, Send file, menu button by ruling, Download), status heading, segments, box, sheet peek                      | 3, 4, 5, 6, 7 |
| MobileTray                                         | Tray sheet                                                                                                                      | 8             |
| MobileEdit                                         | Full-screen editor                                                                                                              | 10            |
| MobileBox                                          | Full-screen box editor with side view                                                                                           | 11            |
| MobileFix                                          | Phone fit problem                                                                                                               | 12            |
| MobileDownload                                     | Full-screen Download                                                                                                            | 13            |
| Flow                                               | Navigation map only: every screen opens from and returns to the workspace. Checked by the Task 17 keyboard journey.             | 17            |
| (no board) kit gallery                             | Nearest: Main, Empty, Edit, Settings controls                                                                                   | 2             |
| (no board) kind picker behind Add                  | Nearest: Empty's kind tiles                                                                                                     | 5             |
| (no board) project menu on the phone, Your inserts | Nearest: Main menu panel                                                                                                        | 4             |
| (no board) toasts (remove, option notes)           | Nearest: Edit's note toast                                                                                                      | 10            |
| (no board) older-geometry banner, layout notices   | Nearest: Main's banner (warn tone for older geometry, as Main's `olderVersion` colours)                                         | 6             |
| (no board) error, making-a-plan, no-plan headings  | Nearest: Main's status heading                                                                                                  | 6             |
| (no board) 3D view                                 | Nearest: Main's box frame and segments                                                                                          | 7             |
| (no board) packing guide                           | Nearest: Export                                                                                                                 | 13            |
| (no board) editor-minis on desktop                 | Nearest: Edit (layout), MobileEdit (content)                                                                                    | 10            |
| (no board) long names, many items                  | Nearest: Main                                                                                                                   | 5, 7          |
| (no board) dark                                    | Nearest: Main, dark tokens                                                                                                      | 16            |

---

## Global Constraints

### Engine and files

- **Engine stays.** Do not change, except to fix a bug a test exposes: `src/model`, `src/layout`, `src/sizing`, `src/geometry`, `src/export`, `src/share`, `src/instructions/{naming,numbering,labels,render,exploded,png}.ts`, `src/app/{state,store,actions,meshes,download}.ts`, `src/viewer/scene.ts`.
- **Allowed additive changes:** `src/app/actions.ts` gains `clearChoices` (Task 5). `src/share/prefs.ts` gains the theme preference (Task 16). Nothing else in the frozen list changes.
- **Not frozen, changed on purpose:** `src/app/runner.ts` and `src/ui/ExportPanel.tsx` call `shotsHold` (Task 0); `scripts/smoke-dist.mjs` checks it is gone from the build (Task 0).

### Process

- **Boards before code.** Each UI task names its board(s) and regions. The implementer reads the board file before writing code.
- **Layout from the board:** regions, proportions, sizes, and what is absent.
- **Text from the board.** A visible string is either a literal of its state's board, an engine string, data, or a ruled string in `src/screens/copy-rulings.ts` that cites a DESIGN §7 row. `src/screens/copy.board.test.tsx` enforces this (from Task 4).
- **DESIGN in the same commit.** Each task lists the DESIGN lines it amends and amends them in its own commit (DESIGN §1).
- **CSS read by tests.** Every CSS file a test reads as `?raw` is added to `test.css.include` in `vite.config.ts` in the same task, or it imports as `""` and its tests pass vacuously.
- **Hard rules beat board values.** Where a board draws a control under 44 px (rule chips 32 px, menu note buttons 40 px, failure buttons 40 px), the visual size follows the board and the target is still 44 px (a `::before` hit area, `inset: -6px 0`).
- **Commits.** `npm test` passes on every commit. `npm run verify` passes at the end of every task. No `Co-Authored-By` or any other trailer.

### Board copy conflicts (resolved by the authority order)

| Board says                                                  | App says                                                                                                  | Why                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "Update the plan" (Main notice)                             | "Make a new plan"                                                                                         | Words table                                                                                |
| "Keep the old plan"                                         | "Use the old plan"                                                                                        | DESIGN §2 Flow and §7                                                                      |
| "Top layer stays put" (Settings)                            | "Rim between layers" (the board's hint line is kept)                                                      | Words table                                                                                |
| "+ Add" (MobileWorkspace)                                   | Plus icon (inline SVG) + "Add"                                                                            | No text characters as icons                                                                |
| "Bottom layer · 40 mm", "Bottom", "Top"                     | "Layer 1 (bottom) · 40 mm" … "Layer n (top) · 26 mm"; phone drops " · mm"                                 | Ruling (layers keep DESIGN's names)                                                        |
| Step badges "1", "2" (Empty)                                | Kept                                                                                                      | Ruling: steps, not tray numbers                                                            |
| "Pinned · Turned" (one chip per row)                        | One chip per rule: "Pinned", "Pinned, turned", "Size locked"                                              | DESIGN §3 and §7                                                                           |
| "Turn back"                                                 | "Turn 90°" always                                                                                         | §7: turn is absolute inside a pin                                                          |
| "Trays then fill up to the lid, so nothing falls out" (Box) | "Loose pieces go under other trays where they can, so nothing spills."                                    | Not true of the engine (ruling); `storedOnSide` only steers coverage scoring and a warning |
| "Heroes don't fit yet" (NoFit, MobileFix)                   | "The <name> tray doesn't fit yet" ("The Heroes tray doesn't fit yet"); fallback "Not everything fits yet" | Owner decision: avoids singular/plural agreement on names                                  |
| Estimates "about 560 g" (boards) vs "≈ 42 g" (DESIGN)       | "about 560 g", "about 33 h", "about 45 min"                                                               | Owner decision; DESIGN §2 amended (Task 6)                                                 |

### Values from the boards (light theme)

Verified against the board files (`grep` of every `#hex`, `box-shadow`, `border-radius`, `gap`, `padding` and `height` in `docs/design/boards/*.dc.html`). They become tokens in Task 1. No raw hex outside `src/styles/tokens.css`. Sources in brackets.

- **Surfaces:** `--page #F4F3EF`, `--sheet #FFFFFF`, `--row #FAF9F6` (box card, kind tiles, Settings footer), `--fill-quiet #EFEDE7` (Edit/Box/Settings segment track, progress track, small tags), `--chip #E9E5DB` (Empty size chips), `--track #E9E7E0` (Main/MobileWorkspace Layer and View segments), `--icon-ground #EDEAE2` (box card icon, step badge 2), `--scrim #8E8B83` (behind dialogs and the drawer).
- **Lines:** `--rule #E4E1D9`, `--rule-soft #EEEBE4`, `--field-line #DAD6CC`, `--line-strong #BDB7A9` (secondary buttons on a tinted box), `--handle #D6D2C8` (phone sheet handle).
- **Ink:** `--ink #1D1F1C`, `--muted #5F625C`, `--muted-strong #3E413C`, `--ink-dim #4A4D47` ("Empty box", spacer chip), `--ink-off #6B6E68` (blocked control text).
- **Box:** `--box #D3CDBF`, `--box-edge #BFB8A8`, `--box-dash #8C8778`.
- **Focus:** `--focus #2F5BB8`, `--field-glow #CFDCF6`.
- **Info:** `--info-bg #E6EEFC`, `--info-ink #1B3D7A` (banner, searching icon ground; the searching icon is `--focus`).
- **Fit and saved:** `--fit-bg #DDF0E3`, `--ok #2B7247`.
- **Error:** `--danger #B4321F`, `--danger-bg #FBE4E0`, `--danger-ink #8A2414`, `--destructive #A13A2C` ("Remove…").
- **Warning:** `--warn #C2620F`, `--warn-bg #FCE6CF`, `--warn-ink #7A3A08`, `--warn-ink-strong #5A2A06` (banner and menu note text), `--warn-icon #9A4A0B` (NoFit icon, "Failed").
- **Changed (Settings):** `--changed #3F6FD1`, `--changed-bg #EEF3FC`, `--changed-ink #22457E`.
- **Logo squares:** `--logo-cards #8FB0EE`, `--logo-bits #EDC175`, `--logo-tiles #86C79A`, `--logo-minis #E89BBE`.
- **Kinds** (unchanged): cards `#DCE6FA/#335AA6/#22457E`, bits `#FBE9C9/#8A5D08/#6E4C0E`, tiles `#D8EEDE/#2E6B41/#22552E`, minis `#F5DCE7/#964068/#74244B`, custom `#E7E3F4/#5B4B9A/#45397A`. Spacer `--spacer-fill #E9E5DB`, `--spacer-hatch #DDD8CC`, `--spacer-dash #6E695C`.
- **Shadows:**
  - `--shadow-menu: 0 16px 40px rgba(29,31,28,.18)` (Main menu)
  - `--shadow-dialog: 0 30px 80px rgba(29,31,28,.35)` (Export, Exporting)
  - `--shadow-drawer: -20px 0 60px rgba(29,31,28,.25)` (Settings)
  - `--shadow-bar: 0 6px 18px rgba(29,31,28,.08)` (tray bar)
  - `--shadow-thumb: 0 1px 2px rgba(29,31,28,.12)` (segment thumb)
  - `--shadow-toast: 0 10px 24px rgba(29,31,28,.18)` (Edit note)
  - `--shadow-peek: 0 -8px 30px rgba(29,31,28,.14)` (MobileWorkspace, MobileFix sheets)
  - `--shadow-sheet-modal: 0 -8px 30px rgba(29,31,28,.18)` (MobileTray)
  - `--shadow-lift-drop: 0 14px 28px rgba(29,31,28,.2)` (Edit lifted tray, after a 4 px `--sheet` ring and a 6 px kind-line ring)
  - `--ring-selected: 0 0 0 3px #FFFFFF, 0 0 0 5px #1D1F1C` (Main selected tile; written with `var(--sheet)` and `var(--ink)`)
  - `--ring-dot: 0 0 0 2px #FFFFFF` (menu dot)
  - Box inset: `inset 0 0 0 1px var(--box-edge)` (plan frame), `inset 0 0 0 2px var(--box-dash)` (side view).
- **Spacing scale:** `--s-2 2px`, `--s-3 3px`, `--s-4 4px`, `--s-5 5px`, `--s-6 6px`, `--s-8 8px`, `--s-10 10px`, `--s-12 12px`, `--s-14 14px`, `--s-16 16px`, `--s-18 18px`, `--s-20 20px`, `--s-22 22px`, `--s-24 24px`, `--s-28 28px`, `--s-32 32px`, `--s-40 40px`. One-off values (1 px, 7 px, 9 px) stay literal with a comment naming the board.
- **Radii:** `--r-pill 999px`, `--r-dialog 22px` (dialogs, phone sheet top corners), `--r-bar 18px` (tray bar), `--r-panel 16px` (box frame, side panels, side view), `--r-card 14px` (box card, kind tiles, menu panel, toast, banner, stat tiles, phone box frame, option cards), `--r-field 12px` (fields, list rows, rules note, error card, disclosure rows), `--r-tile 10px` (plan tiles, menu items, icon tiles 36/40, exact-number inputs), `--r-icon 9px` (34 px kind icon, 30 px swatch), `--r-logo 8px` (logo, name button, back link, side-view trays), `--r-cell 6px` (tile cells).
- **Sizes:**
  - `--control-h 44px` (buttons and every target), `--field-h 48px` (Empty, Box, phone fields), `--field-h-compact 44px` (count input, exact numbers, search), `--cta-h 54px` (Export primary), `--dialog-btn-h 48px` (Exporting buttons, phone tray Edit).
  - `--header-h 60px`, `--header-h-phone 56px`. Header padding `0 24px`, gap 12 px (Main); phone `0 8px 0 16px`, gap 4 px.
  - **Rail, one width on every screen (ruling, Main's):** `--rail-basis 300px`, `--rail-max 350px`, `--rail-pad 20px`. Stage `flex: 999 1 640px`.
  - Stage padding: `--stage-pad: 22px 36px 28px` (workspace, Main); `--stage-pad-focus: 28px 40px` (first visit, editor, box, fit problems: Empty, Edit, Box, NoFit).
  - Box frame: longer side `min(582px, 100cqw, 100cqh)` inside a size container (`.plan-fit`) that takes the stage height left after the banner, status row, slot, caption and notes, so the stage never scrolls on desktop (582 at 1440×900 with nothing above the status row); the other side by the box's W:L. Phone: `calc(100vw - 32px)` (358 at 390), radius 14, no height cap (the phone stage scrolls). Empty box `min(440px, calc(100vw - 96px))`.
  - `--row-min 52px` (list rows, check rows), `--kind-tile-h 56px`, `--stage-slot 52px`, `--status-icon 40px` (phone 32), `--menu-w 260px`, `--dialog-max 560px`, `--dialog-pad 32px` (below 600: 20 px, radius 0), `--sheet-peek 196px`.
- **Type:** `--font-display` (Bricolage Grotesque), `--font-ui` (Figtree; keep the existing name). Base 15 px (phone 16 px). Sizes `--text-sm 14px`, `--text-xs 13px`, `--text-2xs 12px`, field value 17 px 600, count 18 px 600.
  - Bricolage 700: wordmark 18; `--h1 28px` (status heading, Exporting), `--h1-first 40px` (letter-spacing −0.02em, line-height 1.1), `--h1-dialog 30px` (Export), `--h1-drawer 26px` (Settings), `--h1-phone 21px`; `--h2 20px` (rail), `--h2-panel 22px` (Box "The box", editor name input), `--h3 19px` (side panels, phone sheet title); stat value 24. Status h1 letter-spacing −0.01em.
  - Figtree 700: Settings section h2 17 px.
  - Figtree 500 is used by the boards (segment "off" labels). Task 1 adds the 500 weight (§7 row; DESIGN §4 says a weight is a decision-log row).
- **Focus:** `outline: 3px solid var(--focus); outline-offset: 2px`. A field with focus: border `1.5px solid var(--ink)` and `box-shadow: 0 0 0 3px var(--field-glow)`.
- **Light is the default and the only theme until Task 16.** `:root { color-scheme: light }`. `light-dark()` in `shadeOf` stays and returns the light value. Task 16 adds `[data-theme="dark"]` with `color-scheme: dark`, opt-in from the project menu.

### Unchanged from `docs/DESIGN.md`

- Words table, names not numbers, one exposed h1 (the rule's wording changes in Task 6 and Task 13; the count stays one).
- 44 px controls; the plan-tile exemption.
- `aria-pressed` rules, breakpoints 760 / 600 and the 760–960 tablet rail, one Download, one plan banner, no slicer claims, single-line pills, reduced motion.

### Visual gate (every UI task)

- Run `npm run shots -- <state…>` (Task 0). For each state it writes, into `.superpowers/sdd/2026-10-16-ui-rebuild/shots/`:
  - `<state>.pair.png`: board above, app below, both at 1:1.
  - `<state>.<region>.pair.png`: 1:1 crops of each named region present in both (board above, app below).
  - `<state>.numbers.md`: plan width, rail width, header height, h1 font size and text, board vs app, with `≠` on any difference over 1 px.
- The task report lists the pair paths and pastes the numbers tables.
- The reviewer opens every pair and crop and answers, per state: does it match? What is extra? What is missing? Each `≠` in the numbers needs a sentence.

---

## Review Focus

1. **Long names** (a 40-character component name, a 3-component stack name). Rail rows, tile name pills, tray bar and status h1 stay on one line with an ellipsis and the full text in `title`. Tests in Tasks 5, 7, 8; state `workspace-long`.
2. **Many items** (25 components, 60 trays). The rail list scrolls inside the rail, the plan stays the hero, no page scroll on desktop. Task 5 test; `shots.mjs` fails `workspace-long` if the page scrolls at 1440×900.
3. **Tablet width 820px.** Rail and stage both fit, the plan is at least 360 px wide, nothing overlaps. Task 15.
4. **A slow plan run.** Keep searching turns into Stop, Download shows its reason, and nothing jumps: `shots.mjs` compares the bounding boxes of header, rail and plan box in `workspace` and `workspace-searching` (Task 6).
5. **Keyboard only.** First visit → add Cards → Done → select a tray → Pin → Download, focus visible throughout. Task 17.

---

### Task 0: Harness: boards as images, seeds, shots, copy check

**Boards:** all 18 (read Main, NoFit and Exporting to see the template syntax).

**Files:**

- Create: `scripts/design/renderBoard.mjs`, `scripts/design/renderBoard.d.mts`, `scripts/design/renderBoard.test.mjs`.
- Create: `scripts/design/viteModules.mjs` (loads `src/` TypeScript in Node through Vite's `createServer(...).ssrLoadModule`).
- Create: `scripts/design/make-seeds.mjs`, `scripts/design/states.mjs`, `scripts/design/regions.mjs`, `scripts/design/shots.mjs`.
- Create: `src/test-support/harbourKings.ts`, `src/test-support/harbourKings.test.ts`.
- Create: `src/test-support/boardCopy.ts`, `src/test-support/boardCopy.test.ts`.
- Create: `src/app/shotsHold.ts`, `src/app/shotsHold.test.ts`. Modify: `src/app/runner.ts`, `src/ui/ExportPanel.tsx`, `src/env.d.ts`, `scripts/smoke-dist.mjs`, `scripts/smoke-dist.test.mjs`.
- Create: `docs/design/README.md`, `docs/design/seeds/*.json`, `docs/design/boards/png/*.png`.
- Modify: `.prettierignore` (add `docs/design/boards/`, `docs/design/shots/`, `docs/design/seeds/`; do not reformat the boards: whitespace in their text matters), `package.json` (devDependency `playwright`, scripts `"shots": "node scripts/design/shots.mjs"`, `"seeds": "node scripts/design/make-seeds.mjs"`; no postinstall).

**Decisions:**

- **Test location.** The renderer test is `scripts/design/renderBoard.test.mjs`: it matches the existing `include` (`scripts/**/*.test.mjs`), so `vite.config.ts` does not change for it.
- **Types.** The renderer stays `.mjs`. `renderBoard.d.mts` declares its exports, so `src/test-support/boardCopy.ts` imports `../../scripts/design/renderBoard.mjs` and `tsc` (include `src`, no `allowJs`) resolves the declaration.
- **Parser.** `jsdom` (already a devDependency) parses the board; `node:vm` runs its script as `script + ";Component"` in a context holding the stub `DCLogic`.
- **Seeds load through Vite in `src`.** `src` cannot import `node:` modules (`tsconfig.json` types are `vite/client` and `vitest` only), so `loadSeed` uses `import.meta.glob("../../docs/design/seeds/*.json", { eager: true, import: "default" })` (as `src/model/fixtures.test.ts` does) and picks `<name>.json` and `<name>.result.json` from that one map.
- **Seeds are generated, never hand-written.** `make-seeds.mjs` loads the fixture and the engine through `viteModules.mjs` and runs the real `optimize` with the runner's seed and budget and the worker's 30 s cap (`DEFAULT_TIME_CAP_MS`), so Node and the browser stop under the same rule; a run that hits the cap is reported (`layout.capped`), since a slower browser could then land elsewhere. It writes the whole `localStorage` content the real stores produce, with every index entry's `updatedAt` pinned to `1792108800000` (2026-10-16T00:00:00Z) so reruns do not churn the files. It never edits the fixture source. Shots and tests check each seed's `inputsHash` and `geometryVersion` and fail loudly when stale.
- **No-fit and pin conflict come from real runs.** The store cannot restore them: `bestAttempt`, `shortfall` and `lockConflicts` live only in memory (`src/app/state.ts`), and `runner.afterOpen` runs only when there is no layout. So these seeds store the fixture's last good layout plus an edit that makes it stale; the shot clicks "Make a new plan" in the banner and waits for the heading (90 s timeout). `make-seeds.mjs` runs the same optimization in Node first and asserts the outcome, so the browser run is known to land there. It also writes the result as `<seed>.result.json` for the jsdom copy tests, which feed it to the stub layout client.
- **Exporting and searching are held, not raced.** `shotsHold(point)` returns a promise that resolves at once unless `import.meta.env.MODE === "shots"` and `globalThis.__shotsHold?.[point]` is set. In shots mode the shot sets a never-resolving hold, so the build stays at "1 of 10" and a search stays running. Vite folds `import.meta.env.MODE` at build time, so production carries none of it; `smoke-dist.mjs` checks. A slow worker or a timed screenshot would be flaky on a fast machine; a hold is deterministic and costs two call sites.
- **Server.** `shots.mjs` finds a free port (bind a `net` server on port 0, read it, close it), spawns `node_modules/.bin/vite --mode shots --port <p> --strictPort`, waits until `GET /` answers 200, and on exit (normal, error, SIGINT) kills that child by its PID. Never `pkill`.
- **Seeding storage.** `page.addInitScript` writes every key of the seed's `storage` map before the app script runs: always `insert-generator:index` and `insert-generator:project:<id>`, plus `insert-generator:prefs` when the seed has one. `first-visit` and `m-start` use empty storage.

**Interfaces:**

- Consumes: `optimize`, `DEFAULT_ITERATIONS` (`src/layout`), `DEFAULT_SEED`, `buildLayoutInput` (`src/app/runner.ts`), `inputsHash` (`src/model/hash.ts`), `GEOMETRY_VERSION` (`src/geometry/version.ts`), `createProjectStore`, `createPrefsStore` (`src/share`), `MemoryStorage`, `toggleLock` (`src/app/actions.ts`), `misfitOf` (`src/ui/noFit.ts`), `renderApp` (`src/app/test-app.tsx`).
- Produces:
  - `renderBoard(file: string, opts?: { props?: Record<string, unknown>; state?: Record<string, unknown> }): Promise<string>` (a full HTML document) and `boardPreview(file: string): { width: number; height: number }`.
  - `harbourKings(): Project`, `harbourKingsHeadroom(): Project`, `harbourKingsLong(): Project`, `harbourKingsNoFit(base: Project): Project`, `harbourKingsPinConflict(base: Project): Project`, `harbourKingsNotes(base: Project): Project`; `loadSeed(name: string): { storage: Record<string, string>; project: Project; result?: LayoutResult }`.
  - `boardLiterals(file: string, opts?): Promise<Set<string>>`, `visibleStrings(root: Element): string[]`, `unruled(strings: string[], allowed: Allowed): string[]` where `Allowed = { literals: Set<string>; rulings: readonly CopyRuling[]; data: Set<string>; engine: Set<string> }`.
  - `shotsHold(point: "export" | "search"): Promise<void>`.
  - `npm run seeds`; `npm run shots` (every state) and `npm run shots -- <state>… [--out <dir>]`.
  - `states.mjs`: `STATES: Record<string, { board: string; boardOpts?: {props?, state?}; boardCrop?: string; nearest?: string; viewport: {width, height}; seed: string | null; holds?: ("export"|"search")[]; steps?: Step[] }>` where `Step = { click: { role: string; name: string | RegExp } } | { waitFor: { role?: string; name?: string | RegExp; text?: RegExp; timeout?: number } } | { press: string }`.
  - `regions.mjs`: `REGIONS: Record<string, { board: (doc) => Element | null }>`; app regions are found by `[data-region="<name>"]`. Names: `header`, `rail`, `status`, `plan-box`, `tray-bar`, `menu`, `dialog`, `drawer`, `sheet`.

**The fixture (`harbourKings()`):** id `harbour1`, name "Harbour Kings"; box 285 × 285 × 70, headroom 0, `storedOnSide: false`; printer 256 × 256 × 256, margin 5, layer 0.2; `DEFAULT_SETTINGS`. Components, in order:

- "Market deck": cards, 80, standard size, sleeve standard.
- "Starter decks": cards, 4 decks of 12.
- "Event cards": cards, 30.
- "Coins and cubes": tokens and dice, Gold coins 40 (20×20×2), Silver coins 24 (20×20×2), Wood cubes 24 (8×8×8), Wood discs 8 (12×12×4).
- "Resource tokens": tokens and dice, 6 kinds × 20 of 16×16×2 (Wood, Stone, Grain, Wool, Ore, Fish).
- "Dice": tokens and dice, 10 dice, 16×16×16.
- "Hex tiles": tiles, hex, 50 across the flats, 2.2 thick, 24.
- "Heroes": miniatures, 6 figures 30×30×38, one pocket each.

Variants: `harbourKingsHeadroom` sets headroom 8, coverage whole. `harbourKingsLong` adds 17 components to reach 25, one named "The Very Long Name Of A Card Deck Here 40" (40 characters), and a group of three components (a 3-component stack name). `harbourKingsNoFit(base)` keeps `base.layout` and raises Heroes to 40 figures; `harbourKingsPinConflict(base)` pins Market deck and Heroes with `toggleLock` on `base.layout`'s trays and raises Hex tiles to 60. `harbourKingsNotes(base)` keeps `base.layout` and makes the plan stale with component changes that give at least 3 sizing notices (`sizingNoticesOf`), e.g. sleeves on a tarot-size deck and a custom item taller than the box's half height; the script asserts the count. If an assertion in Step 9 fails, the script tries at most 5 other counts (the fixture's count + 10, + 20, + 30, + 40, + 50), never edits `harbourKings.ts`, and exits 1 printing each tried count with its outcome ("layout", "no fit, misfit <name>", "pin conflict") and the counts that would work. A person edits the fixture and reruns `npm run seeds`. Outcomes are not monotonic (more Hex tiles can give a no-fit instead of a conflict), so the script suggests, it does not choose.

**States (initial table; later tasks add theirs):**

| State                    | Board (opts)                       | Viewport | Seed / steps                                                                                                                     |
| ------------------------ | ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `first-visit`            | Empty                              | 1440×900 | empty storage                                                                                                                    |
| `workspace`              | Main                               | 1440×900 | `harbour-kings`                                                                                                                  |
| `workspace-searching`    | Main `{state:{searching:true}}`    | 1440×900 | `harbour-kings`; hold `search`; click button "Keep searching"; wait for button "Stop"                                            |
| `workspace-banner`       | Main `{props:{notice:"outdated"}}` | 1440×900 | `harbour-kings-stale` (Market deck 81 cards)                                                                                     |
| `workspace-banner-notes` | Main `{props:{notice:"outdated"}}` | 1440×900 | `harbour-kings-notes` (stale, and at least 3 sizing notices from `sizingNoticesOf`): the banner and the notes at once            |
| `workspace-menu`         | Main `{state:{menu:true}}`         | 1440×900 | `harbour-kings`; click button /^Project menu/                                                                                    |
| `workspace-tray`         | Main `{state:{sel:"market"}}`      | 1440×900 | `harbour-kings`; click button /^Market deck/ in the plan                                                                         |
| `workspace-long`         | Main (nearest)                     | 1440×900 | `harbour-kings-long`                                                                                                             |
| `editor`                 | Edit `{props:{moreOpen:false}}`    | 1440×900 | `harbour-kings`; click the "Market deck" row                                                                                     |
| `box`                    | Box                                | 1440×900 | `harbour-kings-headroom`; click "The box"                                                                                        |
| `no-fit`                 | NoFit                              | 1440×900 | `harbour-kings-nofit`; click "Make a new plan"; wait for text /fit yet/ (90 s)                                                   |
| `pin-conflict`           | PinConflict                        | 1440×900 | `harbour-kings-pins`; click "Make a new plan"; wait for text /fit with/ (90 s)                                                   |
| `settings`               | Settings                           | 1440×900 | `harbour-kings`; open the menu; click "Settings"                                                                                 |
| `download`               | Export                             | 1440×900 | `harbour-kings`; click "Download"                                                                                                |
| `exporting`              | Exporting                          | 1440×900 | `harbour-kings`; hold `export`; click "Download"; click the 3MF button (name /Download (the )?3MF/); wait for role `progressbar` |
| `m-start`                | MobileStart                        | 390×844  | empty storage                                                                                                                    |
| `m-workspace`            | MobileWorkspace                    | 390×844  | `harbour-kings`                                                                                                                  |
| `m-tray`                 | MobileTray                         | 390×844  | `harbour-kings`; click /^Heroes/ in the plan                                                                                     |
| `m-edit`                 | MobileEdit                         | 390×844  | `harbour-kings`; open the sheet; click the "Heroes" row                                                                          |
| `m-download`             | MobileDownload                     | 390×844  | `harbour-kings`; click "Download"                                                                                                |
| `m-fix`                  | MobileFix                          | 390×844  | `harbour-kings-nofit`; as `no-fit`                                                                                               |
| `m-box`                  | MobileBox                          | 390×844  | `harbour-kings-headroom`; open the sheet; click "The box"                                                                        |

Old-UI step names may differ in Task 0; a step that cannot find its target fails that state with the step printed, and the "before" run records which states could not be reached.

- [ ] **Step 1: Renderer tests.** In `scripts/design/renderBoard.test.mjs`:
  - `it("expands sc-for over renderVals")`: `renderBoard("NoFit.dc.html")` contains each of "Market deck", "Starter decks", "Event cards", "Coins and cubes", "Resource tokens", "Dice", "Hex tiles", "Heroes" and "Heroes don't fit yet", and no `{{`.
  - `it("unwraps sc-if and sc-for into their children")`: the output has no `<sc-if` or `<sc-for`, and `x-dc` has no `sc-*` descendant. In `renderBoard("Main.dc.html")` the `header` has exactly 9 element children; with `{ state: { menu: true } }` it has 10 and the text contains "Your inserts".
  - `it("strips handlers and hints")`: no element in the output of Main, Edit or Exporting has an attribute whose name starts with `on` or `hint-`.
  - `it("applies the data-props defaults")`: Edit contains "Keep it next to"; Edit with `{ props: { moreOpen: false } }` contains "More options" and not "Keep it next to".
  - `it("prints booleans and blanks")`: Main's `[aria-haspopup="menu"]` has `aria-expanded="false"`; Main with `{ props: { notice: "olderVersion" } }` contains no `undefined`.
  - `it("renders static boards")`: Empty contains "Let's build an insert for your game".
  - `it("uses local fonts only")`: no `fonts.googleapis.com`, no `support.js`; contains `file://` and `figtree-latin-500-normal.woff2`.
  - `it("reads the preview size")`: `boardPreview("MobileWorkspace.dc.html")` equals `{ width: 390, height: 844 }`; `boardPreview("Flow.dc.html")` equals `{ width: 1848, height: 800 }`.
- [ ] **Step 2: Run** `npx vitest run scripts/design/renderBoard.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `renderBoard`.** Behaviour, in order:
  - Parse with jsdom. Remove `<script src="./support.js">` and the Google Fonts `<link>`. Move `<helmet>` children into `<head>`. Add a `<style>` of `@font-face` rules pointing at `file://` URLs of `node_modules/@fontsource/figtree/files/figtree-latin{,-ext}-{400,500,600,700}-normal.woff2` and `@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin{,-ext}-{500,700}-normal.woff2`. Add `<base href="file://<abs>/docs/design/boards/">`.
  - Props: the `default` of each key in `data-props` except `$preview`, overlaid with `opts.props`. State: `opts.state ?? null`.
  - Stub: `class DCLogic { constructor() { this.props = PROPS; this.state = STATE } setState(p) { this.state = { ...this.state, ...p } } }`; `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval` are no-ops. Do not call `componentDidMount`. Call `new Component().renderVals()`.
  - Expand depth-first: `sc-for list as` clones its children per item with the item bound to `as` and is replaced by the clones; `sc-if value` is replaced by its children when truthy, removed when not. Text `{{a.b}}` resolves dotted paths; `undefined`/`null` → `""`; booleans → `"true"`/`"false"`. Attributes are expanded the same way; `on*` attributes holding `{{…}}` and every `hint-*` attribute are removed.
- [ ] **Step 4: Run** the renderer test. Expected: PASS.
- [ ] **Step 5: Seed and copy-check tests.**
  - `src/test-support/harbourKings.test.ts`:
    - `it("matches the boards' contents")`: `harbourKings().components.map(c => c.name)` equals the 8 names above, in order; box 285/285/70; `printer.bedX` 256.
    - `it("keeps each committed seed current")`: for `harbour-kings`, `harbour-kings-headroom` and `harbour-kings-long`, the stored project's `layout.inputsHash` equals `inputsHash(project)` and `layout.geometryVersion` equals `GEOMETRY_VERSION`. On failure the message says `run npm run seeds`.
    - `it("stores two keys per seed")`: every seed's storage has `insert-generator:index` (a JSON array with one entry whose `id` is the project's) and `insert-generator:project:<id>`, and no other key except `insert-generator:prefs`.
    - `it("pins updatedAt")`: every seed's index entry has `updatedAt` 1792108800000.
    - `it("makes the stale seeds stale")`: for `harbour-kings-stale`, `-nofit`, `-pins` and `-notes`, `layout.inputsHash` differs from `inputsHash(project)`.
  - `src/test-support/boardCopy.test.ts` (jsdom):
    - `it("collects a board's literals")`: `boardLiterals("Main.dc.html")` has "Tap a tray for details.", "This plan stays unless a better one turns up.", "This plan is from before your last changes." and "Keep searching"; no member contains `{{`.
    - `it("reads only visible text")`: for `<div>A<span aria-hidden="true">B</span><span class="visually-hidden">C</span><span hidden>D</span><b>  E   F </b></div>`, `visibleStrings` returns `["A", "E F"]`.
    - `it("matches digits in literals to any number")`: literal "10 trays in 2 layers, 66 of 70 mm high" allows "8 trays in 3 layers, 60 of 70 mm high".
    - `it("splits on the middle dot")`: "Layer 1 (bottom) · 95 × 190 × 40 mm · about 3.5 h, 58 g" with a ruling "Layer 1 (bottom)" is fully allowed (the parts are a ruling, a measure and an estimate).
    - `it("knows measures and estimates")`: "285 × 285 × 70 mm", "1.6", "about 560 g", "about 33 h", "about 45 min" are allowed with empty literals and rulings.
    - `it("matches ruled templates")`: ruling text "The {name} tray doesn't fit yet" allows "The Heroes tray doesn't fit yet".
    - `it("never allows a denied board string")`: `boardLiterals("Main.dc.html")` has no "Update the plan", "Keep the old plan" or "Turn back"; `boardLiterals("NoFit.dc.html")` has no "Lay the figures down"; `unruled(["Lay the figures down"], { literals: await boardLiterals("NoFit.dc.html"), rulings: [], data: new Set(), engine: new Set() })` equals `["Lay the figures down"]`.
    - `it("reports what is left")`: `unruled(["Hello"], empty)` equals `["Hello"]`.
  - `src/app/shotsHold.test.ts`:
    - `it("resolves at once outside shots mode")`: with `globalThis.__shotsHold = { export: new Promise(() => {}) }`, `shotsHold("export")` resolves within 50 ms.
    - `it("waits on the named hold in shots mode")`: with `vi.stubEnv("MODE", "shots")` and a pending hold, it has not resolved after 50 ms; after the hold resolves, it resolves.
  - `scripts/smoke-dist.test.mjs`: `it("fails on a shots hold left in the build")`: a dist folder whose JS contains `__shotsHold` makes the check fail.
- [ ] **Step 6: Run** them. Expected: FAIL (modules missing).
- [ ] **Step 7: Implement the fixture** (`harbourKings.ts`) as specified, and `loadSeed` on the `import.meta.glob` map (no `node:` import in `src`). Create `src/screens/copy-rulings.ts` with `COPY_RULINGS = []` and `COPY_DENIED`: every string in "Board items the app does NOT build" and the left column of "Board copy conflicts", spelled as on the boards (e.g. "Update the plan", "Keep the old plan", "Turn back", "Top layer stays put", "+ Add", "Heroes don't fit yet", "Lay the figures down", "Everything fits. One layer gets shallower.", "Make the top layer shallower", "Fits. Event cards lie flat instead of standing.", "Keep them loose in one bin", "No pockets, smaller tray", "Let Dice go on any layer", "Everything fits, 1 more spacer", "Still doesn't fit", "Best", "needs 6 mm more height", "Heroes, a little too tall", "Too tall for this spot", "No room left", "Unpin one and everything fits.", "Keep it next to", "Choose…", "Still fits", "Use 70 mm", "Copy a report", "Start again", "Trays then fill up to the lid, so nothing falls out", "It's on the bottom layer, front right.").
- [ ] **Step 8: Implement `boardCopy.ts`.** Literals: text nodes of the raw `<x-dc>` markup with no `{{`, plus string literals (quotes or backticks without `${`) in the board script that contain a letter; trimmed, whitespace collapsed; minus every string in `COPY_DENIED` and every literal that contains one. Visible strings: text nodes outside `[aria-hidden="true"]`, `.visually-hidden` and `[hidden]` subtrees, trimmed and collapsed, empty ones dropped. Matching, per string: split on `" · "`; each part is allowed when it equals a literal (digit runs in a literal match any number), a ruling template (`{…}` matches any text), a member of `data` or `engine`, a measure `/^\d+(\.\d+)?( × \d+(\.\d+)?)*( mm| g| h| min| %)?$/`, or an estimate `/^about \d+(\.\d+)? (g|h|min)(, \d+(\.\d+)? (g|h|min))?$/`.
- [ ] **Step 9: Implement `make-seeds.mjs`.** For each seed: build the project, run `optimize(buildLayoutInput(p), DEFAULT_SEED, DEFAULT_ITERATIONS, { timeCapMs: DEFAULT_TIME_CAP_MS })` (for stale seeds: on the base project; then apply the edit). Assert: `harbour-kings`, `-headroom`, `-long` have a layout; `-nofit`'s fresh run (the way `runner.runNow` runs an edit: same seed, budget and warm start, see `runner.ts` lines 185–215) has `layout === null` and `misfitOf(...)?.name === "Heroes"`; `-pins`' fresh run has `lockConflicts.length > 0` and a non-null fallback; `-notes` is stale and `sizingNoticesOf(project).length >= 3` (on failure print the codes it got). A failed assertion follows the capped tuning rule above. Print a warning for any run with `layout.capped`. Save through `createProjectStore(new MemoryStorage())`, then set each index entry's `updatedAt` to `1792108800000`, and write `{ storage, projectId }` as `docs/design/seeds/<name>.json` (2-space JSON plus newline); write the fresh runs' results as `<name>.result.json` after checking they survive a JSON round trip deep-equal.
- [ ] **Step 10: Run** `npm run seeds`, then the Step 5 tests. Expected: PASS. Run `npm test`. Expected: PASS.
- [ ] **Step 11: Implement `shotsHold.ts`** and its two call sites: in `runner.ts`, after the worker returns for an "improve" (Keep searching) run, `await shotsHold("search")` before accepting; in `ExportPanel.tsx`, where `getMesh` is passed to the build, every call after the first awaits `shotsHold("export")`. Declare `__shotsHold?: Partial<Record<"export" | "search", Promise<void>>>` on `globalThis` in `src/env.d.ts`. Add the `__shotsHold` check to `smoke-dist.mjs`. Run `npm test`. Expected: PASS.
- [ ] **Step 12: Implement `states.mjs` and `regions.mjs`** with the table above. Board regions: `header` → `header`; `rail` → `aside`; `status` → the child of `main` that contains `main h1`; `plan-box` → the first element in `main` whose inline style has `aspect-ratio: 1`; `tray-bar` → `[aria-label="Selected tray"]`; `menu` → `[role="menu"]`; `dialog` → `[role="dialog"]`; `drawer` → `[role="dialog"]` on Settings; `sheet` → the absolutely placed `[role="region"]` or `[role="dialog"]` at the bottom of a phone board.
- [ ] **Step 13: Implement `shots.mjs`: boards.** Exit 1 with `npx playwright install chromium` when Chromium is missing. Render every board (default options) to `docs/design/boards/png/<Board>.png` at its preview size, and every state's board variant to `docs/design/boards/png/<Board>--<state>.png` at the state's viewport. Write rendered HTML to `node_modules/.cache/design/`.
- [ ] **Step 14: Implement `shots.mjs`: app.** Server lifecycle as decided. Per state: new context at the viewport, init script writing storage and holds, `goto`, run steps (each `click` uses `getByRole(role, { name })`; `waitFor` defaults to 15 s), wait for `document.fonts.ready`, screenshot the viewport to `<state>.app.png`. Check each seed with `inputsHash` and `GEOMETRY_VERSION` (through `viteModules.mjs`) before use; a stale seed exits 1 with `run npm run seeds`.
- [ ] **Step 15: Implement `shots.mjs`: compose and measure.** Compose `<state>.pair.png` by screenshotting a local HTML page that stacks the board PNG above the app PNG at 1:1 with a 24 px labelled gap ("Board: <file>", "App: <state>"). For each region found in both, crop each image to the region's bounding box and stack them into `<state>.<region>.pair.png`. Measure in both pages: `header` height, `rail` width, `plan-box` width, and the first `h1`'s computed font-size and text. Write `<state>.numbers.md` (columns: metric, board, app, Δ, flag).
- [ ] **Step 16: Run** `npm run shots`. Expected: 18 board PNGs plus one per state variant under `docs/design/boards/png/`; per state, `.app.png`, `.pair.png`, region pairs and numbers in the out folder, or a named failed step. Open `Main.png`, `NoFit.png` and `MobileWorkspace.png` and compare them with the canvas descriptions in `canvas.json`: they must show real text, no `{{`, and Bricolage headings.
- [ ] **Step 17: Write `docs/design/README.md`:** what the boards are; `npm run seeds` and `npm run shots`; that board PNGs and seeds are committed and app shots are not (until Task 17); the shots-mode holds.
- [ ] **Step 18: Run** `npm run verify`. Expected: exit 0.
- [ ] **Step 19: Commit** scripts, fixture, seeds, board PNGs, README, `package.json`, `.prettierignore`, `shotsHold` and its call sites. Not the app shots.

### Task 1: Tokens and base styles from the boards

**Boards:** Main, Empty, Edit, Box, Settings, Export (values in Global Constraints).

**Files:**

- Rewrite: `src/styles/tokens.css`. Every token in Global Constraints, light only, `:root { color-scheme: light }`. Keep the kind, spacer, axis (`--axis-x/y/z`) and paper (`--paper-white`) tokens and `--control-h`. Keep every legacy alias and old name (`--edge`, `--space-*`, `--radius-*`, `--rail-width`, `--page-max`, `--shadow-sheet`, `--on-focus`, `--focus-wash`, `--on-danger`, `--danger-wash`, `--on-warn`, `--warn-wash`, `--font-mono`, `--paper`, `--indigo`, `--madder`, `--ochre`, `--tint-8` …) mapped onto the new values, until Task 17.
- Delete: the `@media screen and (prefers-color-scheme: dark)` block. Its values stay in git history for Task 16 (cite this commit in the DESIGN line).
- Create: `src/styles/base.css`: body (page, ink, 15 px Figtree, 16 px below 760), headings in `--font-display` 700, the focus ring, the focused-field rule, `.tap`, `.visually-hidden`. Import it after `tokens.css`.
- Modify: `src/styles/fonts.css`: add Figtree 500 (latin and latin-ext woff2).
- Delete: `src/styles/proof.css` and its import; remove `/proof\.css/` from `test.css.include`; add `/base\.css/`.
- Modify: `src/style.test.ts`, `src/rules.test.ts` (only where named below).

**DESIGN amendments (this commit):**

- §2 Colour: "MUST redefine every new colour token in the dark block" becomes "Light is the default and only theme; MUST NOT follow the system's dark setting. Dark is opt-in (§4 Dark mode)."
- §4 Palette roles: add rows for the new roles (row, fill-quiet, track, info, fit, changed, scrim). §4 Shapes: replace the 2/4/8 px radii and "The code's tokens are the reference" with the board radii and spacing scale.
- §4 Typography: Figtree 400, 500, 600, 700. §4 Dark mode: "Not built; the old dark values are in git history (`<this commit>`)."
- §7 rows: "Tokens come from the boards, including shadows, spacing and radii"; "Figtree 500 added for the boards' segment labels"; "Dark set removed until it is opt-in".

**Protected tests** (they move to new selectors when markup changes, never deleted): `style.test.ts` "touch targets" suite, "makes every button 44 px by default", "gives the view's tabs a 44 px target", "breaks at the width the app asks about", "breaks at 600 px where the app asks about it…", the "breakpoints" suite, the "pills" suite, "prints on a light scheme whatever the screen uses", "fills the screen with an open sheet that holds the editor or the box, below 600 px"; `identity.test.ts` contrast tests; `rules.test.ts` "writes no raw hex colour…", "does not add uses of the legacy alias tokens".

**Interfaces:**

- Consumes: Global Constraints values.
- Produces: the tokens named in Global Constraints; `src/styles/base.css`.

- [ ] **Step 1: Failing tests** in `src/style.test.ts`:
  - `it("defines the board tokens")`: a table of every token name and value in Global Constraints, each asserted on `tokens.css`, for example `--r-card: 14px`, `--field-h: 48px`, `--page: #f4f3ef`, `--shadow-drawer: -20px 0 60px rgba(29, 31, 28, 0.25)` (compare normalized: lowercase, spaces collapsed, `.25` = `0.25`).
  - Replace "redefines every colour under the same name in the dark scheme" with `it("keeps dark opt-in")`: `tokens.css` has no `prefers-color-scheme: dark` and `:root` sets `color-scheme: light`. (Task 16 restores a per-token dark check.)
  - `it("keeps the legacy names")`: each legacy alias and old name listed above is still defined.
  - `it("ships Figtree 500")`: `fonts.css` has a `font-weight: 500` face for Figtree in latin and latin-ext.
- [ ] **Step 2: Run** `npx vitest run src/style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `tokens.css`.**
- [ ] **Step 4: Write `base.css`** and its import; add Figtree 500 to `fonts.css`.
- [ ] **Step 5: Delete `proof.css`.** Move any rule another file still needs into `style.css` with primary token names.
- [ ] **Step 6: Run** `npm test`. Expected: PASS. A failing test that pinned an old value is updated to the new value; a protected test is never deleted.
- [ ] **Step 7: Amend DESIGN** as listed.
- [ ] **Step 8: Gate.** `npm run shots -- first-visit workspace m-workspace`. The old layout with the new colours and type; say so in the report.
- [ ] **Step 9: Commit.**

### Task 2: The kit

**Boards:** Main, Empty, Edit, Box, Settings, Export, NoFit, MobileWorkspace (controls only).

**Files:** in `src/kit/`, each with a test: the primitives below, plus `src/kit/kit.css` (tokens only; add `/kit\.css/` to `test.css.include`), `src/kit/index.ts`, `kit.html` and `src/kit/Gallery.tsx`. `kit.html` at the repo root is served by `vite` in dev and shots mode; `vite build` builds only `index.html`, so it never ships.

**Primitives (board source; exact values from Global Constraints):**

- `Button` (`variant: "primary" | "secondary" | "quiet" | "soft"`, `size?: "control" | "dialog" | "cta"`, `blockedReason?: string`, `icon?`). Primary: ink fill, white text, 600. Secondary: sheet fill, 1 px `--field-line`. Quiet: no fill, 600, `--muted-strong`. Soft: `--page` fill (Pin, Turn 90°, Close). Pill, `--control-h`; `dialog` 48, `cta` 54 (16 px). `blockedReason` present → `aria-disabled="true"` and `aria-describedby` pointing at a visually hidden span with the reason; the click handler does not run; blocked look: `--rule` fill, `--muted-strong` text.
- `IconButton` (`label` required → `aria-label`; `variant: "plain" | "outlined" | "soft" | "primary"`; `dot?: boolean`): 44 circle. Dot: 10 px `--warn`, `--ring-dot`, top 6 right 6.
- `Field` (label above, 13 px muted, gap 6; 48 px, radius 12, unit suffix, value 17 px 600; error: 2 px `--danger` border, `aria-invalid`, `aria-describedby`). Wraps the existing `NumberField` rules for `inputmode` and `enterkeyhint`.
- `Stepper` (Edit "How many"): Fewer / input 90 × 44 radius 12, 18 px 600 / More; the buttons are outlined `IconButton`s labelled "Fewer" and "More".
- `Segmented` (`role="group"`, `aria-label`, `aria-pressed` buttons; `tone: "quiet" | "track"`): track padding 3, `--fill-quiet` or `--track`; thumb `--sheet` with `--shadow-thumb`, 600; off 500, `--muted-strong`; items 44 high.
- `ChoiceChips` (pressed pills; Edit card sizes, Settings bed): on `--ink` fill, 1.5 px ink border, white, 600; off sheet, 1 px `--field-line`; 44 high, padding 0 14, gap 8.
- `CheckRow` (label 600 + hint 13 muted left, 22 px checkbox right with `accent-color: var(--ink)`, min 52; `compact` 44).
- `KindTile` (Empty: 56 high, padding 0 12, radius 14, `--rule` border, `--row` fill, 600; 34 px icon tile radius 9 on the kind fill/ink).
- `IconTile` (`size: 34 | 36 | 40 | 44`; radius 9 / 10 / 10 / 12; kind fill/ink, or `--icon-ground` with `--muted`).
- `ListRow` (Main: button, min 52, padding 8 10, radius 12, gap 12, 1.5 px transparent border; selected: kind fill at 40 % and kind line border; `IconTile` 36; name 600 one line with ellipsis and `title`; meta 13 muted).
- `RuleChip` (Main: ink pill, white, 12 px 600, visual 32 high, padding 0 8 0 10, × icon 12; 44 px target; `aria-label` given by the caller).
- `Card` (box card: padding 12 14, radius 14, `--rule` border, `--row` fill, gap 14).
- `StatusHeading` (`tone: "fit" | "info" | "warn" | "error" | "neutral"`, `title`, `line?`, `extra?`): 40 px circle (phone 32) with the tone's ground and icon (fit `--fit-bg`/`--ok` check; info `--info-bg`/`--focus` arc; warn `--warn-bg`/`--warn-icon`; error `--danger-bg`/`--danger`; neutral `--icon-ground`/`--muted`), gap 14; `h1` 28 (phone 21) one line with ellipsis and `title`, letter-spacing −0.01em; muted line, gap 2.
- `Notice` (Main banner: flex wrap, gap 12, padding 12 14, radius 14; `tone: "info" | "warn"`: `--info-bg`/`--info-ink` or `--warn-bg`/`--warn-ink-strong`; bold title then body; primary and secondary small pills, secondary border `--line-strong`).
- `Toast` (Edit: ink fill, white, padding 12 16, radius 14, `--shadow-toast`, icon, `role="status"`). Keeps the existing `Toast.tsx` timing and live behaviour.
- `Disclosure` (Edit "More options": min 60, title 600 + summary 13 muted, chevron rotating 180°, `aria-expanded`, `aria-controls`; the panel is rendered only when open).
- `DisclosureRow` (Settings: 48 high, radius 12, `--rule` border; title 600 and a right meta, 13 px, muted or `--changed-ink` "N changed").
- `ProgressBar` (Exporting: `role="progressbar"`, 10 high, pill, `--fill-quiet` track, ink bar).
- `SearchField` (Settings: 44, radius 12, `--field-line`, search icon, `aria-label`).
- `StepBadge` (Empty: 26 circle, 13 px 700; `active` ink/white, else `--icon-ground`/`--muted`).
- `MenuPanel` (Main: 260 wide, padding 6, radius 14, `--rule` border, `--shadow-menu`; items min 44, padding 0 12, radius 10; separator 1 px `--rule-soft`, margin 4 8). A disclosure panel, not an ARIA menu (DESIGN §7).
- `Sheet` and `Dialog` (from `BottomSheet.tsx` and `Modal.tsx`, keeping their focus, Escape and `inert` behaviour and tests): `Dialog` radius 22, padding 32, `--shadow-dialog` over `--scrim`, max 560, full-screen below 600 (radius 0, padding 20). `Drawer` (Settings: right, full height, max 560, `--shadow-drawer`, full-screen below 600). `Sheet` (phone: radius 22 22 0 0, `--shadow-peek`, 40 × 5 handle `--handle` inside a 44 px handle button, `peek` 196).

**Interfaces:**

- Consumes: tokens (Task 1); `NumberField`, `BottomSheet`, `Modal`, `Toast` behaviour.
- Produces: the components above from `src/kit/index.ts`, with the props named above.

- [ ] **Step 1: Failing tests,** one file per primitive. Exact assertions:
  - `Button.test.tsx` `it("explains a blocked action")`: `<Button blockedReason="Fix the fit to download">Download</Button>` has `aria-disabled="true"`, no `disabled` attribute, and `aria-describedby` naming an element whose text is "Fix the fit to download"; clicking does not call `onClick`.
  - `IconButton.test.tsx` `it("is named by its label")`: `getByRole("button", { name: "Undo" })`; with `dot`, the dot is `aria-hidden="true"`.
  - `Segmented.test.tsx` `it("presses one option")`: `role="group"` named "Layer"; exactly one button has `aria-pressed="true"`; clicking another moves it.
  - `Stepper.test.tsx` `it("steps the count")`: More from 80 calls `onChange(81)`; Fewer at `min` is blocked with a reason.
  - `ChoiceChips.test.tsx` `it("marks the chosen chip")`: `aria-pressed="true"` on "Standard" only.
  - `ListRow.test.tsx` `it("keeps a long name on one line")`: a 40-character name has class `ellipsis` and `title` equal to the name.
  - `RuleChip.test.tsx` `it("names what the × does")`: `getByRole("button", { name: "Unpin Market deck and the trays on it" })` for that `aria-label`.
  - `StatusHeading.test.tsx` `it("is the page heading")`: `getByRole("heading", { level: 1, name: "Everything fits" })`; the icon is `aria-hidden`.
  - `Disclosure.test.tsx` `it("renders the panel only when open")`: closed → `aria-expanded="false"` and no panel in the DOM.
  - `ProgressBar.test.tsx` `it("reports its value")`: `aria-valuenow="30"`, `aria-valuemin="0"`, `aria-valuemax="100"`.
  - `Dialog.test.tsx`, `Sheet.test.tsx`: the existing `Modal.test`/`BottomSheet.test` cases, moved.
  - `style.test.ts` `it("sizes the kit from tokens")`: `kit.css` has `height: var(--control-h)` for `.k-btn`, `height: var(--field-h)` for `.k-field__box`, `border-radius: var(--r-pill)` for `.k-btn`, and no hex.
- [ ] **Step 2: Run** `npx vitest run src/kit src/style.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** Button, IconButton, Field, Stepper.
- [ ] **Step 4: Implement** Segmented, ChoiceChips, CheckRow, Disclosure, DisclosureRow, SearchField.
- [ ] **Step 5: Implement** KindTile, IconTile, ListRow, RuleChip, Card, StepBadge.
- [ ] **Step 6: Implement** StatusHeading, Notice, Toast, ProgressBar, MenuPanel.
- [ ] **Step 7: Implement** Dialog, Drawer, Sheet on the existing focus code. Turn `src/ui/Modal.tsx` and `src/ui/BottomSheet.tsx` into thin re-exports of `Dialog` and `Sheet` (same props), so old users keep working; Task 17 deletes the re-exports.
- [ ] **Step 8: Run** `npm test`. Expected: PASS.
- [ ] **Step 9: Gallery.** `Gallery.tsx` shows every primitive in each state (blocked, pressed, error, each tone). Add states `kit` (1440×900, URL `/kit.html`, nearest: Main, Empty, Edit, Settings) and `kit-phone` (390×844) to `states.mjs`.
- [ ] **Step 10: Gate.** `npm run shots -- kit kit-phone`.
- [ ] **Step 11: Commit.**
- [ ] **Step 12: STOP. Owner checkpoint A.** Show the owner `kit.app.png`, `kit-phone.app.png` and, for comparison, `docs/design/boards/png/Main.png`, `Empty.png`, `Edit.png`, `Settings.png`. The orchestrator also opens `npm run dev` → `/kit.html` itself. Wait for the owner's reply; record it in the ledger. Do not start Task 3 before it.

### Task 3: Workspace shell

**Boards:** Main (regions and proportions), MobileWorkspace (phone regions), Flow.

**Files:**

- Create: `src/screens/Workspace.tsx` (the layout only: `header`, `rail`, `stage` slots, and the phone arrangement), `src/screens/workspace.css` (add `/workspace\.css/` to `test.css.include`), `src/screens/Workspace.test.tsx`.
- Modify: `src/app/App.tsx`: render every screen inside `Workspace`. The old pieces go into named interim slots, unchanged:
  - header slot: the old `AppHeader` (Task 4).
  - rail slot: the old `Section` accordion with `WhatsInside`, editors and `BoxPanel` (Task 5, 10, 11); on first visit, the old first-visit block (Task 9).
  - stage slot: the old `StatusLine`, `Notices`, view tabs, `PlanView`/`Viewer`, `SelectedTrayBar` and `Summary` (Tasks 6–8).
  - phone: the old `BottomSheet` holding the rail slot (Task 5).
- Delete: the hint paragraphs under the plan and their CSS (fate #22).

**Layout (Main, MobileWorkspace):**

- Page: `height: 100dvh`, column; header `flex: none`; body `display: flex; flex-wrap: wrap; flex: 1; min-height: 0`.
- Rail: `flex: 1 1 var(--rail-basis); max-width: var(--rail-max); padding: var(--rail-pad); background: var(--sheet); border-right: 1px solid var(--rule)`, column, `min-height: 0`, `overflow: hidden` (its list scrolls, Task 5).
- Stage: `flex: 999 1 640px; min-width: 0; padding: var(--stage-pad)`, column, gap 16. `Workspace` takes `focus?: boolean` → `padding: var(--stage-pad-focus)` (first visit, editor, box, fit problems).
- Below 760: the stage first (`order: -1`), the rail becomes the `Sheet` (Task 5 fills it); header height `--header-h-phone`.
- `data-region` attributes: `header`, `rail`, `stage`.

**Interfaces:**

- Consumes: `Sheet` (Task 2), tokens.
- Produces: `<Workspace header rail stage focus? sheetSummary? />` and the `data-region` names above.

- [ ] **Step 1: Failing tests:**
  - `Workspace.test.tsx` `it("has one banner, a rail named What's inside and one main")`: `getAllByRole("banner")` length 1; `getByRole("complementary", { name: "What's inside" })`; `getAllByRole("main")` length 1.
  - `style.test.ts` `it("gives the rail Main's width on every screen")`: `workspace.css` `.ws-rail` has `flex: 1 1 var(--rail-basis)` and `max-width: var(--rail-max)`; tokens `--rail-basis: 300px`, `--rail-max: 350px`.
  - `style.test.ts` `it("lets the stage take the rest")`: `.ws-stage` has `flex: 999 1 640px`, `min-width: 0`, `padding: var(--stage-pad)`; `.ws-stage--focus` has `padding: var(--stage-pad-focus)`.
  - `style.test.ts` `it("fills the viewport and never scrolls the page on desktop")`: `.ws` has `height: 100dvh`; `.ws-body` has `min-height: 0`.
  - `style.test.ts` `it("puts the stage first on a phone")`: inside `@media (width < 760px)`, `.ws-stage` has `order: -1`.
  - `App.test.tsx` and `App.phone.test.tsx`: unchanged and passing.
- [ ] **Step 2: Run.** Expected: FAIL for the new tests.
- [ ] **Step 3: Implement `Workspace.tsx` and `workspace.css`.**
- [ ] **Step 4: Move `App.tsx`'s render into `Workspace`** with the interim slots; delete the hint paragraphs.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Gate.** `npm run shots -- workspace m-workspace first-visit`. Expected: rail width 300–350 in the numbers at 1440 (`≠` against Main's 350 is not allowed); header and plan still old.
- [ ] **Step 7: Commit.**

### Task 4: Header and project menu

**Boards:** Main (header, menu panel, `menuNote`, `{state:{menu:true}}` and `{props:{notice:"otherTab"}}` variants), EditKinds (Redo), MobileWorkspace (phone header).

**Owns:** fate rows 1–8.

**Files:**

- Create: `src/screens/Header.tsx`, `src/screens/ProjectMenu.tsx` (on `MenuPanel`), `src/screens/header.css`, tests beside them.
- Create: `src/screens/copy-rulings.ts`, `src/screens/copy.board.test.tsx`.
- Delete: `src/ui/AppHeader.tsx`, `src/ui/ProjectMenu.tsx` and their CSS after moving their tests (`AppHeader.test.tsx` → `Header.test.tsx`, `ProjectMenu.test.tsx` → `screens/ProjectMenu.test.tsx`). Delete the footer in `App.tsx`. Restyle `InsertsList.tsx` with kit pieces.

**Desktop header (left to right):** logo (28 square, radius 8, ink, four `--logo-*` squares radius 2, gap 3, padding 5, `aria-hidden`); wordmark "Insert Generator" (Bricolage 700 18; an `h1` while the prop `brandIsHeading` is true, else a `span`; see N1 below); divider 1 × 22 `--field-line`; name button (44 high, padding 0 10, radius 8, `--muted-strong`, name + pencil 14; click → inline input, existing commit rules); saved status (13 px, `--ok` with check; "Saving paused" in `--warn-ink`; other states as today); flexible gap; Undo and Redo (`IconButton` plain, titles "Undo (Ctrl+Z)" etc., Redo blocked "Nothing to redo"); menu button (`IconButton` outlined, "Project menu" or "Project menu, 1 notice", dot when menu notes exist); Download (`Button` primary with download icon 16, gap 8, padding 0 18; blocked with its reason). Gap 12, padding 0 24, `--header-h`, bottom 1 px `--rule`. `data-region="header"`.

**Phone header (below 760):** logo 26 radius 7; name (700, one line, ellipsis) over "Saved in this browser" (12 px muted); Undo; Send file (`IconButton` plain, share icon); menu button (ruling: the board omits it, Settings and files must stay reachable); Download (`IconButton` primary, `aria-label="Download"`, blocked: `--rule` fill, `--ink-off` icon, reason in `title` and `aria-describedby`). No Redo, no divider.

**Menu panel:** anchored under the menu button (right-aligned to it, 4 px below). Items: [phone only: "Redo"], menu notes (each a `menuNote` box: padding 12, radius 10, `--warn-bg`, `--warn-ink-strong`, 14 px, line-height 1.45; bold title + body; buttons primary and secondary 13 px, 44 target), "New insert", "Your inserts" with right meta "<n> in this browser" (13 px muted), "Open file…", "Save file", separator, "Settings", separator, muted line "Insert Generator <version> (<build id>)" (13 px, not a button), link "Licences" (to `./third-party-licenses.txt`). Another-tab note uses the board's words: "You changed this insert in another tab." "Saving is paused here until you choose." "Keep this version" / "Use the other tab version". Your inserts is a page of the panel with a Back button (existing behaviour).

**Interim h1 (N1).** `App.test.tsx` asserts one h1 on every screen, and the screens' own h1s land later (workspace Task 6, first visit Task 9, editor Task 10, box Task 11). So `Header` takes `brandIsHeading: boolean` (default `true`): the wordmark is the h1 until a screen passes `false` because its own h1 has landed. Task 4 passes `true` everywhere. Task 11 removes the prop; from then the wordmark is always a `span`.

**DESIGN amendments:** §5 Workspace and Project menu paragraphs (new files, items, no footer); §2 one-h1 rule unchanged here (the wordmark is still the h1); §7 rows: footer moves into the menu (replaces "Footer is version, build id and licences"); Delete lives in Your inserts; Send file leaves the menu; phone header gets the menu button; Redo on desktop beside Undo and in the phone menu.

**Copy check (starts here):** `copy-rulings.ts` exports `COPY_RULINGS: readonly { text: string; states: readonly string[] | "all"; ruling: string }[]`; `ruling` is the first words of a §7 row's Decision cell. `copy.board.test.tsx` (jsdom) defines one case per `(state, region)`: render with `renderApp({ project: loadSeed(seed).project })` (phone states with the `matchMedia` stub `App.phone.test.tsx` uses), run the state's steps with Testing Library, then `unruled(visibleStrings(region))` must equal `[]`. `data` = project name, component names, piece and deck names, tray names (`trayNames`); `engine` = the store's notices, validation messages, lock-conflict reasons, `canTurn` reasons and the list's row summaries.

**Interfaces:**

- Consumes: kit; `SavedStatus`, `historyKeys`, `placeNotices`, `menuNoticeCount`, `InsertsList`; `APP_VERSION`, `BUILD_ID`.
- Produces: `<Header …>` with the props of today's `AppHeader` plus `phone: boolean`, `onSendFile` and `brandIsHeading?: boolean` (removed in Task 11); `<ProjectMenu …>`; `COPY_RULINGS`; the copy test harness.

- [ ] **Step 1: Failing tests:**
  - `Header.test.tsx`: every existing `AppHeader.test` case, moved, with this changed: `it("has one h1 with the wordmark and an editable project name")`: with `brandIsHeading` (the default) the banner has `getByRole("heading", { level: 1, name: "Insert Generator" })`; with `brandIsHeading={false}` it has no h1; the name button reads "Harbour Kings" and Enter after editing commits.
  - `Header.test.tsx` `it("shows Undo and Redo on desktop, Undo only on a phone")`.
  - `Header.test.tsx` `it("offers Send file in the phone header")`: `getByRole("button", { name: "Send file" })` when `phone`.
  - `ProjectMenu.test.tsx`: existing cases moved; new: `it("ends with the version and Licences")`: the last two children read "Insert Generator 0.4.0 (<BUILD_ID>)" and a link "Licences"; `it("has no Delete or Send file")`; `it("offers Redo first on a phone")`.
  - `App.test.tsx`: `it("has no footer")`: `queryByRole("contentinfo")` is null.
  - `copy.board.test.tsx`: cases `workspace/header`, `workspace-menu/menu`, `m-workspace/header`; `it("cites a real decision-log row for every ruled string")`: each `ruling` appears in DESIGN §7.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `Header.tsx`** (desktop and phone).
- [ ] **Step 4: Implement `ProjectMenu.tsx`** and restyle `InsertsList`.
- [ ] **Step 5: Wire into `App.tsx`;** delete the footer and the old files.
- [ ] **Step 6: Implement the copy check** cases and the rulings these strings need.
- [ ] **Step 7: Run** `npm test`. Expected: PASS.
- [ ] **Step 8: Amend DESIGN** as listed.
- [ ] **Step 9: Gate.** Add states `workspace-menu-phone` (390×844, nearest Main menu panel) and `inserts` (open the menu, click "Your inserts"; nearest Main menu panel). Run `npm run shots -- workspace workspace-menu m-workspace workspace-menu-phone inserts`.
- [ ] **Step 10: Commit.**

### Task 5: Rail: What's inside

**Boards:** Main (rail), MobileWorkspace (sheet), NoFit and PinConflict (row variants are Task 12).

**Owns:** fate rows 9, 10, 11, 40 (rail half).

**Files:**

- Create: `src/screens/Rail.tsx`, `src/screens/KindPicker.tsx`, `src/screens/rail.css`, tests.
- Modify: `src/app/actions.ts`: add `export function clearChoices(p: Project): Project` (removes every lock; pure; additive).
- Rewrite: `src/ui/components/WhatsInside.tsx`, `ComponentList.tsx` on `ListRow` and `RuleChip` (keep their behaviour tests).
- Delete: `src/ui/Section.tsx`, the accordion state in `App.tsx`, `AddKinds` and their CSS. Map `Summary`'s `onShowSection(id)` (still mounted until Task 6) to: a component id → open its editor; "box" → open the box editor; "settings" → open Settings.

**Desktop rail (Main), top to bottom, gap 16:**

- Box card (`Card`, a button): `IconTile` 40 on `--icon-ground` with the box icon; "The box" (13 muted) over "285 × 285 × 70 mm" (16, 600); "Change" (14, 600, `--muted-strong`). Opens the box editor.
- Row: h2 "What's inside" (`--h2`) and `Button` secondary "Add" with a plus icon (padding 0 16, 14 px). Add opens `KindPicker`: a `MenuPanel` of five `KindTile`s (Cards, Tokens and dice, Tiles, Miniatures, Something else).
- List (`ul`, gap 4, `overflow: auto`, `flex: 1 1 auto`, `min-height: 0`): one `ListRow` per component; meta "<row summary> · Layer 1 (bottom)" (the layer of its first tray; omitted without a plan); `aria-pressed` when selected; hover and focus light the component's trays (Task 7 consumes `hovered`). Rule chips after the row (`RuleChip` per rule, existing labels and × names).
- When any lock exists: a note (padding 12, radius 12, `--page` fill): "These stay as you set them when the plan updates." (13, `--muted-strong`, line-height 1.5) and a quiet underlined button "Clear all my choices" (14, 600, min 44) → `store.edit(clearChoices)`.
- Footer (`margin-top: auto`, padding-top 12, top 1 px `--rule-soft`, gap 10, 14 px muted): printer icon 18; "Printer bed 256 × 256 mm" (the insert's printer); quiet link "Settings" (600, min 44, padding 0 8).
- `data-region="rail"`.

**Phone sheet (MobileWorkspace):** `Sheet` peek 196, handle button "Show everything"; head row: h2 holding a button ("What's inside" in Bricolage 19 + count 14 muted + chevron, `aria-expanded`) and `Button` secondary "Add" (plus icon); list: first row "The box" (14 px dashed `--spacer-dash` square, 600, size right 14 muted), then one row per component (12 px kind swatch, name 600, meta right 14 muted); rows min 52, radius 12, padding 0 8. `data-region="sheet"`.

**DESIGN amendments:** §5 Editor flow ("What's inside lists components; Add opens a kind picker"); §5 Workspace (rail contents); §3 "Let the person drop a rule…" add "Clear all my choices"; §7 rows: one rail width (Main's) on every screen; Add opens a picker; Clear all my choices is one undo step; the footer line in the rail shows the insert's printer.

**Interfaces:**

- Consumes: kit; `ComponentList` behaviour; `layers.ts` (a component's layer); `removeLock`, new `clearChoices`.
- Produces: `<Rail mode="list" … onOpenBox onOpenEditor onAdd onHover />`, `<KindPicker onPick />`, `clearChoices`.

- [ ] **Step 1: Failing tests:**
  - `actions.test.ts` `it("clears every choice in one step")`: a project with a position lock, a size lock and a stack lock → `clearChoices(p).locks` equals `[]`; components and box unchanged.
  - `Rail.test.tsx`:
    - `it("opens the box editor from the box card")`: clicking the button named /The box/ calls `onOpenBox`.
    - `it("adds from the Add pill")`: clicking "Add" shows five buttons named "Cards", "Tokens and dice", "Tiles", "Miniatures", "Something else"; choosing "Tiles" calls `onAdd("tiles")`.
    - `it("lists items with one-line names")`: the 40-character name's row text has class `ellipsis` and `title` equal to the name.
    - `it("shows the rules note only with choices")`: no "Clear all my choices" without locks; with one pin it is there and clicking it leaves `project.locks` empty in one undo step (`store.undo()` brings the pin back).
    - `it("shows the printer bed and Settings")`: text "Printer bed 256 × 256 mm" and a button "Settings".
  - `style.test.ts` `it("scrolls the list inside the rail")`: `.rail-list` has `overflow: auto` and `min-height: 0`.
  - `App.phone.test.tsx`: `it("lists The box first in the sheet")`: the first row in the sheet reads "The box".
  - `copy.board.test.tsx`: cases `workspace/rail`, `m-workspace/sheet`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `clearChoices`.**
- [ ] **Step 4: Implement the desktop `Rail`** (box card, h2 row, list, rules note, footer).
- [ ] **Step 5: Implement `KindPicker`.**
- [ ] **Step 6: Implement the phone sheet contents.**
- [ ] **Step 7: Wire into `App.tsx`;** delete `Section`, the accordion and `AddKinds`; remap `onShowSection`.
- [ ] **Step 8: Run** `npm test`. Expected: PASS.
- [ ] **Step 9: Amend DESIGN.**
- [ ] **Step 10: Gate.** `npm run shots -- workspace workspace-long m-workspace`. `workspace-long` must not scroll the page (`shots.mjs` fails it if `scrollHeight > innerHeight`).
- [ ] **Step 11: Commit.**

### Task 6: Stage top: status heading, segments, banner, and the Summary's jobs

**Boards:** Main (stage top, `{state:{searching:true}}`, `{props:{notice:"outdated"}}`, `{props:{notice:"noWebGL"}}`), MobileWorkspace (phone status and segments).

**Owns:** fate rows 12–21, 23, 43.

**Files:**

- Create: `src/screens/StageTop.tsx`, `src/screens/StageNotes.tsx`, `src/screens/RunAnnouncer.tsx`, `src/ui/estimates.ts`, `src/screens/stage.css`, tests.
- Modify: `src/ui/ExportPanel.tsx` (filament and print time, plainly, until Task 13), `src/ui/TrayBar.tsx` (its estimate through `estimates.ts`), `src/app/App.tsx`.
- Delete (last step, after every job has a home and a passing test): `src/ui/Summary.tsx`, `Summary.test.tsx`, `src/ui/StatusLine.tsx` (its tests move to `StageTop.test.tsx`), `src/ui/components/ListNotices.tsx`, their CSS.

**Status heading (left of the row; Main `aria-live` row: flex wrap, space-between, gap 14):** one `StatusHeading` = the page's h1. Tones and words:

| State                | Tone    | h1                                           | Muted line                                                       | Actions (right)                                                |
| -------------------- | ------- | -------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Fits                 | fit     | "Everything fits"                            | "<n> trays in <l> layers, <h> of <H> mm high" (H below headroom) | Keep searching (secondary, search icon)                        |
| Searching            | info    | "Searching for a better plan…"               | "This plan stays unless a better one turns up."                  | Stop (secondary, 1 px ink border, padding 0 18)                |
| Making a new plan    | info    | "Making a new plan…" (`MAKING_PLAN_MESSAGE`) | none                                                             | none                                                           |
| No plan yet          | neutral | "No plan yet"                                | none                                                             | none                                                           |
| Run failed           | error   | Summary's existing failure headline          | the error message                                                | Retry (secondary)                                              |
| Inputs have errors   | error   | "Fix the errors marked in the inputs"        | then each error with no field, one per line                      | "Edit <name>" / "Change the box" / "Settings" per problem area |
| No fit, pin conflict | warn    | Task 12                                      | Task 12                                                          | Task 12                                                        |

To the right of the heading (gap 10): Layer `Segmented` (tone `track`, `aria-label="Layer"`, labels "Layer 1 (bottom) · 40 mm" … "Layer n (top) · 26 mm", height from the layout; only with 2+ layers); View `Segmented` (`aria-label="View"`, "Top" and "3D"; 3D blocked without WebGL, title "3D needs WebGL"); then the action. Under the row when WebGL is missing: "3D needs a browser with WebGL turned on. The top view works the same." (13 muted). Phone: icon 32, h1 21, line 13; the segments in their own row (Layer `flex: 1` with "Layer 1 (bottom)" labels, 3D a separate pressed toggle button, as MobileWorkspace). `data-region="status"`.

**Relocation of the Summary's jobs (each with a test, all before Summary is deleted):**

| Job                                   | New home                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run announcer (`data-live="run"`)     | `RunAnnouncer`: a mounted, visually hidden `role="status"` beside the heading; same messages and the same 1 s rule.                              |
| Optimizer error + Retry               | Heading, error tone, Retry → `store.retry()`.                                                                                                    |
| Errors with no field                  | Heading, error tone, listed under the h1 (`errorsWithoutField`).                                                                                 |
| Jump links                            | Pills in the heading's action slot, opening the editor, the box editor or Settings.                                                              |
| Layout and sizing notices, "Show all" | `StageNotes` under the plan caption: `Notice` boxes (warn tone for warnings, info otherwise), first `LAYOUT_NOTICES_SHOWN` (3), then "Show all". |
| Filament and print time               | `ExportPanel`: "Filament" "about <g> g", "Print time" "about <t>" (plain `dl` until Task 13).                                                    |

**Plan banner:** above the status row, one at most (`placeNotices`): stale → `Notice` info, "This plan is from before your last changes." "Download is off until it is updated." + "Make a new plan"; older geometry → `Notice` warn, existing title and body + "Reprint everything" / "Use the old plan".

**`estimates.ts`:** `formatGrams(g: number): string` → `"about 560 g"` (at least 1); `formatPrintTime(minutes: number): string` → `"about 45 min"` under an hour (to 5 min), else `"about 33 h"` / `"about 3.5 h"` (to the half hour).

**Interim h1 (N1):** `App.tsx` passes `brandIsHeading={false}` wherever `StageTop` renders (the workspace, including while an editor or the box editor is open in the rail); first visit keeps `true` until Task 9.

**DESIGN amendments:** §2 Accessibility: "MUST have exactly one h1 per screen: the status heading on the workspace (`StageTop`), a screen's own stage h1, or the guide title. The wordmark is the h1 only on a screen that has none of its own." §2 Claims: "≈ 42 g · ≈ 3 h 10 min" → "about 42 g", "about 3 h". §2 Layout: drop the Summary sentence and the 24 rem floor (Task 7 sizes the plan). §3 "Announce only what matters": file name `RunAnnouncer.tsx`. §5 Status line → "Status heading" (tones table). §7 rows: status heading is the page h1 (ruling); Summary's figures dropped, filament and time go to Download; layout notices under the plan caption; no progress bar while searching; "about" estimates (owner); the Summary jobs' new homes.

**Interfaces:**

- Consumes: kit `StatusHeading`, `Segmented`, `Notice`, `Button`; state signals (`run`, `summary`, `validation`, `layoutNotices`, `sizingNotices`, `lockConflicts`, `noFitAttempt`); `placeNotices`; `errorsWithoutField`; `layers.ts`.
- Produces: `<StageTop … />` (exports `statusOf(state): { tone; title; line?; actions }` for Task 12 to extend), `<StageNotes notices />`, `<RunAnnouncer />`, `formatGrams`, `formatPrintTime`, the Layer and View selection signals used by Task 7.

- [ ] **Step 1: Failing tests** (`StageTop.test.tsx`, `StageNotes.test.tsx`, `RunAnnouncer.test.tsx`, `estimates.test.ts`, `ExportPanel.test.tsx`):
  - `it("names the state in the page's one h1")`: with the Harbour Kings seed, `getAllByRole("heading", { level: 1 })` has length 1 and name "Everything fits" (the wordmark is not a heading on the workspace); the line matches `/^\d+ trays in \d+ layers?, \d+ of 70 mm high$/`.
  - `it("Keep searching becomes Stop while running")` (kept from `StatusLine.test`), plus h1 "Searching for a better plan…" and line "This plan stays unless a better one turns up.".
  - `it("says Making a new plan… while an edit's run is pending")`.
  - `it("shows the run error with Retry")`: a failed run → h1 is Summary's failure headline; clicking "Retry" calls `retry` once.
  - `it("lists errors that have no field")`: a project whose validation has one field-less error shows its message under the h1.
  - `it("sends the person to the input in error")`: a component in error → button "Edit Market deck" opens its editor (the rail shows the back link "What's inside"); a box in error → "Change the box" opens the box editor.
  - `it("shows layout notices under the plan, three then Show all")`: 5 notices → 3 visible, "Show all" reveals 5.
  - `RunAnnouncer.test.tsx`: the four `Summary.test` "live region" cases, moved unchanged in meaning.
  - `ExportPanel.test.tsx` `it("shows filament and print time")`: "Filament" with "about <n> g", "Print time" with `/^about \d+(\.\d)? h$|^about \d+ min$/`.
  - `estimates.test.ts`: `formatGrams(559.6)` → "about 560 g"; `formatGrams(0.2)` → "about 1 g"; `formatPrintTime(43)` → "about 45 min"; `formatPrintTime(1980)` → "about 33 h"; `formatPrintTime(208)` → "about 3.5 h".
  - `StageTop.test.tsx` `it("labels layers by number and height")`: two layers → buttons "Layer 1 (bottom) · 40 mm" and "Layer 2 (top) · 26 mm" (heights from the seed's layout); one layer → no Layer group.
  - `style.test.ts`: replace "leaves the order of the stage to the page: the status pill, the box, then the figures" with `it("orders the stage: banner, status, plan")`.
  - `copy.board.test.tsx`: cases `workspace/status`, `workspace-searching/status`, `workspace-banner/status`, `m-workspace/status`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `estimates.ts`;** point `TrayBar` and `ExportPanel` at it; add filament and time to `ExportPanel`.
- [ ] **Step 4: Implement `RunAnnouncer`.**
- [ ] **Step 5: Implement `StageTop`** (heading tones, segments, actions, the no-WebGL line).
- [ ] **Step 6: Implement the banner and `StageNotes`.**
- [ ] **Step 7: Wire into `App.tsx`** next to the still-mounted `Summary`; run `npm test`. Expected: PASS with both mounted.
- [ ] **Step 8: Delete** `Summary`, `StatusLine`, `ListNotices` and their CSS. In `src/rules.test.ts` "reads the source", replace the expected `/src/ui/StatusLine.tsx` with `/src/screens/StageTop.tsx`. Run `npm test`. Expected: PASS.
- [ ] **Step 9: Amend DESIGN.**
- [ ] **Step 10: Gate.** `npm run shots -- workspace workspace-searching workspace-banner m-workspace`. Add the jump check to `shots.mjs`: the bounding boxes of `header`, `rail` and `plan-box` in `workspace` and `workspace-searching` are equal within 1 px, else exit 1.
- [ ] **Step 11: Commit.**

### Task 7: The plan and the 3D frame

**Boards:** Main (box, tiles, slot, caption; `{state:{sel:"market"}}` for the selected ring), MobileWorkspace (phone box).

**Owns:** fate rows 24, 25, 40 (plan half).

**Files:**

- Rewrite the render and CSS of `src/plan/PlanView.tsx` and `plan.css`. Keep its props, selection, keyboard, drag and swap logic and their tests.
- Restyle `src/viewer/Viewer.tsx`'s frame (same size, radius and ground as the plan; axes toggle in its corner).
- Create: `src/screens/StageSlot.tsx` (the 52 px slot).

**Values (Main):**

- Column: `flex: 1 1 560px; min-width: 0`, centred, gap 12. Slot above the box: `min-height: var(--stage-slot)`; holds "Tap a tray for details." (muted) when nothing is selected, or the tray bar (Task 8), or a toast (Task 10).
- Height (N5): the plan column is `flex: 1 1 auto; min-height: 0` and holds, top to bottom, the slot, `.plan-fit` (`flex: 1 1 0; min-height: 0; container-type: size; display: grid; place-items: center`), the caption, the pins line and `StageNotes`. The stage is `min-height: 0` and never scrolls on desktop; the box shrinks instead.
- Box: longer side `min(582px, 100cqw, 100cqh)` inside `.plan-fit`, other side by W:L; radius 16; `--box` ground; `inset 0 0 0 1px var(--box-edge)`; floor inset 6 px; each tile drawn 3 px inside its footprint (6 px between neighbours). Phone: `calc(100vw - 32px)`, radius 14. `data-region="plan-box"`.
- Tile: radius 10, padding 8, kind fill with 2 px kind line; spacer: hatch `repeating-linear-gradient(135deg, var(--spacer-fill) 0 6px, var(--spacer-hatch) 6px 12px)` with a 2 px dashed `--spacer-dash` edge. Compartment cells (N7): each `CompartmentSpec` in `TraySpec.compartments` drawn at its own scaled position and size inside the tile (not a grid), radius 6, `rgba(255,255,255,.6)` fill, 1 px kind line at 25 %, as the board's cells.
- Name pill: centred, 13 px 600, padding 2 9, pill, `rgba(255,255,255,.92)`, kind ink (spacer `--muted-strong`), one line; the kind icon (13) only when hovered, focused or selected; cut by `tileText.ts`.
- Pinned: a 26 px ink circle with a white pin icon, top 8 right 8, `role="img"`, `aria-label="Pinned"`. Turned pin: a tag "Turned", left 8 bottom 8, 12 px 600, padding 2 8, ink pill, white.
- Hover or selection: every other tile at opacity 0.5; transitions 180 ms on opacity and box-shadow (none with reduced motion). Selected: `--ring-selected`.
- Caption under the box: "<layer name>, seen from above. Front of the box" + down arrow 12 (13 muted, gap 6). Phone: "Front of the box" (12 muted). Under it, while any pin exists: "Spacers fill the gaps again when the plan updates." (13 muted). Then `StageNotes` (Task 6).
- 3D: the same frame; selected by the "3D" segment.

**DESIGN amendments:** §2 Layout: "The plan's longer side is at most 582 px and shrinks to the width and height left in the stage; the stage never scrolls on desktop" replaces the 24 rem floor; §4 Shapes: tile radius 10, frame 16; §5 Selection: the slot and "Tap a tray for details."; §7 rows: the plan's size comes from Main (582 px), not "fills the stage"; the 3D view keeps three.js inside Main's frame.

**Interfaces:**

- Consumes: Layer/View selection (Task 6), rail hover (Task 5), `layers.ts`, `tileText.ts`, `glyph.ts`, `shadeOf`.
- Produces: `<PlanView …>` (props unchanged), `<StageSlot>{children}</StageSlot>`.

- [ ] **Step 1: Failing tests** (`PlanView.test.tsx`, `StageSlot.test.tsx`, `style.test.ts`):
  - `it("captions the box with its layer and its front")`: text "Layer 1 (bottom), seen from above. Front of the box".
  - `it("keeps name pills on one line")`: a 40-character tray name renders cut, with the full name in `title`.
  - `it("draws a cell per compartment")`: Starter decks' tray (4 wells) has 4 `.plan-cell`.
  - `it("badges a pinned tray")`: a pinned tray has `getByRole("img", { name: "Pinned" })`; a turned pin also shows "Turned".
  - `it("dims the other trays")`: selecting Market deck gives every other tile class `is-dimmed`.
  - `StageSlot.test.tsx` `it("asks for a tap when nothing is selected")`: "Tap a tray for details.".
  - `PlanView.test.tsx` `it("draws each compartment where it is")`: for a tray whose `compartments[0]` is at x 0 and 50 % of the tray's width, `.plan-cell` 0 has `left: 0%`-equivalent placement and width 50 % of the tile's inner width (assert the computed style values the renderer writes).
  - `style.test.ts` `it("sizes the plan from Main and the height left")`: `.plan-fit` has `container-type: size` and `min-height: 0`; `.plan-box` uses `min(582px, 100cqw, 100cqh)`; below 760, `.plan-box` uses `calc(100vw - 32px)`; `.plan-tile.is-dimmed` has `opacity: 0.5`; replace "keeps the plan at least 24 rem tall…" with this test.
  - `style.test.ts` "gives the view's tabs a 44 px target": moved to `.k-seg__btn`.
  - `copy.board.test.tsx`: cases `workspace/plan-box`, `m-workspace/plan-box`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the frame, floor and tile geometry.
- [ ] **Step 4: Implement** cells, name pills, badges, tags.
- [ ] **Step 5: Implement** hover/selection dimming and the selected ring.
- [ ] **Step 6: Implement** the slot, the caption and the pins line; restyle the 3D frame.
- [ ] **Step 7: Run** `npm test`. Expected: PASS.
- [ ] **Step 8: Amend DESIGN.**
- [ ] **Step 9: Gate.** `npm run shots -- workspace workspace-long workspace-banner workspace-banner-notes m-workspace`. `shots.mjs` fails `workspace` if `plan-box` is narrower than 560 px at 1440×900, and fails `workspace-long`, `workspace-banner` and `workspace-banner-notes` if the page or the stage scrolls (`scrollHeight > clientHeight`).
- [ ] **Step 10: Commit.**

### Task 8: Tray bar

**Boards:** Main (`{state:{sel:"market"}}`), MobileTray.

**Owns:** fate rows 26–28, 39.

**Files:** rewrite the markup and CSS of `src/ui/TrayBar.tsx` and `SelectedTrayBar.tsx` on the kit; keep their behaviour tests (Pin/Unpin, Turn 90°, Swap with…, Lock size, Edit, Close, `canTurn` reasons). Delete the old tray-bar CSS.

**Desktop (in the stage slot, Main):** `role="region"`, `aria-label="Selected tray"`; one wrapping row: padding 8 8 8 12, radius 18, `--sheet`, 1 px `--rule`, `--shadow-bar`, gap 8. Children in order: swatch (30, radius 9, kind fill with 2 px line; spacer hatch); name (700, one line, ellipsis, `title`) over meta (13 muted) in `flex: 1 1 200px`; Pin/Unpin (`Button` soft with pin icon; pinned: ink fill, white); "Turn 90°" (soft, turn icon, blocked with the `canTurn` reason); "Edit" (primary, padding 0 16); "More" (quiet, `aria-expanded`), opening a small `MenuPanel` with "Swap with…" (`aria-pressed`) and "Lock size"/"Unlock size"; Close (`IconButton` soft, "Close"). A blocked reason shows as a full-width line (13, `--warn-ink`). Meta: "<Layer n (…)> · <W × D × H mm> · about <t>, <g> g". Spacer, spare tray or riser: swatch, name, meta and Close only; spacer meta "Fills the gap so the trays can't slide. Print it too. <W × D × H mm>"; riser meta "Carries <name> · <size>". `data-region="tray-bar"`.

**Phone (MobileTray):** a modal `Sheet` (`role="dialog"`, `aria-labelledby` its h2), height 404, `--shadow-sheet-modal`: handle; header row (36 icon tile with 2 px line, h2 21 Bricolage name, meta "Layer 1 (bottom) · <compartments>", Close); primary "Edit <name>" (48 high, full width); `dl` Size and Printing ("about 3.5 h, 58 g"); a 3-column grid of 68 px soft tiles: Pin, Turn 90°, More (opens Swap with… and Lock size). Other trays at 0.5 behind it.

**DESIGN amendments:** §5 Selection and the tray bar (one line meta, More holds Swap with… and Lock size, spacers have no actions); §7 rows: More holds Swap with… and Lock size (owner); spacers, spares and risers show no actions (replaces "every action blocked with one shared reason"); no "To other layer" (Phase 3).

**Interfaces:**

- Consumes: kit; `canTurn`; `formatGrams`, `formatPrintTime`; `StageSlot` (Task 7); `toggleLock`, `turnTray`, `toggleSizeLock`, `swapTrays`.
- Produces: `<TrayBar …>` with its current props plus `phone: boolean`.

- [ ] **Step 1: Failing tests** (`TrayBar.test.tsx`):
  - `it("keeps name, meta and actions in one wrapping row")`: inside the region "Selected tray", the order of children is swatch, text, "Pin", "Turn 90°", "Edit", "More", "Close".
  - `it("hides Swap with… and Lock size behind More")`: neither is in the DOM until "More" is pressed; then "Swap with…" has `aria-pressed="false"`, "Lock size" has none.
  - `it("reads the meta from the layout")`: Market deck → `/^Layer \d \((bottom|top)\) · \d+ × \d+ × \d+ mm · about [\d.]+ (h|min), \d+ g$/`.
  - `it("gives a spacer only Close")`: a spacer selected → buttons are exactly ["Close"]; text starts "Fills the gap so the trays can't slide. Print it too.".
  - `it("never offers another layer")`: no text matching `/layer$/i` on any button.
  - `it("keeps a long name on one line")`.
  - `copy.board.test.tsx`: cases `workspace-tray/tray-bar`, `m-tray/sheet`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the desktop bar.
- [ ] **Step 4: Implement** More and the swap-in-progress state.
- [ ] **Step 5: Implement** the phone sheet.
- [ ] **Step 6: Run** `npm test`. Expected: PASS.
- [ ] **Step 7: Amend DESIGN.**
- [ ] **Step 8: Gate.** `npm run shots -- workspace workspace-tray workspace-searching workspace-banner workspace-menu workspace-long m-workspace m-tray`.
- [ ] **Step 9: Commit.**
- [ ] **Step 10: STOP. Owner checkpoint B (workspace and plan).** Show: `workspace.pair.png`, `workspace.header.pair.png`, `workspace.rail.pair.png`, `workspace.status.pair.png`, `workspace.plan-box.pair.png`, `workspace-tray.pair.png`, `workspace-tray.tray-bar.pair.png`, `workspace-menu.pair.png`, `workspace-banner.pair.png`, `workspace-searching.pair.png`, `workspace-long.app.png`, `m-workspace.pair.png`, `m-tray.pair.png`, and the `workspace.numbers.md` table. The orchestrator opens `npm run dev` itself and clicks through the workspace. Wait for the owner's reply; record it in the ledger.

### Task 9: First visit

**Boards:** Empty, MobileStart.

**Owns:** fate row 29; "Use 70 mm" omitted.

**Files:** create `src/screens/FirstVisit.tsx`, `src/screens/firstVisit.css`, tests. Delete the old first-visit markup in `App.tsx` and `BoxPanel`'s first-visit branch.

**Desktop (Empty), in `Workspace` with `focus`:**

- Header: logo, wordmark, flexible gap, `Button` secondary "Open file". No Undo, menu or Download.
- Rail (padding 24 20, gap 28): section 1: `StepBadge` 1 (active) + h2 "Measure the box"; three `Field`s Width / Length / Height (grid of 3, gap 10); a field error as Empty's card (padding 10 12, radius 12, `--danger-bg`, `--danger-ink`, 14 px, icon; the validation message; no button); "Inside the box, at the narrowest point." (14 muted, line-height 1.5). Section 2: `StepBadge` 2 + h2 "Add what goes inside"; `KindTile`s in a 2-column grid (gap 10), "Something else" across both. Foot (`margin-top: auto`): underlined "Start from an example game" (600, min 44) and "Your inserts are saved in this browser." (13 muted).
- Stage (centred column, gap 28): h1 "Let's build an insert for your game" (`--h1-first`, max 560); "Trays appear in the box as you add things." (17 muted); the empty box (`min(440px, calc(100vw - 96px))`, radius 16, `--box`, inset edge, padding 8 %, inner 2 px dashed `--box-dash` frame radius 12 reading "Empty box" in `--ink-dim` 600), "Width <w> mm" chip above and "Length <l> mm" chip at the left (vertical), 14 px 600 `--muted-strong` on `--chip`; "Front of the box" + arrow below.

**Phone (MobileStart):** header logo, wordmark, "Open file"; h1 first, then the two sections, then the foot; the hint reads "Inside the box, at the narrowest point. Width is left to right, seen from the front." (MobileStart's literal).

**DESIGN amendments:** §5 First visit (new file, step badges allowed by ruling, no "Use 70 mm"); §7 rows: step badges are steps, not tray numbers (ruling); the error card offers no suggested value (engine has none).

**Interfaces:**

- Consumes: kit; `updateBox`, `addComponent`; validation for the box.
- Produces: `<FirstVisit … />`.

- [ ] **Step 1: Failing tests** (`FirstVisit.test.tsx`):
  - `it("adding the first item opens its editor")` (kept).
  - `it("is the page's one h1")`: h1 "Let's build an insert for your game"; no other h1 (the wordmark is a `span`).
  - `it("shows a box error as a card, with no suggested value")`: height 7 → `role="alert"` with the validation message; no button inside it.
  - `it("offers only Open file in the header")`: the banner has exactly one button, "Open file".
  - `copy.board.test.tsx`: cases `first-visit/rail`, `first-visit/stage`, `m-start/stage`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the desktop rail and stage.
- [ ] **Step 4: Implement** the phone layout.
- [ ] **Step 5: Wire into `App.tsx`** with `brandIsHeading={false}` on first visit; delete the old markup. Run `npm test`. Expected: PASS.
- [ ] **Step 6: Amend DESIGN.**
- [ ] **Step 7: Gate.** `npm run shots -- first-visit m-start`.
- [ ] **Step 8: Commit.**

### Task 10: Editors

**Boards:** Edit (default `moreOpen: true` and `{props:{moreOpen:false}}`), EditKinds, MobileEdit.

**Owns:** fate rows 30, 31; "Keep it next to" and the position sentence omitted.

**Files:** rewrite the markup and CSS of `src/ui/components/EditorPanel.tsx`, `CardsEditor.tsx`, `BulkEditor.tsx`, `TilesEditor.tsx`, `MinisEditor.tsx`, `CustomEditor.tsx`, `CommonOptions.tsx`, `MoreOptions.tsx`, `ToggleOptions.tsx`, `GrowthOptions.tsx` on the kit; keep every behaviour test. Delete `DerivedSizes.tsx` (keep only the card size line). Create `src/screens/EditorStage.tsx`.

**Rail (Edit), `Workspace` with `focus`, rail padding-top 12, gap 20:** back link "What's inside" (44, padding 0 10 0 4, radius 8, `--muted-strong`, 600, 14, chevron); identity row (`IconTile` 44 on the kind; label = kind name, 13 muted; name `input` `aria-label="Name"`, Bricolage 700 22, 1.5 px dashed `--field-line` underline); the kind's basics as on Edit and EditKinds (`Stepper`, `ChoiceChips`, `Segmented` quiet, `Field`s); `Disclosure` "More options" with its summary; inside: option groups as `Segmented`, "Tray shape" as `ChoiceChips`, then `DisclosureRow`s for exact values (e.g. "Card thickness" with its board hint); foot: quiet "Remove…" (`--destructive`, 600) and primary "Done" (padding 0 22).

**Stage (Edit):** the slot holds either the stage sentence as the page's h1 (17 px, 400; the name in bold): "<name> tray, <W> × <D> mm." plus " It grows as you add cards." for cards; for several trays "<name>, <n> trays."; or the note toast (`Toast`, existing `describeOptionChange` words). The edited component's trays are lifted (`0 0 0 4px var(--sheet), 0 0 0 6px <kind line>, var(--shadow-lift-drop)`, z 2); the others at 0.5. The remove toast uses the same slot and style.

**Phone (MobileEdit):** full-screen sheet; header: Back (`IconButton`), h1 name (Bricolage), "Done" (primary); a strip with the tray's compartments drawn small (`aria-hidden`) and the stage sentence; the basics; "More options"; "Remove <name>…".

**DESIGN amendments:** §5 Editor flow (toast in the stage slot, not "at the foot of the page"; the stage sentence is the h1 while editing); §2 one-h1 rule adds "the stage sentence in the editor"; §7 rows: editor hints dropped except the card size line; "Keep it next to" absent (Phase 3); the remove toast sits in the stage slot.

**Interfaces:**

- Consumes: kit; `describeOptionChange`; layout trays of the component; `StageSlot`.
- Produces: `<EditorStage componentId />`; editors with their current props.

- [ ] **Step 1: Failing tests:**
  - `editors.test.tsx`: `it("opens More options in place")` (kept); `it("never offers Keep it next to")`: no text "Keep it next to" with More options open, for every kind.
  - `EditorPanel.test.tsx` `it("names the item in an input styled as its title")`: `getByRole("textbox", { name: "Name" })` has value "Market deck"; the kind label "Cards" precedes it.
  - `App.test.tsx` `it("has one h1 while editing")`: with the editor open, the only h1 is the stage sentence (desktop) or the sheet's name (phone).
  - `EditorStage.test.tsx` `it("says which tray it is editing")`: h1 text `/^Market deck tray, \d+ × \d+ mm\. It grows as you add cards\.$/`; `it("lifts the edited tray and dims the rest")`.
  - `EditorStage.test.tsx` `it("shows an option change as a note in the slot")`: changing Sleeves to Premium shows a `role="status"` with the `describeOptionChange` sentence in the slot, replacing the h1.
  - `copy.board.test.tsx`: cases `editor/rail`, `editor/stage`, `editor-more/rail`, `editor-tokens/rail`, `editor-tiles/rail`, `editor-custom/rail`, `m-edit/sheet`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the panel frame (back link, identity row, foot).
- [ ] **Step 4: Implement** Cards basics and More options.
- [ ] **Step 5: Implement** Tokens and dice, Tiles, Miniatures, Something else (EditKinds; Miniatures from MobileEdit).
- [ ] **Step 6: Implement** `EditorStage` and the toasts in the slot.
- [ ] **Step 7: Implement** the phone editor.
- [ ] **Step 8: Run** `npm test`. Expected: PASS.
- [ ] **Step 9: Amend DESIGN.**
- [ ] **Step 10: Gate.** Add states `editor-more` (Edit default), `editor-tokens`, `editor-tiles`, `editor-custom` (EditKinds, `boardCrop` = its 1st, 2nd, 3rd `section`, compared with the app's `rail` region), `editor-minis` (nearest Edit and MobileEdit). Run `npm run shots -- editor editor-more editor-tokens editor-tiles editor-custom editor-minis m-edit`.
- [ ] **Step 11: Commit.**

### Task 11: Box editor

**Boards:** Box, MobileBox.

**Owns:** fate row 32; the honest stored-on-side copy.

**Files:** rewrite `src/ui/BoxPanel.tsx` on the kit; create `src/screens/BoxSideView.tsx` and its test.

**Rail (Box), `focus`, padding-top 16, gap 22:** back link "What's inside"; h2 "The box" (`--h2-panel`); "Inside size" (600) + three `Field`s; a section (top 1 px `--rule-soft`, padding-top 16, gap 10): "Keep space free on top" (600) with "For the rulebook, boards or player mats" (13 muted), a 120 px `Field` ("Space on top, mm") beside a quiet `Segmented` "Whole top" / "Part of it" (`aria-label="How much of the top"`), and "Part of it: only where the rulebook lies. Trays fill the rest." (13 muted); a `CheckRow` (top rule) "The box is stored on its side" with the hint "Loose pieces go under other trays where they can, so nothing spills."; foot: primary "Done" on the right. Every field always visible (DESIGN §5).

**Stage:** centred, gap 18: "Side view of the box" (600, `--muted-strong`; the page's h1 while the box editor is open, styled as the board's label); `BoxSideView`: width `min(560px, calc(100vw - 48px))`, radius 16, `--box` ground, `inset 0 0 0 2px var(--box-dash)`, overflow hidden; when headroom > 0 a 46 px top band (`--sheet`, 2 px dashed `--spacer-dash` bottom, 14 px 600 `--muted-strong`) "Kept free, <h> mm"; then one row per layer, top layer first, height proportional to the layer's height, each tray a block (radius 8, kind fill with 2 px line, gap 6, padding 6, flex by width); caption "Trays fill the <H − h> mm below." (13 muted), only when headroom > 0. `aria-hidden` on the drawing; the caption is text.

**Phone (MobileBox):** full-screen sheet with Back, h1 "The box", "Done"; the same fields; the side view (358 wide) under them.

**DESIGN amendments:** §5 Box panel (side view; the stored-on-side hint); §7 row: the Box board's "Trays then fill up to the lid" is not true of the engine; the hint says what `storedOnSide` does (ruling).

**Interfaces:**

- Consumes: kit; `updateBox`; the layout's layers (`layers.ts`).
- Produces: `<BoxSideView box layout components />`.

- [ ] **Step 1: Failing tests:**
  - `Header.test.tsx` `it("never makes the wordmark a heading")`: the banner has no h1 on any screen, and `Header` has no `brandIsHeading` prop (a type test: `// @ts-expect-error` on passing it).
  - `App.test.tsx` `it("has one h1 in the box editor")`: h1 "Side view of the box" (desktop) or "The box" (phone).
  - `BoxPanel.test.tsx`: `it("box headroom is always visible")` (kept); `it("explains stored on its side honestly")`: the hint is exactly "Loose pieces go under other trays where they can, so nothing spills." and nothing on screen matches `/up to the lid/`.
  - `BoxSideView.test.tsx` `it("shows the kept-free height and the rest")`: headroom 8, height 70 → "Kept free, 8 mm" and "Trays fill the 62 mm below."; `it("draws one row per layer, top first")`: the Harbour Kings layout → 2 rows, the first holding the top layer's trays; `it("says nothing about free space without headroom")`: headroom 0 → neither string.
  - `copy.board.test.tsx`: cases `box/rail`, `box/stage`, `m-box/sheet`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the rail panel.
- [ ] **Step 4: Implement** `BoxSideView`.
- [ ] **Step 5: Implement** the phone layout.
- [ ] **Step 6: Remove `brandIsHeading`** from `Header` and every caller; the wordmark is a `span`.
- [ ] **Step 7: Run** `npm test`. Expected: PASS.
- [ ] **Step 8: Amend DESIGN** (also §2: "The wordmark is not a heading").
- [ ] **Step 9: Gate.** `npm run shots -- box m-box`.
- [ ] **Step 10: Commit.**

### Task 12: When it doesn't fit, and when pins block a fit

**Boards:** NoFit, PinConflict, MobileFix.

**Owns:** the no-fit and pin-conflict regions; the Phase 3 omissions in fixes.

**Files:** create `src/screens/FitProblem.tsx`, `src/screens/fitProblem.css`, tests. Extend `statusOf` (Task 6) with the warn states. Rail row variants in `Rail.tsx`.

**Engine limits (DESIGN §6; ruling):** only engine-backed actions; no outcome lines; no mm figure; no "Best" chip.

**No fit (NoFit), `Workspace` with `focus`:**

- Heading (warn): h1 "The <name> tray doesn't fit yet" (owner decision; `misfitOf(...).name`, e.g. "The Heroes tray doesn't fit yet"; when `misfitOf` is null: "Not everything fits yet"); line by `reason`: bed → "It's too big for your printer's bed."; box → "There's no room left for it in the box.".
- Stage body (flex wrap, gap 40, centred): the closest attempt (`noFitAttempt`) drawn in the plan frame, every tile at 0.5, not interactive, clipped to the frame; the misfit's tile, when `misfitOf` has one, drawn on top in the warn style (2 px dashed `--warn`, `--warn-bg`, the name in `--warn-ink` 700, no second line); caption "Front of the box". Beside it a panel (`flex: 0 1 300px`, `--sheet`, 1 px `--rule`, radius 16, padding 20, gap 12): title "Ways to make it fit" (Bricolage 19); option cards (padding 14, radius 12; first card 1.5 px ink border, others 1 px `--field-line`; title 600 only): "Edit <name>" (opens its editor), and "Keep searching" when the run allows more search.
- Rail: the culprit row: `--warn-bg` fill, 1.5 px `--warn` border, 12 px dot `--warn`, meta "Doesn't fit" (13, `--warn-ink`, 600).
- Download blocked with "Fix the fit to download".

**Pin conflict (PinConflict):** heading (warn): h1 "<name> doesn't fit with your pins" (size lock: "<name> doesn't fit with its size locked"); line: the `LockConflict` reason(s), joined. Stage: the current plan (kept by the runner) with pinned tiles at 1 and the rest at 0.5, pinned badges; beside it a column (`flex: 1 1 280px`, max 340, gap 12): title "Unpin one" (Bricolage 19); option cards (radius 14) "Unpin <name>" per conflicting pin, "Unlock size of <name>" per size lock; a quiet underlined "Undo" (`store.undo`). Rail rows keep their rule chips; the row of the tray that doesn't fit uses the warn style with meta "Doesn't fit". No conflict area is drawn on the plan and no "Unpin one and everything fits." line (not built: no free-space figure, no outcome).

**Phone (MobileFix):** status heading in warn ink (h1 21 and line in `--warn-ink`); the attempt drawing (358) with the misfit tile; a peek `Sheet` (276, `--shadow-peek`) titled "Ways to make it fit" with the same option cards (min 56). Pin conflict on the phone uses the same sheet titled "Unpin one". Download icon blocked with title "Fix the fit to download".

**DESIGN amendments:** §5 Status heading rows for no fit and pin conflict; §6 table "Which tray doesn't fit" UI note; §7 rows: no-fit reason sentences (bed, box); the attempt is drawn dimmed with the misfit marked when `misfitOf` has one (ruling); "Doesn't fit" rail meta; "Fix the fit to download"; no outcome lines or suggested fixes (Phase 3).

**Interfaces:**

- Consumes: `misfitOf`, `noFitAttempt`, `lockConflicts`, `unpinTrays`, `removeLock`, `store.refit`, `store.undo`; `PlanView` in a read-only mode (add a `readOnly` prop if it has none).
- Produces: `<FitProblem kind="noFit" | "pinConflict" … />`; `statusOf` warn cases.

- [ ] **Step 1: Failing tests** (`FitProblem.test.tsx`, fed with `loadSeed("harbour-kings-nofit").result` and `-pins` through the stub layout client):
  - `it("names the tray and the reason as a heading")`: with `misfit = misfitOf(result.bestAttempt, …)` from the seed, the h1 is `` `The ${misfit.name} tray doesn't fit yet` `` (expected "The Heroes tray doesn't fit yet"); `it("falls back when no tray stands out")`: a result whose `misfitOf` is null → h1 "Not everything fits yet" and the line equals the sentence for `misfit.reason`.
  - `it("offers only actions the engine can do")`: buttons in the panel are exactly ["Edit Heroes"] or ["Edit Heroes", "Keep searching"]; no text matches `/Lay the figures down|shallower|loose in one bin|any layer|Everything fits|Still doesn't fit|Best|needs \d+ mm/`.
  - `it("highlights the culprit in the list")`: the Heroes row has class `is-culprit` and meta "Doesn't fit".
  - `it("marks the misfit tile")`: one `.plan-tile.is-misfit` whose text is "Heroes".
  - `it("offers one Unpin per conflicting pin")`: the pins seed → buttons "Unpin Market deck" and "Unpin Heroes" (or the seed's conflicting names); clicking one removes that pin in one undo step.
  - `it("blocks Download with its reason")`: Download has `aria-disabled="true"` and description "Fix the fit to download".
  - `copy.board.test.tsx`: cases `no-fit/status`, `no-fit/stage`, `no-fit/rail`, `pin-conflict/status`, `pin-conflict/stage`, `m-fix/sheet`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the warn heading cases in `statusOf`.
- [ ] **Step 4: Implement** the no-fit stage and panel.
- [ ] **Step 5: Implement** the pin-conflict stage and column.
- [ ] **Step 6: Implement** the rail culprit row.
- [ ] **Step 7: Implement** the phone layout.
- [ ] **Step 8: Run** `npm test`. Expected: PASS.
- [ ] **Step 9: Amend DESIGN.**
- [ ] **Step 10: Gate.** `npm run shots -- no-fit pin-conflict m-fix`.
- [ ] **Step 11: Commit.**
- [ ] **Step 12: STOP. Owner checkpoint C (moments).** Show: `no-fit.pair.png`, `no-fit.status.pair.png`, `pin-conflict.pair.png`, `m-fix.pair.png`, `first-visit.pair.png`, `m-start.pair.png`, `editor.pair.png`, `editor-more.pair.png`, `editor-tokens.pair.png`, `editor-tiles.pair.png`, `editor-custom.pair.png`, `editor-minis.app.png`, `m-edit.pair.png`, `box.pair.png`, `m-box.pair.png`. The orchestrator opens the app itself and walks first visit → editor → box → a no-fit. Also list for the owner every new ruled string added since checkpoint B, with its §7 row: "The <name> tray doesn't fit yet", "Not everything fits yet", "It's too big for your printer's bed.", "There's no room left for it in the box.", "Doesn't fit", "Fix the fit to download", "<name> tray, <W> × <D> mm." and "<name>, <n> trays." (editor stage), "Change the box", "No plan yet", "Loose pieces go under other trays where they can, so nothing spills.", and the phone menu's "Redo". Wait for the owner's reply; record it.

### Task 13: Download, building the file, packing guide

**Boards:** Export, Exporting (default = building at 0 %; `{state:{phase:"done", p:100}}`), MobileDownload.

**Owns:** fate rows 3 (download half), 14 (stat tiles), 36–38; Exporting's extra buttons omitted.

**Files:** rewrite the markup and CSS of `src/ui/ExportPanel.tsx` and `export.css` on `Dialog`; restyle `src/instructions/AssemblyPage.tsx` and `assembly.css` to the kit and tokens (keep the print stylesheet). Keep behaviour and tests: one combined 3MF first, Other formats, progress and Stop, "Not exported" with Try again, Ko-fi and PayPal.

**Ready (Export):** `Dialog` (`role="dialog"`, `aria-labelledby` the h1): h1 "Ready to print" (`--h1-dialog`) over "<n> trays and <m> spacers for <insert name>" (muted), Close (`IconButton` soft); tray chips (30 high, padding 0 10, pill, kind fill/ink, 13 px 600; spacers one dashed chip "<m> spacers" in `--ink-dim`); two stat tiles (padding 16, radius 14, `--page`): "Filament" / "about <g> g", "Print time" / "about <t>" (Bricolage 700 24); primary `Button` cta "Download the 3MF file" with icon, and "One file with all <n> parts." (13 muted, centred); Packing guide card (padding 14, radius 14, 1 px `--rule`, `IconTile` 40 on `--page`, "Packing guide" 600 + "A printable sheet showing where each named tray goes" 13 muted, chevron) opening the guide; "Other formats" (quiet, `aria-expanded`) with secondary buttons "One 3MF per part (.zip)" and "STL files (.zip)"; support row (top 1 px `--rule-soft`, padding-top 18): "This tool is free. Support it if you like it." + "Ko-fi" (bits fill/ink pill with cup icon) + "PayPal" (secondary). Gap 24.

**Building (Exporting):** h1 "Building your print file" (`--h1`) over "<k> of <n> parts built"; `ProgressBar`; "Stop" (secondary, 48). Done: h1 "All <n> parts are ready", "One file with every part.", "Back to the plan" (secondary 48). A failed part (ruling: plain): h1 "<k> of <n> parts are ready"; h2 "Not exported"; per part a box (radius 12, padding 10 12, `--warn-bg`, `--warn-ink`, 14 px) with its reason and "Try again" (1.5 px `--warn-ink` border, 44 target).

**Phone (MobileDownload):** full screen; Close at the top left; title block; chips; stats; "Send file" (secondary, share icon); Packing guide card with "Where each named tray goes"; Other formats; support row; a fixed foot with the primary and its caption.

**Packing guide:** no board; headings, cards and spacing as Export (radius 14 cards, Bricolage titles, 13 px muted captions).

**DESIGN amendments:** §2 Accessibility one-h1 rule: "a modal dialog titles itself with an h1 while open; the page behind is inert"; §5 Download dialog; §7 rows: dialog titles are h1 (boards); done phase without a second download; Exporting's report, partial download and Start again not built (ruling); Send file in the phone Download.

**Interfaces:**

- Consumes: kit `Dialog`, `ProgressBar`, `Button`; `formatGrams`, `formatPrintTime`; `trayNames`; `buildCombined3mf`, `buildPartsZip`, `buildStlZip`; `sendFile`; `shotsHold` call site (keep it).
- Produces: `<ExportPanel …>` with its current props plus `phone`.

- [ ] **Step 1: Failing tests** (`ExportPanel.test.tsx`, `AssemblyPage.test.tsx`):
  - `it("titles itself Ready to print and names what it holds")`: h1 "Ready to print"; subtitle `/^\d+ trays and \d+ spacers? for Harbour Kings$/`.
  - `it("shows a chip per tray and one for the spacers")`: 8 kind chips and one chip `/^\d+ spacers?$/`.
  - `it("shows filament and print time as tiles")`: "Filament" / `/^about \d+ g$/`, "Print time" / `/^about [\d.]+ (h|min)$/`.
  - `it("downloads one combined 3MF by default")` (kept), now via "Download the 3MF file".
  - `it("shows progress and Stop while building")`: role `progressbar` and "Stop"; the h1 "Building your print file".
  - `it("lists a failed part under Not exported with Try again")` (kept); no "Copy a report", "Start again" or "Download without".
  - `it("says nothing about slicers or what the files open in")` (kept).
  - `AssemblyPage.test.tsx`: existing cases pass on the new markup.
  - `copy.board.test.tsx`: cases `download/dialog`, `exporting/dialog`, `m-download/dialog`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the ready state.
- [ ] **Step 4: Implement** building, done and failed states.
- [ ] **Step 5: Implement** the phone layout.
- [ ] **Step 6: Restyle** the packing guide.
- [ ] **Step 7: Run** `npm test`. Expected: PASS.
- [ ] **Step 8: Amend DESIGN.**
- [ ] **Step 9: Gate.** Add states `exporting-done` (Exporting `{state:{phase:"done", p:100}}`; no hold; wait for the h1 /parts are ready/ up to 120 s) and `packing-guide` (nearest Export). Run `npm run shots -- download exporting exporting-done m-download packing-guide`.
- [ ] **Step 10: Commit.**

### Task 14: Settings drawer

**Boards:** Settings (default insert tab; `{state:{tab:"printer"}}`).

**Owns:** fate rows 33–35; "Still fits" omitted, Done kept.

**Files:** rewrite the markup and CSS of `src/ui/SettingsSheet.tsx`, `SettingsForm.tsx` and `PrinterForm.tsx` on `Drawer` and the kit. Keep the behaviour tests (tabs, opens on the tab with an error, one undo step per change, "N changed", search, per-value reset, Apply to this insert).

**Drawer (Settings):** right, full height, max 560, `--shadow-drawer` over `--scrim`; below 600 full screen. Header (padding 22 28, bottom 1 px `--rule-soft`, gap 12): h1 "Settings" (`--h1-drawer`); "<n> changed" (8 px `--changed` dot, 14 px 600 `--changed-ink`) when n > 0; quiet "Reset all" (14 px 600 muted) → `setSettings` with the defaults, one undo step; Close. Tabs: quiet `Segmented` "This insert" / "My printer" (`aria-label="Settings for"`), padding 14 28 0. Body scrolls (padding 8 28 24). Footer (padding 16 28, top 1 px `--rule-soft`, `--row`): primary "Done" on the right, nothing else.

**This insert:** section "How the trays sit" (h2 17, Figtree 700; padding 18 0; bottom `--rule-soft`; gap 16): "Fit in the box" `Segmented` Snug / Standard / Loose; "Walls" `Segmented` Light / Standard / Sturdy / Custom (changed dot after the label; "Custom" pressed in `--changed-ink`; line "You set the wall to <w> mm below." when Custom); `CheckRow`s "Room for fingers" ("Extra space beside walls to grab things"), "Rim between layers" ("A small rim on each tray keeps the top layer from sliding"), "Fill to the lid" ("Keeps everything snug if the box is stored on its side"). Section "Exact numbers" (h2 + "For fine-tuning. All in mm." 13 muted): `SearchField` "Find a setting, like floor or lip"; open group card (radius 14, 1 px `--rule`; head padding 12 14, title 700, "<n> changed" in `--changed-ink`; rows: label with a changed dot, 72 × 44 input radius 10 right-aligned (changed: 1.5 px `--changed`), "Back to <default>" pill `--changed-bg`/`--changed-ink` 13 px 600); other groups as `DisclosureRow` ("<n> values" or "<n> changed"); the existing groups plus "Spacers and space" (Unused space, One thick wall instead of a spacer).

**My printer:** first, only when this insert's printer differs from the browser's printer, a visible row (owner decision N8; padding 12 14, radius 12, `--info-bg`, `--info-ink`, 14 px): "This insert uses another printer" and a secondary `Button` "Apply" → `store.edit(p => applyPrinter(p, prefsPrinter))`, one undo step; the row disappears once they match. Then "These apply to every insert you make." (14, `--muted-strong`); "Printer bed" `ChoiceChips` "Small, 180 mm", "Medium, 220 mm", "Large, 256 mm", "My own size" + "No part will be bigger than this."; `DisclosureRow` "Printer details" holding the bed size fields (own size), margin, layer height and folding risers; "Printing" (h2 with tag "Doesn't move any trays", 12 px 600 on `--fill-quiet`) with compact `CheckRow`s "Engrave tray names" (hint as the board, the example name from the project) and "Join spacers into fewer parts".

**DESIGN amendments:** §5 Settings sheet → drawer; items and their places; §7 rows: Settings is a right-hand drawer (board); extras under Exact numbers and Printer details (owner decision and its reading); "Rim between layers" keeps the Words-table name with the board's hint; no "Still fits" (Phase 3), footer keeps Done; dialog-style h1.

**Interfaces:**

- Consumes: kit `Drawer`, `Segmented`, `ChoiceChips`, `CheckRow`, `SearchField`, `DisclosureRow`; `settingsFields.ts`, `setSettings`, `applyPrinter`, prefs.
- Produces: `<SettingsSheet …>` with its current props.

- [ ] **Step 1: Failing tests** (`SettingsSheet.test.tsx`, `SettingsForm.test.tsx`, `PrinterForm.test.tsx`), the existing cases kept, plus:
  - `it("opens as a drawer titled Settings")`: `getByRole("dialog", { name: "Settings" })`; an h1 "Settings".
  - `it("keeps Done and says nothing about fitting")`: the footer has one button "Done"; no text "Still fits".
  - `it("puts the plain choices first")`: in "This insert", the first heading is "How the trays sit" and "Exact numbers" comes after it.
  - `it("finds Unused space under Exact numbers")`: typing "unused" in "Find a setting" shows "Unused space".
  - `it("offers Apply only when this insert uses another printer")`: with matching printers, no text "This insert uses another printer"; with the insert on 220 and the browser on 256, the row shows at the top of My printer with a button "Apply"; pressing it sets the insert's printer to 256 in one undo step and the row goes.
  - `it("keeps margin, layer height and folding risers under Printer details")`: absent until "Printer details" is opened.
  - `it("uses Rim between layers")`: a checkbox named /^Rim between layers/; no text "Top layer stays put".
  - `copy.board.test.tsx`: cases `settings/drawer`, `settings-printer/drawer`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the drawer frame (header, tabs, footer).
- [ ] **Step 4: Implement** "How the trays sit".
- [ ] **Step 5: Implement** "Exact numbers" with the new group.
- [ ] **Step 6: Implement** My printer and Printer details.
- [ ] **Step 7: Run** `npm test`. Expected: PASS.
- [ ] **Step 8: Amend DESIGN.**
- [ ] **Step 9: Gate.** Add `settings-printer` (click "My printer") and `m-settings` (390×844, Settings board rendered at 390). Run `npm run shots -- settings settings-printer m-settings`.
- [ ] **Step 10: Commit.**

### Task 15: Phone and tablet final pass

**Boards:** all Mobile* boards; Main and Edit rendered at 820×1180.

**Scope:** the phone layouts are built by Tasks 3–14. This task checks them together, adds the tablet width, and owns the cross-cutting phone behaviour: `inert` behind full-screen sheets and dialogs, Escape, focus return, the sheet's peek and open heights, the 760–960 tablet rail.

**Files:** `src/screens/workspace.css` and the per-screen CSS, `src/kit/Sheet.tsx`, `App.phone.test.tsx`, `style.test.ts`, `scripts/design/states.mjs`.

- [ ] **Step 1: Add states** `workspace-820` and `editor-820` (820×1180; boards Main and Edit rendered at 820).
- [ ] **Step 2: Run** `npm run shots -- m-start m-workspace m-tray m-edit m-box m-fix m-download m-settings workspace-menu-phone workspace-820 editor-820`.
- [ ] **Step 3: List the differences.** For each state, write the reviewer's three answers into the report as a numbered list of differences, each tagged with its owning task (from "Board regions → owning task"). This list is the bound for Step 4; nothing outside it is changed.
- [ ] **Step 4: Failing tests,** one per listed difference that a rule can hold, in `style.test.ts` or `App.phone.test.tsx`. Always:
  - `it("never scrolls sideways on a phone")`: no rule in the screen CSS sets a fixed width over 390 px outside `@media (width >= 760px)`.
  - `it("keeps the tablet rail between 760 and 960")` (moved from "narrows the rail between 760 and 960 px, and no further").
  - `it("makes the page behind a full-screen sheet inert")` (kept) for the editor, the box editor, the tray sheet, Download and Settings.
  - `App.phone.test.tsx` `it("peeks the sheet at 196 px with The box first")`.
- [ ] **Step 5: Run.** Expected: FAIL for the new ones.
- [ ] **Step 6: Fix** each listed difference in its screen's CSS or component.
- [ ] **Step 7: Run** `npm test`. Expected: PASS. Run the Step 2 shots again; every listed difference is gone or explained.
- [ ] **Step 8: Commit.**
- [ ] **Step 9: STOP. Owner checkpoint D (phone and tablet).** Show every `m-*.pair.png`, `workspace-menu-phone.app.png`, `workspace-820.pair.png`, `editor-820.pair.png`, and `download.pair.png`, `exporting.pair.png`, `exporting-done.pair.png`, `settings.pair.png`, `settings-printer.pair.png`, `packing-guide.app.png`. The orchestrator opens the app at 390 and 820 itself. Wait for the owner's reply; record it.

### Task 16: Dark theme as an option

**Boards:** none; nearest Main.

**Files:**

- `src/styles/tokens.css`: `:root[data-theme="dark"] { color-scheme: dark; … }` redefining every colour token. Start from the dark values in git history (the commit Task 1 cites); derive the new tokens' dark values to hold 4.5:1 text and 3:1 edges.
- `src/share/prefs.ts` (additive): `theme: "light" | "dark"`, default `"light"`, read and written with the other prefs.
- `src/main.tsx` or `App.tsx`: set `document.documentElement.dataset.theme` from the preference before first paint.
- `src/screens/ProjectMenu.tsx`: a "Dark theme" item with `aria-pressed`.
- `src/viewer/shades.ts`: `pageScheme()` reads `document.documentElement.dataset.theme`; `Viewer.tsx`'s `usePageScheme` watches that attribute with a `MutationObserver`. `shadeOf` (`light-dark()`) is unchanged: `color-scheme` drives it.

**DESIGN amendments:** §2 Colour: "MUST redefine every colour token under `[data-theme="dark"]`"; §4 Dark mode: opt-in from the project menu, default light, the 3D view reads `data-theme`; §8 checklist keeps "in light and dark"; §7 row: dark is opt-in (owner).

**Interfaces:**

- Consumes: prefs store; tokens; `shadeHex`.
- Produces: `Prefs.theme`, the "Dark theme" menu item, `pageScheme()` reading `data-theme`.

- [ ] **Step 1: Failing tests:**
  - `prefs.test.ts` `it("defaults the theme to light and remembers dark")`.
  - `ProjectMenu.test.tsx` `it("switches to dark from the menu and remembers it")`: pressing "Dark theme" sets `aria-pressed="true"`, `data-theme="dark"` on `<html>`, and the prefs store's `theme` to `"dark"`; a fresh app with those prefs starts dark.
  - `App.test.tsx` `it("is light by default")`: no `data-theme` or `data-theme="light"`; `getComputedStyle(html).colorScheme` is not checked (jsdom); assert the attribute only.
  - `style.test.ts` `it("redefines every colour token under data-theme dark")` (the Task 1 check, restored on the new selector); `it("keeps text at 4.5:1 and edges at 3:1 in dark")` over the text/ground and edge/ground pairs the light contrast test already lists.
  - `shades.test.ts` (or `Viewer.test.tsx`) `it("reads the page theme")`: `data-theme="dark"` → `pageScheme()` returns `"dark"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the prefs field and the root attribute.
- [ ] **Step 4: Implement** the dark token set.
- [ ] **Step 5: Implement** the menu item and the 3D reading.
- [ ] **Step 6: Run** `npm test`. Expected: PASS.
- [ ] **Step 7: Amend DESIGN.**
- [ ] **Step 8: Gate.** Add `workspace-dark` (seed prefs with `theme: "dark"`; nearest Main) and `m-workspace-dark`. Run `npm run shots -- workspace-dark m-workspace-dark`. The reviewer checks that no surface stayed light and no text is hard to read.
- [ ] **Step 9: Commit.**

### Task 17: Removal sweep, whole-screen copy check, docs, version

**Files:**

- Delete every old UI file no screen imports. Check with a script that lists `.tsx` and `.css` under `src/ui`, `src/plan`, `src/viewer`, `src/instructions` and `src/styles` and greps for an import of each; zero unimported files remain.
- Delete the thin re-exports `src/ui/Modal.tsx` and `src/ui/BottomSheet.tsx` (Task 2) after pointing their last users at `Dialog` and `Sheet`.
- `src/style.css`: delete unused selectors (remove the file if empty). `tokens.css`: delete the legacy aliases and old names once `rules.test.ts` counts zero uses; update that test to "no legacy alias exists".
- `src/screens/copy.board.test.tsx`: one whole-screen case per state with a board (every region at once).
- `src/app/App.test.tsx`: `it("works through the main path from the keyboard")`: from first visit, Tab to Width and type 285, Length 285, Height 70; Tab to "Cards" and Enter; the editor opens with focus in it; Tab to "Done" and Enter; focus returns to the new row "Cards"; the plan's first tile is reachable by Tab and Enter selects it; Tab to "Pin" and Enter → the chip "Pinned" appears; Tab to "Download" and Enter → a dialog named "Ready to print". Each step asserts `document.activeElement`. (Real focus rings are checked in the shots.)
- `docs/DESIGN.md`: §4 matches the tokens; §5 names the new files; §7 has every ruling made in this plan (cross-check `COPY_RULINGS`' citations).
- `docs/DEVELOPMENT.md`: the architecture section shows `src/kit` and `src/screens`, `npm run seeds` and `npm run shots`, and the shots-mode holds.
- `README.md`: the "Look" section (tokens, fonts incl. Figtree 500, dark opt-in).
- `package.json`: version `0.4.0` → `0.5.0` (UI change; `scripts/check-version-bump.mjs`).

- [ ] **Step 1: Write** the whole-screen copy cases and the keyboard journey.
- [ ] **Step 2: Run.** Expected: FAIL only where a region test passed but the screen as a whole has text that no region covered. List each failure.
- [ ] **Step 3: Fix** the listed screens (never the rulings without a §7 row). Run `npm test`. Expected: PASS.
- [ ] **Step 4: Remove** unimported files, unused selectors and legacy aliases. Run `npm test`. Expected: PASS.
- [ ] **Step 5: Update** DESIGN, DEVELOPMENT, README and the version.
- [ ] **Step 6: Run** `npm run shots -- --out docs/design/shots` (all states). Commit `*.pair.png`, region pairs and numbers in `docs/design/shots/`; no `*.app.png` duplicates.
- [ ] **Step 7: Run** `npm run verify`. Expected: exit 0.
- [ ] **Step 8: Commit.**

### Final review (controller)

- Use the most capable model. Check every rule in DESIGN.md and DEVELOPMENT.md, rule by rule.
- Answer the outcome question with evidence: for each state in `docs/design/shots/`, open the pair and its region crops and answer "Does this screen look like its board? What is extra? What is missing?" Read every `numbers.md`; each `≠` needs a reason.
- Check "What the boards don't show": every row's fate is visible in the app; every Phase 3 item is absent.
- **STOP. Owner checkpoint E (before the PR).** Show the owner the full set in `docs/design/shots/`, including `workspace-dark`. The orchestrator opens the built app (`npm run build && npm run preview`). Wait for the nod before opening the PR.

---

## Revision notes

Changes made against `.superpowers/sdd/2026-10-16-ux-redesign/rebuild-plan-review.md` and the ledger rulings.

| Finding | Where addressed                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1      | Task 6: `StatusHeading` (40/32 px tone circle, h1 28/21, muted line) is the page h1; the wordmark stops being a heading in Task 4; DESIGN §2 h1 rule amended in Task 6 (and Tasks 10, 13 for the editor and dialogs). Kit primitive in Task 2.                                                                                                                                              |
| C2      | Task 6 relocation table: announcer, run error + Retry, field-less errors, jump links, layout/sizing notices, filament and time (to Download first, tiles in Task 13), each with a test; Summary deleted only in Step 8 after both are mounted and green.                                                                                                                                    |
| C3      | Task 0 Decisions: test at `scripts/design/renderBoard.test.mjs` (already in `include`); `.prettierignore` gains `docs/design/{boards,shots,seeds}/`; `renderBoard.d.mts` for `tsc`; Global Constraints and each task add new `?raw` CSS to `test.css.include`.                                                                                                                              |
| C4      | Task 0: two-key (plus prefs) storage written by the real stores; seeds generated by `make-seeds.mjs` with the real optimizer, hash and geometry version checked in a test and in `shots.mjs`; Harbour Kings fixture; no-fit and pin conflict from real runs with 90 s waits, pre-verified in Node; exporting and searching held by `shotsHold`; server lifecycle by PID.                    |
| C5      | New section "What the boards don't show" (43 rows with fate and task) plus the list of board items not built.                                                                                                                                                                                                                                                                               |
| C6      | "How tasks run": per-task ownership of both widths; Task 15 is the final pass; checkpoints moved to after the kit (A, Task 2), workspace and plan (B, Task 8), fit problems (C, Task 12), phone (D, Task 15), and before the PR (E).                                                                                                                                                        |
| H1      | Task 5: Add pill beside the h2 and a kind picker; Task 4: name is a button; Task 5 owns the rail footer, rule chips and Clear all; one rail width (Main's) in Global Constraints and Task 3.                                                                                                                                                                                                |
| H2      | Global Constraints: shadows, spacing scale, fills (track, icon ground, info, fit, warn strong, warn icon, scrim, changed, destructive, ink dim, ink off, line strong, handle, logo), radii (dialog 22, bar 18, logo 8, cell 6), per-screen tokens (`--stage-pad`, `--stage-pad-focus`, `--field-h-compact`, `--cta-h`, `--dialog-btn-h`), h1/h2 variants. Verified by grep over the boards. |
| H3      | Task 1: kind, axis and paper tokens kept; legacy aliases and old names kept until Task 17; protected tests listed; DESIGN §2 and §4 amended in the commit; `color-scheme: light` instead of touching `shadeOf`.                                                                                                                                                                             |
| H4      | Every UI task has a "DESIGN amendments" list applied in its own commit.                                                                                                                                                                                                                                                                                                                     |
| H5      | Global Constraints (allowed additive changes), "Board items the app does NOT build", and the engine notes in Tasks 8, 9, 10, 11, 12, 14 (NoFit reason and culprit per ruling, Keep it next to, Settings footer keeps Done, Use 70 mm, `clearChoices` in `actions.ts`, honest Box copy, `prefs.ts` theme).                                                                                   |
| H6      | Authority order at the top; "Board copy conflicts" table in Global Constraints.                                                                                                                                                                                                                                                                                                             |
| H7      | Task 0 Step 3: unwrap, attribute stripping, booleans and blanks, `data-props` defaults, jsdom + vm, local font URLs incl. Figtree 500, `{props, state}` variants; tests for each in Step 1.                                                                                                                                                                                                 |
| H8      | Visual gate: stacked pairs at 1:1, 1:1 region crops, numbers report (Task 0 Step 15).                                                                                                                                                                                                                                                                                                       |
| H9      | Checkpoints A–E as explicit STOP steps with named files; the orchestrator opens the app at each.                                                                                                                                                                                                                                                                                            |
| H10     | Word budget removed; `src/screens/copy.board.test.tsx` with `copy-rulings.ts` citing §7 rows (Task 4 on), whole-screen cases in Task 17. A word-count backstop was not kept: the literal check is strictly tighter and the ruling replaces the budget.                                                                                                                                      |
| M1      | Old Task 3 split into Task 3 (shell with named interim slots incl. first visit, phone sheet, editors), Task 4 (header and menu), Task 5 (rail), Task 6 (Summary relocation).                                                                                                                                                                                                                |
| M2      | Old Task 4 split into Task 6 (status heading and segments) and Task 7 (plan and 3D frame), with tile internals, badge, tag, dimming, caption and layer labels specified.                                                                                                                                                                                                                    |
| M3      | Task 8: actions inline in one wrapping row (test of child order); Swap with… and Lock size behind More (owner); Task 7 owns the 52 px slot and "Tap a tray for details.".                                                                                                                                                                                                                   |
| M4      | Task 2 adds ChoiceChips, Stepper, StatusHeading, Notice, Toast, Disclosure, DisclosureRow, RuleChip, ProgressBar, SearchField, StepBadge, MenuPanel, IconTile, Drawer; Button takes one `blockedReason?: string`.                                                                                                                                                                           |
| M5      | New section "Board regions → owning task", including menu panel and dot, Your inserts, banners, the footer's fate, the editor's stage, delete confirmation and remove toast, making-a-plan and no-plan headings.                                                                                                                                                                            |
| M6      | Task 0 split into 19 steps with expected output; implement steps split per component everywhere; red-first runs restored in every task; Task 15 bounded by a written difference list; Task 17 bounded by the listed failures; server lifecycle by PID, no `pkill`.                                                                                                                          |
| M7      | "How tasks run": strictly in order, no parallel tasks.                                                                                                                                                                                                                                                                                                                                      |
| M8      | Per-task shots go to the gitignored ledger folder; only board PNGs, seeds and Task 17's final pairs are committed.                                                                                                                                                                                                                                                                          |
| M9      | Ruling applied (plain "Not exported" + Try again): Task 13 and "Board items the app does NOT build".                                                                                                                                                                                                                                                                                        |
| M10     | Task 14: right-hand `Drawer`; fates of Unused space, One thick wall, Apply to this insert and the printer fields (rows 33–35).                                                                                                                                                                                                                                                              |
| L1      | Redo kept beside Undo on desktop (EditKinds shows it) and in the phone menu; §7 row in Task 4.                                                                                                                                                                                                                                                                                              |
| L2      | Ruling: "Layer 1 (bottom)", "Layer 2", …, "Layer n (top)" for any count; Task 6 labels and test.                                                                                                                                                                                                                                                                                            |
| L3      | View segment reads "Top" and "3D" (Task 6).                                                                                                                                                                                                                                                                                                                                                 |
| L4      | Renderer test asserts the 8 NoFit names and no `sc-*` under `x-dc` (Task 0 Step 1).                                                                                                                                                                                                                                                                                                         |
| L5      | Task 6 Step 10: `shots.mjs` compares the bounding boxes of header, rail and plan box in `workspace` and `workspace-searching`.                                                                                                                                                                                                                                                              |

**Owner questions in the review, as answered by the ledger:** 1 (h1) → status heading; 2 (tray bar extras) → behind More; 3 (Settings extras) → Exact numbers, with printer extras in Printer details (the plan's reading, flagged in row 34); 4 (no-fit stage) → ruling; 5 (rail) → Main's; 6 (layer names) → DESIGN's; 7 (estimates) → "about"; 8 (phone menu) → header menu button; 9 (export failure) → plain; 10 (step badges) → allowed; 11 (footer) → into the menu; 12 (older geometry) → plan banner; 13 (frozen files) → additive allowed.

**Judgment calls the owner may want to see:**

- Printer-tab extras (margin, layer height, folding risers) go in the board's "Printer details", not Exact numbers, because Exact numbers exists only on the This insert tab. "Apply to this insert" is now a visible row when the printers differ (owner decision N8).
- Phone Redo lives in the project menu, since MobileWorkspace shows Undo only.
- The no-fit and pin-conflict fixture counts (Heroes 40, Hex tiles 60) are starting values; if they miss, `make-seeds.mjs` fails and suggests counts (at most 5 tried), and a person edits the fixture.
- Where boards disagree on a value (back-link colour Edit vs Box, name pill opacity Main .92 vs NoFit .88, PinConflict stage padding 24/36 and h1 26), Main's or Edit's value is used and the others are treated as drawing drift.

### Re-review fixes (N1–N11)

| Finding    | Where addressed                                                                                                                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1         | Task 4 "Interim h1": `Header`'s `brandIsHeading` (default true) keeps the wordmark as the h1; Task 6 passes false where `StageTop` renders, Task 9 on first visit; Tasks 10 and 11 add one-h1 tests for the editor and box; Task 11 removes the prop and asserts it is gone.                                         |
| N2         | Task 0 Decisions and Step 7: `loadSeed` uses `import.meta.glob(..., { eager: true, import: "default" })` for seeds and `.result.json`; no `node:` import in `src`.                                                                                                                                                   |
| N3         | Task 0 fixture variants and Step 9: at most 5 other counts tried, exit 1 with the outcomes and suggested counts, the fixture is never edited by the script; index `updatedAt` pinned to 1792108800000, with a test.                                                                                                  |
| N4         | Task 0 Step 7: `COPY_DENIED` in `src/screens/copy-rulings.ts` (created in Task 0) lists the not-built items and the left column of the copy conflicts; `boardLiterals` subtracts it; `boardCopy.test` "never allows a denied board string".                                                                          |
| N5         | Global Constraints and Task 7: the box is capped by the stage height left (`.plan-fit` size container, `min(582px, 100cqw, 100cqh)`), the stage never scrolls on desktop; new seed and state `workspace-banner-notes`; the no-scroll check covers `workspace-long`, `workspace-banner` and `workspace-banner-notes`. |
| N6         | "Board items the app does NOT build" gains the PinConflict conflict area and "Unpin one and everything fits."; the regions table and Task 12 say it is not drawn.                                                                                                                                                    |
| N7         | Task 7: each `TraySpec.compartments` entry drawn at its scaled position, with a placement test.                                                                                                                                                                                                                      |
| N8         | Owner decision: a visible "This insert uses another printer" row with "Apply" at the top of My printer, only when the printers differ; margin, layer height, own size and folding risers in Printer details. Fate row 34, Task 14 and its tests.                                                                     |
| N9         | Task 6 Step 8: `rules.test.ts` "reads the source" points at `src/screens/StageTop.tsx`.                                                                                                                                                                                                                              |
| N10        | Task 0 Decisions and Step 9: `make-seeds` uses `DEFAULT_TIME_CAP_MS` (30 s), as the worker, and warns on a capped run.                                                                                                                                                                                               |
| N11        | Task 2 Step 7: thin re-exports of `Dialog` and `Sheet` from `Modal.tsx` and `BottomSheet.tsx`; Task 17 deletes them.                                                                                                                                                                                                 |
| Owner copy | No-fit h1 "The <name> tray doesn't fit yet", fallback "Not everything fits yet" (copy conflicts table, Task 12 and tests); Task 12's checkpoint C lists every new ruled string for the owner.                                                                                                                        |
