# Retrospective: the 2026-10 UX redesign shipped the old layout

## What happened

The redesign started from a design canvas: 18 boards (desktop and phone) for a calm, light, one-screen
app where the box drawing is the hero and text is rare. A spec and a two-phase plan followed, and
about 25 tasks were built by subagents, each one reviewed. Every review passed, and the final
whole-branch review checked every written rule. More than 3,200 tests passed.

When the owner first opened the running app, at the very end, the desktop screen looked like the
old app. It had the numbered accordion rail, a small plan and a wall of explanatory text under it.
Its corners, spacing and type scale were the old ones. Many pieces had improved: names instead of
numbers, the tray bar, the status line, the settings sheet, one Download and the phone layout. But
the thing the redesign was for, a screen that feels light and obvious, was not delivered.

The spec's own "Why" names the old problems as "an accordion rail … paragraphs of explanation and a
small plan". All three survived.

## Why it happened

1. **The design never reached the people building it.**
   - The canvas lived only as a link in the spec, and no task brief mentioned it (0 of 17 Phase 2
     briefs).
   - Implementers and reviewers worked from text. The chain was canvas → spec prose → plan task →
     brief, and each step dropped visual information: proportions, density, what is absent, the
     overall feel.
   - Text can say "the box is the hero". It cannot show how big.

2. **The plan edited the old screen instead of building the new one.**
   - Phase 2 was titled "New screens", but every task modified existing files. Examples: restyle
     tiles, add a status line, swap the tray details for a bar.
   - No task said "replace the workspace layout with the Main board". So the rail accordion, the
     stage proportions and the Summary block stayed, because no task owned them.
   - Removal was only done where a task tripped over something. Nothing was ever deleted for its
     own sake.

3. **"Too much text" was never made checkable.**
   - The owner's main complaint became word rules (retired terms) and "don't over-explain", a soft
     principle.
   - Tests enforced vocabulary, not volume. A paragraph of correct words passes every check.
   - The boards, which show the intended amount of text by having almost none, were not used as
     the reference.

4. **Tokens copied the colours and missed the rest of the visual language.**
   - The plan's token task listed colours only.
   - Radii (the canvas uses 12–16 px; the code kept 2/4/8), spacing, the type scale and the
     surfaces were never extracted. That is why even the light theme "doesn't feel the same".

5. **Visual checks were optional and nobody owned them.**
   - The plan said "visual checks … by hand with `npm run dev`". Some implementers glanced at one
     width. No reviewer had a browser.
   - The controller (the orchestrating session) never opened the app in about 25 tasks.
   - jsdom tests, by design, cannot see layout.

6. **Review checked conformance to the brief, not the outcome.**
   - Every review asked "does the diff do what the brief says?" Every brief was satisfied, so the
     sum looked done.
   - The final review checked the written rules, and the written rules were already lossy.
   - Nobody asked "if every task passes, will the screen look like the board?"

7. **The owner saw nothing between the design and the end.**
   - There was no checkpoint showing a running screen after the first layout work.
   - A one-minute look after the first two screens would have caught this.

8. **Throughput was optimised over fidelity.**
   - Parallel tasks, usage limits and merge logistics took the controller's attention.
   - Those are good for engineering work. For design work, the scarce resource is someone looking
     at the result.

## How to prevent it

These are now rules. See `docs/DEVELOPMENT.md` → "UI work", and `CLAUDE.md`.

1. **Designs live in the repo, and every UI brief carries its boards.**
   - Export the boards (HTML or images) into `docs/design/`.
   - Each UI task names the board(s) it implements and links them. The implementer reads the board
     before writing code.
2. **Build layout first, from the board.**
   - The first task for a screen builds its skeleton from the board markup: regions, proportions
     and what is absent.
   - Features slot into that skeleton afterwards.
   - "Modify the old screen" is not a plan for a redesign.
3. **Removal is planned work.**
   - A redesign plan lists what the boards do NOT show (old blocks, hints, paragraphs), and a task
     deletes them.
4. **Text has a budget.**
   - On-screen text matches the board. No hint, paragraph or label appears unless the board has it,
     or a ruling in `docs/DESIGN.md` adds it.
   - A test pins the visible word count per screen against a budget.
5. **Tokens cover the whole visual language.**
   - Extract radii, spacing, type scale, surfaces and shadows from the boards, not just colours.
6. **Every UI task has a visual acceptance gate.**
   - Capture screenshots at 1440 and 390 px, next to the board.
   - The reviewer looks at them in a browser and answers: does it match? What is extra? What is
     missing?
   - "By hand" is not a check. It needs an owner and an artifact.
7. **The owner sees the running app early.**
   - After the first screen is built, and at the end of each phase, show the app (a screenshot or
     a preview) and wait for a nod before continuing.
8. **Ask the outcome question in plan review and in final review.**
   - "If every task passes, will each screen look like its board?" Plan reviewers and final
     reviewers must answer it with evidence.
9. **The orchestrator opens the app at least once per phase.**

## What went right

- Engine work held up well. Undo and redo, names engraved instead of numbers, pins never dropped,
  the global printer preference, and flush stacking with engraving above the groove all landed
  correctly.
- The phone layout came closest to its boards. It was the one task framed as "build this layout".
- The rule documents, `DESIGN.md` and `DEVELOPMENT.md`, now exist and are checkable.
- The owner looked at the result before deploying a "finished" redesign.
