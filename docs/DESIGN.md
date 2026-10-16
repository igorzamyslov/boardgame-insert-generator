# Design rules

How the insert generator looks, speaks and behaves, and why. Read this before you change any UI.

## 1. Purpose and how to use this document

- This file is the living rulebook for the UI. It describes the app as built after the 2026-10-16
  redesign.
- The spec, [`docs/superpowers/specs/2026-10-16-ux-redesign.md`](superpowers/specs/2026-10-16-ux-redesign.md),
  is the original argument. It is a dated record. Do not edit it to match later work.
- When this document and the spec disagree, this document wins. If you want to change a rule here,
  change it on purpose, in the same commit as the code, and add a row to the decision log
  (section 7) saying why.
- **Hard rules** (section 2) are MUST / MUST NOT. Break one only by first changing it here.
- **Soft principles** (section 3) are SHOULD. Depart from one when you have a reason, and say
  the reason in the commit or the review.
- File paths are relative to the repository root.

The person this app is for: someone with a board game, a ruler and a 3D printer. They are not an
engineer. The old app read as a technical tool: too many buttons, too much text and a cold,
technical palette. The owner called it unusable. Everything below exists so it does not drift back.

## 2. Hard rules

### Words

- MUST use the words in the table below in every string a person can read (UI, notices, packing
  guide, README). Enforced by `src/ui/copy.test.ts` ("uses no retired words", "keeps the README to
  the same words").

  | Use                                                      | Not                                             |
  | -------------------------------------------------------- | ----------------------------------------------- |
  | tray                                                     | part (except in the download list), bin         |
  | spacer                                                   | filler, loose spacer                            |
  | Pin, Pinned, Unpin                                       | lock, keep, placement, let go                   |
  | Tokens and dice, Miniatures (the kind), figures (pieces) | bits, minis                                     |
  | What's inside                                            | components, things                              |
  | Keep searching                                           | find a better fit, tighter layout, Improve more |
  | Rim between layers, Removable dividers                   | locking rim, loose dividers, loose plates       |
  | Exact numbers                                            | Exact values                                    |
  | Make a new plan                                          | Update plan, Update the plan                    |
  | Save file, Open file, Send file                          | Copy link, share link                           |
  | (nothing: there is one mode)                             | Simple, Advanced, simple mode, advanced mode    |

- MUST keep "Lock size", "Unlock size" and "size locked" for the size lock. Only a position lock is
  a pin. The allow-list in `copy.test.ts` covers these and "Keep searching", "Keep space free",
  "Part of it" (the box's headroom choice) and `data-part` (an attribute name inside an SVG
  string, not text).
- MUST say "part" only in the download list, export failure reasons and part names. The files are
  listed in `PART_FILES` in `copy.test.ts`.
- MUST NOT add a word to the allow-list without a row in the decision log.

### Names, not numbers

- MUST identify a tray by what it holds, its kind colour and its kind icon. MUST NOT show a tray
  number, a `#` and a digit, or a number badge anywhere. Enforced by the "# and a digit" check in
  `src/ui/copy.test.ts`.
- MUST take tray names from `trayNames` (`src/instructions/naming.ts`). Several trays of one
  component are "<name> 1", "<name> 2"; spacers are "Spacer by <neighbour>", several by one tray
  "Spacer 1 by Dice". Tested in `src/instructions/naming.test.ts`.
- MUST engrave the short name, never a number. Where the short name differs from the full name,
  the packing guide says "Engraved as".
- The assembly order number in `src/instructions/numbering.ts` is a sort key. MUST NOT show it or
  engrave it.
- Measurements carry information. MUST show mm, g and h as numbers. MUST NOT replace them with
  friendly conversions ("about a deck high").

### Accessibility and touch

- MUST give every control a target of at least 44 px (`--control-h`). Enforced by
  `src/style.test.ts`: "touch targets", "makes every button 44 px by default", "gives the view's
  tabs a 44 px target".
- Exemption: plan tiles may be smaller than 44 px. Their size is the tray's geometry drawn to
  scale (WCAG 2.5.8 "essential"). The note is in `src/plan/plan.css`. No other control may claim
  this exemption.
- MUST have exactly one `h1` per screen: the wordmark in `src/ui/AppHeader.tsx`, or the guide title
  in `src/instructions/AssemblyPage.tsx`. Dialogs name themselves with a lower heading passed to
  `Modal`'s `labelledBy`. Tested in `src/ui/AppHeader.test.tsx`, `src/app/App.test.tsx` ("under one
  h1") and `src/instructions/AssemblyPage.test.tsx`.
- MUST put `aria-pressed` on a toggle whose label stays the same when it is set: "Swap with…",
  "Show axes", the headroom choice in `BoxPanel`, plan tiles and the 3D tray picker.
- Exception: a button whose label is the action MUST NOT carry `aria-pressed`. "Pin" / "Unpin" and
  "Lock size" / "Unlock size" change their label, and the chips on the list carry the state.
  Enforced in `src/ui/TrayBar.test.tsx`.
- MUST keep a blocked action focusable: `aria-disabled="true"` plus `aria-describedby` pointing at
  the sentence that says why. MUST NOT use the `disabled` attribute on an action that has a reason.
  See `Action` in `src/ui/TrayBar.tsx`, the Download button in `src/ui/AppHeader.tsx`, `CheckField`
  in `src/ui/fields.tsx` and `RowRemove` in `src/ui/components/RowRemove.tsx`. The one exception is
  `disabled` on an `<option>` of a `<select>` (the "Custom" placeholder). Enforced by
  `src/rules.test.ts`.
- MUST show the 3 px focus ring from `src/styles/tokens.css` (`:focus-visible`, `--focus`, 2 px
  offset) on every focusable element. SVG tiles draw their own ring (`.plan-ring`); do not remove
  outlines elsewhere.
- MUST draw icons as inline SVG with `aria-hidden="true"` and a text label or `aria-label` on the
  control. MUST NOT use emoji or text characters as icons.
- MUST keep text at 4.5:1 and tray edges and icons at 3:1 against their ground, in light and dark.
  Enforced by `src/style.test.ts` and `src/ui/identity.test.ts`.
- MUST handle Undo and Redo from the keyboard in one place: a single `keydown` listener on
  `document`, added by `App` and removed when it unmounts (`src/app/App.tsx`, helpers in
  `src/ui/historyKeys.ts`). Ctrl+Z and Cmd+Z undo; Shift+Ctrl+Z, Shift+Cmd+Z and Ctrl+Y redo. It
  stands aside while focus is in a text field, text area, select or editable element (they have
  their own undo), while any modal dialog is open (Download and Settings: see the decision log),
  and on the packing guide. A shortcut with nothing to undo or redo does nothing and is left to the
  browser, as the `aria-disabled` button. The buttons show the shortcut in their title ("Undo
  (Ctrl+Z)", "Undo (⌘Z)" on a Mac). This is the only global key handler: another one needs a
  decision-log row. (The rule against global key handlers on the design canvas is about its
  mockups, not the app.) Tested in `src/app/App.test.tsx` ("Undo and Redo from the keyboard") and
  `src/ui/historyKeys.test.ts`.
- MUST give number fields `inputmode` (`decimal` for mm, `numeric` for counts) via
  `src/ui/NumberField.tsx`.

### Layout

- MUST use 760 px as the phone breakpoint (`PHONE_QUERY` in `src/ui/useMediaQuery.ts`, CSS
  `@media (width < 760px)`) and 600 px for full-screen dialogs and sheets (`@media (width < 600px)`).
  Enforced by `src/style.test.ts` ("breaks at the width the app asks about", "fills the screen with
  an open sheet … below 600 px").
- The rail is one width on every screen: 300 to 350 px (`--rail-basis`, `--rail-max`), Main's, and
  the stage takes the rest (`src/screens/workspace.css`). There is no tablet rule; the 3D canvas is
  shorter below 600 px, on the 600 px line.
- MUST NOT add a new breakpoint without a decision-log row. `src/style.test.ts` ("breakpoints")
  lists every `@media` width in the CSS and fails on one that is not ruled here.
- MUST keep the plan at least 24 rem tall (`style.test.ts`). The figures (Summary) sit below the
  plan on every width, so the page order is the status line, the plan, the figures; with them
  below, the plan still fell to 93 px at 1440 by 700 px without the floor.

### Hosting and network

- MUST NOT make runtime requests to any other host. Fonts, scripts, WASM and workers are bundled.
  Ko-fi and PayPal are plain links a person clicks, not requests. Enforced by
  `src/rules.test.ts` ("makes no runtime request to another host": no `fetch`, `XMLHttpRequest`,
  `WebSocket` or the like in the source; no absolute URL in it but the support links and the XML
  namespaces; none in `index.html`) and, for the built files, `scripts/smoke-dist.mjs` (relative
  URLs only).
- MUST keep `base: "./"` in `vite.config.ts`. The app is served from a subpath. Checked by
  `scripts/smoke-dist.mjs` (no absolute `/assets/` paths).
- MUST NOT add URL sharing or write state to the address bar. Projects live in browser storage and
  in project files. Old `#1.` links are read once and the address bar is cleared (`src/main.tsx`).

### Colour

- MUST take every colour from a token in `src/styles/tokens.css`. MUST NOT write a raw hex in
  component CSS or inline styles. Exemption: the packing guide's `@media print` rules in
  `src/instructions/assembly.css` use `#000`, `#fff` and one grey, because paper is black on white
  whatever the screen theme; the on-screen pictures use `--paper-white`. `src/rules.test.ts` fails
  on a raw hex anywhere else outside `tokens.css`. New code uses the primary names (`--page`, `--ink`, `--focus`,
  `--danger` …), not the legacy aliases at the end of `tokens.css` (`--indigo`, `--madder`,
  `--paper`, `--tint-8` …). Old uses of the aliases remain in `src/style.css` and
  `src/plan/plan.css`; move one to the primary name when you touch it.
  `src/rules.test.ts` fails if the count grows.
- MUST colour a component and its trays with its kind's hue in its own shade:
  `shadeIndexOf(components, i)` picks the shade, `shadeOf(kind, i)` gives page CSS colours
  (`light-dark()`), `shadeHex(kind, i, scheme)` gives plain hex. All in `src/ui/identity.ts`.
- MUST use the same shade for a component in every view: list row, plan tile, tray bar, 3D view,
  packing guide. `src/plan/glyph.ts` and `src/viewer/shades.ts` both go through `shadeIndexOf`.
  Tested in `src/ui/identity.test.ts` and `src/plan/PlanView.test.tsx`.
- MUST NOT use `light-dark()` outside the page's own CSS. three.js, PNG and SVG export and print
  use `shadeHex(kind, i, "light")` (paper is always light). A test keeps `light-dark(` out of the
  exported SVG.
- Light is the default and only theme; MUST NOT follow the system's dark setting. Dark is opt-in
  (§4 Dark mode). Enforced by `src/style.test.ts` ("keeps dark opt-in").

### Claims and copy limits

- MUST NOT claim slicer compatibility ("opens in any slicer", "works with Cura"). Enforced by the "a slicer
  claim" entry of `src/ui/copy.test.ts` (UI strings and the README) and by `ExportPanel.test.tsx`
  ("says nothing about slicers or what the files open in").
- MUST keep pills to a single line. Text inside a pill truncates with an ellipsis; it never wraps.
  See `.pf-status__pill`, `.pf-status__text` and `.pf-status__btn` in `src/style.css`
  (pinned by `src/style.test.ts`, "pills") and the plan's name pills cut by `src/plan/tileText.ts`
  (tested in `src/plan/tileText.test.ts`).
- MUST NOT add glosses to estimates. "≈ 42 g · ≈ 3 h 10 min" stands on its own.

### Flow

- MUST have one Download entry point: the header's "Download" in `src/ui/AppHeader.tsx`, which
  opens `ExportPanel` in a `Modal`. No second Download button in a toolbar, a pill or the list.
  Enforced by `src/rules.test.ts` ("opens the Download dialog from one place only") and
  `src/app/App.test.tsx` ("has exactly one Download button, in every state of the workspace").
- MUST make one combined 3MF the default download. Per-part zip and STL stay under "Other formats".
  Tested in `src/ui/ExportPanel.test.tsx` ("downloads one combined 3MF by default").
- MUST show at most one plan banner. "This plan is from before your last changes." (stale) and the
  older-geometry banner never show together; the older-geometry one wins. Implemented in
  `placeNotices` (`src/ui/noticePlacement.ts`), tested in `src/ui/noticePlacement.test.ts` and
  `src/app/App.test.tsx`. Other notices go inline or into the project menu with a dot.
- MUST keep Download off, with its reason, while there is no plan yet, the plan is stale, a run is
  pending, nothing fits, pins conflict, or the plan is from older geometry, whether or not the
  person chose "Use the old plan" (`src/app/App.test.tsx`). The reason for the last is
  "Reprint everything to download" (`GEOMETRY_REPRINT_REASON`, one short line); pressing the
  blocked button while the old plan is kept brings the banner and its "Reprint everything" back,
  and that re-plan clears the state.
- MUST NOT drop a pin silently. When the worker reports `lockConflicts`, the runner keeps the
  previous plan and every pin, and the status line offers "Unpin <name>". Tested in
  `src/app/runner.test.ts` ("keeps every pin and the previous plan when pins conflict", "never
  prunes pins on its own").
- MUST route every project change through `store.edit(fn)` with a pure function from
  `src/app/actions.ts`, so it is one undo step. Edits less than 1000 ms apart coalesce into one
  step; a "Keep searching" result is its own step; history holds 100 steps and clears when another
  project opens. Tested in `src/app/store.test.ts` and `src/app/history.test.ts`.
- The printer preference lives in the browser, not the project, so changing it is not an undo
  step. "Apply to this insert" is (`src/app/App.test.tsx`).

### Data and versions

- MUST follow the versioning rules in the README:
  [How to add a kind of item](../README.md#how-to-add-a-kind-of-item) (`SCHEMA_VERSION`,
  `GEOMETRY_VERSION`) and [Releasing](../README.md#releasing) (`package.json` version on every PR
  to main, checked by `scripts/check-version-bump.mjs`).
- MUST put into `inputsHash` (`src/model/hash.ts`) everything that changes the layout, and nothing
  else. Names, `engraveNames`, `infill`, `mergeFillers` and `mergeRisers` stay out: changing them
  must never mark the plan stale.
- MUST make anything that changes the printed mesh but not the layout part of the mesh cache key.
  `src/app/meshes.ts` keys on `JSON.stringify([spec, settings])`, with the engraved `partName` on
  the spec. A new print-only option goes into the spec or settings passed there, not into
  `inputsHash`.
- When a new hashed field is added, MUST leave its default out of the hash so saved plans stay
  current (see how `oneWall` and `playLimit` are handled in `inputsHash`).

## 3. Soft principles

- **Hide detail until asked.** Plain choices first; exact numbers behind "More options"
  (`src/ui/components/MoreOptions.tsx`) and "Exact numbers" in Settings. _Why:_ most people never
  need them, and every visible control costs everyone attention.
- **The box is the hero.** One workspace: What's inside on the left, the box drawn large on the
  right; every other screen opens from it and returns to it unchanged. _Why:_ the box is what the
  person is making; everything else is a means to it.
- **Say less late in the flow.** By the download screen the person knows what they are doing:
  no explanations, sometimes no text at all. _Why:_ explanation the person no longer needs reads as
  noise and hides the one thing that matters.
- **Explain a blocked action; don't hide it.** Keep it visible and focusable with one sentence
  saying why ("Turning would clash with the pin on Market."). _Why:_ a missing button is a mystery;
  a blocked one with a reason teaches the rule.
- **One primary action per screen.** The workspace has Download, the editor has Done, the download
  dialog has "Download 3MF". _Why:_ two loud buttons make the person stop and choose.
- **State engine limits honestly.** If the engine can't do something, the UI does not offer it.
  If a design needs it, mark it "needs engine work" (section 6). _Why:_ a control that half works
  breaks trust in every other control.
- **Plan for success.** A part that fails to build is a rare bug: list it plainly under "Not
  exported" with its reason and "Try again", nothing more. _Why:_ designing for common failure
  makes the common path heavier.
- **Respect reduced motion.** Every transition has a `prefers-reduced-motion: reduce` override
  (see the end of `src/style.css`). Keep motion short (200 ms) and functional. _Why:_ motion can
  make people ill, and it is never the message.
- **Phone: stage first, list in a sheet.** Below 760 px the status pill and the box come first;
  What's inside is a bottom sheet (`src/ui/BottomSheet.tsx`) with a 44 px handle. _Why:_ on a
  small screen the box is still the hero, and the list is one tap away.
- **Reuse before you add.** Use `EditorPanel`, `Modal`, `Toast`, `BottomSheet`, `Notices`,
  `MoreOptions` and `NumberField` before writing a new container or field. _Why:_ each one already
  carries focus handling, live regions and 44 px targets that a new one would have to relearn.
- **Pins are promises.** Pins, turns and swaps stay as set when the plan updates; when they block
  a fit, say which ones and offer to unpin. _Why:_ a choice the app quietly undoes is worse than
  no choice.
- **Let the person drop a rule where they see it.** Every chip ("Pinned", "Pinned, turned", "Size
  locked") has its own ×. _Why:_ the person should not have to find the tray to undo a rule.
- **Keep support low-key.** The Ko-fi and PayPal links sit in one quiet "Support it" line at the
  end of the download dialog, opening in a new tab. _Why:_ asking loudly spoils the moment the app
  just earned.
- **Announce only what matters.** Errors are alerts, warnings polite, routine saving silent
  (`src/ui/Notices.tsx`, `src/ui/SavedStatus.tsx`). A new plan after an edit is announced only if
  it takes over a second; "Keep searching" always is (`src/ui/Summary.tsx`). _Why:_ a screen reader that talks constantly
  is ignored.

### Non-goals

- **No Simple/Advanced mode.** Progressive disclosure does the job without a switch.
- **No URL sharing.** Links were about 2000 characters, too long for some browsers and chat apps.
  Files and browser storage replace them.
- **No React, shadcn/Tailwind or Bun.** Evaluated and ruled out: none gives the person using the
  app anything. Preact with `@preact/signals` and a hand-rolled token system
  (`src/styles/tokens.css`) is the deliberate stack: small, fast, and already carrying the
  accessibility work.

## 4. Look and feel

### Palette roles

Light and warm. Every value comes from the boards (`docs/design/boards`). Tokens in
`src/styles/tokens.css`:

| Role                                        | Token                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Page background                             | `--page`                                                                          |
| Cards, panels, sheets                       | `--sheet`, with `--shadow-sheet`                                                  |
| List rows, the box card, kind tiles         | `--row`                                                                           |
| Segment tracks, progress tracks, small tags | `--fill-quiet`; Main's Layer and View segments `--track`                          |
| Text                                        | `--ink`; secondary text `--muted`, `--muted-strong`; blocked `--ink-off`          |
| Hairlines, dividers                         | `--rule`, `--rule-soft`; field edges `--field-line`                               |
| Control and tray edges                      | `--edge`                                                                          |
| The box floor in the plan                   | `--box`, `--box-edge`, `--box-dash`                                               |
| Focus, links, selection                     | `--focus`, `--focus-wash`, text on it `--on-focus`; a field's glow `--field-glow` |
| Info (banner, searching)                    | `--info-bg`, `--info-ink`                                                         |
| Everything fits, saved                      | `--fit-bg`, `--ok`                                                                |
| Errors, no-fit                              | `--danger`, `--danger-bg`, `--danger-ink`, `--on-danger`                          |
| Warnings, the menu dot                      | `--warn`, `--warn-bg`, `--warn-ink`, `--warn-ink-strong`                          |
| Changed from the default (Settings)         | `--changed`, `--changed-bg`, `--changed-ink`                                      |
| Behind a dialog or the drawer               | `--scrim`                                                                         |

Never lay `--muted` text on `--box`: it falls below 4.5:1 in light mode.

### Kind hues and shades

Each kind has a fill, line and ink triple:

| Kind            | Hue    | Tokens                                    |
| --------------- | ------ | ----------------------------------------- |
| Cards           | blue   | `--cards-*`                               |
| Tokens and dice | amber  | `--bits-*` (the token keeps the old name) |
| Tiles           | green  | `--tiles-*`                               |
| Miniatures      | pink   | `--minis-*`                               |
| Other           | violet | `--custom-*`                              |

Each component takes its own shade of its kind's hue, by its place among components of that kind
(`shadeIndexOf`). Shades cycle after a few. Spare trays and spacers belong to no kind: hatched
`--spacer-fill` / `--spacer-hatch` with a dashed `--spacer-dash` edge (`src/plan/plan.css`); the
3D view and the packing guide use the same neutral (`SPACER_SHADE` in `src/ui/identity.ts`).
"Everything fits" borrows the tiles green; that is the only place a kind hue means something else.

### Typography

- Headings: Bricolage Grotesque 500 and 700 (`--font-display`).
- Everything else: Figtree 400, 500, 600 and 700 (`--font-ui`). 15 px on the page, 16 px on a phone.
- Both self-hosted from `@fontsource` packages, declared in `src/styles/fonts.css`: woff2, latin
  and latin-ext subsets only. Adding a weight or subset is a decision-log row.
- Numbers that line up (percentages, sizes in columns) use `font-variant-numeric: tabular-nums`.
- No all-caps labels.

### Shapes

- Radii are the boards': `--r-cell` 6, `--r-logo` 8, `--r-icon` 9, `--r-tile` 10, `--r-field` 12,
  `--r-card` 14 (cards, menu panel, toast, banner), `--r-panel` 16, `--r-bar` 18, `--r-dialog` 22
  (dialogs, the phone sheet's top corners), `--r-pill` 999 px.
- Pills: `border-radius: var(--r-pill)`, one line, at least 44 px tall. The status line is a stack
  of pills, one per matter.
- Spacing is the boards' scale: `--s-2` … `--s-40` (2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22,
  24, 28, 32, 40 px). A one-off board value (1, 7 or 9 px) stays literal, with a comment naming
  the board. The old `--space-*`, `--radius-*`, `--rail-width` and `--page-max` stay as aliases
  until the old layout is gone.
- Shadows, sizes and type sizes are tokens too (`--shadow-*`, `--field-h`, `--header-h`, `--h1` …).

### Dark mode

- Not built; the old dark values are in git history (`68733a9`, `src/styles/tokens.css`). Dark is
  opt-in from the project menu and defaults to light; it sets `data-theme="dark"` on the root, with
  `color-scheme: dark`.
- Print is always light (`src/style.css` sets `color-scheme: light` for print).

### Icons

- Inline SVG only, 24 × 24 viewBox, `stroke="currentColor"`, stroke width 2, round caps and joins
  (see `ICON` in `src/ui/TrayBar.tsx`).
- Kind glyphs live in `src/ui/kindGlyphs.tsx`; `KindIcon` (`src/ui/KindIcon.tsx`) puts a glyph on
  its shade.
- On the plan, a tray's kind icon shows only when it is hovered, focused or selected
  (`src/plan/PlanView.tsx`). Keyboard focus mirrors hover.
- Never emoji, never text characters (×, ✓, ▸) as icons.

## 5. Interaction patterns

**Workspace.** `src/screens/Workspace.tsx` is its shell: the header, the rail (`aside`, "What's inside") and the stage (the one `main`), marked `data-region`. Below 760 px the stage comes first and the rail is the sheet. The page is one screen tall and never scrolls on a desktop. `src/app/App.tsx` fills the slots: `AppHeader` (wordmark, insert name, `SavedStatus`,
Undo, Redo, the project menu, Download), then What's inside (`WhatsInside`) in the rail and the
stage: `StatusLine`, the Plan / 3D tabs (`src/plan/PlanView.tsx`,
`src/viewer/Viewer.tsx`), then `Summary` (figures, notes and messages about the plan). The footer holds only the version, build id and licences link.

**Selection and the tray bar.** Click or focus a tray in the plan or the 3D view to select it. The
tray bar (`src/ui/SelectedTrayBar.tsx` wrapping `src/ui/TrayBar.tsx`) shows its name, layer
("Layer 1 (bottom)"), size, estimates, what it holds or sits on, and the actions: Pin, Turn 90°,
Swap with… (plan only), Lock size, Edit. Spare trays, spacers and risers get every action blocked
with one shared reason. Only one tray is selected at a time.

**Pin, turn, swap.** Pin fixes a tray where it is; pinning a stacked tray pins its whole stack.
Turn 90° only exists as part of a pin, so turning pins the stack ("Pinned, turned"). Swap with…
swaps two whole stacks and pins both; it works by drag or keyboard in the plan. `canTurn`
(`src/app/dryRun.ts`) runs the lock check without the optimizer and returns a full sentence naming
the tray at fault, shown as is. Each rule shows as a chip on the component's row
(`src/ui/components/ComponentList.tsx`) with an × that lifts it; the pin × lifts the whole stack.

**Status line.** `src/ui/StatusLine.tsx`, one single-line pill per matter:

- fits: "Everything fits. 6 trays in 2 layers, 40 of 52 mm high." with Keep searching;
- searching: "Searching…", a progress bar and Stop (focus moves between Keep searching and Stop);
- making a new plan: "Making a new plan…" while an edit's run is pending or going, Download waits;
- no fit: names the tray (`misfitOf` in `src/ui/noFit.ts`) and offers "Edit <name>"; on a phone
  Keep searching moves to the bottom sheet's bar;
- pin conflict: "<name> doesn't fit with your pins" with one "Unpin <name>" per conflicting pin; for
  a size lock it reads "<name> doesn't fit with its size locked" and "Unlock size of <name>".
  The "H of B mm high" figure uses the height below the reserved headroom.

**Plan banners and notices.** `src/ui/Notices.tsx` renders them; `src/ui/noticePlacement.ts`
decides where. The stale banner ("Make a new plan") or the older-geometry banner ("Reprint
everything", which re-plans with current geometry, or "Use the old plan") sit above the plan.
Another-tab conflicts and storage problems go into the project menu with a dot on its button.

**Editor flow.** What's inside lists components; "Add" picks a kind; a first item opens its
editor at once. Editing replaces the list with `EditorPanel`
(`src/ui/components/EditorPanel.tsx`): the basics, then "More options" opening in the same panel.
Each option change shows a short note at the foot of the page via `Toast` (`src/ui/Toast.tsx`), worded by
`describeOptionChange` (`src/ui/components/optionNotes.ts`). "Done" or the back link returns to the
list. The tray bar's and status line's Edit open the same panel. Kind editors are
`CardsEditor`, `BulkEditor` (tokens and dice), `TilesEditor`, `MinisEditor`, `CustomEditor`.

**Box panel.** `src/ui/BoxPanel.tsx`: inside size, "Keep space free on top" (Whole top / Part of
it), "The box is stored on its side". Every field always visible, so an error is always in sight.

**Settings sheet.** `src/ui/SettingsSheet.tsx`, a `Modal` with two tabs. "This insert": Fit,
Walls (Custom when the numbers match no preset), Room for fingers, Rim between layers, Fill to the
lid, Unused space, "One thick wall instead of a spacer", then "Exact numbers" with search, a reset
per value and "N changed". "My printer": bed size, margin, layer height and printing options
(Engrave tray names, joining spacers, folding risers). The printer is a browser preference used by
new inserts; an insert keeps its own printer until "Apply to this insert", and the hint says
"Applying replaces it". The sheet opens on the tab that holds an error. Each settings change is
one undo step.

**Download dialog.** `src/ui/ExportPanel.tsx` in a `Modal`, opened only from the header. It shows
parts, filament and print time, one primary "Download 3MF", "Other formats" folded, "Open the
packing guide" and the "Support it" line. While building: a progress bar and Stop (closing stops
it). A failed part is listed by name under "Not exported" with "Try again"; the rest still
download. It does not count the parts that carry no engraved name; the packing guide lists them
("Too small for its name"). The packing guide is
`src/instructions/AssemblyPage.tsx` with its own print stylesheet.

**Project menu.** `src/ui/ProjectMenu.tsx` is a disclosure (a button and a panel of buttons), not
an ARIA menu. New insert, Your inserts (`src/ui/InsertsList.tsx`), Open file…, Save file, Send file
(phone share sheet), Settings, Delete. Delete asks first and takes focus to the question.

**First visit.** The empty state in `src/app/App.tsx`: "Measure the box", "Pick what goes inside"
(one button per kind), "Start from an example game", and one line saying inserts are saved in this
browser. Field errors say what is wrong, why, and what to do (the spec's example: "Use 70 mm").

**Phone sheet.** Below 760 px What's inside lives in `BottomSheet`: a 44 px handle, a summary
line that stays when folded, and an action slot beside the handle (Keep searching when nothing
fits). It opens and closes by tap only, no swipe. Below 600 px a sheet holding the editor or the
box fills the screen, and the page behind it is inert. Dialogs (`Modal`) fill the screen too.

## 6. Engine boundaries

What the engine can do today, checked 2026-10-16 after the redesign build. "UI may offer" means a
control can be built on it now.

| Feature                                   | Engine today                                                                                          | UI may offer     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------- |
| Pin a tray                                | `Lock.position`; pins the whole stack (`src/app/actions.ts`)                                          | Yes              |
| Turn 90°                                  | Only inside a position lock (`rotated`), so it pins the stack                                         | Yes, as pin      |
| Swap two trays                            | `swapLocks` swaps whole stacks and pins both                                                          | Yes              |
| Lock a tray's size                        | `Lock.size`                                                                                           | Yes              |
| Pins that conflict                        | Reported in `lockConflicts` with a `kind`; plan and pins kept                                         | Yes              |
| Why a tray can't turn                     | `canTurn` dry run through `resolveLocks` (`src/app/dryRun.ts`)                                        | Yes              |
| Keep searching with progress and Stop     | `store.refit()`: about 3× budget, warm start, kept only if better                                     | Yes              |
| Undo and redo of every edit               | `src/app/history.ts`, 100 steps, plan joins its edit's step                                           | Yes              |
| Engraved tray names                       | Letter glyphs, unique short names (`naming.ts`), `engraveNames`; two opposite walls and the underside | Yes              |
| Box headroom (whole/part), stored on side | `Box.headroom`, `headroomCoverage`, `storedOnSide`                                                    | Yes              |
| Per-player piles, growth, access, storage | `perPlayer`, `growth`/`separators`/`dividers`, `access`, `storage`                                    | Yes              |
| Settings presets and "N changed"          | Choice tables in `src/model/settings.ts`                                                              | Yes              |
| Project files, other-tab conflict         | `src/share/`, `src/app/persistence.ts`                                                                | Yes              |
| Saved status                              | `src/ui/SavedStatus.tsx`                                                                              | Yes              |
| 3D on phones                              | Needs WebGL; falls back to a sentence and the top view                                                | Yes              |
| Which tray doesn't fit                    | `misfitOf` heuristic plus `overBedKeys`; not a true culprit report                                    | Yes, approximate |
| Move a tray to the other layer            | Layers are derived from stacks; no layer lock                                                         | No: engine work  |
| Keep it next to                           | Grouping merges into one tray; no adjacency                                                           | No: engine work  |
| Fix suggestions with outcomes             | No suggestion generator; no side runs                                                                 | No: engine work  |
| "Unpin one" with outcomes                 | Unpin works; its outcome needs a trial run                                                            | Unpin only       |
| Live "Still fits" in Settings             | No side-run API                                                                                       | No: engine work  |

Known limits worth stating where they matter:

- Parts with no face that has room for their name stay plain (too short for the walls' band, too
  small or too thin a floor for the underside); the packing guide says "Too small for its name"
  (the download dialog does not count them: "Say less late in the flow"). Upper trays of
  about 9 mm or less may lose their wall names since geometry 0.8.0 (owner ruling pending). A
  merged part carries its name on walls only, never the underside.
- The combined 3MF lays parts in a grid that can spill past one bed for large inserts. No warning
  yet.
- Stop during export doesn't end the build already running in the geometry worker.

### Phase 3: where this is going

From the plan's Phase 3 outline (`docs/superpowers/plans/2026-10-16-ux-redesign.md`). Each needs
its own plan before UI work starts.

1. **Trial runs.** A second layout worker with its own cancel token; budget-limited runs that never
   touch the stored plan. Everything below depends on it.
2. **Fix suggestions with outcomes.** Candidates (lay figures flat, other storage, thinner walls,
   unpin one, another layer), each checked by a trial run, "Checking…" while they run. Replaces the
   bare no-fit and pin-conflict pills and the `misfitOf` heuristic.
3. **Live "Still fits" in Settings.** Draft settings feed a debounced trial run; the footer shows
   the result and the size and filament change.
4. **Layer lock.** A `level` lock kind, schema PATCH, enforced in `resolveLocks` and the move set;
   then "To the other layer" in the tray bar with dry-run reasons.
5. **Keep it next to.** `nextTo` on components (in `inputsHash`), a score term, a notice when it
   can't be met; then the editor's chooser.

Ship 4 and 5 in one release so they share one schema bump. Until each lands, MUST NOT add its
control, even disabled.

## 7. Decision log

Durable rulings from the build ledger
(`.superpowers/sdd/2026-10-16-ux-redesign/progress.md`) and later. Add a row for every change to a
rule in this document.

| Decision                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                      | Cost if wrong                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Trays are named by contents, colour and icon; never numbered                                                                                                                                                                                                                                    | Numbers mean nothing to people                                                                                                                                                                                                                                                                                           | A rename rule in `naming.ts`                                                                                        |
| Several spacers by one tray read "Spacer 1 by Dice", not "Spacer by Dice 1"                                                                                                                                                                                                                     | Avoids reading as a tray called "Dice 1"                                                                                                                                                                                                                                                                                 | A copy change in `naming.ts`                                                                                        |
| Engrave the short name; packing guide adds "Engraved as" where it differs                                                                                                                                                                                                                       | The printed part and the guide must match                                                                                                                                                                                                                                                                                | Readers confused by two names                                                                                       |
| Retry engraving with a tighter band before giving up                                                                                                                                                                                                                                            | A low part still gets a name on its walls                                                                                                                                                                                                                                                                                | A few shallow parts stay plain                                                                                      |
| Engrave the name on up to three faces: the wall the rule prefers and the wall across from it, and the underside, each only where it has room (this replaces "never engrave the underside")                                                                                                      | Owner: the name should be findable from the side and from below once the tray is out of the box                                                                                                                                                                                                                          | One face that carries it, as 0.8.1 first did                                                                        |
| The underside name is mirrored, centred, kept 1.5 mm clear of the bed face's edge (the stacking groove's reach on an upper tray, the corner arcs) and of floor notches, and cut as V grooves at most 0.6 mm deep, never nearer than 0.81 mm to the floor's top (0.39 mm deep on a 1.2 mm floor) | A flat roof is an overhang and the spec allows none; the V closes in a ridge. The 0.81 mm is the thinnest feature, as for walls. The geometry kernel does not know the layer height, so the depth is set against the floor: at most 0.6 mm (three layers of the 0.2 mm default), at least 0.3 mm or the face is left off | A floor under 1.1 mm takes no underside name; flat-roofed recesses would read better but break the no-overhang rule |
| The 0.8.1 engraving change (two walls and the underside) is folded into 0.8.1, not a new version                                                                                                                                                                                                | It only removes material inside a face, so fit is unchanged, and 0.8.1 is not public yet on this branch                                                                                                                                                                                                                  | If 0.8.1 ships first, a PATCH 0.8.2                                                                                 |
| Merged parts keep their name on walls only                                                                                                                                                                                                                                                      | Their underside is the bottoms of several members and the bridges between them                                                                                                                                                                                                                                           | A merged part has no name underneath                                                                                |
| Geometry 0.8.1 (PATCH) engraves names instead of numbers, with the band above the 0.8.0 groove                                                                                                                                                                                                  | Mesh-only recess; fit is unchanged, so no reprint banner                                                                                                                                                                                                                                                                 | Names cut into the groove                                                                                           |
| Export file names are the full tray names, no order prefix                                                                                                                                                                                                                                      | They match screens and engraving                                                                                                                                                                                                                                                                                         | Files don't sort in assembly order                                                                                  |
| Edits less than 1000 ms apart are one undo step                                                                                                                                                                                                                                                 | Typing should not make one step per key                                                                                                                                                                                                                                                                                  | Two quick edits to different fields undo together                                                                   |
| Pin conflicts are reported and kept, never pruned; unpin removes one lock kind                                                                                                                                                                                                                  | A choice the app quietly undoes breaks trust                                                                                                                                                                                                                                                                             | A size-lock conflict needs two clicks                                                                               |
| `canTurn` reads the stored layout, not a dry sizing run, and returns a full sentence naming the tray                                                                                                                                                                                            | Simpler, same answer; UI needs no framing                                                                                                                                                                                                                                                                                | A stack conflict surfaces only at run time                                                                          |
| Pin/Unpin and Lock size carry no `aria-pressed`; Swap with… keeps it                                                                                                                                                                                                                            | The label is the action; chips carry the state                                                                                                                                                                                                                                                                           | Switch to fixed labels plus `aria-pressed`                                                                          |
| "Pinned, turned" reads the absolute `rotated` of the pin                                                                                                                                                                                                                                        | The model can't express a turn relative to the optimizer                                                                                                                                                                                                                                                                 | Label wrong after re-plans                                                                                          |
| A chip's × on a pin lifts the whole stack, and its name says so                                                                                                                                                                                                                                 | Matches how pinning works                                                                                                                                                                                                                                                                                                | Unpin only that tray                                                                                                |
| Plan tiles may be under 44 px (WCAG 2.5.8 essential)                                                                                                                                                                                                                                            | Tile size is the tray drawn to scale                                                                                                                                                                                                                                                                                     | Add a visible tray picker on the plan, like 3D's                                                                    |
| Project menu is a disclosure, not an ARIA menu                                                                                                                                                                                                                                                  | Cheaper and correct for a panel of buttons                                                                                                                                                                                                                                                                               | Upgrade to the menu pattern                                                                                         |
| One plan banner; older geometry wins over stale                                                                                                                                                                                                                                                 | Two banners about the plan say the same thing twice                                                                                                                                                                                                                                                                      | A click-path change                                                                                                 |
| "Reprint everything" re-plans with current geometry; download follows                                                                                                                                                                                                                           | Downloading old-geometry trays would not mate                                                                                                                                                                                                                                                                            | A click-path change                                                                                                 |
| Printer is a browser preference; an insert keeps its own until Apply                                                                                                                                                                                                                            | Nothing lost silently                                                                                                                                                                                                                                                                                                    | Add a "Keep this one" control                                                                                       |
| An old `#1.` link or file opens as its own project; a copy only on an id clash                                                                                                                                                                                                                  | Avoids duplicates                                                                                                                                                                                                                                                                                                        | Always-copy is a one-line change                                                                                    |
| Fonts self-hosted from `@fontsource`, latin and latin-ext only                                                                                                                                                                                                                                  | No other hosts; reproducible builds                                                                                                                                                                                                                                                                                      | Add a subset for other scripts                                                                                      |
| One shade helper (`shadeIndexOf`) for list, plan and 3D                                                                                                                                                                                                                                         | Colours drifted between views                                                                                                                                                                                                                                                                                            | Colours drift again                                                                                                 |
| "H of B mm high" counts the height below reserved headroom                                                                                                                                                                                                                                      | That is the room the person has                                                                                                                                                                                                                                                                                          | Show full inner height                                                                                              |
| `misfitOf` names the tray that doesn't fit, as a stopgap                                                                                                                                                                                                                                        | No engine culprit report until Phase 3                                                                                                                                                                                                                                                                                   | The wrong tray named                                                                                                |
| Summary sits below the plan on every width; the 24 rem plan floor stays                                                                                                                                                                                                                         | Owner ruling: the plan is the hero, the figures follow it (the phone already did). Without the floor the plan fell to 93 px at 1440 by 700 px with the figures below it                                                                                                                                                  | Back above the plan; the floor could go if the plan took the whole stage                                            |
| The bottom sheet is tap-only, no swipe                                                                                                                                                                                                                                                          | Ruled in the phone build; a tap target is simpler to make accessible                                                                                                                                                                                                                                                     | Add swipe later                                                                                                     |
| The 760 to 960 px tablet rail is a ruled breakpoint; the 3D canvas height uses the 600 px line (below, not at) and the 520 px padding rule was dropped (the phone rule always overrode it)                                                                                                      | Three stray widths had no ruling; one line of each kind is easier to keep in step with the JS                                                                                                                                                                                                                            | A third breakpoint to test                                                                                          |
| Raw hex is allowed only in `tokens.css` and the packing guide's print rules (paper is black on white); the axis colours and `--paper-white` are tokens                                                                                                                                          | The print rules need fixed paper colours; the axis colours had no dark values                                                                                                                                                                                                                                            | A paper token set                                                                                                   |
| Tokens come from the boards, including shadows, spacing and radii                                                                                                                                                                                                                               | The boards are the design; the old tokens were a guess at it                                                                                                                                                                                                                                                             | The old 2, 4 and 8 px radii and 4 to 64 px spacing, until the old layout is gone                                    |
| Figtree 500 added for the boards' segment labels                                                                                                                                                                                                                                                | The boards' "off" segment labels are 500; a weight is a decision-log row (§4)                                                                                                                                                                                                                                            | Figtree 400 or 600 for them                                                                                         |
| Dark set removed until it is opt-in                                                                                                                                                                                                                                                             | Light is the only theme; the old set followed the system and had no screen to be checked on                                                                                                                                                                                                                              | The system-following dark set                                                                                       |
| The rail is one width on every screen (Main's 300 to 350 px); the 760 to 960 px tablet rail rule is dropped, and so are the hint paragraphs under the plan                                                                                                                                      | Main draws one rail and no hints under the plan; "Tap a tray for details." replaces them with the plan slot (Task 7). Supersedes the row on the tablet rail                                                                                                                                                              | A tablet width that needs its own rail (Task 15 checks 820)                                                         |
| The download dialog does not count parts without an engraved name; the packing guide lists them                                                                                                                                                                                                 | Say less late in the flow: the person already knows at download time                                                                                                                                                                                                                                                     | Bring back "N parts are too small for their name"                                                                   |
| Download stays off while an older-geometry plan is kept ("Use the old plan"), reason "Reprint everything to download"; pressing it then brings the banner back                                                                                                                                  | Owner ruling: trays from an older line do not mate with new ones, so they must not be exported; the person must not hit a dead end                                                                                                                                                                                       | Allow download of a kept old plan again                                                                             |
| Undo and Redo have keyboard shortcuts through one document-level listener in App; skipped in text fields and behind any modal dialog, Settings included                                                                                                                                         | Owner ruling. A modal's own controls are the whole screen; Settings has a tab (My printer) whose changes are not undo steps, so a shortcut there could undo something the person cannot see                                                                                                                              | Allow it in Settings' "This insert" tab                                                                             |
| Footer is version, build id and licences; no "All apps"                                                                                                                                                                                                                                         | Owner removed it                                                                                                                                                                                                                                                                                                         | Re-add the link                                                                                                     |
| Default name "Tokens and dice"                                                                                                                                                                                                                                                                  | Display and engraving only; not in `inputsHash`                                                                                                                                                                                                                                                                          | A copy change                                                                                                       |
| Size lock keeps "Lock size"; position locks are "pins"                                                                                                                                                                                                                                          | The plan names the control; pins are a different thing                                                                                                                                                                                                                                                                   | Rename the size lock                                                                                                |
| "Exact values" became "Exact numbers"; "Update the plan" became "Make a new plan"                                                                                                                                                                                                               | Plainer words                                                                                                                                                                                                                                                                                                            | A copy change                                                                                                       |
| One combined 3MF by default; per-part zip and STL under Other formats                                                                                                                                                                                                                           | Most people want one file                                                                                                                                                                                                                                                                                                | Format choice up front                                                                                              |
| No URL sharing; files and browser storage                                                                                                                                                                                                                                                       | Links were too long for browsers and chat apps                                                                                                                                                                                                                                                                           | Bring back links                                                                                                    |
| No Simple/Advanced mode                                                                                                                                                                                                                                                                         | Disclosure in place does the job                                                                                                                                                                                                                                                                                         | A mode switch                                                                                                       |
| Part build failure UI is plain and short                                                                                                                                                                                                                                                        | Failures are rare bugs                                                                                                                                                                                                                                                                                                   | Heavier recovery UI                                                                                                 |
| Preact, signals and hand-rolled tokens; no React, Tailwind or Bun                                                                                                                                                                                                                               | No user benefit from switching                                                                                                                                                                                                                                                                                           | A rewrite                                                                                                           |

## 8. Checklist for a UI change

- [ ] Every new string uses the Words table; `npx vitest run src/ui/copy.test.ts` passes.
- [ ] Trays are named, never numbered; measurements still show as mm, g and h.
- [ ] Every new control is at least 44 px, keyboard reachable, with a visible focus ring.
- [ ] A blocked control stays focusable and says why in one sentence.
- [ ] Toggles follow the `aria-pressed` rule and its Pin / Lock size exception; still one `h1`.
- [ ] Colours come from tokens or `shadeOf` / `shadeHex`; new tokens have a dark value; the same
      component looks the same in the list, plan, 3D and packing guide.
- [ ] Checked at 390, 820 and 1440 px, in light and dark, and with reduced motion.
- [ ] Nothing new is shown by default that could sit behind "More options" or "Exact numbers".
- [ ] No new Download entry point, banner, mode, link sharing, slicer claim, two-line pill or global
      key handler.
- [ ] The change is one undo step through `store.edit`; layout inputs are in `inputsHash`,
      print-only inputs are in the mesh cache key and not in the hash.
- [ ] The engine can back it today (section 6); otherwise it is marked as needing engine work and
      not shipped.
- [ ] Schema, geometry and app versions bumped per the README; a decision-log row added if a rule
      changed; `npm run build` passes.
