# UI/UX review, 2026-10-23: decisions and plan

Handoff for another session. Nothing here is built yet. The owner said: **wait with the build** until
they say go.

- Design canvas (private, owner's Claude account): https://claude.ai/artifact/8s6vXTfDzCbmhSRGug1mwe
- The same boards as files, readable without that link: `docs/design/ux-review-2026-10-23/*.dc.html`
  (open `canvas.json` for the index; styles in `review.css`). They are review boards drawn with
  simple stand-in shapes, not pixel specs. Treat each as the layout and the words, not exact radii.
- Screenshots of today's app (1440 × 900 unless noted): `shots/`. Made with
  `npm run shots -- <state>`; the state names are in `scripts/design/states.mjs`.

## Rules that apply to every task

1. **Top and 3D must behave the same.** Same header, same caption row, same controls in the same
   place. Only the picture and one view-specific control ("Spread apart") differ. Never anchor a
   control to a tray in the picture (the camera moves); dock it.
2. Follow `docs/DEVELOPMENT.md` → "UI work": each task links its board, layout first, deletions listed,
   screenshots at 1440 and 390 set beside the board, owner sees the running app after the first
   screen and waits for a nod.
3. Words need a ruling in `docs/DESIGN.md` (decision log). Record each change there in the same commit.
4. Bump `package.json` version in every PR. No `Co-Authored-By` trailers.
5. Do not add controls the engine can't honour (see "Not possible today").

## Decisions

| # | Board | Decision | Board file |
|---|---|---|---|
| 1 | Stage header | One toolbar row: status (with sub-line) left, Top/3D switch and ⋯ right. The hint ("Tap a tray…") becomes the caption under the plan. "Keep searching" leaves the toolbar and becomes **"Try another arrangement"** in the ⋯ menu; while it runs the status line reads "Searching… Stop". "Spread apart" is the only view-specific control: right end of the caption row in 3D, empty in Top. In 3D the model grows to fill the stage column. | `Stage.dc.html` |
| 2 | Layers | **Option A:** one segment `Layer 1 \| Layer 2 \| All` with identical labels and meaning in both views. "Layer n" shows layers 1 to n: Top lights layer n and ghosts the ones below; 3D peels off the ones above. The "(bottom)/(top)" words drop out of the labels (the caption names them). The vertical strip (option B) is parked: it would need a second layout on a phone. | `Layers.dc.html` |
| 3 | Item list | **Dropped. No change.** Owner is still thinking. Do not build pills, grouping by layer, or chips. | `Rail.dc.html` (reference only) |
| 4 | Tray actions | **Docked toolbar** at a fixed place (bottom centre of the stage), identical in Top and 3D and on a phone. Primary: Edit. ⋯ holds Keep here (pin), Rotate 90°, Swap places with…, Keep this size, each with a one-line effect. Facts (layer, size, print time) are the dock's label, not an action row. Selecting a tray never shifts the layout. | `TrayBar.dc.html` |
| 5 | Item editor | **Option 3:** keep today's first screen (name, count, size as a select that shows the dimensions, sleeves), then summary rows (Reach, Shape, Room, Copies and group) that open in place, each showing its current value and a "changed" mark. Reuses the existing disclosure rows. | `Editor.dc.html` |
| 6 | Does not fit | **Pinned problem strip** in the status row, never scrolls away, same in Top and 3D: "<tray> doesn't fit yet" plus how far off it is, primary "Edit <tray>", secondary "Try another arrangement". The failing tray is marked the same way in both views (in 3D it sticks out of its slot). Quick fixes with numbers are later (they need trial runs, Phase 3). | `NoFit.dc.html` |
| 7 | Settings | **Option 2:** "This insert" as the drawer's page, switches on the left of their labels, "Exact numbers" and "My printer" become pages you open with a back button. No print profiles. | `Settings.dc.html` |
| 8 | Download | **Option 2:** a per-layer print plan (tray pills collapse to "+ n", time and grams per layer), one primary button, Packing guide and Other formats below, support as a text line. | `Download.dc.html` |
| 9 | Phone | **Option 3:** the list sheet peeks as one row of item chips (tap a chip to select its tray; swipe up for the full list). The layer segment from board 2 sits under the plan. | `Mobile.dc.html` |

## Suggested order

1. Boards 1 and 6 together (6 builds on 1's status row). Owner sees the running app, then waits for a nod.
2. Board 2 (layer segment) and board 4 (dock).
3. Board 5, then 7, 8, 9.

## Open or parked

- **Board 3:** owner is thinking; do not touch.
- **Layer lock** (force an item onto a layer): not possible today. See below. Parked as its own task.
- **3D size:** the model is small in a large stage today; board 1 covers it, check at 1440 and 1920.
- The no-fit screenshot at 1440 × 900 shows the stage scrolled with the heading off-screen. It may be a
  quirk of the shots script, so reproduce it by hand before treating it as a bug.

## Not possible today

There is no layer lock. The lock kinds in `src/model/types.ts` are `position`, `size`, `stack` and `turn`.
Pin fixes a tray's place (and so its layer); layers are otherwise chosen by the optimizer. A `level`
lock and "To the other layer" are listed as Phase 3, item 4 in `docs/DESIGN.md`, to ship with "Keep it
next to" in one schema bump. Until then do not draw or build a control that implies you can move an
item between layers.

## Findings the boards answer (with the screenshot that shows each)

1. Three rows above the plan, about 210 px (`shots/workspace.app.png`).
2. Layers behave differently in Top and in 3D (`shots/workspace-3d.app.png`).
3. Item list reads as one colour (dropped).
4. Five tray controls and jargon (`shots/workspace-tray-more.app.png`).
5. Editor is one long scroll (`shots/editor-more.app.png`, `editor-more-changed.app.png`).
6. No-fit loses its explanation (`shots/no-fit.app.png`).
7. Settings mixes two jobs (`shots/settings.app.png`).
8. Download repeats the list (`shots/download.app.png`, `packing-guide.app.png`).
9. Phone sheet covers the plan (`shots/m-workspace.app.png`, `m-edit.app.png`).
