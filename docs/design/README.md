# Design boards and the screenshot harness

The UI rebuild is built from these boards, so each screen can be set beside its board. Rules:
[`docs/DEVELOPMENT.md`](../DEVELOPMENT.md) → "UI work".

## What is here

- `boards/*.dc.html` are the design canvas's boards (custom elements, inline handlers). `canvas.json`
  indexes them. Do not reformat them: their whitespace is part of the text.
- `boards/png/` are the boards drawn to images at 1:1: `<Board>.png` at the board's own size, and
  `<Board>--<state>.png` for each state in `scripts/design/states.mjs` (its board, with the
  options that state needs). Committed.
- `seeds/` are what the app's `localStorage` holds for each "Harbour Kings" state the screenshots
  start from. Committed. Never edit one by hand.

## `npm run seeds`

Makes `seeds/<name>.json` with the real optimizer (the runner's seed and budget, the worker's 30 s
cap), from the fixture in `src/test-support/harbourKings.ts`. A rerun gives the same files (every
index entry's `updatedAt` is pinned). Seeds for a plan that is not current on purpose:
`harbour-kings-stale`, `-notes`, `-nofit`, `-pins`. The last two also have a `.result.json`, the
fresh run's result, because the store cannot keep a failed search (it lives in memory only): their
screenshots click "Make a new plan" and wait for it. The script runs the same search first and
stops when the outcome is not the one the state needs, printing the counts it tried. Then edit the
fixture's count and run it again. A seed that goes stale (the inputs or the geometry version
changed) fails the seed tests and the screenshots with "run npm run seeds".

## `npm run shots`

`npm run shots` draws every board and runs every state. `npm run shots -- <state>… [--out <dir>]`
runs the named ones; with `--boards` it only redraws the board PNGs. It starts `vite --mode shots` on a free port and stops it when it ends. It
needs Chromium: `npx playwright install chromium` once.

The default out folder is `.superpowers/sdd/2026-10-16-ui-rebuild/shots/` (not committed). Per state:

- `<state>.app.png`: the app's window.
- `<state>.pair.png`: the board above the app, both at 1:1, a labelled gap between.
- `<state>.<region>.pair.png`: the same for each region found in both. A region in the board is
  found by `scripts/design/regions.mjs`; in the app it is the element with `data-region="<name>"`.
- `<state>.numbers.md`: header height, rail width, plan width and the first h1, board against app;
  `≠` marks a difference over 1 px, or a metric one side lacks.
- `<state>.failed.png` when a step could not find its target; the state is then listed as FAILED.

Board PNGs and seeds are committed; app shots are not, until the final pairs (Task 17) are.

The board renderer adds `a{color:inherit}` ahead of a board's own styles: some boards have links
with no colour set (MobileWorkspace's sheet rows), which a browser draws blue, and no board means that.

## Shots mode

`vite --mode shots` sets `import.meta.env.MODE` to `"shots"`. Two places in the app then wait on a
promise the harness leaves pending, so a screenshot catches them mid-way without a race:

- the build in the Download dialog stays at "1 of N" (`export`, `src/ui/ExportPanel.tsx`);
- a "Keep searching" run stays running (`search`, `src/app/runner.ts`).

`src/app/shotsHold.ts` holds this. Vite folds the mode in at build time, so a production build
carries none of it, and `scripts/smoke-dist.mjs` fails if `__shotsHold` is found in `dist`.

## Adding a state

Add it to `scripts/design/states.mjs`: its board (and the `boardOpts` that make the board show the
same state), the viewport, a seed, and the steps. A step is a click on a role and name, a wait, or
a key. Give the screen's regions `data-region` attributes as the screen is built.
