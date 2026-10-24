# insert-generator

Built app: **Vite + TypeScript + Preact (signals)**. Turns a board game box and
what goes inside it into a 3D-printable insert: trays that tile the box, stack with
a locating lip, open upward and fit the print bed. Exports 3MF/STL and a
printable assembly page. Design: [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md).

Status: **preview (0.x)**: saved projects and files may break between
versions.

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

## What the app does

One screen, one mode: plain choices come first, and the exact numbers sit behind "More options" (per item) and "Exact numbers" (in Settings).

1. **Start.** A first visit asks for the box's inside size ("Measure the box"), then a kind
   ("Add what goes inside") or "Start from an example game". After that the workspace has
   "What's inside" (the list) on the left and the box drawn large on the right. Below 760 px
   the box comes first and the list is a bottom sheet; dialogs fill the screen below 600 px.
2. **What's inside.** Five kinds: Cards, Tokens and dice, Tiles, Miniatures (the pieces are
   figures) and Other. Each item has its own shade of its kind's colour and icon, and
   that same shade marks its trays in the plan and in the 3D view. Editing an item opens
   a panel with the basics and, under "More options", the rest: room for more cards, tiles or pieces, how
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
   Fill to the lid) and "Exact numbers": a search, then groups of
   numbers (Walls and floors, Cards, Finger cuts, Rim between layers, Spacers and space and more),
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
   quiet line with Ko-fi and PayPal links. On a phone, "Send file" is in the header and in this
   dialog.
9. **Packing guide.** The dialog's "Packing guide" card shows the packing order (bottom layer
   first), how it goes together (an exploded picture), a picture per layer, a "What goes where"
   table, PNG downloads per layer and "Print or save as PDF". Trays are named; the download
   list is the one place that says "part".
10. **Save and share.** Projects autosave in the browser, and the header says nothing while
    that works (it speaks up only when saving is paused, fails or is blocked). There are no share
    links: the address bar never changes. The project menu (the header's menu button) has New
    insert, Your inserts (open or delete one), "Open file…", "Save file" and Settings, then, at
    its end, the version and build id and a link to "Licences"; there is no footer. A phone's
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
a banner too ("Reprint everything" or "Use the old plan"): its trays no longer mate with trays
exported now.

## Look

The redesign's tokens live in `src/styles/tokens.css`: page, sheet, ink, muted, rule, edge, box
and focus colours, one fill/line/ink triple per kind (cards blue, tokens and dice amber, tiles
green, miniatures rose, custom violet; the tokens and dice colour is named `--bits-*`), the hatched spacer, spacing, radii and the two typefaces.
Light is the default; a warm dark set redefines the same names under
`prefers-color-scheme: dark` (screen only, so printing stays on white). Text stays at 4.5:1 and
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

## Architecture

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

## How to add a kind of item

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
   `<MoreOptions summary={moreSummary(c)} errorPaths={commonOptionPaths(index)}>` disclosure,
   with `<RoomOptions …/>`, `<AccessChoice …/>`, `<TrayShape …/>` and `<CommonRows …/>`; the
   controls are in `ui/components/controls.tsx`), add a `case` to `KindEditor` in `EditorPanel.tsx`,
   and add the kind to `KIND_TILES` in `screens/KindPicker.tsx`. Field paths must
   match `validateProject()` so errors show next to the field.
5. **Tests:** sizing unit tests, an editor test next to the editor, and run
   `npm run build`.

## Build smoke test and its limits

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

## Publishing

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

### One-time setup

1. In this repo's GitHub settings, Pages: set Source to "GitHub Actions".
2. In [igorzamyslov/static-web-apps](https://github.com/igorzamyslov/static-web-apps), remove the
   `apps/insert-generator` submodule (or replace its page with a redirect to the URL above), so the
   old `/static-web-apps/insert-generator/` address does not go on serving a stale copy.

### Releasing

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
