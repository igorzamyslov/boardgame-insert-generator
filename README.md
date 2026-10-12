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

1. **Describe the box and the printer** (inner size, bed size), then **add
   components**: cards ("Add cards"), bits such as tokens, cubes and dice
   ("Add bits"), tiles, miniatures and other items. A Simple / Advanced switch
   shows or hides the extra fields (each editor's "More options").
2. **Per component toggles.** Every editor has "Finger cuts" (a cut through a
   wall of each compartment, to reach in) and, for bits, miniatures and other
   items, "Curved floor" (a scoop ramp). "Corner reliefs" (round holes in the
   compartment corners, so square pieces sit flat) shows in Advanced mode. Each
   toggle starts at the default of its kind and writes an explicit value when
   changed. Under Settings, the "Extra finger room in the box" switch leaves
   extra room beside the walls and dividers for fingers.
3. **Bulk fallback.** When no tray variant can give a tiles, miniatures
   (pockets) or other item a finger cut, its pieces are stored loose in a bin
   with a curved floor instead. The editor says so, and what the bin has.
4. **Layout.** The optimizer runs on its own 400 ms after you stop editing and
   shows the fill, the trays, the stacks, an upper bound for the weight and the
   play per axis. "Re-optimize", "Improve more" and "Undo layout" (one step)
   are in the summary. In the plan view, drag a tray onto another (or use the
   keyboard) to swap them, and "Lock position" / "Lock size" keep a tray where
   or as big as it is; the optimizer works around locks.
5. **3D view and export.** The 3D view shows the trays (it needs WebGL; the
   rest works without). Export gives "3MF per part (.zip)", "One combined 3MF"
   or "STL files (.zip)", with a progress bar and a Cancel button. A tray that
   fails to build is listed under "Not exported" with its reason, and "Retry
   failed trays" builds just those again.
6. **Assembly page.** "Open the assembly page" shows the packing order (bottom
   layer first), a numbered picture per layer, a "What goes where" table, PNG
   download per layer and "Print / save as PDF".
7. **Save and share.** Projects autosave in the browser. "Copy link" puts the
   whole project in the `#1.` link (the project menu offers JSON download
   when the link is too long) and "Import JSON…" opens a file as a separate
   project.

If you change the inputs after a layout was made, the layout stays and an
"Inputs changed since this layout was made — re-optimize?" notice offers
"Re-optimize now". A layout whose geometry version is on an older line than
the app's gets a "reprint the whole insert" notice: its trays no longer mate
with trays exported now.

## Architecture

| Folder          | What it does                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `model/`        | Types, defaults, validation, schema versioning, `inputsHash`                                     |
| `share/`        | `#1.` link codec, local project store, JSON files                                                |
| `sizing/`       | Component (group) → tray requirements with variants                                              |
| `layout/`       | Optimizer (Web Worker, deterministic), `summarize`, `swapLocks`                                  |
| `geometry/`     | `TraySpec` → manifold mesh (Web Worker; only `geometry/client.ts` is imported by the page)       |
| `export/`       | 3MF / STL writers, zip, grid layout                                                              |
| `app/`          | State (`state.ts`), optimizer runner, persistence, store, export builders, mesh cache, `App.tsx` |
| `ui/`           | Forms, component editors, project menu, summary, export panel                                    |
| `plan/`         | Top-down plan view with select, drag/keyboard swap and lock                                      |
| `viewer/`       | three.js 3D view (`scene.ts` is loaded lazily)                                                   |
| `instructions/` | Part numbering, assembly SVGs, packing order, printable page, PNG                                |
| `licenses/`     | Builds `dist/third-party-licenses.txt` (see `licenses.config.ts`)                                |

**Data flow.** Every edit goes through `store.edit(fn)` with a pure function
from `app/actions.ts`. If `inputsHash` changed, `app/runner.ts` waits 400 ms,
cancels any running optimization, runs `size()` and the layout worker (same
seed, warm start from the current layout) and auto-accepts the result into
`project.layout`, keeping the previous layout for one-step Undo. A result whose
inputs no longer match the project is discarded. `app/persistence.ts` autosaves
(500 ms) to localStorage, writes the `#1.` link with `history.replaceState`,
opens links and files as separate projects (a different project with the same
id becomes a copy) and pauses autosave if another tab saved the same project.
A project with a stored layout is never re-optimized on load; if its inputs
changed, the "Inputs changed since this layout was made — re-optimize?" notice
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
(the deploy subpath) with a tiny `node:http` server and checks that `index.html` only uses relative
URLs that load, that the layout and geometry worker scripts and the manifold
WASM exist and are referenced by name, that nothing points at `/assets/`
absolutely, and that `third-party-licenses.txt` names every bundled library.
No browser runs the page, so it cannot prove the workers or WASM execute; do a
manual check in a real browser (import a fixture from `test/fixtures/`, export,
open the link) before a release.

`vite.config.ts` sets `base: "./"` for subpath hosting and defines
`__APP_VERSION__` from `package.json`. TypeScript strictness comes from
[`tsconfig.base.json`](tsconfig.base.json). `tsconfig.json`
checks the browser code in `src/` (no Node types); `tsconfig.node.json` checks
the config files that run in Node. `npm run typecheck` runs both.

## Publishing

This app is published to GitHub Pages through
[igorzamyslov/static-web-apps](https://github.com/igorzamyslov/static-web-apps),
where it is a git submodule at `apps/insert-generator`. A new version goes live
when that repo's submodule pointer is bumped to a commit of this one.
