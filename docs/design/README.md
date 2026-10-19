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

## The kit gallery

`/kit.html` (`npm run dev`) shows every primitive of `src/kit` in each state the boards draw:
blocked, pressed, error, each tone. `npm run shots -- kit kit-phone` draws it at 1440 and 390
beside the nearest boards. It is served in dev and shots mode only; `vite build` builds just
`index.html`.

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
- `<state>.numbers.md`: header height, rail width, plan width and the first h1, board against app,
  then the status row's parts (icon, h1, line, the Layer and View switches, the action, the
  banner; a part neither side has is no row); `≠` marks a difference over 1 px, or a metric one
  side lacks. Under it a "Console errors" section lists what the page logged as an error while the
  state was shot (`console.error` and uncaught page errors), or "none".
- `<state>.failed.png` when a step could not find its target; the state is then listed as FAILED.
- A state may also fail for what it measures (`states.mjs`): `noPageScroll` (the page scrolls),
  `noStageScroll` (the stage scrolls: the plan's box shrinks to what the stage has left, so on a
  desktop it must not) and `minPlanWidth` (the plan's box is narrower than that many px at the
  state's size).

**Console errors fail the run.** Any `console.error` or uncaught page error during a state
makes it FAILED (and `npm run shots` exit non-zero), unless the state lists the message in its
`expectedErrors` (a string the message contains, or a RegExp; empty by default). The last line of
the run says which states had errors ("console errors in 2 states: a (1), b (3)") or "console errors:
none". The helpers are `scripts/design/consoleErrors.mjs` (tested). Only the app's page is listened to
(from its first load to the end of the probes), not the page the board is drawn on.

Board PNGs and seeds are committed; app shots are not, until the final pairs (Task 17) are.

The `fit-3d` probe (`workspace-3d-wide`: the wide seed, a box wider than it is tall) turns the 3D
camera over and under by dragging the canvas, with "Spread apart" at 0, half and full, and reads
`__shotsScene.framing()` after each turn: a corner of the box or of a part outside the frame (a value
over 1) fails the state.

A state may name `probes` (`scripts/design/shots.mjs`): checks that need Chromium, run after the
pictures. `m-tray-more` probes the phone's native dialog: Escape with More open closes only More,
and a press on the backdrop closes the sheet.

`settings-keys` and `m-settings-keys` (1440×900 and 390×844) open Settings with the keyboard alone
(Tab to the project menu's button, Enter, Tab to Settings, Enter) and run the `settings-keys` probe:
the focus starts in the drawer; Tab stays on the drawer's controls and comes round from the last to
the first, and Shift+Tab from the first goes to the last; the page behind is inert (nothing outside
the drawer takes the focus, a click on the rail does nothing); Escape closes the drawer; and the
focus goes back to the project menu's button (the menu hands the focus to its button before
Settings opens, and the dialog hands it back to whatever had it). A native modal `<dialog>` does not
wrap the focus inside the page: Tab past the last control goes to the browser's own interface (the
body in a headless run) and the next Tab comes back to the first control. The probe accepts that one
step and fails only a focus that lands on the page behind the drawer. Each check's verdict is printed
under the state in the run's output (`keys: pass …`); a focus that falls to the body in the middle of the trap counts as the browser step, so only a drawer that comes round every time passes; `scripts/design/keys.mjs` judges it (tested).

`box-nofit` and `m-box-nofit` have the box editor open over the no-fit seed (Heroes is 80 mm in a 70 mm box):
the editor tells the problem in a line ("The Heroes tray doesn't fit yet" with how far the closest
plan is short), above the fields on a phone and above the side view on a desktop. No board draws
the editor with the problem: Box and MobileBox are the nearest, and NoFit's status line is the
words.

When `workspace` and `workspace-searching` both run, `scripts/design/jump.mjs` compares the header,
the rail, the status row and the plan box (`data-region="plan-box"`): none may move or change
size by more than 1 px, or the run fails ("Keep searching" turning into
"Stop" must not shift the page). `workspace` is compared with `workspace-3d` (the 3D view holds the
plan's caption line, so the frame has the same height) and with `workspace-tray` (the slot over the
plan is as tall as the tray bar, `--stage-slot-bar`, so choosing a tray moves nothing). With a
swap chosen (`workspace-swap`) the box is where `workspace` has it: the prompt lies over the box.
`workspace-tray` and `workspace-3d-selected` (a tray chosen, then 3D) are compared with no slide allowed,
and `workspace-1920` against `workspace-3d-1920` and `workspace-tray-1920`: at 1920×1080 the plan is at its
900 px cap (`--plan-max`). The board is drawn at 1440 only, so the 1920 pairs show Main for reference and
their numbers differ by design. `workspace-rail-wide` has the rail dragged to 420 px (a state's `storage`
sets the prefs entry before the app starts). `workspace-rail-wide-1024` (1024×768, rail at 480) fails when the stage is not beside the rail with 360 px (`stageBesideRail`).

The board renderer adds `a{color:inherit}` ahead of a board's own styles: some boards have links
with no colour set (MobileWorkspace's sheet rows), which a browser draws blue, and no board means that.

## Shots mode

`vite --mode shots` sets `import.meta.env.MODE` to `"shots"`. Two places in the app then wait on a
promise the harness leaves pending, so a screenshot catches them mid-way without a race:

- the build in the Download dialog stays at "1 of N" (`export`, `src/ui/ExportPanel.tsx`);
- a "Keep searching" run stays running (`search`, `src/app/runner.ts`).

`src/app/shotsHold.ts` holds this. Vite folds the mode in at build time, so a production build
carries none of it, and `scripts/smoke-dist.mjs` fails if `__shotsHold` is found in `dist`.

The 3D scene also offers a read-only window in shots mode, `globalThis.__shotsScene`
(`src/viewer/shotsScene.ts`): each tray's emissive colour and its colour against its own full colour, by key, which a canvas cannot tell. The
`selection-parity` probe reads it (`workspace-3d-selected`: a tray chosen in Top, then 3D; the bar
and rail row stay, the other trays' colours moved toward the page's while the selected tray's did not, pointing at or focusing another row keeps its trays full and fades the rest (and changes the canvas's
pixels), closing the bar leaves every tray at full colour, and Top still has the tray selected). It needs WebGL: without it the probe has nothing to
check and the state notes the fallback. The same smoke check fails if `__shotsScene` is found in `dist`.

## Adding a state

Add it to `scripts/design/states.mjs`: its board (and the `boardOpts` that make the board show the
same state), the viewport, a seed, and the steps. A step is a click on a role and name, a text typed into the box with a label (`fill`), a wait for something
to show (`waitFor`), a pause (`wait`: milliseconds), a key, or Tab until a control has the focus (`tabTo`: role, name,
optional `in` and `max`, for a state reached by keyboard alone). A page other than the app's own is a `url` (`/kit.html`, the kit gallery), and a page that
scrolls is drawn whole with `fullPage: true`. A board that draws several screens side by side (EditKinds) names the one a state is judged by with
`boardCrop`: `{ rail: "main section:nth-of-type(2)" }` crops the board's rail to that selector. Give the screen's regions `data-region` attributes as
the screen is built.
