# Development guidelines

Read this before writing code here, whether you are a person or an agent. It covers how to work in
this repo and what the UX redesign (about 25 tasks, each reviewed) learned the hard way. It does
not cover design: what the screens say and look like belongs in [`docs/DESIGN.md`](DESIGN.md),
the spec (see [Pointers](#6-pointers)). The README is for people who use the app.

Stack: Vite 8, TypeScript (strict), Preact 11 with `@preact/signals`. The layout optimizer runs
in a Web Worker, and manifold-3d (WASM) builds geometry in a second worker. Tests run on vitest
with jsdom and `@testing-library/preact`.

---

## 1. Quick start

**Commands** (`package.json`):

| Command                 | What it does                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server                                                                                   |
| `npm test`              | `vitest run`, the whole suite (about 3,100 tests)                                                 |
| `npx vitest run src/ui` | One folder or file. Use this while iterating                                                      |
| `npm run typecheck`     | `tsc` on both `tsconfig.json` (browser `src/`) and `tsconfig.node.json` (configs)                 |
| `npm run lint`          | eslint, then `lint:css` (stylelint `src/**/*.css`), then `lint:html` (html-validate `index.html`) |
| `npm run format:check`  | prettier `--check .` (`npm run format` writes)                                                    |
| `npm run build`         | vitest, both tscs, `vite build`, then `scripts/smoke-dist.mjs dist`                               |
| `npm run verify`        | **The gate**: lint, format:check, build                                                           |

**The verify gate.** `npm run verify` runs everything CI runs except `npm audit` and the version
bump check. It takes several minutes, so start it in the background and keep working. Don't call
a task done, or ask for a review, until it exits 0. CI (`.github/workflows/ci.yml`) splits it
into the jobs lint, format, typecheck, test, build and audit, with one required `verify` job
over them. On pull requests to `main` it also runs `version-bump`. `.husky/pre-commit` runs
`lint-staged`, which runs eslint, stylelint, html-validate and prettier on the staged files, so
a commit can rewrite your files. Node version: `.nvmrc` (24).

**Layout of `src/`.** See the [Architecture table](#74-architecture) for the full list. In short:

- `model/` holds types, defaults, validation, `inputsHash` (`hash.ts`), `SCHEMA_VERSION`
  (`version.ts`) and the readers for saved files (`schema*.ts`).
- `sizing/` turns components into tray requirements; `size()` lives in `sizing/group.ts`.
- `layout/` is the deterministic optimizer (`optimize.ts`, Web Worker in `worker.ts`). It also
  resolves pins (`locks.ts`) and derives printable parts (`printable.ts`).
- `geometry/` turns a `TraySpec` into a manifold mesh in a worker. The page may import only
  `types`, `version`, `engraves` and `client`.
- `export/` writes 3MF and STL files and zips them.
- `app/` holds state, store, history, runner, persistence, the mesh cache, export building,
  the dry run (`dryRun.ts`), and `App.tsx`, which wires the screen.
- `ui/` holds the list and editors (`ui/components/`), the settings sheet, the tray bar, notices,
  the download panel, and colour and identity (`identity.ts`). `screens/` holds the workspace
  shell, the header, the rail and the top of the stage (`StageTop.tsx`: the status heading, the
  switches and the plan banner; `StageNotes.tsx`; `RunAnnouncer.tsx`).
- `plan/` is the top view (a box frame of HTML tiles), `viewer/` the three.js view in the same frame
  (`scene.ts` loads lazily).
- `instructions/` handles tray names (`naming.ts`), part ids (`numbering.ts`), the packing
  guide and the PNG.
- `share/` holds the local project store, JSON files, printer and rail-width prefs and the reader for old
  `#1.` links. `styles/` holds tokens, fonts and the legacy `pf-` classes.

**Test environment.** Tests run in Node by default. A component test opts into jsdom with a
`// @vitest-environment jsdom` comment at the top of the file (`vite.config.ts`). Vitest stubs CSS
imports to `""`, except the files listed under `test.css.include` in `vite.config.ts`. Tests read
those as `?raw`. If you add a CSS file that a test reads, add it to that list.

Preact 11 runs the cleanup of an unmounted component's `useEffect` after paint, on a timer, not at
unmount. `test-support/preact-effects.setup.ts` (a `setupFiles` entry) flushes those after every
jsdom test, so no cleanup fires after the file's page is gone. Don't add `document` guards to app code for it.

---

## 2. Architecture in one page

```
Project (signal, app/state.ts)
  │  every change: store.edit(fn) with a pure fn from app/actions.ts  → History step (app/history.ts)
  ▼
inputsHash(project) changed? (model/hash.ts)
  │  app/runner.ts: debounce 400 ms (DEBOUNCE_MS), cancel the running search
  ▼
size(components, settings)  (sizing/)  → TrayRequirement[]
  ▼
Layout worker (layout/client.ts → layout/worker.ts → optimize.ts)   seeded PRNG, warm start
  │  LayoutResult { layout | null, bestAttempt, summary, notices, lockConflicts }  (structured clone)
  ▼
runner accepts → project.layout (StoredLayout: TraySpec[]), joins the edit's History entry
  │  lockConflicts non-empty → NOT accepted; old plan + every pin stay; state.lockConflicts set
  ▼
printableParts(layout.trays, …) (layout/printable.ts): risers split, spacers opened, parts merged
  ├──► plan/PlanView.tsx (HTML)     names: instructions/naming.ts trayNames(numberParts(…))
  ├──► viewer/Viewer.tsx (three.js) colours: shadeHex via viewer/shades.ts
  └──► meshes: app/meshes.ts cache, key JSON.stringify([spec, settings])
           └─► geometry worker (geometry/client.ts → worker.ts, manifold WASM)
                 └─► export: app/exportBuild.ts + src/export/ (3MF / STL / zip), instructions/
```

**Where state lives.**

- **App state** (`src/app/state.ts`, `createState`) is one `State` object of signals and
  computeds:
  - `project`, `run`, `lastResult` with `lastResultHash`, `lockConflicts` and `history`
  - `selection`, `viewLevel` and `swapFrom`
  - notices, the save state, and the computeds `currentHash`, `stale`, `geometryOld`,
    `summary` and `noFitAttempt`.

  The store (`src/app/store.ts`, `createAppStore`) is the only thing that writes `project`.

- **History** (`src/app/history.ts`) stores whole projects, up to 100 entries, and is cleared
  when another project opens. `store.edit` passes `COALESCE_MS = 1000`. Consecutive edits less
  than 1 s apart replace the newest entry, but only while the component id list is unchanged
  (`sameComponents`), so an add or a remove is always its own step. `History.version` is a
  signal that bumps on push, undo, redo and clear. The remove toast in `App.tsx` uses it to hide
  itself once anything else happens. `amendBefore` lets the runner give a new plan to older
  planless entries with the same hash.
- **View state that several views share** is owned by App:
  - `viewLevel` and `swapFrom` are signals in `State`. `App.tsx` resets `swapFrom` when the view
    leaves Plan, and opening a project resets `viewLevel` (`persistence.ts`).
  - `editingId` is `useState` in `App.tsx`, passed down as controlled `openId` and
    `onOpenChange` to `ui/components/WhatsInside.tsx`.
- **Persistence** (`src/app/persistence.ts`) autosaves 500 ms after a change (`SAVE_DEBOUNCE_MS`)
  to localStorage. A project with a stored layout is never re-optimized on load. If its inputs
  changed, the stale banner shows instead.
- **In memory only:** `lastResult`, its `bestAttempt` (the closest no-fit attempt behind the
  status-line pill) and `lockConflicts`. None of them is written to a project or file.

---

## 3. Rules

MUST is required: a reviewer sends the work back if it is broken. SHOULD is the default: break
it only with a written reason in the code or the PR.

### State

- MUST change the project only through `store.edit(fn)` (or the store's named methods: `undo`,
  `unpin`, `refit`…), with `fn` a pure `Project → Project` function, usually from
  `app/actions.ts`. Never assign `state.project.value` from UI code.
- MUST NOT add a global key handler without a decision-log row (DESIGN.md). The two that exist
  are App's Undo and Redo listener (`src/ui/historyKeys.ts`) and App's Escape listener that closes
  an open editor wherever the focus is (only while an editor is open, and only for an Escape that
  nothing took: inner handlers `preventDefault` theirs). Both are added in an effect, removed in
  their cleanup; the Undo one is skipped in fields that have their own undo and behind modal dialogs. Put its checks in
  `historyKeys.ts` and test them with plain events.
- MUST keep shared view state in App (`State` signals or App `useState`) and pass it down as
  controlled props (`openId`/`onOpenChange`, `swapFrom`/`onSwapFromChange`, `level`/…). Don't
  invent "request" objects (`{ id, nonce }`) or effects that query the DOM to open something.
  Two tasks built competing mechanisms (`editRequest` and `openFirst`) and had to be merged by
  hand (see P2 Tasks 8 and 9).
- MUST read a signal with `.peek()` when you don't want the component or effect to subscribe
  (e.g. `state.history.version.peek()` right after an edit).
- SHOULD lift view state only when two views need it. Local UI state stays in `useState`.
- SHOULD measure before memoising. Tray naming and part numbering run a few times per render.
  The phone-layout task measured them on a desktop Mac for 18 components and 55 parts (medians:
  `numberParts` 0.06 ms, `printableParts` 0.07 ms, `trayNames(numberParts(…))` 0.35 ms; roughly
  2.5 ms at 6× slower on a mid phone, against a 16 ms frame), so `PlanView.tsx` calls `trayNames` on
  every render without a memo. Some callers (`ExportPanel`, `SelectedTrayBar`, `Viewer`) use
  `useMemo` because their dependencies are cheap to compare, not because the call was slow.

### Engine and versioning

- MUST decide, for every new field, whether it changes the **layout** or only the **mesh**:
  - It changes the layout: it goes in `inputsHash` (`model/hash.ts`). Most fields are in by
    default, because the hash covers box, printer, settings, components (without `name`) and
    locks.
  - It changes only the mesh or the print (e.g. `engraveNames`, `mergeFillers`, `mergeRisers`,
    `minRiser`, `infill`): leave it out of the hash explicitly, in `inputsHash`'s settings block, with a
    comment. The mesh cache key in `app/meshes.ts` is `JSON.stringify([spec, settings])`, so
    settings and every `TraySpec` field (including `partName`, the engraved text) reach the key
    automatically. Don't build a narrower key.
  - Keep `name` fields out of the hash. Renaming must never re-run the optimizer. The default
    name "Tokens and dice" is display and engraving only.
  - Adding a hashed field must not change the hash of existing projects (that would mark every
    saved plan stale). Leave its default out, as `oneWall` and `playLimit` do.
- MUST keep the trays of a set of alike trays (the copies of an item or group, `Ctx.alikeOf`) alike
  (owner, 2026-10-23, DESIGN.md decision log). Anything `evaluate`, `materialize` or `realizeTray`
  does to a tray by where it stands (its level, whether something is on it, the padding its stack
  gives it, the room beside it) must give every tray of a set the same size, height, rim, groove
  and wells: go through `Level.plug` and `RealizeOptions.fixedDepth`, not around them. Run
  `checkHardRules` (`layout/test-hard-rules.ts`) on a layout with copies when you add such a
  thing; it compares the printed trays of every set.
- SHOULD keep the copies of a set facing the same way (owner, 2026-10-24, DESIGN.md decision log):
  a copy turned on its own leaves a sliver of room that becomes a spacer beside the odd one out. A
  move that turns a tray with copies turns the set (`turnSet`, `layout/moves.ts`; a pin or turn lock
  on one copy holds that copy and the rest follow it), a producer of rotations picks one turn per
  set, `unturned` in the score counts the unlike trays within a set, and `polish` in
  `layout/anneal.ts` ends the search by trying both turns of every set. It is a preference, not a
  hard rule: a copy that fits only turned stays turned. `checkHardRules` does compare where the
  wells stand in a copy's own frame.
- MUST give the split parts of one item (`Ctx.kinOf`) the joint through `Level.joint`, not
  `Level.plug`: with two or more of them in a stack all carry the rim and the groove's wall (owner,
  2026-10-24), but they are not alike (own size, height and deepening wells). `plug` implies `joint`.
  `stackHeights` shares the spare height among the trays set to As much as fits (not the first
  one); keep both when you touch it, and run `shared-room.test.ts`.
- MUST keep growth the last step of planning (owner, 2026-10-23, DESIGN.md decision log): the
  search (`startPhase` in `layout/optimize.ts`) builds its context with
  `createCtx(input, measure, { growth: false })`, so no tray has room to grow, every gap is a spacer
  and the score charges it; only `withGrowth`, once the best tree is chosen, evaluates it again with
  growth on. Never score a plan that grew, never give a tray room in the plan that an item did not
  ask for in its size (its "Some" room is part of the size sizing writes, `CompartmentReq.minW`), and
  keep the trays of a set of alike trays growing together (`alikeGrowth`, `layout/fill.ts`).
- MUST keep Auto (`settings.lip.joint` "auto", 2026-10-24) out of the engine: `createRun`
  (`layout/optimize.ts`) resolves it, so every search, `materialize` and `realizeTray` sees "off",
  "rim" or "step" only, and the layout it stores says which (`StoredLayout.joint`). Everything that
  sizes, draws or prints from stored trays (the app's `engineProject`, `jointOf`, `checkHardRules`)
  reads Auto as that joint, and as the rim when the layout names none (an unresolved "auto" is
  the rim in `rimOn`, never a third joint). Keep which parts carry a joint (`TraySpec.lip`,
  `onRiser`, `Level.plug`) apart from which joint it is: a change to either must work with both.
- MUST keep `src/layout/` deterministic. eslint bans `Math.random` there; use the seeded PRNG
  (`layout/prng.ts`).
- MUST keep the geometry kernel off the main thread. eslint enforces it: outside `geometry/` you
  may import only `geometry/types`, `geometry/version`, `geometry/engraves`, `geometry/buildable`
  and `geometry/client`. If the page needs a new pure geometry helper, add it to that allow-list in
  `eslint.config.mjs` and say so in the PR (`engraves.ts` and `buildable.ts`, which asks `planTray`
  whether a part is accepted so `splitRisers` hands out only parts the builder builds, are the
  examples).
- MUST keep everything that crosses a worker boundary structured-cloneable: plain objects,
  arrays, numbers and strings. No class instances with behaviour, no functions, no signals. If
  you add a field to `LayoutResult` or `LayoutResponse` (`layout/types.ts`), it rides
  `postMessage`.
- MUST report pin conflicts, never drop them. A worker result with `lockConflicts` is not
  accepted (`app/runner.ts`). `LockConflict` names the tray and the lock `kind`, and
  `store.unpin(trayKey, kind?)` removes only that kind.
- MUST make UI dry runs return a full sentence the screen can show as is, and never throw.
  `canTurn` in `app/dryRun.ts` is the model: "Make a plan first.", "Turning doesn't work for
  <name>: <reason>.", and a catch-all "Turning isn't possible right now.".
- MUST bump versions as [§7.5 "How to add a kind of item"](#75-how-to-add-a-kind-of-item) and [§7.8 "Releasing"](#78-releasing) say:
  - `SCHEMA_VERSION` (`model/version.ts`) for any change to the file format. While 0.x, an
    additive change is a PATCH and a breaking one is a MINOR plus a migration: a 0.x MINOR MUST
    come with a `MIGRATIONS` entry (`model/schema.ts`; the first is `model/migrate-0.2.ts`, line
    "0.1" → "0.2.0"), and `schema-versions.test.ts` fails without one. Add
    `test/fixtures/schema/<new version>.json` and keep the old fixtures.
  - `GEOMETRY_VERSION` (`geometry/version.ts`) for any change to printed geometry. A mesh-only
    change or a new optional feature is a PATCH. A change that breaks how trays mate, or makes
    `planTray` reject specs it accepted before, is a MINOR: a new line, "reprint everything".
    Add a paragraph to the history comment in `version.ts`.
  - `package.json` `version` on every PR to `main` (CI enforces it). While 0.x, bump MINOR for
    features and PATCH for fixes.
- MUST keep engraving clear of the stacking groove. Since geometry 0.8.0 an upper tray with the
  lip on has a groove along its bottom edge, and `geometry/engrave.ts` starts both text bands at
  `groove.zTop` (with the stepped base, geometry 0.9.2, at the step's top, and the underside name
  goes on the slab's bed face; a socketed wall is only the socket's wall thick at the top). The underside name stays `EDGE_MM` inside the groove's `reach`. Tests fail if the
  groove is ignored (`engrave.test.ts`, "on three faces").
- MUST engrave on at most four faces, each only where it has room (`planEngravings`): the floor of
  one well (`planInside`, geometry 0.9.9: straight walls, planned first), the wall `planEngraving`
  prefers, the wall across from it (the thinnest feature kept between the two recesses), and the
  underside (`planUnderside`: mirrored, a flat recess 0.4 mm deep that moves aside from the floor's
  name or drops out; the one flat downward face `checkPrintability` lets through). A merged part
  carries walls, and the floor of a riser's pocket (`planMergedInside`), never the underside. A new
  engraving input goes in the spec or settings, so it reaches the mesh cache key; the faces
  themselves depend only on the spec and settings.
- MUST set names with `layoutText` (`geometry/glyphs.ts`): Overpass Bold outlines (SIL OFL 1.1) in
  `name-font-data.ts`, which `scripts/build-name-font.mjs` generates (never edit it by hand; the
  script's header says how to run it). A name's size is one of `CAP_SIZES_MM` (8, 6, 5, 4 mm),
  chosen by `fitCap`. Planners measure with `layoutText` (pure, no kernel); only the builders
  (`buildEngraving`, `buildUnderside`, `buildInside`) make a `CrossSection`, from the same polygons.
  The licence text is `licenses/overpass-OFL.txt`, and `licenses.config.ts` puts it on the
  third-party licences page (`REQUIRED_PACKAGES`).

### Components and accessibility

- MUST write SVG attributes in their real case: `tabindex`, not `tabIndex`, on SVG elements (see
  [Gotchas](#4-gotchas)). HTML elements may use `tabIndex`.
- MUST keep a control that is off but explained focusable. Give it
  `aria-disabled="true"`, guard its click handler, and point `aria-describedby` at the sentence
  that says why (`Button`'s `blockedReason` in `kit/blocked.tsx`, as the tray bar's Turn 90° and Download in `screens/Header.tsx` use it). Never use
  `disabled` for it, because a disabled control leaves the Tab order and its reason can't be
  read. `CheckRow` (`kit/CheckRow.tsx`) takes `blocked` and renders `aria-disabled`; `RowRemove` is the Remove
  button of a row that can't go (the last one). The one exception is `disabled` on an `<option>`
  in a `<select>` (the "Custom" placeholder in `ui/fields.tsx`): that is correct HTML and the
  option is not in the Tab order anyway. `src/rules.test.ts` fails on `disabled` on a button,
  input, select, textarea or fieldset. The shared look is `button[aria-disabled="true"]` in
  `style.css`.
- MUST give a toggle whose label stays the same `aria-pressed` ("Swap with…"). The exception is
  a control whose label changes to name the action (Pin/Unpin, Lock size/Unlock size). It takes
  no `aria-pressed`, and `data-on="true"` drives its pressed look (ruling, P2 Task 8).
- MUST mount a live region (`role="status"` or `aria-live`) before its text changes. Render the
  region always and swap only its content (`kit/Toast.tsx`, the `viewer-selection-live` region in
  `viewer/Viewer.tsx`). Keep `aria-live` narrow: the changing words only, never a whole toolbar
  (`ui/TrayBar.tsx` has exactly two live regions, the hidden pin and size-lock words and the reason
  line, and a test checks that). Every region in the app is mounted before it speaks. Where the thing to say is a
  visible notice or banner that comes and goes, keep a visually hidden region beside it that
  always exists (`Announcer` in `ui/Notices.tsx`, `SavedStatus`, the remove toast's
  `data-live="removed"` region in `App.tsx`) and keep the notice itself free of `role`. Keep a
  button out of a region (the Download dialog's Stop sits beside its region, not in it) and keep
  the words steady while a count changes, so it speaks once.
- MUST move focus on purpose when the focused element unmounts, and only if focus fell to
  `document.body`, so you never steal it from where the person moved it. Examples:
  - `ui/components/ComponentList.tsx`: a chip's × moves focus to the next chip, else to the
    row's button.
  - `screens/StageTop.tsx`: Stop (after "Searching…") and the ⋯ menu's Try another arrangement trade the focus, so the one
    that appears takes focus.
  - `ui/components/EditorPanel.tsx`: the Remove… and Cancel confirmation pair. It moves the focus
    unconditionally: the button that went was the one just pressed, so nothing is stolen.
- MUST focus an editor's, dialog's or panel's heading when it opens (`tabIndex={-1}` on the
  heading, `.focus()` in an effect), and return focus to what opened it on close. The rail's editor
  has no visible heading (its name is an input styled as a title, and the stage's sentence is the
  page's h1): a visually hidden h2 takes the focus. The phone's editor focuses its h1. Exemption: the
  phone's list sheet (`kit/Sheet.tsx`) is an in-page disclosure, not a dialog; its 44 px handle
  carries the name and opening it focuses the first control, not a heading. The sheet holding an
  editor or the box still lands on that editor's heading:
  - `WhatsInside.tsx` returns it to the row.
  - `kit/Dialog.tsx` returns it to the opener.
  - `SelectedTrayBar.tsx` returns it to the tile, or in 3D to the picker item (`data-key`).
- MUST make touch targets 44 px. The base `button` and the text inputs and selects take
  `min-height: var(--control-h)` (44px, `styles/tokens.css`). Where a container rule would have
  to set height on a button, add the shared `.tap` class instead (see Gotchas). Plan tiles are
  exempt (their size is tray geometry, WCAG 2.5.8 "essential"; see the comment in
  `plan/plan.css`).
- SHOULD use a disclosure (`aria-expanded` plus a group of buttons) rather than an ARIA menu for
  a panel of buttons (`screens/ProjectMenu.tsx`, ruling P2 Task 4). Don't put `aria-haspopup` on it.
- SHOULD use `useId()` for ids that tie a control to its description.

### CSS and tokens

- MUST take colours, spacing, radii, fonts, sizes and `--control-h` from `src/styles/tokens.css`.
  Light and dark are both built: dark is one `[data-theme="dark"]` block in tokens.css, set by `src/ui/theme.ts` (DESIGN §4 Dark mode); a new colour token needs a value in both. The page,
  type, focus ring, `.tap` and `.visually-hidden` live in `src/styles/base.css`.
- MUST decide a component's shade in one place only: `shadeIndexOf(components, index)` in
  `src/ui/identity.ts`. Then pick the format by consumer:
  - DOM: `shadeOf(kind, i)` or `shadeVars`. These are CSS `light-dark()` strings, so one inline
    style follows the scheme.
  - Anything that isn't page CSS (three.js, PNG and SVG export, print): `shadeHex(kind, i,
scheme)`, with `"light"` for paper. `viewer/shades.ts` and `plan/glyph.ts` go through
    `shadeIndexOf`.
  - `instructions/render.test.ts` checks that `light-dark(` and `var(` stay out of exported
    SVG.
- MUST pin any CSS behaviour jsdom can't see (media queries, `:has`, transitions, print rules)
  with a text test: `src/style.test.ts` (`ruleFor`, `declarations`), or a test next to the
  component that reads its CSS as `?raw`.
- MUST keep the breakpoints in step with the JS. `PHONE_QUERY` `(width < 760px)` and
  `NARROW_QUERY` `(width < 600px)` in `ui/useMediaQuery.ts` must match `style.css`.
  `style.test.ts` checks both lines, and that no other `@media` width exists beyond the ruled
  760 to 960 px tablet rail.
- SHOULD prefer attributes over `:has()` and DOM queries for state-driven styling. For example,
  `Sheet` sets `data-editing`, `data-full` and `data-expanded`, and App passes a
  `handleRef` instead of `querySelector(".k-sheet__handle")`.
- Note: stylelint ignores `src/styles/**` (`.stylelintrc.json`), so `tokens.css`, `base.css`
  and `fonts.css` are only checked by `style.test.ts` and `identity.test.ts`. Run those tests
  after touching them.

### Copy

- MUST use the spec's words (spec "Words"; summary in DESIGN.md). `src/ui/copy.test.ts` enforces
  them on every non-test `.ts`/`.tsx` file under `src/` and on the README (see the
  [recipe](#add-a-user-facing-string)).
- MUST NOT show part numbers as names. Trays are named by contents, colour and icon; a number
  appears only as part of an id. Names come from `instructions/naming.ts` (`trayNames`), and the
  fallback is "Tray", never a key.
- SHOULD give one source for a sentence shown in two places. For example, `STALE_MESSAGE` and
  `GEOMETRY_OLD_MESSAGE` in `app/state.ts` are used by both the notices and `PlanBanners`.

### Tests

- MUST write the test first and see it fail for the right reason. A test that passes on hidden
  text proves nothing: P2 Task 2a's settings error test passed while the error sat inside a
  closed `<details>`. After a fix, break the fix on purpose once (a mutation check) and confirm
  the test catches it.
- MUST render the whole app with `renderApp({ project, storage, overrides })` from
  `src/app/test-app.tsx`. It wires a real store with a stubbed layout client, a stubbed mesh
  source and `viewerProps={{ webgl: () => false }}`. Use `fixtureProject`, `makeTray`,
  `makeLayout`, `makeResult`, `stubLayoutClient` and `flush` from `src/app/test-helpers.ts`.
  Find plan tiles with a `tile(key)` helper (`.plan-tile[data-key=…]`, as in `App.test.tsx`).
- MUST prefer `getByRole(…, { name })` queries. Fall back to `data-key` or classes only for plan
  tiles' parts and other things with no role.
- MUST name keyboard tests honestly. If the test says "keyboard", it must fire real key events
  (`fireEvent.keyDown(tile, { key: " " })`) and assert the tab stop (`tabindex="0"`). Clicking a
  button covers Enter and Space on that button and is fine, but don't call a click test a
  keyboard test.
- MUST NOT write regexes that depend on formatting (`/\n}/`, exact indentation) to slice CSS or
  code. Extract a block by brace matching (see the reduced-motion test in
  `ui/BottomSheet.test.tsx`) or by selector (`ruleFor` in `style.test.ts`).
- MUST clean up global stubs (`Element.prototype.scrollIntoView`, `matchMedia`, `focus`) in the
  same test or in `afterEach`, e.g. `Reflect.deleteProperty(Element.prototype,
"scrollIntoView")`.
- SHOULD inject time (`createHistory(limit, now)`, `AppDeps.now`) or use fake timers rather than
  sleep.
- SHOULD put a visual check (390, 820 and 1440 px, light and dark) in the report for any layout
  change. jsdom can't see layout. If you didn't look, say so.

### Workflow and git

- MUST pass `npm run verify` before you call a task done. Run it in the background.
- MUST bump `package.json` `version` on every PR to `main` (`scripts/check-version-bump.mjs`).
  The bump only has to be higher than `main`'s, so when `main` moves, re-bump open PRs. That
  includes Renovate's PRs: Renovate doesn't bump, so its automerge waits on the version-bump job
  (`renovate.json`).
- MUST add a `CHANGELOG.md` entry to every PR that bumps the version, in the same commit as the
  code (`scripts/check-changelog.mjs` checks it, next to the version bump). See "Write a
  changelog entry and cut a release" in the recipes.
- MUST NOT add `Co-Authored-By:` or any co-author trailer to commit messages (owner rule).
- MUST NOT push to or merge into `main` without the owner's go-ahead.
- MUST NOT `pkill` dev servers or `vite` processes. Other worktrees and sessions run their own.
  Stop only the process you started, by its PID or through the tool that started it.
- MUST NOT use a bare `git stash` or `git stash pop`, because the stash stack is shared across
  worktrees. lint-staged also leaves its own backup entries there.
- SHOULD start each source file with its path comment (`// src/kit/Dialog.tsx`), as most files do.

### UI work (visual changes, new screens, redesigns)

Written after the 2026-10 redesign. It passed every review and 3,200 tests, but it shipped the old
layout. See [`docs/retros/2026-10-16-ux-redesign.md`](retros/2026-10-16-ux-redesign.md).

- MUST keep the design in the repo (boards as HTML or images under `docs/design/`). Every UI task
  names and links the board(s) it implements, and the implementer reads them before coding. A
  design that exists only as prose, or as a link nobody opens, does not count.
- MUST build a screen's layout from its board first: regions, proportions, and what is absent.
  Features go in afterwards. "Modify the old screen" is not a plan for a redesign.
- MUST list what the boards do NOT show (old blocks, hints, paragraphs), and give the deletions a
  task.
- MUST keep on-screen text to what the board shows. Any other hint, paragraph or label needs a
  ruling in `docs/DESIGN.md`. Correct words are not enough; volume counts too.
- MUST take the whole visual language from the boards into tokens: radii, spacing, type scale,
  surfaces and shadows, not only colours.
- MUST gate every UI task on screenshots at 1440 and 390 px, set beside the board. A reviewer
  looks at them in a browser and answers three questions: does it match, what is extra, what is
  missing. "Checked by hand" with no owner and no artifact is not a check.
- MUST show the owner the running app after the first screen is built and at the end of each
  phase, and wait for a nod before going on.
- MUST answer, in plan review and in final review: "If every task passes, will each screen look
  like its board?" Answer with evidence, not belief.
- SHOULD have whoever orchestrates the work open the app at least once per phase.

---

## 4. Gotchas

Each entry reads: symptom → cause → what to do.

**SVG `tabIndex` is not a tab stop.**
Plan tiles couldn't be reached with Tab even though the code said `tabIndex={0}` (this shipped
in P2 Task 7 and was caught in P2 Task 8; the plan's tiles are HTML since the UI rebuild's Task 7,
where `tabIndex` is right, but the lesson stands for any SVG).
→ Preact 11 passes SVG prop names to `setAttribute` as written. SVG attributes are case-sensitive,
so `tabIndex` on `<g>` renders a literal `tabIndex` attribute that the browser ignores.
→ Write `tabindex={0}` on SVG elements. The same goes for any camelCase prop on SVG that isn't a
real SVG attribute.

**`onFocusOut` never fires.**
→ Preact derives the DOM event name from the prop and listens for a `FocusOut` event, which
Chrome doesn't dispatch.
→ Use `onBlurCapture` and check `relatedTarget` against the wrapper (`screens/Header.tsx`, the
project menu). Safari doesn't focus buttons on click, so keep an outside-click handler as well.

**`inert` is a type error.**
→ It isn't in Preact's JSX typings yet.
→ Spread it from a loosely typed object: `const behindSheet = { inert: sheetCoversScreen } as
Record<string, unknown>;` then `<main {...behindSheet}>` (`app/App.tsx`).

**`ReferenceError: document is not defined` at the end of a test run, from an effect cleanup.**
→ Preact 11 defers an unmounted component's effect cleanup to a timer (35 ms), and a short test file
can end first. `test-support/preact-effects.setup.ts` flushes it after every test; keep it in
`setupFiles` (0.8.3).

**`el.scrollIntoView is not a function` in tests.**
→ jsdom has no `scrollIntoView`.
→ Call it as `el.scrollIntoView?.({ block: "nearest" })` in app code (`App.tsx`). To assert on
it, stub `Element.prototype.scrollIntoView` and delete it afterwards (`App.phone.test.tsx`).

**Focus assertions on SVG elements fail.**
→ jsdom gives SVG elements no `focus()`. (The plan's tiles are HTML now and have one; a test may
still stub it on the instance, as `App.test.tsx` does:
`(tile(key) as unknown as { focus: () => void }).focus = vi.fn()`.) Say in the report that real
focus wasn't checked.

**`:focus-visible` styling or logic can't be tested.**
→ jsdom doesn't match `:focus-visible`.
→ Mock `Element.prototype.matches` for that selector only and call through for everything else
(`plan/PlanView.test.tsx`).

**Text overflows its pill, or tests can't tell whether it fits.**
→ jsdom has no layout or text measurement, and `getBBox` and `getComputedTextLength` don't
exist.
→ Let the CSS cut it: the pill holds the whole name, with `overflow: hidden; text-overflow:
ellipsis` on the text and `max-width: 100%` on the pill (`plan/plan.css`). JS only decides whether
a tile has room for a pill at all (`hasPillRoom` in `plan/tileText.ts`, an estimate from the
tile's measured px, `CHAR_WIDTH = 0.5` em); the whole name stays in the tile's `title`.

**A media-query behaviour has no test.**
→ jsdom has no `matchMedia`, and CSS media queries never apply.
→ JS side: `useMediaQuery` returns false without `matchMedia`, so stub `matchMedia` in the test
(`App.phone.test.tsx`). CSS side: pin the rule's text in `style.test.ts`, as `.pf-sheet[data-full]`
below 600 px, `(width < 760px)`, `.tap` and the base `button` min-height are. A class that only
hides on phones (`pf-status__btn--phone-off`) is tested by its class.

**The 3D view never renders in tests.**
→ jsdom has no WebGL.
→ `renderApp` passes `viewerProps={{ webgl: () => false }}`, so tests cover the fallback text.
`viewer/Viewer.test.tsx` injects a stub scene through `loadScene`. Keep the fallback path (`viewer/webgl.ts`,
`WebGLUnavailableError`) working and tested.

**`light-dark(` shows up in a PNG or a three.js colour.**
→ `shadeOf` returns CSS `light-dark()` strings, which work only in page CSS.
→ Use `shadeHex(kind, i, scheme)` there ([§7.3 Look](#73-look)).

**The plan and 3D disagree on a tray's colour.**
→ Two helpers each picked a shade index (P2 Task 14 against the plan's `lookOfTray`).
→ Go through `shadeIndexOf` in `ui/identity.ts`. Never compute a shade index anywhere else.

**stylelint `no-descending-specificity` rejects a button rule inside a container.**
For example, `.modal-actions button { min-height: … }` after the base `button` rules.
→ The container rule is more specific than, and comes after, rules for the same element
elsewhere.
→ Add the shared `.tap` class (`min-height: var(--control-h)`) to the button instead
(the `SettingsForm` buttons).

**A Not-word passes review and then fails `copy.test.ts`, or a legitimate label fails it.**
→ The test parses source with the TypeScript compiler and checks string literals, template text
and JSX text. Comments and identifiers aren't checked.
→ Reword the text, or add a narrow allow-list entry (see the [recipe](#add-a-user-facing-string)).

**A live region says nothing.**
→ The region was mounted in the same render as its text, and screen readers announce changes
inside a region that already exists.
→ Mount the region always and swap its children (`kit/Toast.tsx`). Toggling `role` with the text
has the same problem (`ui/SavedStatus.tsx` keeps its region mounted and empty while saving works).

**Focus lands on `<body>` after a click.**
For example, after a chip's ×, after Try another arrangement turns into Stop, or after deleting the last
row.
→ The focused element unmounted.
→ In an effect after the re-render, if `document.activeElement` is `body` (or null), focus the
counterpart, the next item or the owner (`StageTop.tsx`, `ComponentList.tsx`). Never move focus
when it's somewhere else.

**Calling `rerender` from an `onChange` in a test overflows the stack.**
→ It re-enters Preact's effect flush.
→ Wrap the component in a small `Host` that holds the value in `useState` (`plan/PlanView.test.tsx`).

**Errors are invisible.**
→ The field sits in a closed disclosure (a Tray settings row, "Exact numbers").
→ The disclosure opens itself while an error exists at one of its paths and stays open
(`SettingsGroup errorPaths={shapePaths(index)}` and the like match exact paths and prefixes,
`path/...`). If you add a field under a disclosure, add its path. The test must assert the message
has no closed `<details>` ancestor.

**A stored upper tray from before 0.8.0 is refused, or a test fixture loses its engraving.**
→ Geometry 0.8.0 stacks trays flush with a groove, and `planTray` refuses the 0.7.x inset shape
(main merge report).
→ Build upper-tray fixtures flush (x/y 0, wall 3), and expect a re-run banner for old plans.

**Fonts: fontsource's `latin-*.css` drop glyphs.**
→ Those files carry no `unicode-range`, so the later face shadows the earlier one.
→ `src/styles/fonts.css` declares its own `@font-face` rules (woff2 only, latin and latin-ext,
with the packages' `unicode-range`). Extend that file and don't import fontsource CSS.

**Tests fail in a task worktree but pass on the merged branch.**
In P2 Tasks 8, 11 and 13: `TargetedPointerEvent` type errors, and Viewer or ExportPanel abort
tests failing.
→ The worktrees symlinked one shared `node_modules`. The main merge installed Preact 11 and
Vite 8 there while the task branches still declared Preact 10.
→ Give each worktree its own `npm ci`, or at least one that matches its `package.json`. Merge
base changes (dependency bumps above all) into task branches early. Re-run tests on the merged
branch before you trust a red or green result.

**Merge conflicts in `App.tsx` and `App.test.tsx` every time.**
→ Most screen tasks wire into `App.tsx`.
→ Plan the seams before running tasks in parallel. Put new behaviour in its own component (e.g.
`SelectedTrayBar.tsx`, which was pulled out of App) and have App pass props. Serialise tasks
that change the same App state.

**The 3D scene rebuilds on every keystroke while an editor is open.**
→ A rename leaves the plan's hash unchanged (names are not hashed), but it changes `components`, so
anything keyed on them redraws. The layout runner's 400 ms debounce does not cover it.
→ Hand the scene what `useSettled(values, ms)` returns (`src/screens/useSettled.ts`, `SETTLE_MS`
400): the values as they were when the last change was over, the first ones at once.
`EditorStage` does this for the 3D scene's trays, components, groups, box, settings and lit keys.

**Lighting trays in the 3D scene from outside the viewer.**
→ `Viewer` takes `litKeys`, merged with what a rail row lights; the scene already glows lit trays
and fades the rest (`setLit`, `fadeOf`, `emissiveOf`). The editor passes its item's or group's
trays and the spacers and dividers that travel with them. Don't add a second lighting path.
While `litKeys` is given the scene is told `setLit(keys, true)`: the lit trays glow harder and the
rest fade further and are drawn through (`EDITED_*` in `viewer/transform.ts`), so they show at
Spread apart 0. A hover alone stays mild.

**Opening an item in 3D reset the camera and Spread apart, with "Loading…".**
→ The workspace and the editor drew two `Viewer`s in two places of the tree, so one unmounted and
the other mounted.
→ Both stages are drawn by `EditorStage` (the workspace passes its own parts as `normal`), and its
`StageFrame` puts the one `Viewer` at the same place; only props change. Keep it that way: a new
stage that has a 3D view goes through `StageFrame` too (test: `EditorStage.sameStage.test.tsx`).

**A new file matched by `import.meta.glob` is not seen by the tests.**
→ Vitest's transform cache is keyed by the content of the file that holds the glob, not of the
files it matches (seen with the seeds under `docs/design/seeds/`).
→ Delete `node_modules/.vitest-cache` once after adding such a file.

**`npm run shots` changes committed board PNGs.**
→ The harness re-renders every board under `docs/design/boards/png/`, and the anti-aliasing differs a little each time.
→ Before you commit, `git restore -- docs/design/boards/png/`, and delete the untracked
variants of a board the run made (keep only the ones you meant to add).

**`npm run seeds` changes every seed.**
→ It rewrites `createdWith` in each seed under `docs/design/seeds/` to the current app version.
→ Run it to add a seed, then `git restore` the other seeds, or commit them all on purpose.
→ Tests that check a stored plan against what the plan holds (chamfers, the take-out order, the
filament estimate against a slicer) read `test/fixtures/frozen-seeds/` (`loadSeed(name, true)`), the
seeds as 0.15.0 made them: a rerun does not move them.

---

## 5. Recipes

### Add a component kind

Follow [§7.5 **"How to add a kind of item"**](#75-how-to-add-a-kind-of-item): model and schema bump, sizing,
geometry if needed, editor, tests. It's the source of truth, so it isn't repeated here. In
addition:

- Add the kind's shade triple to `src/styles/tokens.css` and to `KIND_BASES` in `ui/identity.ts`.
  `identity.test.ts` checks the base shades against the tokens, and the contrast for every
  index in both schemes.
- Add its glyph (`KindGlyph` in `kit/icons.tsx`, shown by `kit/IconTile.tsx`) and its name in `KIND_NAMES`, using the
  spec's words.
- Check that `instructions/naming.ts` names it sensibly when the user leaves the name empty (it
  falls back to the kind's name).

### Add a migration

A breaking schema change (a 0.x MINOR) needs one. Write it as a module of its own beside
`model/migrate-0.2.ts` (a pure function from the old raw project to the new one, with the
`inputsHash` cleared when the old plan would no longer match) and add it to `MIGRATIONS` in
`model/schema.ts`. Before changing the model, write the old projects the migration must carry
into `test/fixtures/legacy/` and their `inputsHash` into `hashes.json`, with the old code, the
way `scripts/make-legacy-fixtures.mjs` did for 0.2.0 (it needs the pre-change model, so run it
on the old commit and commit its output). Test the migration against those fixtures in a
`migrate-<line>.test.ts` beside it, and the unchanged hash of every plan that must stay current
in `model/hash.test.ts`.

### Add a setting

1. Add it to `Settings` in `src/model/types.ts` and to `DEFAULT_SETTINGS` in
   `src/model/settings.ts`.
2. Read it in `readSettings` in `src/model/schema-read.ts`. A missing value falls back to the
   default, so older files keep loading.
   If you change the default of a setting that is already stored and `compactSettings` in
   `model/schema.ts` leaves it out at its default (`mergeRisers` went from off to on in 0.10.0), a
   saved file cannot tell an old "off" from "never said": decide which meaning old files get, and
   say so in a decision-log row. (A reader constant like `LIP_ENABLED_WHEN_ABSENT` keeps the old
   meaning, but marks every old project as changed.)
3. If it's numeric, validate it: add an entry to `SETTING_RANGES` in `src/model/validate.ts`, and
   a setter in `SETTING_SETTERS` in `src/ui/settingsFields.ts` if the settings form edits it.
   Error paths are `/settings/<name>`.
4. Choose the hash or the cache:
   - Changes the layout (tray sizes or positions, score, warnings): leave it in `inputsHash`. If
     existing projects should keep their plan, hash it only when it isn't the default (see
     `oneWall` and `playLimit` in `model/hash.ts`).
   - Changes only the mesh, the grouping of printed parts or an estimate: set it to `undefined`
     in `inputsHash`'s settings block with a comment, and extend the doc comment there. The mesh
     cache picks it up automatically, because the whole `settings` object is in the key.
5. Bump the versions:
   - `SCHEMA_VERSION` PATCH (additive), with `test/fixtures/schema/<version>.json`, a copy of
     the previous fixture with the field and the new `schemaVersion`.
   - If it changes printed geometry, `GEOMETRY_VERSION`: PATCH if parts still mate, MINOR if
     not.
   - `package.json` on the PR.
6. UI: put it in the Settings drawer (`ui/SettingsSheet.tsx` and `ui/SettingsForm.tsx`, or the My
   printer tab for printer things). A number goes in a group of `ui/settingsGroups.ts` (a test
   fails while a `SETTING_RANGES` path is in no group); an error at its path then opens that group.
   The first screen of "This insert" is the board's plain choices: do not add to it without a
   decision-log row. A number drawn there (`minRiser`, "Separate risers from") is listed in
   `FIRST_SCREEN_PATHS` instead of a group, and its new strings are ruled in
   `screens/copy-rulings.ts` against that row.
7. Tests: the hash test (`model/hash.test.ts`: it changes, or doesn't change, the hash), the
   schema read test, and a form test that the error shows next to the field.

### Add a user-facing string

1. Write it in the spec's words (spec "Words", DESIGN.md). Name trays by contents, never by
   number.
2. Run `npx vitest run src/ui/copy.test.ts`. It scans every non-test `.ts` and `.tsx` under
   `src/` (`*.test.*`, `test-*` and `test-support/` are skipped) and the README:
   - `RETIRED`: phrases the redesign dropped ("Copy link", "Advanced", "Update plan", "Lock
     position", "Exact values", "#" plus a digit…).
   - `NOT_WORDS`: the spec's "Not" column as whole words, case-insensitive ("part", "bin",
     "filler", "lock", "keep", "bits", "minis", "components"…).
   - `isNotCopy` skips single lowercase tokens and class lists (`"tray-chip tray-chip--spare"`),
     so type tags and keys aren't flagged.
3. If the test flags your text, reword it. Add an exception only for a real control or a real
   label:
   - A legitimate phrase: add it to `ALLOWED` (e.g. "Lock size", "Try another arrangement", "Part of it").
     The phrase is removed before the check, and the rest of the string is still checked.
   - "part" and "parts" are allowed only in `PART_FILES` (the download list, export reasons and
     part names). Add a file there only if it writes that list.
   - A word the redesign retires: add a `{ name, test }` entry to `RETIRED`, and to the README
     list in `"keeps the README to the same words"` if the README could say it.
4. If the same sentence appears in two places, export one constant and use it in both.

### Add a dialog or sheet

- **Modal over the page** (download, settings): wrap the content in the kit's `Dialog`
  (`kit/Dialog.tsx`; `Drawer` for Settings' right-hand placement), with `labelledBy` (the id of its
  h1), `onClose` and optional `class` and `region`. The owner mounts it to open and unmounts it to
  close. Dialog handles the rest:
  - it opens a native `<dialog>` with `showModal()`, which keeps focus on the dialog and makes the
    page inert (Tab past the last control goes to the browser's own interface and the next Tab
    comes back to the first: the platform's way, checked by the `settings-keys` probe)
  - Escape goes through `onCancel` to your `onClose`
  - it returns focus to the opener on unmount
  - it goes full screen below 600 px (`.k-dialog`, `.k-drawer` in `kit/kit.css`)
  - the content draws its own Close (`CloseButton`) and Done.

  Model a drawer on `ui/SettingsSheet.tsx` and a dialog on `ui/ExportPanel.tsx`: each focuses its
  h1 (`tabIndex={-1}`) in an effect. In tests, jsdom has no `showModal`, so Dialog falls back to
  `open`. Fire `cancel` to test Escape, and note that the real focus trap wasn't exercised.

- **Panel in the page** (phone list sheet): `kit/Sheet.tsx`, placed by `screens/Workspace.tsx`. State comes in as attributes
  (`data-expanded`, `data-full`, `data-editing`) and the handle as a `handleRef`. Below
  `NARROW_QUERY` a full sheet covers the screen, and App puts `inert` on `.app-top` and `<main>`.
  Between 600 and 760 px it's non-modal. Add every transitioned selector to the reduced-motion
  block, which `kit/Sheet.test.tsx` checks by brace matching.
- Every new button gets 44 px, from the base `button` rule or `.tap`. Pin a new media-query rule
  in `style.test.ts`.

### Add a way to lift a part

The packing guide's Lift column says how each printed part comes back out of the box
(`src/instructions/lift.ts`; DESIGN §7, "The packing guide says how to take each tray out"). A new
grip feature (a top chamfer on a filler, say) is **one entry in `GRIP_RULES`**: its `kind`, whether
it is a grip of the part's `own`, and an `applies` test on the spec's features (a merged part
meets a rule when one of its members does) and, for what stands beside the part, on `facing`, the
keys of the trays with a top chamfer of a filler beside them (`chamfersFacingTrays`, read in `render.ts`). Then:

1. Add its line to `LIFT_LINES` (the rulings in `screens/copy-rulings.ts` list every value), and
   the kind to `GripKind`.
2. Add a case to `lift.test.ts`. The Lift cell, the "No grip of its own" flag, the note above the
   layers and the order of the rows (`takeOutOrder` in `render.ts`, which reads only the grip)
   follow from `gripOf`: don't test for the feature anywhere else.

### Write a changelog entry and cut a release

`CHANGELOG.md` is for the people who use the app (Keep a Changelog style, newest first). Each
version is a section `## [0.22.0] - 2026-10-24` with `### Added`, `### Changed` and `### Fixed`
lists. Write in DESIGN.md's words: plain, no file names, no code, say what a person sees and
what to reprint. Behind-the-scenes changes get one short line saying the app is unchanged.

- **A feature or fix PR** adds its entries under `## [Unreleased]` (create the heading and
  `###` lists if they are empty) and bumps `package.json`'s version as usual. It may instead
  write them under its own dated version section; the check accepts both.
- **An integrating PR** (it combines several PRs into one release and renumbers versions) moves
  the Unreleased entries of the PRs it combines under one `## [<new version>] - <date>` section,
  and lists every feature once. When a PR is renumbered, only that heading changes. Leave
  `## [Unreleased]` in place, empty, for the next PR.
- **CI** (`version-bump` job): when the version rises, `CHANGELOG.md` must have entries under
  `[Unreleased]` or a section for the new version, and be sound (dated, newest first, only
  those three headings, `[Unreleased]` first). Renovate PRs need no entry.
- **The release** is automatic. A push to `main` that changes `package.json`'s version runs
  `.github/workflows/release.yml` (`scripts/release.sh`): it creates the tag `v<version>` and a
  GitHub Release titled "<version>: <summary>", the summary being the squash commit's title, and
  with the version's section as notes. If the tag exists it does nothing. If there is no
  section for the version (a PR that left its entries under Unreleased, or a Renovate bump), the
  release gets GitHub's generated notes and the entries stay under Unreleased for the next
  version that moves them. So a release PR must move them.
- **Check it** without GitHub: `node scripts/changelog.mjs notes 0.22.0` prints the notes and
  `node scripts/changelog.mjs title 0.22.0 "0.22.0: summary (#1)"` the title.

### Add a notice

- A notice is `{ level, code, message }` (`model/types.ts`), produced by validation, sizing, the
  layout (`NOTICE_CODES` in `layout/warnings.ts`), state (`STALE_CODE`, `GEOMETRY_MAJOR_CODE` in
  `app/state.ts`) or persistence (`CONFLICT_CODE`, `SAVE_FAILED_CODE`,
  `STORAGE_UNAVAILABLE_CODE`). App notices go through `store.pushNotice` and `dismissNotice`.
- Where a notice shows is decided by code in `ui/noticePlacement.ts`:
  - `"banner"`: only the plan-level stale and geometry notices. There is **one banner at a
    time**; when both apply, the older-geometry one wins (`placeNotices`).
  - `"menu"`: needs a look but no interruption. It adds a dot and a count to the project menu
    button (`MENU_CODES`).
  - `"inline"`: under the status heading (the default). `Notices` shows at most 3; errors always
    show, and the rest fold behind "Show all".
  - `"none"`: for example, the stale notice while a run is pending or the inputs don't fit.
- To add one: give it a stable code constant, decide its place in `noticePlacement` (add to
  `MENU_CODES`, or leave it inline), write the message in the spec's words, and add a
  `noticePlacement.test.ts` case. Don't add a second banner. If it's about the plan, it's either
  the existing banner or a status-line pill.

---

## 6. Pointers

- [`docs/DESIGN.md`](DESIGN.md): design rules, principles, look, patterns, engine limits,
  decision log and checklist. Read it before any UI work; this file doesn't repeat it.
- Spec: [`docs/superpowers/specs/2026-10-16-ux-redesign.md`](superpowers/specs/2026-10-16-ux-redesign.md),
  especially "Words", "Accessibility and touch" and "What the engine can and can't do".
  Original design spec:
  [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](superpowers/specs/2026-10-11-boardgame-insert-generator-design.md)
  (§9 versioning).
- Plan: [`docs/superpowers/plans/2026-10-16-ux-redesign.md`](superpowers/plans/2026-10-16-ux-redesign.md).
- Analytics: [`docs/analytics.md`](analytics.md), the owner's steps to switch the anonymous count
  on and what it counts. The only module that sends anything to another host is
  `src/app/analytics.ts`; a new event is one name in `COUNT_EVENTS`, one `count(...)` call, a test
  that it fires once and a line in that file and in the decision log.
- Sections of §7 below:
  - 7.3 "Look": tokens, shades, fonts
  - 7.4 "Architecture": folders and data flow
  - 7.5 "How to add a kind of item"
  - 7.6 "Build smoke test and its limits": what `smoke-dist.mjs` can't prove; check a real browser
    before release
  - 7.7 "Publishing" and 7.8 "Releasing": GitHub Pages deploy, version bumps
- Build ledger with the review findings behind these rules:
  `.superpowers/sdd/2026-10-16-ux-redesign/progress.md` (if present in your checkout).

---

## 7. Reference moved from the README

The README is written for people who use the app. What it used to hold for developers lives
here, unchanged in substance: what the app does screen by screen, the look, the architecture,
how to add a kind of item (and the versioning rules), the smoke test's limits, publishing and
releasing. Other documents link to these sections.

### 7.1 Scripts and tests

```bash
npm install
npm run dev        # dev server
npm test           # vitest run (unit + jsdom UI tests + script tests)
npm run verify     # lint + format check + build (what CI runs)
npm run build      # vitest run && tsc (app + node configs) && vite build → dist/ && smoke test of dist/
npm run preview    # serve the production build
```

Tests run inside `npm run build` (and `npm run verify`); CI also runs them as their
own job (`npm test`) next to lint, format, typecheck, build + smoke test and audit, so a
failure names what broke. UI tests opt in to jsdom with
`// @vitest-environment jsdom` in their header comment and stub the layout and
geometry clients, so they never start a worker or load WASM.

### 7.2 What the app does

One screen, one mode: plain choices come first, and the exact numbers sit in the rows of "Tray settings" (per item) and "Exact numbers" (in Settings).

1. **Start.** A first visit asks for the box's inside size ("Measure the box"), then a kind
   ("Add what goes inside") or "Start from an example game". After that the workspace has
   "What's inside" (the list) on the left and the box drawn large on the right. Below 760 px
   the box comes first and the list is a bottom sheet; dialogs fill the screen below 600 px.
2. **What's inside.** Five kinds: Cards, Tokens and dice, Tiles, Miniatures (the pieces are
   figures) and Other. Each item has its own shade of its kind's colour and icon, and
   that same shade marks its trays in the plan and in the 3D view. Editing an item opens
   a panel with the basics and, under "Tray settings" (Reach, Shape, Room, Copies and group), the rest: room for more cards, tiles or pieces, how
   often you reach for it, finger cuts, curved floor, corner holes, how cards stand,
   copies (each its own tray), the group an item belongs to, removable dividers between flat
   decks in one well, and the exact numbers in rows that open in place. While you edit, the stage
   stays as it is (the same Layer and Top / 3D switches, the plan or 3D in the same place) and
   shows the item's trays lit. A group is a set of
   items that share one tray: it has a name, Copies (each copy is its own tray, "×4" in its
   header), the order of its items (the order of the wells in the tray) and how often you reach
   for it. Drag an item by its grip into or out of a group, or use "Move to group…".
   The box beside it shows the item's trays lifted, and each change to an option shows a short
   note over the box. When
   no tray variant can give tiles, miniatures (pockets) or an other item a finger cut, its
   pieces are stored loose in a tray with a curved floor instead, and the editor says so.
3. **The box.** The box card (above the list) opens "The box", which sets the inside width,
   length and height, "Keep space free on top" (the whole top or part of it) and whether the box
   is stored on its side. The stage beside it is a side view of the box: the space kept free as
   a band on top, the layers under it, and how many mm the trays fill. A first visit asks for the
   three sizes only, and its header has "Open file" and the project menu.
4. **The plan.** The optimizer runs on its own 400 ms after you stop editing. The status heading
   above the box says the result ("Everything fits. 6 trays in 2 layers, 40 of 52 mm high.") or
   what is wrong. When nothing fits the status row becomes a strip pinned at the top of the stage,
   with "Edit <name>" and "Try another arrangement", and the stage, in Top and in 3D, shows the
   closest attempt dimmed with the tray that doesn't fit marked (in 3D it sticks out of its slot). When
   your pins block the fit it shows the plan that was kept and "Unpin one": "Unpin <name>" (or
   "Unlock size of <name>") for each pin in the way. "Try another arrangement" runs a longer
   search (about three times the budget) from the current plan and never throws it away;
   it becomes "Stop" while the search runs. Trays are named by what they hold, never
   shown with numbers ("Market", "Spare by Market"). Spare trays and spacers fill gaps so the other
   trays cannot move; print them too. Layers are labelled "Layer 1 (bottom)" to
   "Layer n (top)", and the Layer segment above the box, beside the Top / 3D segment, has a button
   for each. On a wide screen the app is one centred block, 1600 px at most, with the status, the
   switches and the box in one column.
5. **Trays.** Select a tray, in the plan, in the 3D view or in the list (on a phone, by its chip),
   to see its dock: one toolbar at the bottom centre of the stage, the same in Top, in 3D and on a
   phone. Its label is the tray's colour, its name and one line ("Layer 1 · 95 × 190 × 40 mm · about
   76 g"); "Edit" opens its item. The ⋯ menu holds "Keep here" (the pin: holds it where it is, a
   stack with all its trays), "Rotate 90°" (turns it without pinning it; "Turned" says so, and its
   × lets it turn as the plan likes), "Swap places with…" (pick the other tray in the plan or in 3D;
   both stacks are pinned), "Put on…" and "Keep this size" (holds it at the size it is), each with a
   line saying what it does. A blocked entry says why. Spacers, spare trays and risers have no
   actions, only Close. Pins and size locks also show as chips on the item's row, each with an x
   ("Unpin", "Unlock size"). The optimizer works around them and never drops one silently.
6. **3D view.** The "3D" segment (beside "Top") shows the trays in a frame as wide as the plan's
   column (it needs WebGL; the rest works without), with the model kept inside it however you turn
   it. One quiet row holds "Spread apart". There is no axis button.
   The Layer switch above works here too: "All", or "Layer 2" to show layers 1 and 2, so you can peel the layers off the top. A
   tray chosen in the plan or the list is chosen in 3D too, and the other way round: the same bar,
   the same row, and the trays not chosen fade.
7. **Settings.** A drawer on the right (full screen on a phone), opened from the project menu, the
   rail's footer or the status heading, with "<n> changed" and "Reset all" in its header and
   "Done" at its foot. "This insert" is "How the trays sit" (Fit in the box, Walls, Room for
   fingers, Rim between layers: Off, Auto (the default: the plan is made with a rim and groove and
   with a stepped base that leaves the walls thin, and the better one is kept) or one of the two,
   Fill to the lid, Fill the space that's left: Separate spacers, Bigger wells or Thicker walls,
   which print no spacer at all) and "Exact numbers": a search, then groups of
   numbers (Walls and floors, Cards, Finger cuts, Rim between layers and more),
   each value with a dot and "Back to <default>" when it differs. "My printer" is the bed (Small,
   Medium, Large or your own size), "Printer details" (margin, layer height) and "Printing"
   ("Engrave tray names", joining spacers). **The printer is a preference in this browser** and
   every new insert starts with it; when the open insert uses another printer, a row at the top of
   "My printer" says so and "Apply" copies the browser's printer to it.
8. **Download.** The header's "Download" opens one dialog, "Ready to print": a chip for each tray
   in its colour, the filament, one primary button, "Download the 3MF file"
   (a single combined file), a "Packing guide" card and "Other formats" ("One 3MF per part (.zip)"
   and "STL files (.zip)"). It becomes "Building your print file" with a progress bar and "Stop"
   (closing the dialog stops it), then says every tray is in the file; a tray that fails to build is
   listed under "Not exported" with its reason and one "Try again". Download says "Fix the fit to
   download" while nothing fits and is off while the plan is out of date. The dialog ends with a
   quiet line, "For personal use · Terms". On a phone, "Send file" is in the header and in this
   dialog.
9. **Packing guide.** The dialog's "Packing guide" card shows the packing order (bottom layer
   first), how it goes together (an exploded picture), a picture per layer, a "What goes where"
   table, PNG downloads per layer and "Print or save as PDF". Trays are named; the download
   list is the one place that says "part".
10. **Save and share.** Projects autosave in the browser, and the header says nothing while
    that works (it speaks up only when saving is paused, fails or is blocked). There are no share
    links: the address bar never changes. The project menu (the header's menu button) has New
    insert, Your inserts (open or delete one), "Open file…", "Save file" and Settings, then, at
    its end, the version and build id and one quiet line, "Licences · Terms · Privacy"; there is no footer. A phone's
    menu starts with Redo, and its header has Undo and "Send file". A file holds the whole
    insert, so sending the file is how you share one. Opening a file opens it as a separate
    insert (a file whose id and content match a stored one just opens that one; one whose id
    matches a different one opens as a copy). A `#1.` link made by an older version still opens,
    once, as a copy, and the address bar is cleared. If the browser blocks storage the app says so
    and asks you to save a file; the page warns before closing while there are changes no file
    holds. When another tab changes the insert you are editing, autosave pauses and the menu
    offers "Keep this version" or "Use the other tab version".
11. **Undo and redo.** Every edit is a step (header buttons); "Try another arrangement" results are
    steps of their own.

The status heading above the box (the page's h1) says where the plan stands: it fits, a new plan
is being made, or what is wrong, with the way out beside it ("Try another arrangement", "Stop", "Edit
<name>", "Settings"). If you change the inputs after a plan was made, the plan stays as it was
and a banner says "This plan is from before your last changes." with "Make a new plan". Download
and the packing guide are off until you do. A plan made under an older line of tray geometry gets
a banner too ("Update plan" or "Use the old plan"): its trays no longer mate with trays
exported now.

### 7.3 Look

The redesign's tokens live in `src/styles/tokens.css`: page, sheet, ink, muted, rule, edge, box
and focus colours, one fill/line/ink triple per kind (cards blue, tokens and dice amber, tiles
green, miniatures rose, custom violet; the tokens and dice colour is named `--bits-*`), the hatched spacer, spacing, radii and the two typefaces.
A warm dark set redefines the same names under `[data-theme="dark"]`, which
`src/ui/theme.ts` sets from the Appearance choice in Settings (System follows the device; printing
stays on white). Text stays at 4.5:1 and
edges 3:1 against their ground in both, and `src/style.test.ts` checks it. Every focusable
element gets a 3 px `--focus` outline (`:focus-visible` in `tokens.css`).

`shadeOf(kind, index)` in `src/ui/identity.ts` gives each item of a kind its own shade of
the kind's hue (`light-dark(…)` colours, so one inline style follows the scheme; `shadeHex`
gives plain hex per scheme). `light-dark()` only works in the page's own CSS: the 3D view,
the PNG and SVG export and anything printed must use `shadeHex(kind, i, "light")` (paper is
always light); a test checks that `light-dark(` stays out of the exported SVG. `src/ui/identity.test.ts` checks the base
shades against the tokens and the contrast of every shade.

Headings use Bricolage Grotesque (500, 700) and everything else Figtree (400, 600, 700),
both self-hosted from `@fontsource` packages (`src/styles/fonts.css` declares only those
weights, woff2, latin and latin-ext subsets; Vite emits the files as relative assets, so `base: "./"` still works and the page
requests nothing from another host). Their SIL OFL licences are added to
`third-party-licenses.txt` by `licenses.config.ts`. `src/styles/proof.css` holds the older `pf-`
classes that are still in use; it reads the new tokens through a short block of legacy names
at the end of `tokens.css`. `src/style.css` holds the app's own rules. A test (`src/ui/copy.test.ts`)
scans the string literals and JSX text of every non-test source file for words the redesign
retired (the spec's "Words" section lists them), so they stay out.

### 7.4 Architecture

| Folder          | What it does                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `model/`        | Types, defaults, validation, schema versioning, `inputsHash`                                       |
| `share/`        | Reader for old `#1.` links, local project store, JSON files, the printer preference                |
| `sizing/`       | Items (group) → tray requirements with variants                                                    |
| `layout/`       | Optimizer (Web Worker, deterministic), `summarize`, `swapLocks`                                    |
| `geometry/`     | `TraySpec` → manifold mesh (Web Worker; only `geometry/client.ts` is imported by the page)         |
| `export/`       | 3MF / STL writers, zip, grid layout                                                                |
| `app/`          | State (`state.ts`), optimizer runner, persistence, store, export builders, mesh cache, `App.tsx`   |
| `screens/`      | The workspace: header, project menu, rail, stage, first visit, fit problems                        |
| `kit/`          | The primitives the design boards repeat: buttons, fields, segments, dialog, drawer, sheet          |
| `ui/`           | The editors for each kind, the Settings drawer, the Download dialog, view logic                    |
| `plan/`         | Top-down plan view: tiles with name, size and kind icon; select, drag/keyboard swap, pin           |
| `viewer/`       | three.js 3D view (`scene.ts` is loaded lazily)                                                     |
| `instructions/` | Tray names, part ids for the download list, packing guide SVGs, packing order, printable page, PNG |
| `licenses/`     | Builds `dist/third-party-licenses.txt` (see `licenses.config.ts`)                                  |

**Data flow.** Every edit goes through `store.edit(fn)` with a pure function
from `app/actions.ts`. If `inputsHash` changed, `app/runner.ts` waits 400 ms,
cancels any running optimization, runs `size()` and the layout worker (same
seed, warm start from the current layout) and auto-accepts the result into
`project.layout`. Every edit is an Undo/Redo step of the whole project (`app/history.ts`, up to
100, cleared when another project opens); the plan joins the history entry of the edit that
caused it, and a "Try another arrangement" result is a step of its own. A result whose
inputs no longer match the project is discarded. Pins are never dropped silently:
when the worker had to ignore pins (`LayoutResult.lockConflicts`), the runner does
not accept that plan. The previous plan and every pin stay, the conflicts are in
`state.lockConflicts`, and `store.unpin(trayKey)` removes a tray's pins and size lock and
re-runs. `app/persistence.ts` autosaves
(500 ms) to localStorage, opens files (and, once at start, an old `#1.` link,
after which `main.tsx` clears the address bar) as separate projects (a different
project with the same id becomes a copy), warns before the page closes when
storage is unavailable and changes are unsaved, and pauses autosave if another
tab saved the same project.
A project with a stored layout is never re-optimized on load; if its inputs
changed, the "This plan is from before your last changes." banner appears instead. Meshes are built on demand by the geometry worker and cached
in `app/meshes.ts`.

### 7.5 How to add a kind of item

1. **Model (additive schema bump):** add the interface to `src/model/types.ts`
   (roadmap §4.1), add it to the `Component` union, give it defaults in
   `newComponent()` and `KIND_NAMES` (`model/defaults.ts`), validation in
   `model/validate.ts`, and reading support in
   `model/schema-read-components.ts`. Bump `SCHEMA_VERSION`
   (`model/version.ts`) for an additive change: while MAJOR is 0 that is the
   PATCH (MINOR is breaking and needs a migration); from 1.0 on it is the
   MINOR (MAJOR is breaking). Add a fixture under `test/fixtures/schema/`. A
   breaking change (a 0.x MINOR) also needs an entry in `MIGRATIONS`
   (`model/schema.ts`; the first is `model/migrate-0.2.ts`), tested against the
   projects in `test/fixtures/legacy/`.
2. **Sizing:** turn it into `TrayRequirement` variants in `src/sizing/`
   (one compartment requirement per item, finger cuts, elastic axes). Decide
   its defaults for the "Finger cuts", "Curved floor" and "Corner reliefs"
   toggles in `model/defaults.ts`, and whether it may use the bulk fallback
   (`sizing/fallback.ts`).
3. **Geometry:** only if it needs a new compartment kind or feature. Bump
   `GEOMETRY_VERSION` (`geometry/version.ts`): while MAJOR is 0 a new optional
   feature is a PATCH and a change that breaks fit (or makes `planTray` reject
   specs it accepted before) is a MINOR, which `isOlderGeometryLine` treats as
   a new line ("reprint the whole insert"); from 1.0 on they are MINOR and
   MAJOR.
4. **UI:** create `src/ui/components/<Kind>Editor.tsx` taking
   `EditorProps<YourComponent>` (the basics first, then the rest inside the
   `<TraySettings>` with its four `<SettingsGroup id="reach|shape|room|copies" errorPaths={…}>`
   rows: `<ReachGroup …/>`, then `<TrayShape …/>` in Shape, `<RoomOptions …/>` and `<RoomRows …/>`
   in Room, `<CopiesRows …/>` in Copies and group (the paths are `shapePaths`, `roomPaths` and
   `copiesPaths` of `CommonOptions.tsx`; the row's value line is `groupSummary` in
   `moreSummary.ts`); the
   controls are in `ui/components/controls.tsx`), add a `case` to `KindEditor` in `EditorPanel.tsx`,
   and add the kind to `KIND_TILES` in `screens/KindPicker.tsx`. Field paths must
   match `validateProject()` so errors show next to the field.
5. **Tests:** sizing unit tests, an editor test next to the editor, and run
   `npm run build`.

### 7.6 Build smoke test and its limits

`scripts/smoke-dist.mjs` serves `dist/` from `/boardgame-insert-generator/`
(the deploy subpath) with a tiny `node:http` server and checks that
`index.html` only uses relative URLs that load, that the layout and geometry
worker scripts and the manifold WASM exist and are referenced by name, that
nothing points at `/assets/` absolutely, and that `third-party-licenses.txt`
names every bundled library.
No browser runs the page, so it cannot prove the workers or WASM execute; do a
manual check in a real browser (import a fixture from `test/fixtures/`, export,
open the page) before a release.

`vite.config.ts` sets `base: "./"` for subpath hosting and defines
`__APP_VERSION__` from `package.json` and `__BUILD_ID__` (the short git SHA, `-dirty` for
uncommitted changes, `unknown` when git is unavailable; `build-id.config.ts`). The project menu's last line shows both
as `Insert Generator 0.5.0 (2a2ec02)`. The build id is display-only and is never written to a project or hashed.
TypeScript strictness comes from
[`tsconfig.base.json`](tsconfig.base.json). `tsconfig.json`
checks the browser code in `src/` (no Node types); `tsconfig.node.json` checks
the config files that run in Node. `npm run typecheck` runs both.

### 7.7 Publishing

The app is deployed to this repository's own GitHub Pages,
<https://igorzamyslov.github.io/boardgame-insert-generator/>, by
`.github/workflows/deploy.yml`. Every push to `main` runs `npm ci` and `npm run build` (tests,
type checks, Vite build, dist smoke test) and, if that passes, publishes `dist/`. The build
uses the relative base `./`, so it works under that subpath without configuration.

Pull requests to `main` also run the `version-bump` job in `.github/workflows/ci.yml`
(`scripts/check-version-bump.mjs`), which fails unless `version` in `package.json` is a higher
semver than on `main`. Renovate raises the patch version itself (`bumpVersion` in
`renovate.json`) on the pull requests that change `package.json`; `rangeStrategy: bump` makes
every dependency update change it. `lockFileMaintenance` changes only `package-lock.json`, so
`bumpVersion` cannot act there, and the check lets a Renovate pull request that changes nothing
else through without a bump.

#### One-time setup

1. In this repo's GitHub settings, Pages: set Source to "GitHub Actions".
2. In [igorzamyslov/static-web-apps](https://github.com/igorzamyslov/static-web-apps), remove the
   `apps/insert-generator` submodule (or replace its page with a redirect to the URL above), so the
   old `/static-web-apps/insert-generator/` address does not go on serving a stale copy.

### 7.8 Releasing

Every pull request to `main` (except Renovate's `package-lock.json`-only updates, see above) must bump `version` in `package.json` (the project menu's version line and every saved
project's `createdWith` read it; CI enforces it). The menu's build id shows the commit even if you forget, but
`createdWith` does not, so do not skip it. This is separate from `SCHEMA_VERSION` and
`GEOMETRY_VERSION`, which change when the file format or the printed geometry does, not on a
release; a release that changed either also bumps the app version (see spec §9). While 0.x, bump
MINOR for features and breaking changes, PATCH for fixes.

Every version has an entry in `CHANGELOG.md`, and a push to `main` that changes the version
creates the tag `v<version>` and a GitHub Release with that entry as its notes
(`.github/workflows/release.yml`). A pull request adds its entry under "Unreleased", or under its
own version; the `version-bump` job checks it (`scripts/check-changelog.mjs`). The pull request
that cuts a release moves the entries under the new version.
