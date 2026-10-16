# insert-generator

Built app: **Vite + TypeScript + Preact (signals)**. Turns a board game box and
its components into a 3D-printable insert: trays that tile the box, stack with
a locating lip, open upward and fit the print bed. Exports 3MF/STL and a
printable assembly page. Design: [`docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md`](docs/superpowers/specs/2026-10-11-boardgame-insert-generator-design.md).

Status: **preview (0.x)**: saved projects and shared links may break between
versions.

```bash
npm install
npm run dev        # dev server
npm test           # vitest run (unit + jsdom component tests + script tests)
npm run verify     # lint + format check + build (what CI runs)
npm run build      # vitest run && tsc (app + node configs) && vite build → dist/ && smoke test of dist/
npm run preview    # serve the production build
```

Tests run inside `npm run build`, because the repo's quality gate only runs
lint, format and build. Component tests opt in to jsdom with
`// @vitest-environment jsdom` in their header comment and stub the layout and
geometry clients, so they never start a worker or load WASM.

## What the app does

1. **Describe the box and the printer**, then **add components.** The inputs
   are a short accordion in the left rail: "The box" (width, depth, height),
   "What goes inside" (cards, bits such as tokens, cubes and dice, tiles,
   miniatures and other items) and "Your printer" (the print bed, chosen by
   size). Each component is one folded line with its kind's icon on a colour,
   and the number of the tray it makes; the same colour and icon mark that
   tray in the plan and the 3D view. Simple mode shows only what most games
   need. **Advanced** (switch in the bar) adds, behind a dotted edge: the
   box's headroom and side storage, the printer's bed margin and layer height,
   a "Walls and fit" section (walls, fit, finger room, exact numbers, locating
   lip, unused space), and per component "Needed during play", group,
   per-player counts, extra room, finger cuts, curved floor, corner reliefs,
   measured card stacks and storage. Switching back to Simple keeps every
   value. The page is one screen: inputs on the left, the result on the right
   (a plain sentence, "Everything fits. 6 trays (2 are spares) in 2 layers,
   78% of the box used.", then the plan or the 3D view). Under 960px the
   result and any problem come first, then the form.
2. **Per component toggles.** Every editor has "Finger cuts" (a cut through a
   wall of each compartment, to reach in) and, for bits, miniatures and other
   items, "Curved floor" (a scoop ramp). "Corner reliefs" (round holes in the
   compartment corners, so square pieces sit flat) shows in Advanced mode. Each
   toggle starts at the default of its kind and writes an explicit value when
   changed. In Simple mode, the Settings switch "Extra finger room in the box"
   leaves extra room beside the walls and dividers for fingers; Advanced mode
   edits the wall and divider room numbers it sets (Advanced mode, "Walls and fit").
3. **Bulk fallback.** When no tray variant can give a tiles, miniatures
   (pockets) or other item a finger cut, its pieces are stored loose in a bin
   with a curved floor instead. The editor says so, and what the bin has.
4. **Layout.** The optimizer runs on its own 400 ms after you stop editing and
   says the result in one sentence; Advanced adds the slack per axis and an
   upper bound for the filament. One search button and "Undo layout" sit under it: the
   button says "Update plan" while there is no layout or the inputs changed since it was made, and "Keep searching"
   (a longer search, about three times the budget) once the layout is current; either way the search starts from the
   current layout and never throws it away. Spare trays (plain, dashed, still
   numbered) fill gaps so the other trays cannot move; print them too. In the
   plan view, select a tray to see its details; in Advanced, drag a tray onto
   another (or use the keyboard) to swap them, and "Lock position" / "Lock
   size" keep a tray where or as big as it is; the optimizer works around
   locks.
5. **3D view and export.** The 3D view shows the trays (it needs WebGL; the
   rest works without). "Show axes" adds a small X, Y, Z indicator that turns with the model.
   "Export all N parts" opens the export dialog over the view you are in (close it
   with Close or Escape and you are right where you were), which gives "3MF per
   part (.zip)", "One combined 3MF" or "STL files (.zip)", with a progress bar
   and a Cancel button (closing the dialog cancels a running export). A tray that
   fails to build is listed under "Not exported" with its reason, and "Retry
   failed trays" builds just those again.
6. **Assembly page.** "Open the assembly page" shows the packing order (bottom
   layer first), an exploded picture of all the parts, a numbered picture per layer, a "What goes where" table, PNG
   download per layer and "Print / save as PDF".
7. **Save and share.** Projects autosave in the browser. "Copy link" puts the
   whole project in the `#1.` link (the project menu offers JSON download
   when the link is too long), "Save to file" saves the project as a file, and
   "Open from file…" opens a file as a separate project (a file whose id and
   content match a stored project just opens that project; one whose id
   matches a different project opens as a copy). When another tab changes the
   project you are editing, autosave pauses until you choose which version to
   keep.

If you change the inputs after a layout was made, the layout stays and an
"Inputs changed since this plan was made — update the plan?" notice points
at the "Update plan" button; the plan is greyed and badged "Out of date"; export and the assembly page are off, and the 3D view keeps
showing the last layout, until you do. A layout whose geometry version is on an older line than
the app's gets a "reprint the whole insert" notice: its trays no longer mate
with trays exported now.

## Look

The redesign's tokens live in `src/styles/tokens.css`: page, sheet, ink, muted, rule, edge, box
and focus colours, one fill/line/ink triple per component kind (cards blue, bits amber, tiles
green, miniatures rose, custom violet), the hatched spacer, spacing, radii and the two typefaces.
Light is the default; a warm dark set redefines the same names under
`prefers-color-scheme: dark` (screen only, so printing stays on white). Text keeps 4.5:1 and
edges 3:1 against their ground in both, and `src/style.test.ts` checks it. Every focusable
element gets a 3 px `--focus` outline (`:focus-visible` in `tokens.css`).

`shadeOf(kind, index)` in `src/ui/identity.ts` gives each component of a kind its own shade of
the kind's hue (`light-dark(…)` colours, so one inline style follows the scheme; `shadeHex`
gives plain hex per scheme for canvas and 3D). `src/ui/identity.test.ts` checks the base
shades against the tokens and the contrast of every shade.

Headings use Bricolage Grotesque (500, 700) and everything else Figtree (400, 600, 700),
both self-hosted from `@fontsource` packages (`src/styles/fonts.css` imports only those
weights; Vite emits the files as relative assets, so `base: "./"` keeps working and the page
requests nothing from another host). Their SIL OFL licences are added to
`third-party-licenses.txt` by `licenses.config.ts`. `src/styles/proof.css` (the older `pf-`
components) stays until the new screens replace it; it reads the new tokens through a short
block of legacy names at the end of `tokens.css`. `src/style.css` holds the app's own rules.

## Architecture

| Folder          | What it does                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `model/`        | Types, defaults, validation, schema versioning, `inputsHash`                                      |
| `share/`        | `#1.` link codec, local project store, JSON files                                                 |
| `sizing/`       | Component (group) → tray requirements with variants                                               |
| `layout/`       | Optimizer (Web Worker, deterministic), `summarize`, `swapLocks`                                   |
| `geometry/`     | `TraySpec` → manifold mesh (Web Worker; only `geometry/client.ts` is imported by the page)        |
| `export/`       | 3MF / STL writers, zip, grid layout                                                               |
| `app/`          | State (`state.ts`), optimizer runner, persistence, store, export builders, mesh cache, `App.tsx`  |
| `ui/`           | Forms, component editors, rail sections, project menu, summary, export panel                      |
| `plan/`         | Top-down plan view: tiles with number, name, size and kind icon; select, drag/keyboard swap, lock |
| `viewer/`       | three.js 3D view (`scene.ts` is loaded lazily)                                                    |
| `instructions/` | Part numbering, assembly SVGs, packing order, printable page, PNG                                 |
| `licenses/`     | Builds `dist/third-party-licenses.txt` (see `licenses.config.ts`)                                 |

**Data flow.** Every edit goes through `store.edit(fn)` with a pure function
from `app/actions.ts`. If `inputsHash` changed, `app/runner.ts` waits 400 ms,
cancels any running optimization, runs `size()` and the layout worker (same
seed, warm start from the current layout) and auto-accepts the result into
`project.layout`. Every edit is an Undo/Redo step of the whole project (`app/history.ts`, up to
100, cleared when another project opens); the plan joins the history entry of the edit that
caused it, and a "Keep searching" result is a step of its own. A result whose
inputs no longer match the project is discarded. Pins are never dropped silently:
when the worker had to ignore pins (`LayoutResult.lockConflicts`), the runner does
not accept that plan. The previous plan and every pin stay, the conflicts are in
`state.lockConflicts`, and `store.unpin(trayKey)` removes a tray's locks and
re-runs. `app/persistence.ts` autosaves
(500 ms) to localStorage, tells `main.tsx` the new `#1.` link (which writes it
with `history.replaceState`), opens links and files as separate projects (a
different project with the same id becomes a copy) and pauses autosave if
another tab saved the same project.
A project with a stored layout is never re-optimized on load; if its inputs
changed, the "Inputs changed since this plan was made — update the plan?" notice
appears instead. Meshes are built on demand by the geometry worker and cached
in `app/meshes.ts`.

## How to add a component kind

1. **Model (additive schema bump):** add the interface to `src/model/types.ts`
   (roadmap §4.1), add it to the `Component` union, give it defaults in
   `newComponent()` and `KIND_NAMES` (`model/defaults.ts`), validation in
   `model/validate.ts`, and reading support in
   `model/schema-read-components.ts`. Bump `SCHEMA_VERSION`
   (`model/version.ts`) for an additive change: while MAJOR is 0 that is the
   PATCH (MINOR is breaking and needs a migration); from 1.0 on it is the
   MINOR (MAJOR is breaking). Add a fixture under `test/fixtures/schema/`.
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
   `EditorProps<YourComponent>` (simple fields first, then `<ToggleOptions …/>`,
   then extra ones inside `<MoreOptions open={advanced}>` together with
   `<CommonOptions …/>`), add a `case` to `KindEditor` in `ComponentCard.tsx`,
   and add the kind to `ADD_LABELS` in `ComponentList.tsx`. Field paths must
   match `validateProject()` so errors show next to the field.
5. **Tests:** sizing unit tests, an editor test next to the editor, and run
   `npm run build`.

## Build smoke test and its limits

`scripts/smoke-dist.mjs` serves `dist/` from `/static-web-apps/insert-generator/`
(the deploy subpath) with a tiny `node:http` server and checks that
`index.html` only uses relative URLs that load, that the layout and geometry
worker scripts and the manifold WASM exist and are referenced by name, that
nothing points at `/assets/` absolutely, and that `third-party-licenses.txt`
names every bundled library.
No browser runs the page, so it cannot prove the workers or WASM execute; do a
manual check in a real browser (import a fixture from `test/fixtures/`, export,
open the link) before a release.

`vite.config.ts` sets `base: "./"` for subpath hosting and defines
`__APP_VERSION__` from `package.json` and `__BUILD_ID__` (the short git SHA, `-dirty` for
uncommitted changes, `unknown` when git is unavailable; `build-id.config.ts`). The footer shows both
as `v0.2.0 (2a2ec02)`. The build id is display-only and is never written to a project or hashed.
TypeScript strictness comes from
[`tsconfig.base.json`](tsconfig.base.json). `tsconfig.json`
checks the browser code in `src/` (no Node types); `tsconfig.node.json` checks
the config files that run in Node. `npm run typecheck` runs both.

## Publishing

This app is published to GitHub Pages through
[igorzamyslov/static-web-apps](https://github.com/igorzamyslov/static-web-apps),
where it is a git submodule at `apps/insert-generator`. A new version goes live
when that repo's submodule pointer is bumped to a commit of this one.

### Releasing

Before bumping the submodule pointer, bump `version` in `package.json` (the footer and every saved
project's `createdWith` read it). The footer's build id shows the commit even if you forget, but
`createdWith` does not, so do not skip it. This is separate from `SCHEMA_VERSION` and
`GEOMETRY_VERSION`, which change when the file format or the printed geometry does, not on a
release; a release that changed either also bumps the app version (see spec §9). While 0.x, bump
MINOR for features and breaking changes, PATCH for fixes.
