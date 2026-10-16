# UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the redesign in `docs/superpowers/specs/2026-10-16-ux-redesign.md` in full, including every item the spec lists as engine work, without shipping interim compromises.

**Architecture:** Three phases, each releasable on its own. Phase 1 changes the engine and app glue so the redesign's promises hold (real undo history, unique tray names engraved on the parts, pins that are never dropped silently, a global printer preference). Phase 2 replaces the interface (`src/app/App.tsx`, `src/ui/`, `src/plan/`, styles) on top of that. Phase 3 adds the remaining engine features (trial runs, fix suggestions, live settings preview, layer lock, keep-next-to). Phase 1 and 2 tasks are detailed here; Phase 3 is an outline to be expanded into its own plan once Phase 2 lands.

**Tech Stack:** Vite, TypeScript, Preact with `@preact/signals`, vitest (+ jsdom, `@testing-library/preact`), manifold WASM (geometry worker), layout worker.

**Spec:** `docs/superpowers/specs/2026-10-16-ux-redesign.md`; mockups on the design canvas named there.

## Global Constraints

- Words: tray, spacer, part (download list only), Pin/Pinned/Unpin, Tokens and dice, Miniatures, figures, What's inside, Keep searching, Rim between layers, Removable dividers.
- Trays are named, never numbered, on every surface (screens, 3D, download, packing guide, engraving) once Phase 1 Task 4 lands; no surface shows numbers after that.
- mm, g and h stay visible as numbers.
- No claim of slicer compatibility.
- Versioning (README "How to add a component kind"): schema additive change while MAJOR is 0 = PATCH bump in `src/model/version.ts` plus a fixture under `test/fixtures/schema/`; geometry change that keeps fit = PATCH in `src/geometry/version.ts`; anything that breaks fit = MINOR ("reprint the whole insert").
- Fields that change geometry but not layout stay out of `inputsHash` (`src/model/hash.ts`) and go into the mesh cache key.
- Every interactive control at least 44 px; one `h1` per screen; SVG icons only; `aria-pressed` on toggles; focus ring `outline: 3px solid var(--focus)`.
- Colours (light): page `#F4F3EF`, sheet `#FFFFFF`, ink `#1D1F1C`, muted `#5F625C`, rule `#E4E1D9`, box `#D3CDBF`, focus `#2F5BB8`; kind hues (fill/line/ink): cards `#DCE6FA/#335AA6/#22457E`, bits `#FBE9C9/#8A5D08/#6E4C0E`, tiles `#D8EEDE/#2E6B41/#22552E`, minis `#F5DCE7/#964068/#74244B`, custom `#E7E3F4/#5B4B9A/#45397A`; each component of a kind gets its own shade of that hue (decision); spacer hatched `#E9E5DB/#DDD8CC`, dashed `#6E695C`.
- Layer labels: "Layer 1 (bottom)", "Layer 2", …, "Layer n (top)"; no height.
- Printer (bed, margin, layer height) is a global preference in this browser, applied to new inserts.
- Breakpoints: phone layout below 760 px; dialogs full-screen below 600 px.
- `base: "./"` keeps working; no runtime requests to other hosts (fonts self-hosted).
- Every commit: `npm test` green; every task ends with `npm run verify`.

## Review Focus

1. A project saved by today's app (locks incl. `rotated`, `engraveNumbers`, `oneWall`, `separators`, stored layout) opens with the same plan, not stale, and its pins intact. Owner: P1 Task 1 (`opens a stored project without re-planning`, existing) and P1 Task 4 (`reads engraveNumbers into engraveNames`).
2. Undo after an edit that triggered a run restores both the inputs and the plan, and the plan is not stale. Owner: P1 Task 2.
3. Two trays can never show or engrave the same name, including spacers, fillers, spares and a component split into several trays. Owner: P1 Task 3.
4. A pin the user set is never removed without the user choosing it. Owner: P1 Task 5.
5. Keyboard-only: select a tray, pin it, swap it, open its editor, close back to the same selection. Owner: P2 Task 8.

---

## Phase 1: Foundations

### P1 Task 1: Up to date, and a test harness that does not depend on links

**Files:** Modify `src/app/test-app.tsx`, `src/app/App.test.tsx`, `src/app/App.release.test.tsx`.

**Interfaces:** Produces `renderApp(opts?: { project?: Project; storage?: MemoryStorage; overrides?: Partial<AppProps> }): { store; stub; projectStore; download }`. Seeds a project through `projectStore`, not through a `#1.` hash.

- [ ] **Step 1:** Call the ccd_host `sync_with_base_branch` tool (branch is behind `origin/main` by a8e3875, 6bebd17, 2a2ec02); `npm test` PASS.
- [ ] **Step 2:** Change `renderApp` to the new signature; keep a temporary `renderAppFromHash(hash)` for the tests that test link opening.
- [ ] **Step 3:** Migrate every `renderApp(encodeHash(...))` call in `App.test.tsx` (46 uses) to `renderApp({ project })`.
- [ ] **Step 4:** `npm run verify` PASS (no behaviour change).
- [ ] **Step 5:** Commit `Seed app tests through the project store`.

### P1 Task 2: Undo and redo history

**Files:** Create `src/app/history.ts`, `src/app/history.test.ts`; Modify `src/app/store.ts` (`edit`, `undo`, add `redo`), `src/app/runner.ts` (accepted result amends the current history entry), `src/app/state.ts` (replace `undoSlot` with `history`), `src/app/persistence.ts` (clear history on project switch, open and conflict resolution), `src/app/store.test.ts`.

**Interfaces:**

- Produces `createHistory(limit = 100): History`, `History { push(p: Project): void; amend(p: Project): void; undo(): Project | null; redo(): Project | null; canUndo: ReadonlySignal<boolean>; canRedo: ReadonlySignal<boolean>; clear(): void }`.
- `AppStore` gains `redo(): void`, `canUndo`, `canRedo`; `undo()` restores a whole `Project` (inputs, layout, locks).
- `state.undoSlot` and `UndoSlot` are removed; the remove-component toast's Undo calls `store.undo()`.

- [ ] **Step 1: Failing tests** in `store.test.ts`: `it("undo after an edit restores the inputs and the plan, not stale")` (edit → resolve the stub run → undo → `project.components` equals before, `layout` equals before, `stale.value === false`); `it("redo reapplies the edit and its plan")`; `it("a Keep searching result is one undo step")`; `it("history clears when another project opens")`; replace the old `undo` test at `store.test.ts:71-89`.
- [ ] **Step 2:** Run `npx vitest run src/app/store.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement. `edit` pushes the new project; when a run for that hash is accepted, `amend` replaces the top entry with the project carrying the new layout and locks; a run result whose hash no longer matches the top entry is discarded as today.
- [ ] **Step 4:** `npm test` PASS.
- [ ] **Step 5:** Commit `Undo and redo history for every edit`.

### P1 Task 3: One naming rule for trays

**Files:** Create `src/instructions/naming.ts`, `src/instructions/naming.test.ts`.

**Interfaces:** Produces `trayNames(parts: NumberedPart[], components: Component[]): Map<string, TrayName>` with `TrayName { full: string; short: string }` keyed by `TraySpec.key`. Rules: a component with one tray → its name; with several → name plus " 1", " 2" in plan order; spacers and fillers → "Spacer by <name of the tray beside it>" (ties broken by "front", "back", "left", "right"); spares → "Spare by <neighbour>"; `short` ≤ 10 characters for engraving: first word cut to fit, plus the suffix digit when there is one; names unique across the project (append " (2)" as last resort).

- [ ] **Step 1: Failing tests:** `it("uses the component name for a single tray")`; `it("numbers the trays of one component in plan order")`; `it("names a spacer by its neighbour")`; `it("never returns two equal full names")` (property-style over `test/fixtures/*.json` layouts); `it("short names fit 10 characters and stay unique")`.
- [ ] **Step 2–4:** Run (FAIL), implement, `npx vitest run src/instructions/naming.test.ts` (PASS).
- [ ] **Step 5:** Commit `Unique tray names`.

### P1 Task 4: Engrave names instead of numbers

**Files:** Modify `src/geometry/glyphs.ts` (add A–Z, space and hyphen to the 3×5 block font; `textRects(text: string)`, `textWidth(text: string)`), `src/geometry/engrave.ts` (engrave `partName`), `src/geometry/types.ts` (`TraySpec.partName?: string`, never stored), `src/geometry/version.ts` (PATCH), `src/model/types.ts` (`Settings.engraveNames: boolean` replaces `engraveNumbers`), `src/model/settings.ts`, `src/model/schema-read.ts` (read `engraveNumbers` into `engraveNames`), `src/model/version.ts` (schema PATCH), `test/fixtures/schema/<new>.json`, `src/instructions/numbering.ts` (`buildSpecOf(part, engrave, name)`), `src/app/meshes.ts` (cache key includes `partName`), `src/viewer/Viewer.tsx`, `src/ui/ExportPanel.tsx`, `src/instructions/render.ts`, `labels.ts`, `exploded.ts`, `AssemblyPage.tsx` (names from `trayNames` everywhere numbers were shown).

- [ ] **Step 1: Failing tests:** `glyphs.test.ts` `it("draws every letter within the 3x5 grid")`; `engrave.test.ts` `it("engraves the short name and skips it when it does not fit")`; `schema.test.ts` `it("reads engraveNumbers into engraveNames")`; `meshes.test.ts` `it("rebuilds a part when its name changes")`; `render.test.ts` update the instruction strings to names ("Slide Spacer by Dice into Market deck").
- [ ] **Step 2–4:** Run (FAIL), implement, `npm test` (PASS); `npm run verify`; open a fixture, export, and check the engraving in a 3MF viewer by hand.
- [ ] **Step 5:** Commit `Engrave tray names; names on every surface`.

### P1 Task 5: Pins are never dropped silently

**Files:** Modify `src/layout/locks.ts` (return `conflicts: { trayKey: string; reason: string }[]` instead of dropping), `src/layout/types.ts` (`LayoutResult.lockConflicts`), `src/app/runner.ts` (do not call `pruneDroppedLocks`; a result with conflicts is not accepted, the previous plan stays, `state.lockConflicts` is set), `src/app/actions.ts` (keep `pruneDroppedLocks` for explicit use only), `src/app/state.ts` (`lockConflicts: Signal<LockConflict[]>`), tests `locks.test.ts`, `runner.test.ts`.

**Interfaces:** Produces `LockConflict { trayKey: string; name: string; reason: string }`; `store.unpin(trayKey: string): void` (removes that lock and reruns).

- [ ] **Step 1: Failing tests:** `runner.test.ts` `it("keeps every pin and the previous plan when pins conflict")`; `it("reports which pins conflict and why")`; `locks.test.ts` update the drop-rule tests to expect conflicts.
- [ ] **Step 2–4:** Run (FAIL), implement, `npm test` (PASS).
- [ ] **Step 5:** Commit `Report pin conflicts instead of dropping pins`.

### P1 Task 6: Global printer preference

**Files:** Create `src/share/prefs.ts`, `src/share/prefs.test.ts`; Modify `src/app/store.ts` (`newProject` uses the preference), `src/app/actions.ts` (`applyPrinter(p, printer)`).

**Interfaces:** Produces `createPrefsStore(storage?: Storage): PrefsStore`, `PrefsStore { printer: Signal<Printer>; setPrinter(p: Printer): void }`, stored under `insert-generator:prefs`.

- [ ] **Step 1: Failing tests:** `it("a new insert uses my printer")`; `it("changing my printer leaves existing inserts alone until applied")`; `it("falls back to defaults when storage is unavailable")`.
- [ ] **Step 2–4:** Run (FAIL), implement, `npm test` (PASS).
- [ ] **Step 5:** Commit `Printer as a preference`.

### P1 Task 7: Signals the new screens need

**Files:** Modify `src/app/runner.ts` (`runPending: ReadonlySignal<boolean>` true from `schedule()` until the run settles), `src/app/persistence.ts` (`saveState: ReadonlySignal<"saved" | "saving" | "paused" | "failed" | "unavailable">`), `src/app/state.ts`; Create `src/app/dryRun.ts` (`canTurn(project, trayKey): { ok: boolean; reason?: string }` using `w === d` for square trays and `resolveLocks` for stack conflicts, main thread, no optimizer).

- [ ] **Step 1: Failing tests:** `runner.test.ts` `it("runPending is true during the debounce")`; `persistence.test.ts` `it("saveState is paused during a conflict and failed after a write error")`; `dryRun.test.ts` `it("a square tray cannot usefully turn")`, `it("reports a stack conflict before running")`.
- [ ] **Step 2–4:** Run (FAIL), implement, `npm test` (PASS).
- [ ] **Step 5:** Commit `Pending-run, save-state and dry-run signals`.

---

## Phase 2: New screens

Each task: failing tests named below, implement, `npm test`, commit. Tests query by role and name; no `:hover` (use focus or selection), no drag (jsdom has no layout); visual checks at 390, 820 and 1440 px by hand with `npm run dev`.

### P2 Task 1: Tokens, fonts, base styles, dark theme

**Files:** new `src/styles/tokens.css` (the redesign's own tokens; the vendored `proof-tokens.css` and `proof.css` are retired, README "Look" updated), `src/styles/fonts.css` + `src/assets/fonts/*.woff2` (Bricolage Grotesque, Figtree; OFL licences added to `licenses.config.ts`; `scripts/smoke-dist.mjs` still passes), dark set under `prefers-color-scheme: dark` with the same names; `src/ui/identity.ts` `shadeOf(kind, index): { fill, line, ink }`.
**Tests:** `style.test.ts` `it("defines the redesign tokens")`; `identity.test.ts` `it("gives two card components two shades of blue")`.

### P2 Task 2a: Remove the mode switch

**Files:** `src/app/state.ts` (remove `mode`), `src/app/App.tsx` (remove radios, `data-level`, the dotted-edge note); every former advanced section renders always (no interim `<details>`); `src/ui/validation.ts` `errorsWithoutField(validation)` without the mode argument.
**Tests:** `App.test.tsx` `it("has no Simple/Advanced switch")`; `it("shows settings errors next to their field")`.

### P2 Task 2b: Drop the `advanced` prop, one component per commit

`Summary`, `PlanView`, `Viewer`, `TrayDetails`, `SettingsForm`, `BoxForm`, `PrinterForm`, each editor, `MoreOptions` (opens itself on an error, unchanged); delete `Advanced.tsx`. Each commit keeps `npm test` green.

### P2 Task 3: Files instead of links

**Files:** `src/main.tsx`, `src/app/store.ts` (`AppDeps` without `replaceHash`), `src/app/persistence.ts` (no `writeHash`; on start, an old `#1.` link is decoded read-only, opened as a copy, and the hash is cleared once), `src/app/link.ts` deleted, `src/share/link.ts` decode-only (`encodeHash` deleted), `src/ui/ProjectMenu.tsx` (no Copy link); storage-unavailable notice "Save a file to keep your work" and a `beforeunload` warning when storage is unavailable and there are unsaved changes.
**Tests:** `App.test.tsx` `it("an old link opens as a copy and the address bar is cleared")`; `persistence.test.ts` `it("warns before leaving when nothing can be saved")`.

### P2 Task 4: Header and project menu

**Files:** `src/ui/AppHeader.tsx`, `src/ui/SavedStatus.tsx`, `src/ui/ProjectMenu.tsx` (menu: New insert, Your inserts, Open file…, Save file, Settings), `src/ui/InsertsList.tsx` (saved inserts with open and "Delete…" with confirm), phone "Send file" via `navigator.share({ files })` with a Save fallback.
**Interfaces:** `AppHeader(p: { name; onRename; saveState; canUndo; canRedo; onUndo; onRedo; onDownload; downloadDisabled; menuDot; menu })`.
**Tests:** `AppHeader.test.tsx` `it("shows Saved in this browser")`, `it("shows Saving paused")`, `it("Undo and Redo follow history")`; `InsertsList.test.tsx` `it("deletes an insert after confirming")`.

### P2 Task 5: Notices

**Files:** `src/ui/noticePlacement.ts` (`STALE_CODE` → banner only when `!runPending && run.status !== "running"`; `GEOMETRY_MAJOR_CODE` → banner; `CONFLICT_CODE`, `STORAGE_UNAVAILABLE_CODE`, `SAVE_FAILED_CODE` → menu dot plus a block at the top of the menu; others inline under the status, at most 3); when a no-fit and a stale plan coincide, the no-fit state wins and the stale banner is not shown.
**Tests:** `noticePlacement.test.ts` table; `App.test.tsx` `it("conflict shows a menu dot and both choices")` (uses `projectStore` from `renderApp`), `it("no stale banner while a run is pending")`.

### P2 Task 6: Lift plan view state

**Files:** `src/plan/PlanView.tsx` (`levelIndex` and `swapFrom` become props), `src/app/state.ts` (`viewLevel: Signal<number>`, `swapFrom: Signal<string | null>`).
**Tests:** existing `PlanView.test.tsx` adapted; `it("the layer switch is controlled by the app")`.

### P2 Task 7: Plan tiles

**Files:** `src/plan/PlanView.tsx`, `plan.css`, `tileText.ts`: names from `trayNames` in a pill, shade per component, hatched spacers, kind icon on the selected or focused tray only, `aria-label` "<name>, layer n"; layer switch labels "Layer 1 (bottom)" … "Layer n (top)"; a visually hidden list of trays per layer as the accessible alternative to the SVG.
**Tests:** `it("labels trays by name, never by number")`, `it("shows the kind icon only on the selected tray")`, `it("lists the trays of the shown layer for screen readers")`.

### P2 Task 8: Tray bar

**Files:** `src/ui/TrayBar.tsx`: name, layer, size, contents, print estimate; Pin/Unpin (`toggleLock`, pins the stack), Turn 90° (stack position lock with `rotated` flipped; chip "Pinned, turned"), "Swap with…" (existing `swapFrom` flow; swap-made pins show as chips), Lock size (`toggleSizeLock`), Edit, Close; blocked actions say why via `canTurn`.
**Tests:** `TrayBar.test.tsx` `it("Pin toggles to Unpin")`, `it("Turn says why it is unavailable for a square tray")`; `App.test.tsx` `it("keyboard pin and swap")` (seed a project with a layout via `renderApp({ project })`, Tab to a tray, Enter, Pin, "Swap with…", Enter on another tray; expect the locks `swapLocks` writes for both stacks).

### P2 Task 9: Status line, searching, doesn't fit, pin conflicts

**Files:** `src/ui/StatusLine.tsx`: "Everything fits" + "N trays in L layers, H of B mm high"; Keep searching ↔ Stop (`refit`, `cancelRun`, progress from `run`); no-fit variant names the component from `shortfall` and offers "Edit <name>"; pin-conflict variant (from P1 Task 5) "<name> doesn't fit with your pins" with one "Unpin <name>" button per conflicting pin (no outcomes yet; Phase 3 adds them); Download label "Fix the fit to download" while either applies.
**Tests:** `it("Keep searching becomes Stop while running")`, `it("names the component that does not fit")`, `it("offers to unpin each conflicting pin")`.

### P2 Task 10: What's inside list and editor panel

**Files:** `src/ui/components/ComponentList.tsx` (rows with kind shade, name, meta, layer; chips "Pinned", "Pinned, turned", "Size locked", each with × → `store.unpin` / `removeLock`), `src/ui/components/EditorPanel.tsx` (basics, then More options in place: `CommonOptions`, `GrowthOptions`, `ToggleOptions`, sleeves and measured stacks; labels per spec), `src/ui/components/optionNotes.ts` (`describeOptionChange(prev, next): string | null`), `src/ui/Toast.tsx`; "Keep it next to" appears in Phase 3.
**Tests:** `optionNotes.test.ts` (growth → "Leaves room to grow. The deck stands in a wider well."; `separators` 0→1 → "A removable spacer fills the gap."); `EditorPanel.test.tsx` `it("every option of each kind is reachable")`; `ComponentList.test.tsx` `it("removing a Pinned chip unpins the stack")`.

### P2 Task 11: Box panel and first visit

**Files:** `src/ui/BoxPanel.tsx` (size, "Keep space free on top" with Whole top / Part of it, "The box is stored on its side"), empty state in `App.tsx` (box fields, kinds, "Start from an example game", "Your inserts are saved in this browser.").
**Tests:** `it("adding the first item opens its editor")`, `it("box headroom is always visible")`.

### P2 Task 12: Settings sheet

**Files:** `src/ui/SettingsSheet.tsx` (dialog; tabs "This insert" / "My printer"); This insert: Fit, Walls (Custom when exact values differ), Room for fingers, Rim between layers, Fill to the lid, Unused space, "One thick wall instead of a spacer" (`oneWall`), exact numbers with search, per-value reset, "N changed"; My printer: bed preset and size, margin, layer height (the P1 preference, with "Apply to this insert"), Engrave tray names, Join spacers into fewer parts, Fold risers.
**Tests:** `it("every setting is reachable")`, `it("Walls shows Custom when it matches no preset")`, `it("Escape closes and returns focus")`.

### P2 Task 13: Download dialog and packing guide

**Files:** `src/ui/ExportPanel.tsx` (one combined 3MF first; Other formats; named parts; filament and print time; progress and Stop; "Not exported" with names and Try again; Ko-fi `https://ko-fi.com/igorzamyslov` and PayPal `https://paypal.me/igorzamyslov`, new tab), `src/instructions/AssemblyPage.tsx` + `assembly.css` (new look, names, phone layout, print stylesheet).
**Tests:** `it("downloads one combined 3MF by default")`, `it("support links open in a new tab")`, `AssemblyPage.test.tsx` `it("refers to trays by name")`.

### P2 Task 14: 3D view

**Files:** `src/viewer/Viewer.tsx`, `scene.ts`: shades per component, names on select, axes toggle kept in the view's corner, WebGL fallback text "3D needs WebGL turned on. The top view works the same."
**Tests:** `Viewer.test.tsx` `it("explains when WebGL is missing")`.

### P2 Task 15: Phone and tablet

**Files:** styles (stage first below 760 px; list as a bottom sheet with a 44 px handle; editor, box and settings full-screen below 600 px), `NumberField.tsx` (`inputmode` decimal for mm, numeric for counts, `enterkeyhint="next"`); measure `numberParts`/`printableParts`/`trayNames` per render on a mid phone and memoise if a frame exceeds 16 ms.
**Tests:** `NumberField.test.tsx` `it("uses a decimal keyboard for mm")`; manual check at 390 and 820 px.

### P2 Task 16: Copy, footer, README

**Files:** every string against spec "Words"; footer (version, licences, all apps); `README.md`.
**Tests:** `src/ui/copy.test.ts` `it("uses no retired words")` ("Copy link", "Simple", "Advanced", "Find a better fit", "tighter layout", "Locking rim", "loose dividers", "#" followed by a digit in UI strings).

---

## Phase 3: Engine features (outline; expand into its own plan after Phase 2)

1. **Trial runs.** A second layout worker with its own cancel token (today one token invalidates everything), budget-limited runs that never touch the stored plan. Everything below depends on it.
2. **Fix suggestions with outcomes.** Candidate generator (lay figures flat, other storage mode, thinner walls, unpin one pin, move a component to another layer); each candidate checked by a trial run; "Checking…" while they run; replaces the bare no-fit and pin-conflict variants of P2 Task 9.
3. **Live "Still fits" in Settings.** Draft settings feed a debounced trial run; the footer shows the result and the size and filament change.
4. **Layer lock.** `Lock { kind: "level"; trayKey: string; level: number | "top" | "bottom" }` in `src/model/types.ts`, validation, schema read, schema PATCH plus fixture; older apps keep it as foreign data; enforced in `resolveLocks` and the move set; interaction with `swapLocks` defined; "To the other layer" in the tray bar with reasons from the dry run.
5. **Keep it next to.** `nextTo?: string[]` on components (schema PATCH, in `inputsHash`), a score term in `src/layout/score.ts`, a notice when it cannot be met, layout fixtures updated; the editor's "Keep it next to" chooser.

Ship 4 and 5 in one release so they share one schema bump.

## Decisions taken

Foundations first. Printer is a global preference. Colours: kind hue, one shade per component. Layers labelled "Layer 1 (bottom)" … "Layer n (top)". Turn pins the stack ("Pinned, turned"). Swap-made pins show as chips. Old `#1.` links open read-only as a copy for a deprecation window. "Older version, reprint everything" is a banner. Fonts self-hosted. Dark theme kept. Spacer and multi-tray naming as in P1 Task 3.
