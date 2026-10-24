# Changelog

What changed in Insert Generator, version by version, for the people who use it. Newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/): each version lists
what was Added, Changed and Fixed. Versions released after this changelog was added are also releases on GitHub with the same
notes; earlier versions are recorded here only.

New entries go under "Unreleased" until a version is cut; see "Changelog and releases" in
`docs/DEVELOPMENT.md`.

## [Unreleased]

## [0.23.3] - 2026-10-24

### Fixed

- **Your inserts is tidier.** A long insert name now ends in an ellipsis instead of running under
  its button, and Delete is a small grey trash icon on each row instead of a red "Delete…" link
  (it turns red when you point at it, and still asks before it deletes). Two inserts with the same
  name show when each was last edited, so you can tell them apart.

## [0.23.2] - 2026-10-24

### Fixed

- **Copies that grow no longer leave a crack between trays.** When identical copies took the
  spare room into their wells, a plan could end up with a sliver of room too thin for a spacer
  between two trays instead of at the end of the row, so the trays no longer sat flush. That
  sliver now stays at the end of the row.

## [0.23.1] - 2026-10-24

### Fixed

- **Copies face the same way, so the spare room is one spacer.** In a group with several copies
  (like Faction in the Scythe box), one copy could stand turned a quarter turn from the others.
  It left a thin sliver of room beside it as a spacer of its own, and the room at the end of the
  row became a second one. Copies are now turned together, so the room gathers in one thicker
  spacer. Pressing Try another arrangement fixes a plan you already have. Turning one copy now turns
  the others with it, where they can follow.

## [0.23.0] - 2026-10-24

### Added

- **A chamfered grip on spacers.** A spacer wedged beside a tray now has a sloped edge along its
  top, up to 5 mm across, where it touches the tray, so a fingertip can get in and lift the tray
  out. It replaces the rounded finger dip. Trays still mate with parts you printed before; print
  a spacer again only if you want the new grip.
- **Rim between layers is one choice.** Off, Auto, Rim and groove, or Stepped base. New inserts
  start with Auto, which plans with both joints and keeps the better plan; the plan says which
  one it used. Projects you saved keep the joint they had.
- **Names in a clearer font, on the well floor too.** Names are cut in Overpass Bold, sized
  8, 6, 5 or 4 mm to fit the room on a face. A name is also engraved on the floor of each well,
  so you can tell the trays apart once their contents are out, and the name underneath is a
  flat recess that prints cleanly. Trays still mate with parts you printed before.
- **The no-fit bar says what the real limit is.** When something does not fit, one bar stays
  pinned over the plan and names the cause, for example "Heroes needs 103.7 mm of height. The
  box has 70 mm." The room the items need overall only leads when that is the reason.
- **A docked tray toolbar.** Select a tray and its toolbar sits at the bottom centre of the
  stage, the same in the top view, in 3D and on a phone. Edit is the main button.
- **Item chips on the phone.** The folded list sheet is one row of chips, one for each item or
  group, in its own colour, instead of a title and the first rows.

### Changed

- **The ⋯ menu appears only when it adds something.** A tray whose actions are all on screen
  already has no menu; the no-fit bar has none.
- **No fit is shown over the normal plan,** in the top view and in 3D alike, instead of on a
  screen of its own that scrolled its explanation away.

## [0.22.1] - 2026-10-24

### Fixed

- **Hidden notes stay hidden.** When two notes of the same kind were under the plan (for example
  two stacks that only fit in one order), hiding the second brought the first one back. Each note
  you hide now stays hidden until its own words change.

## [0.22.0] - 2026-10-24

### Added

- This changelog, and a release page on GitHub for every version, with the same notes.

## [0.21.0] - 2026-10-24

### Added

- **Space on top over part of the box.** "Part of it" now keeps free only the area you give it,
  not the whole top. Trays can reach the lid everywhere else.
- **Dividers for flat decks.** Between groups of flat decks, a plate with finger cuts keeps each
  group apart and easy to lift out.
- **Hide the notes under the plan.** Notes and warnings can be hidden, so the plan has the room.
- **Download by layer.** The Download dialog is now a print plan for each layer, with the weight
  of each part in grams.

### Changed

- **Room is shared in a stack.** When trays stand on each other, the spare height is shared
  among them instead of being left in one tray.
- **Split parts of one item can stack in any order.**

## [0.20.2] - 2026-10-24

### Changed

- Updated a library the app is built on (Preact). Nothing changes in how the app works.

## [0.20.1] - 2026-10-24

### Changed

- Behind the scenes only: automatic dependency updates now pass the project's own checks. The
  app is unchanged.

## [0.20.0] - 2026-10-24

### Added

- **Room for more.** Each item has one "Room for more cards" (or tiles, or pieces) choice:
  None, Some, or As much as fits. It replaces the separate growth controls for each direction.
- **Fill the space that's left.** One insert-wide choice for leftover space: Separate spacers
  (the default), Bigger wells, Thicker walls or One thick wall.

### Changed

- **A tray never grows on its own.** Planning starts from natural sizes, plus the room you
  asked for, and growth is the last step. Every gap is then a spacer the plan counts, instead
  of free growth that hid how much room was wasted.
- **Where the room lies.** Trays are packed together and the spare room goes to the end of the
  row, against the box wall, or to the trays that are meant to grow.
- **Copies stay alike.** When a set of copies grows, every copy grows by the same amount.
- Plans saved by an older version show "Make a new plan" once, because they were made with the
  old way of growing. Items you set to grow are converted to the closest new choice.

## [0.19.0] - 2026-10-23

### Changed

- **Each group has a colour of its own**, in the plan, the tray bar, the list, the Download
  chips, the packing guide and the 3D view. Groups were all white and hard to tell apart.

## [0.18.0] - 2026-10-23

### Changed

- **Copies are alike.** All copies of an item or group print at the same size with the same
  wells, wherever they stand, so any copy can take another's place.
- **A split is even.** An item is split into trays that divide its entries evenly (four entries
  go 2 and 2, or 1 and 1 and 1 and 1), never 2, 1 and 1.
- When a stack cannot afford the joint between copies, the plan says so, for example "The top
  Faction tray has no rim, so the Faction trays only stack in this order."

## [0.17.0] - 2026-10-23

### Changed

- **The top of the stage is one toolbar row**: the status on the left, Top and 3D with a "Plan
  options" menu on the right.
- **One Layer switch for Top and 3D**: Layer 1, Layer 2, All, with the same meaning in both
  views. Top lights the layer you pick and ghosts the ones below; 3D peels off the ones above.
  The item editor has the same switch.
- "Keep searching" is now "Try another arrangement", and reads "Searching… Stop" while it runs.

## [0.15.0] - 2026-10-23

Version 0.16.0 was skipped; 0.15.0 and 0.17.0 follow each other.

### Added

- **Figures can lie down.** Figures lie on any side, their pockets turn to suit, and a figure
  can be kept upright when it should not.
- **Put on…** stands one tray on another, with a dry run first, an "On" chip, and Take off.
- **Thin walls.** A choice of 1.0 mm walls, floors and dividers.
- **Packing for loose pieces.** Each item of loose pieces has its own packing factor.

### Changed

- **The no-fit screen says how much room the items need** against the box, and the card takes
  the focus without cutting the top of the plan off.
- **Folded parts are one joined shape** when a riser with a rim is folded in, with no notch at
  the seams.

## [0.14.0] - 2026-10-23

### Changed

- **Small chits and markers no longer stand upright where a finger cannot reach their cut.**
  Upright storage is offered only where the cut is at least 15 mm wide, a fingertip. Smaller
  pieces lie flat with a floor notch, or go in a scoop. Setting Upright yourself still works,
  with a warning.

## [0.13.0] - 2026-10-23

### Added

- **A floor notch for flat items.** Boards, custom items and miniatures under 20 mm tall get a
  full-depth finger cut with a notch you can get under. Before, a 2 mm board got a cut too
  shallow to use.
- **Finger dips beside trays.** A U-shaped dip is cut into a spacer wherever it touches a tray,
  so the tray can be lifted.
- **"Taking it out" in the packing guide.** Each layer's table has a Lift column, says which
  parts have no grip of their own, and lists the parts in the order that always works: top
  layer first, each table from its last row up.

### Changed

- A low upper tray no longer has to be 4.45 mm tall just to fit a plain cut.

## [0.12.0] - 2026-10-23

### Added

- **A stepped base**, the other Rim between layers. In Settings, "Kind of rim" is either Rim and
  groove (as before) or Stepped base, where the upper tray has a slab that sits in the tray
  below. Its walls stay 1.6 mm thick.

## [0.11.2] - 2026-10-23

### Changed

- Behind the scenes only: automatic dependency updates raise the version themselves. The app is
  unchanged.

## [0.11.1] - 2026-10-23

### Fixed

- **Folded parts have no hole at the corner.** A part made of a riser and spacers could have a
  0.2 mm gap right through it where three pieces meet.
- **See-through trays in 3D no longer look inside out** while you edit an item.

## [0.11.0] - 2026-10-23

### Added

- **Real filament numbers.** The Download dialog counts the filament from the printed shapes,
  shell plus infill. On six inserts the totals came within 3 % of a slicer. Print time is gone.
- **The packing guide has one section per layer**, a picture and a table, and prints with each
  layer on its own page.

### Changed

- **Trays of the same deck stand on the same floor.** Height a tray has beyond its cards is
  air above them, not a thicker floor.
- **Risers carry the rim** when "Rim between layers" is on, and the tray on them gets the groove.
- Upper trays with a rim are lower: they shrink to what the groove needs and the riser takes
  the height they save.
- Saved plans show the reprint notice, because trays printed before and after this change do
  not fit together.
- The Back link and the item's name stay in place while the editor scrolls, also on a phone.
  The browser's Back closes the packing guide.

### Fixed

- A long hint no longer pushes the editor's row sideways.

## [0.10.0] - 2026-10-22

### Added

- **"Separate risers from"** setting, 3 mm by default: a raise to the lid smaller than 10 mm no
  longer stays inside the tray as a thick floor. Risers whose pocket is under 5 mm print solid.

### Changed

- **Fold risers into the joined spacers** is on by default and sits in "This insert".

## [0.9.0] - 2026-10-21

### Changed

- **Wide screens keep the work together.** The app is one centred block: the status, Layer and
  Top / 3D switches, tray bar and plan form one working column, so the controls sit next to
  what they act on.
- **The editor shares the stage** with the plan: same switches, the edited trays lit in 3D
  and the rest faded. The 3D view keeps its camera and Spread apart while you edit.
- The 3D frame is as tall as the plan, so switching between them does not jump, and the model
  stays inside its frame at any angle.

## [0.8.4] - 2026-10-21

### Changed

- Behind the scenes only: the checks run faster. The app is unchanged.

## [0.8.3] - 2026-10-21

### Fixed

- Behind the scenes only: a rare false error at the end of a test run. The app is unchanged.

## [0.8.2] - 2026-10-21

### Fixed

- **A pinned tray never moves silently.** When the pins leave no free place for the other
  trays, the plan now names the pins it had to break and why. Before, a pin could be broken
  without a word.

## [0.8.1] - 2026-10-21

### Fixed

- **One item's split trays stay in one stack** even when that costs a little more empty room.
  Fixes the Star Realms file, where one deck's three trays landed in two stacks.

## [0.8.0] - 2026-10-20

### Added

- **Columns arrangement.** Small wells are stacked front to back up to the deepest well, then
  the next column starts.

### Changed

- **Max in a group fills the group's tray.** An item on Max takes the room its group's tray
  already has and never makes the tray bigger. Saves about half the filament on the sample kit.

## [0.7.0] - 2026-10-20

### Added

- **Groups.** A group of items shares one tray per copy, with a compartment for each member.
  Groups show as framed cards in the list and have their own editor. Items move in and out by
  drag, or from the item editor (Move to group…, New group, Take out of group). A group is split
  only when one tray cannot hold it; split trays are lettered, like "Player kit 2a".
- **Copies** replaces Per player, always as separate trays.
- **Removable dividers for flat decks.** Flat decks can share one well, each with a finger cut
  through the front wall.

### Changed

- **Turn no longer pins.** Turning a tray fixes only its direction. It shows as "Turned", and
  its × lets the tray turn again.
- Older files open as they were. Plans that used per-player counts or combined decks open as
  "Make a new plan".

## [0.6.0] - 2026-10-19

### Added

- **A rail you can resize.** Drag its edge, or use the arrow keys; the width is remembered in
  this browser.

### Changed

- **The plan grows on wide screens**, up to 900 px on its longer side.
- Tablet and phone layouts were gone over: the status controls take two rows on a narrow stage
  and nothing scrolls sideways at any width.

### Fixed

- An empty band above the plan on the phone.

## [0.5.3] - 2026-10-19

### Changed

- **Split trays stay together.** The trays of one item stay in one stack whenever possible, and
  an item stays in one tray when a single tray fits.
- **Controls stay put.** A control stays where it first appeared, and a blocked control says
  why instead of vanishing.
- Decks are set up in the basics: the stepper, then "+ Another deck".

### Fixed

- Auto storage no longer misses plans that flat or upright storage finds on their own (the
  Star Realms box fits again on Auto).
- A pin on a tray that several variants share now pins the variant it fits.

## [0.5.2] - 2026-10-18

### Changed

- **The item editor shows what changed.** Every changed row has a dot and "Back to …", and
  "N changed" counts exactly those rows.
- **One choice for small gaps**: "Fill small gaps with" a spacer, thicker walls, or one thick
  wall, each with one plain line saying what it does.
- All number boxes line up on one edge.

## [0.5.1] - 2026-10-18

### Changed

- The Layer switch drives the 3D view (All, then layer 1 to k), and the editor has it too.
- A tray holding several items belongs to all of them: each row lights up and shows its layer.
- Every setting that was changed shows "Back to …".

### Fixed

- The 3D camera fits the whole model, so a long box is no longer cut off when turned.
- Layer labels no longer show a height; "Max" under Room to grow now says what it means.

## [0.5.0] - 2026-10-17

### Changed

- **The look of the app was rebuilt** from the design boards: a calm list on the side, the plan
  as the main thing, one status heading ("Everything fits"), and a tray bar with Pin, Turn 90°,
  Edit and More. Top and 3D share one selection.
- First visit, editors, box editor, fit problems, Settings and Download were each redone.
  A problem shows one honest line, like "The closest plan is 17.2 mm too tall."
- On a phone, the plan comes first and the editors go full screen.
- Projects saved by 0.4.0 open as they are.

## [0.4.0] - 2026-10-16

### Added

- **Trays have names, not numbers**, everywhere: the plan, the tray bar, 3D, the packing guide
  and the engraving (on up to three faces).
- **Undo and redo** for every edit.
- **A packing guide**, and one Download that makes a single combined 3MF file.
- **A settings sheet** with "This insert" and "My printer" tabs. The printer is remembered in
  this browser.
- **A phone layout**, with "What's inside" as a bottom sheet.

### Changed

- **Trays stack flush** (see 0.3.0): the stack no longer narrows as it rises.
- One mode: plain choices first, exact numbers behind "More options".
- Projects are files. Share links are retired, though old links still open.

## [0.3.0] - 2026-10-16

### Changed

- **Trays stack flush.** An upper tray has a groove underneath that takes the rim of the tray
  below, so a stack with a rim no longer narrows as it rises. Upper trays gain usable room, and
  boxes that need stacking fit more reliably.
- Trays printed before this version do not fit together with ones printed after it.

## [0.2.5] - 2026-10-16

Behind the scenes: library updates (Preact 11, Vite 8). The app is unchanged.

## [0.2.4] - 2026-10-16

Behind the scenes: build-tool updates. The app is unchanged.

## [0.2.3] - 2026-10-16

Behind the scenes: a newer Node.js for building the app. The app is unchanged.

## [0.2.2] - 2026-10-16

### Added

- A favicon with the four-square mark.

## [0.2.1] - 2026-10-16

### Added

- The app is published on GitHub Pages from this repository.

## [0.2.0] - 2026-10-16

### Added

- The footer shows which build you are running.

## [0.1.0] - 2026-10-11

The first version. The planner could already arrange trays and spacers in a box, stack them
with dividers, number them, and export the parts. Versions before 0.4.0 get a short line each.
