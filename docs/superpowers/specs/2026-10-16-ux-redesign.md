# UX redesign: one welcoming screen

Status: design, not built. The mockups live on a private design canvas:
<https://claude.ai/artifact/Jis1JDmfF8N6GTqdhaKNLW> (board names below refer to it).

## Why

The current app works but reads as a technical tool: a dark palette, an accordion rail, a
Simple/Advanced switch, all-caps stats, paragraphs of explanation and a small plan. The redesign
keeps the engine and changes how people meet it.

## Principles

1. **The box is the hero.** One workspace: what's inside on the left, the box drawn large on the
   right. Every other screen opens from the workspace and returns to it in the same state.
2. **Detail on request.** No Simple/Advanced mode. Plain choices first; exact numbers sit behind
   "More options" and "Exact numbers".
3. **Say little, and only when it helps.** No explanations for steps the person already
   understands by the time they get there (for example, nothing about slicers on the download
   screen).
4. **Trays have names, not numbers.** A tray is known by what it holds, its kind colour and icon.
5. **Your choices are promises.** Pins, layer choices and turns stay as set when the plan updates;
   when they block a fit, the app says which ones and offers to drop one.
6. **Measurements stay visible.** mm, g and h are shown as they are; no cute conversions.
7. **Never claim what we can't guarantee** (no "opens in any slicer").

## Decisions

| Decision                                                                                                                                            | Instead of                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Light, warm palette; Bricolage Grotesque headings, Figtree body                                                                                     | Dark technical theme                                                                |
| Kind colours: cards blue, tokens and dice amber, tiles green, miniatures pink, each component its own shade of its kind's hue; spacers hatched grey | One of 8 tints per component                                                        |
| Layers labelled "Layer 1 (bottom)" … "Layer n (top)" (up to 4; a layer is a level within each stack, so it has no single height)                    | "Layer N" radios                                                                    |
| Printer (bed, margin, layer height) is a preference in this browser, used by new inserts                                                            | Printer stored per insert                                                           |
| Turning a tray pins its stack; swapping pins both stacks; both show as chips                                                                        | Hidden locks                                                                        |
| Default download: one combined 3MF; per-part zip and STL under "Other formats"                                                                      | Format choice up front                                                              |
| Sharing by project file (Save file, Open file; phone: Send file via the share sheet)                                                                | `#1.` share links (about 2000 characters, too long for some browsers and chat apps) |
| Engrave the tray name, shortened to fit                                                                                                             | Engraved part numbers                                                               |
| Part build failure is a rare bug: shown only when it happens                                                                                        | A designed retry path                                                               |
| "Keep searching" runs a longer search from the current plan                                                                                         | "Update plan" / "Keep searching" pair, "Find a better fit", "Try a tighter layout"  |

## Screens

Desktop (fluid, 1440 design width; phone order below 760 px, full-screen dialogs below 600 px):

| Board             | Screen                                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty             | First visit                            | Measure the box, pick a kind, or start from an example. Field errors say what, why, what to do ("Use 70 mm").                                                                                                                                                                                                                                                                                                                                                                                        |
| Main              | Workspace                              | List with rule chips (each with ×), box card, layer switch (Bottom layer · 40 mm / Top layer · 26 mm), box drawn large, tray bar (Pin, Turn 90°, To the other layer, Edit; one line says why an action is blocked), "Keep searching" with Stop, project menu. Only "plan out of date" is a banner (it blocks download); "changed in another tab" and "older version" show as a dot on the menu with their choices inside it (Tweak: notice). Kind icons appear only on the hovered or selected tray. |
| Edit              | Edit a component                       | Basics, then More options opening in the same panel: room for expansions, how often you reach for it, cards stand, tray shape, keep it next to, card thickness (one pile per player for multi-deck components). Each change shows a short note over the box for a few seconds; the collapsed row summarises the options.                                                                                                                                                                             |
| EditKinds         | Tokens and dice, tiles, something else | The editors not covered by Edit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Box               | Change the box                         | Inside size, space kept free on top (whole or part), stored on its side.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Settings          | Settings sheet                         | Two tabs. This insert: how trays sit (fit, walls, finger room, rim, fill to the lid), exact numbers with search, per-value reset, "N changed", live "Still fits" footer. My printer (applies to every insert): bed size, printer details, printing options (do not move trays).                                                                                                                                                                                                                      |
| NoFit             | Doesn't fit                            | Names the tray and the reason; offers fixes with their outcome.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PinConflict       | Pins block a fit                       | "Unpin one", each option with its outcome.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Export, Exporting | Download                               | Parts, filament, print time, one primary button, packing guide, other formats, a quiet "Support it" line with Ko-fi (ko-fi.com/igorzamyslov) and PayPal (paypal.me/igorzamyslov), as in the chore app; building shows a bar, a part list only on failure.                                                                                                                                                                                                                                            |
| Flow              | Flow map                               | Workspace as hub.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Phone (390 × 844): MobileStart, MobileWorkspace (box first; a bottom sheet with just the list, the box first),
MobileTray (tray sheet), MobileEdit (miniatures editor), MobileDownload, MobileFix, MobileBox.

Not drawn yet: packing guide (desktop, phone, print), the "Your inserts" list.

## Words

| Use                                                      | Not                                     |
| -------------------------------------------------------- | --------------------------------------- |
| tray                                                     | part (except in the download list), bin |
| spacer                                                   | filler, loose spacer                    |
| Pin, Pinned, Unpin                                       | lock, keep, placement, let go           |
| Tokens and dice, Miniatures (kind), figures (the pieces) | bits, minis                             |
| What's inside                                            | components, things                      |
| Keep searching                                           | find a better fit, tighter layout       |
| Rim between layers, Removable dividers                   | locking rim, loose dividers             |

## Accessibility and touch

Real buttons, links and labels; `aria-pressed` on toggles; a visible 3 px focus ring; keyboard
focus mirrors hover; icons are SVG, never text characters; every control at least 44 px; text
4.5:1, tray edges and icons 3:1 against the box; number fields use `inputmode`.

## What the engine can and can't do

Checked against the code on 2026-10-16. "Exists" means UI work only.

| Feature in the design                                                             | Engine today                                                                                                   | Work                                                                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Pin a tray                                                                        | Position lock (`Lock.position`); pinning a stacked tray locks its whole stack (`app/actions.ts`)               | Exists                                                                                                    |
| Turn 90°                                                                          | Only as part of a position lock (`rotated`); turning therefore pins the stack                                  | Exists, with that behaviour                                                                               |
| Swap two trays                                                                    | `swapLocks` swaps whole stacks and pins them                                                                   | Exists                                                                                                    |
| Lock a tray's size                                                                | `Lock.size`                                                                                                    | Exists                                                                                                    |
| Pins that conflict                                                                | The engine drops them and posts a notice (`pruneDroppedLocks` on every run)                                    | Small to medium: report conflicts and keep the pins                                                       |
| Keep searching, with progress and Stop                                            | `store.refit()` runs the "improve" search: about 3× the budget, warm-started, kept only if the score is better | Exists                                                                                                    |
| Box headroom (whole/part), stored on side                                         | `Box.headroom`, `headroomCoverage`, `storedOnSide`                                                             | Exists                                                                                                    |
| One pile per player, room for expansions, how often you reach for it, cards stand | `perPlayer`, `growth`/`separators`/`dividers`, `access` (often/sometimes/setup), `storage`                     | Exists                                                                                                    |
| Settings presets mapped to numbers, "N changed"                                   | `settings.ts` choice tables, diff against defaults                                                             | Exists                                                                                                    |
| Project files, open as copy, other-tab conflict                                   | `share/`, `app/persistence.ts`                                                                                 | Exists                                                                                                    |
| Saved status                                                                      | Autosave exists; no exposed "saved" signal                                                                     | Small                                                                                                     |
| Undo and redo of any edit                                                         | One-step undo of the layout only (`undoSlot`); after an edit it leaves the plan stale; no redo                 | Small to medium: snapshot history in `store.edit`, coalesced with the runner's result                     |
| Reasons a tray can't move or turn                                                 | Lock-drop reasons exist only after a run                                                                       | Small to medium: a dry-run of `resolveLocks`                                                              |
| Engraved tray names                                                               | Only digits have glyphs (`geometry/glyphs.ts`); names are not unique today (`partLabel`)                       | Medium: a unique naming rule, letter glyphs, a shortening rule, `engraveNames` replacing `engraveNumbers` |
| Move a tray to the other layer / keep it on a layer                               | Layers are derived from stacks (`plan/layers.ts`); no layer lock                                               | Large: a new lock kind, schema and hash bump, move-set enforcement                                        |
| Keep it next to                                                                   | Grouping merges components into one tray; no adjacency                                                         | Large (or approximate with grouping)                                                                      |
| Fix suggestions with outcomes; "Unpin one" with outcomes                          | No suggestion generator; one optimizer run per candidate                                                       | Medium to large; show "Checking…" while trial runs go                                                     |
| Live "Still fits" preview in Settings                                             | No side-run API                                                                                                | Medium; approximate first, exact later                                                                    |
| 3D on phones                                                                      | `viewer/scene.ts` resizes; needs WebGL                                                                         | Adapt                                                                                                     |

Order (decided 2026-10-16): foundations first (undo history, unique names engraved on parts, pins never dropped silently, printer preference), then the new screens, then trial runs, fix suggestions, live settings preview, layer lock and keep-next-to. Plan: `docs/superpowers/plans/2026-10-16-ux-redesign.md`.

Since `origin/main` a8e3875, a growing deck stands in a wider well; a spacer is printed only when `separators` is set, so the editor says "Leaves room to grow" and offers a removable spacer separately. Since 2a2ec02, "One thick wall instead of a spacer" (`oneWall`) lives in Settings, This insert.

## Open questions

- Spacer names (proposed: "Spacer by <neighbour>") and several trays of one component (proposed: "<name> 1", "<name> 2"); confirm when Phase 1 Task 3 lands.
- Duplicate and bulk edit of components.
- Whether to drop: show axes, slack per axis, lock size.
