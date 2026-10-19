// scripts/design/states.mjs
// Every screen state the screenshot harness can reach, and the board it is judged against.
// Later UI tasks add their states here. `npm run shots -- <state>…` runs the named ones.
//
//   board      the board file without ".dc.html" (docs/design/boards)
//   boardOpts  renderBoard options for the board variant: { props, state }
//   boardCrop  { <region name (regions.mjs)>: <CSS selector in the board> }: the board is judged by
//              that part of it only, for a board that draws several screens side by side (EditKinds)
//   nearest    set when no board of its own exists: why this board is the nearest
//   viewport   the app's window; the board variant is drawn at this size too
//   seed       a docs/design/seeds name, or null for empty storage (first visit)
//   url        the page to open, relative to the dev server ("/kit.html"); the app's own by default
//   fullPage   the app is drawn in full, not just the window (a page that scrolls, like the kit gallery)
//   holds      shots-mode holds to set before the app starts ("export", "search")
//   steps      what to do before the screenshot
//   noPageScroll  the state fails when the page scrolls at its size (a review focus)
//   noStageScroll  the state fails when the stage scrolls: the plan's box shrinks instead (Task 7)
//   minPlanWidth  the state fails when the plan's box is narrower than this many px
//   planWidth     the state fails when the plan's box is not this many px wide (±1), by its computed size
//   probes        names of probes (shots.mjs PROBES) run in Chromium after the pictures; a problem fails the state
//   needsWebGL    the state draws the 3D view: without WebGL it notes the fallback and the jump check skips it
//
// Step = { click: { role, name, in? } }  click getByRole(role, { name }), inside the CSS selector `in`
//      | { waitFor: { role?, name?, text?, timeout? } }  (default 15 s)
//      | { fill: { label, value } }  type a value into the text box with that label (getByLabel)
//      | { press: key }
//      | { scrollTop: selector }  a scrolling panel back to its top
//      | { wait: ms }  a pause, for what has no mark to wait on (the 3D view building its meshes)

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const MENU = { click: { role: "button", name: /^Project menu/ } };
// The rail (Task 5) and the editor opened from it (Task 10).
const RAIL = '[data-region="rail"]';
const EDIT_MARKET = { click: { role: "button", name: /^Market deck, /, in: RAIL } };
const MORE_OPTIONS = { click: { role: "button", name: /^More options/, in: RAIL } };
// The no-fit heading: "The <name> tray doesn't fit yet" (owner decision; the board's is "<name> don't fit yet").
const FIT_YET = /tray doesn't fit yet|Not everything fits yet/;
// The banner's button (the stale seeds): a new plan, whose result the state then waits for.
const MAKE_NEW_PLAN = {
  click: { role: "button", name: "Make a new plan", in: '[data-region="banner"]' },
};
// The status heading of the stage (Task 6): the h1, its switches and its action.
const STATUS = '[data-region="status"]';
// The tray bar (Task 8), and the tray the harness selects in it.
const TRAY_BAR = '[data-region="tray-bar"]';
const SELECT_HEROES = {
  click: { role: "button", name: /^Heroes/, in: '[data-region="stage"]' },
};
const SELECT_MARKET = {
  click: { role: "button", name: /^Market deck/, in: '[data-region="stage"]' },
};

// The Settings drawer (Task 14) and the steps that give it the board's three changed values.
const DRAWER = '[data-region="drawer"]';
const SCROLL = { scrollTop: ".st-body" };
const SETTINGS_STEPS = [
  MENU,
  { click: { role: "button", name: "Settings" } },
  { click: { role: "button", name: /^Room around trays and pieces/, in: DRAWER } },
  { fill: { label: /^Box clearance/, value: "0.8" } },
  { fill: { label: /^Tray gap/, value: "0.4" } },
  { click: { role: "button", name: /^Walls and floors/, in: DRAWER } },
  { fill: { label: /^Wall \(mm\)$/, value: "1.8" } },
  SCROLL,
];

/** Seeds: a current plan each, and the ones that are stale on purpose (make-seeds.mjs). */
export const SEEDS = {
  current: ["harbour-kings", "harbour-kings-headroom", "harbour-kings-long", "harbour-kings-wide"],
  stale: [
    "harbour-kings-stale",
    "harbour-kings-notes",
    "harbour-kings-nofit",
    "harbour-kings-nofit-bed",
    "harbour-kings-pins",
  ],
};

/** @type {Record<string, any>} */
export const STATES = {
  // Empty at 1440: the page does not scroll, the h1 is the first visit's. The board's rail is 320
  // wide and Main's is 300 (a ruling), so the rail and the stage differ in width by the ruling.
  "first-visit": { board: "Empty", viewport: DESKTOP, seed: null, noPageScroll: true },
  // The board draws Height 7 with Use 70 mm; the engine has no rule for 7 mm and no value to
  // suggest (a ruling), so the app's card says what the rules say of a 0.
  "first-visit-error": {
    board: "Empty",
    nearest: "Empty, whose card is drawn with a Use 70 mm button the app does not build",
    viewport: DESKTOP,
    seed: null,
    noPageScroll: true,
    steps: [{ fill: { label: "Height", value: "0" } }, { waitFor: { role: "alert" } }],
  },
  // The plan is the hero: at 1440×900 its box is at least 560 px wide (Main's is 582).
  workspace: {
    board: "Main",
    viewport: DESKTOP,
    seed: "harbour-kings",
    minPlanWidth: 560,
    noStageScroll: true,
    probes: ["plan-gaps"],
  },
  // The tablet band: the rail stays beside the stage (Task 3 checks it; Task 15 does the pass).
  "workspace-820": {
    board: "Main",
    viewport: { width: 820, height: 1180 },
    seed: "harbour-kings",
    noPageScroll: true,
  },
  "workspace-searching": {
    board: "Main",
    boardOpts: { state: { searching: true } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    holds: ["search"],
    steps: [
      { click: { role: "button", name: "Keep searching", in: STATUS } },
      { waitFor: { role: "button", name: "Stop" } },
    ],
  },
  "workspace-banner": {
    board: "Main",
    boardOpts: { props: { notice: "outdated" } },
    viewport: DESKTOP,
    seed: "harbour-kings-stale",
    noStageScroll: true,
  },
  "workspace-banner-notes": {
    board: "Main",
    boardOpts: { props: { notice: "outdated" } },
    viewport: DESKTOP,
    seed: "harbour-kings-notes",
    noStageScroll: true,
  },
  // A box that is not square (400 × 285 mm): its longer side is 582 px wide, as a square box's is.
  "workspace-wide": {
    board: "Main",
    nearest: "no board of its own: Main's box frame, wider than it is tall",
    viewport: DESKTOP,
    seed: "harbour-kings-wide",
    planWidth: 582,
    noStageScroll: true,
  },
  // The 3D view: three.js in the plan's frame. Main's own 3D is a CSS tilt of the flat box.
  "workspace-3d": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest: "no board of its own: Main's box frame and segments",
    viewport: DESKTOP,
    seed: "harbour-kings",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: STATUS } }, { wait: 3000 }],
  },
  // A long box in 3D (feedback on 0.5.0, point 10): the camera fits it however it is turned and spread.
  "workspace-3d-wide": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest: "no board of its own: Main's box frame and segments, with a wider box",
    viewport: DESKTOP,
    seed: "harbour-kings-wide",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: STATUS } }, { wait: 3000 }],
    probes: ["fit-3d"],
  },
  // One selection for both views (parity): a tray chosen in the top view, then the 3D view. Its bar
  // stays and the tray's rail row is pressed; the probe also points at another row and checks the
  // canvas changed, and goes back to Top to check the selection is still there.
  "workspace-3d-selected": {
    board: "Main",
    boardOpts: { state: { view: "3d", sel: "market" } },
    nearest: "no board of its own: Main's box frame, segments and tray bar",
    viewport: DESKTOP,
    seed: "harbour-kings",
    needsWebGL: true,
    steps: [SELECT_MARKET, { click: { role: "button", name: "3D", in: STATUS } }, { wait: 3000 }],
    probes: ["selection-parity"],
  },
  "workspace-menu": {
    board: "Main",
    boardOpts: { state: { menu: true } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [MENU],
  },
  // The project menu on a phone: no board of its own, judged against Main's menu panel (its `menu` crop).
  "workspace-menu-phone": {
    board: "Main",
    boardOpts: { state: { menu: true } },
    nearest: "no board of its own: Main's menu panel",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [MENU],
  },
  // Your inserts, a page of the same panel.
  inserts: {
    board: "Main",
    boardOpts: { state: { menu: true } },
    nearest: "no board of its own: Main's menu panel",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [MENU, { click: { role: "button", name: /^Your inserts/ } }],
  },
  // The tray bar (Task 8): a tray selected. The plan's box keeps the size it has with nothing selected (jump check).
  "workspace-tray": {
    board: "Main",
    boardOpts: { state: { sel: "market" } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    planWidth: 582,
    noStageScroll: true,
    steps: [SELECT_MARKET],
  },
  // More open: its panel of Swap with… and Lock size. No board draws it.
  "workspace-tray-more": {
    board: "Main",
    boardOpts: { state: { sel: "market" } },
    nearest: "no board of its own: Main's tray bar and menu panel",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [SELECT_MARKET, { click: { role: "button", name: "More", in: TRAY_BAR } }],
  },
  // A swap under way: More stays open on the pressed Swap with…, and the slot says what to do.
  "workspace-swap": {
    board: "Main",
    boardOpts: { state: { sel: "market" } },
    nearest: "no board of its own: Main's tray bar",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      SELECT_MARKET,
      { click: { role: "button", name: "More", in: TRAY_BAR } },
      { click: { role: "button", name: "Swap with…", in: TRAY_BAR } },
      { waitFor: { text: /Choose the tray to swap with/ } },
    ],
  },
  // A spacer: a swatch, its name, one line and Close. The seed's spacers are on its top layer.
  "workspace-tray-spacer": {
    board: "Main",
    boardOpts: { state: { sel: "spacerBottom" } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: /^Layer 2/, in: STATUS } },
      { click: { role: "button", name: /^Spacer/, in: '[data-region="stage"]' } },
    ],
  },
  // The Add pill's picker: no board of its own, judged against Empty's kind tiles (its `kind-picker` crop).
  "workspace-add": {
    board: "Empty",
    nearest: "no board of its own: Empty's kind tiles",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: "Add", in: '[data-region="rail"]' } }],
  },
  // A pin: its chip beside the row, and the note with Clear all my choices (Main's `pins` state).
  "workspace-rules": {
    board: "Main",
    boardOpts: { state: { pins: { market: { x: 0, y: 0, layer: "bottom" } } } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: /^Market deck/, in: '[data-region="stage"]' } },
      { click: { role: "button", name: /^Pin this/ } },
      // the pin makes the plan stale and the rail loses its layers; they are back with the new plan
      { waitFor: { role: "button", name: /^Market deck, .*bottom layer/ } },
    ],
  },
  "workspace-long": {
    board: "Main",
    nearest: "no board of its own: judged against Main",
    viewport: DESKTOP,
    seed: "harbour-kings-long",
    noPageScroll: true,
    noStageScroll: true,
  },
  // Edit with More options folded, and open (the board's own default).
  editor: {
    board: "Edit",
    boardOpts: { props: { moreOpen: false } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [EDIT_MARKET],
  },
  "editor-more": {
    board: "Edit",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [EDIT_MARKET, MORE_OPTIONS],
  },
  // One deck, then "+ Another deck" pressed: the stepper turns into the deck list where it stood
  // (the owner's rule, 0.5.3: a control stays where it first appeared). The board has no such line.
  "editor-decks": {
    board: "Edit",
    boardOpts: { props: { moreOpen: false } },
    nearest:
      'Edit with a second deck added: the board draws one deck and no "+ Another deck" under the stepper',
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [EDIT_MARKET, { click: { role: "button", name: "+ Another deck", in: RAIL } }],
  },
  // The same on a tall window (the rail scrolls in a 900 px one): Corner holes turned on, so a chip, and
  // the Extra room row opened, show the changed dot and "Back to <default>" beside the Market deck's own.
  "editor-more-changed": {
    board: "Edit",
    nearest:
      "Edit's open More options, with the changed dots and ways back the board does not draw",
    viewport: { width: 1440, height: 1500 },
    seed: "harbour-kings",
    steps: [
      EDIT_MARKET,
      MORE_OPTIONS,
      { click: { role: "button", name: /^Corner holes/, in: RAIL } },
      { click: { role: "button", name: /^Extra room/, in: RAIL } },
    ],
  },
  // A deck that lies flat: Spacer plates and Dividers (and the Removable dividers chip) stay, blocked, each
  // with its reason (the owner's rule, 0.5.3). The board has them only as open rows.
  "editor-blocked": {
    board: "Edit",
    nearest:
      "Edit's open More options, with the blocked spacer plates and dividers the board does not draw",
    viewport: { width: 1440, height: 1700 },
    seed: "harbour-kings",
    steps: [
      EDIT_MARKET,
      MORE_OPTIONS,
      { click: { role: "button", name: "Flat", in: RAIL } },
      { waitFor: { text: "Flat decks have no dividers." } },
    ],
  },
  // Sleeves: Custom chosen, which opens the sleeve's three numbers under the segments, seeded with its size.
  "editor-sleeves": {
    board: "Edit",
    boardOpts: { props: { moreOpen: false } },
    nearest: "Edit with Sleeves on Custom: the board has three segments and no sleeve numbers",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      EDIT_MARKET,
      { click: { role: "button", name: "Custom", in: RAIL } },
      { waitFor: { text: "Sleeve outer width" } },
    ],
  },
  // EditKinds draws the other three editors side by side: each is judged by its own section.
  "editor-tokens": {
    board: "EditKinds",
    boardCrop: { rail: "main section:nth-of-type(1)" },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: /^Coins and cubes, /, in: RAIL } }],
  },
  "editor-tiles": {
    board: "EditKinds",
    boardCrop: { rail: "main section:nth-of-type(2)" },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: /^Hex tiles, /, in: RAIL } }],
  },
  // Something else: the seed has none, so one is added and filled in as the board has it.
  "editor-custom": {
    board: "EditKinds",
    boardCrop: { rail: "main section:nth-of-type(3)" },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: "Add", in: RAIL } },
      { click: { role: "button", name: "Something else" } },
      { fill: { label: "Name", value: "Player boards" } },
      { fill: { label: "Width mm", value: "230" } },
      { fill: { label: "Depth mm", value: "150" } },
      { fill: { label: "Height mm", value: "3" } },
      { fill: { label: "Number of items", value: "4" } },
    ],
  },
  // Miniatures on a desktop: no board draws it. Edit's layout, MobileEdit's content.
  "editor-minis": {
    board: "Edit",
    nearest: "no board of its own: Edit's layout, MobileEdit's content",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: /^Heroes, /, in: RAIL } }],
  },
  // The box's editor (Task 11): the rail's panel and the side view, which is the page's h1 ("Side view of the box").
  box: {
    board: "Box",
    viewport: DESKTOP,
    seed: "harbour-kings-headroom",
    noPageScroll: true,
    steps: [
      { click: { role: "button", name: /^The box/, in: '[data-region="rail"]' } },
      { waitFor: { role: "heading", name: "Side view of the box" } },
    ],
  },
  // The box editor with decimals in the three sizes (the rail's fields are 80 px: "285.5" must not clip).
  "box-decimal": {
    board: "Box",
    nearest: "Box, with 285.5 mm where the board has 285",
    viewport: DESKTOP,
    seed: "harbour-kings-headroom",
    noPageScroll: true,
    probes: ["field-clip"],
    steps: [
      { click: { role: "button", name: /^The box/, in: '[data-region="rail"]' } },
      { waitFor: { role: "heading", name: "Side view of the box" } },
      { fill: { label: "Width", value: "285.5" } },
      { fill: { label: "Length", value: "285.5" } },
      { fill: { label: "Height", value: "70.5" } },
      { wait: 600 },
    ],
  },
  // The rail's box card with a four-digit box (polish: it stays on one line, or is cut with an ellipsis).
  "workspace-wide-box": {
    board: "Main",
    nearest: "Main, with a 1000 × 1000 × 100 mm box where the board has 285 × 285 × 70",
    viewport: DESKTOP,
    seed: "harbour-kings-headroom",
    steps: [
      { click: { role: "button", name: /^The box/, in: '[data-region="rail"]' } },
      { waitFor: { role: "heading", name: "Side view of the box" } },
      { fill: { label: "Width", value: "1000" } },
      { fill: { label: "Length", value: "1000" } },
      { fill: { label: "Height", value: "100" } },
      { wait: 400 },
      { click: { role: "button", name: "Done", in: '[data-region="rail"]' } },
      { wait: 400 },
    ],
  },
  // NoFit (Task 12): the closest attempt of a failed search (box height: Heroes 80 mm), the culprit
  // tray marked, and the panel of what the engine can do. The seed holds no result (the store keeps
  // none), so the state asks for a new plan and waits for the run.
  "no-fit": {
    probes: ["plan-gaps"],
    board: "NoFit",
    viewport: DESKTOP,
    seed: "harbour-kings-nofit",
    noPageScroll: true,
    steps: [MAKE_NEW_PLAN, { waitFor: { text: FIT_YET, timeout: 90_000 } }],
  },
  // The bed variant: a tray no print bed orientation holds ("It's too big for your printer's bed.").
  "no-fit-bed": {
    probes: ["plan-gaps"],
    board: "NoFit",
    viewport: DESKTOP,
    seed: "harbour-kings-nofit-bed",
    noPageScroll: true,
    steps: [MAKE_NEW_PLAN, { waitFor: { text: FIT_YET, timeout: 90_000 } }],
  },
  // PinConflict (Task 12): the plan the runner kept, the pins whole, and the column "Unpin one".
  "pin-conflict": {
    probes: ["plan-gaps"],
    board: "PinConflict",
    viewport: DESKTOP,
    seed: "harbour-kings-pins",
    noPageScroll: true,
    steps: [MAKE_NEW_PLAN, { waitFor: { text: /fit with/, timeout: 90_000 } }],
  },
  // Settings (Task 14): the drawer, opened from the project menu. The board shows three values
  // changed (the wall, and two of "Room around things"), so the steps change the same: Box clearance
  // and Tray gap, then the wall (Walls and floors is the group left open, as the board has it).
  settings: {
    board: "Settings",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: SETTINGS_STEPS,
  },
  // My printer: the bed, Printer details folded, Printing; the board's `{ tab: "printer" }`. The
  // steps change the same three values first, so the header says "3 changed" as the board's does.
  "settings-printer": {
    board: "Settings",
    boardOpts: { state: { tab: "printer" } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      ...SETTINGS_STEPS,
      { click: { role: "button", name: "My printer", in: DRAWER } },
      SCROLL,
    ],
  },
  // The printer tab's parts the board does not draw, judged against its printer tab: Printer
  // details open with My own size (the three sizes, margin, layer height, folding risers) ...
  "settings-printer-details": {
    board: "Settings",
    boardOpts: { state: { tab: "printer" } },
    nearest: "Settings' printer tab: Printer details drawn open (the board draws the row closed)",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      MENU,
      { click: { role: "button", name: "Settings" } },
      { click: { role: "button", name: "My printer", in: DRAWER } },
      { click: { role: "button", name: "My own size", in: DRAWER } },
      SCROLL,
    ],
  },
  // ... and the row "This insert uses another printer" (my printer is made Medium, so the insert's
  // Large bed differs), which the board does not draw.
  "settings-printer-other": {
    board: "Settings",
    boardOpts: { state: { tab: "printer" } },
    nearest: "Settings' printer tab, with the row for another printer (owner decision) above it",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      MENU,
      { click: { role: "button", name: "Settings" } },
      { click: { role: "button", name: "My printer", in: DRAWER } },
      { click: { role: "button", name: "Medium, 220 mm", in: DRAWER } },
      { waitFor: { text: "This insert uses another printer" } },
      SCROLL,
    ],
  },
  // The group the board does not draw: "Spacers and space", opened.
  "settings-spacers": {
    board: "Settings",
    nearest: "Settings' open group card, with the group the board does not draw",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      MENU,
      { click: { role: "button", name: "Settings" } },
      { click: { role: "button", name: /^Spacers and space/, in: DRAWER } },
      SCROLL,
    ],
  },
  // "Fill small gaps with" on Thicker walls: the choice, what it does, the wall thickness box under it
  // (right-aligned like every number box) and the way back.
  "settings-spacers-walls": {
    board: "Settings",
    nearest: "Settings' open group card, with the group the board does not draw, on Thicker walls",
    viewport: { width: 1440, height: 1500 },
    seed: "harbour-kings",
    steps: [
      MENU,
      { click: { role: "button", name: "Settings" } },
      { click: { role: "button", name: /^Spacers and space/, in: DRAWER } },
      { click: { role: "button", name: "Thicker walls", in: DRAWER } },
    ],
  },
  // The same drawer on a phone: full screen, the board drawn at 390.
  "m-settings": {
    board: "Settings",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: SETTINGS_STEPS,
  },
  // Export (Task 13): the dialog opened from the header. Export draws "Other formats" open; the
  // app folds it, so the state opens it too.
  download: {
    board: "Export",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: "Download" } },
      { click: { role: "button", name: "Other formats" } },
    ],
  },
  // Exporting, building: the build stays at "1 of N" (the export hold, shotsHold.ts).
  exporting: {
    board: "Exporting",
    boardOpts: { state: { phase: "building", p: 10 } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    holds: ["export"],
    steps: [
      { click: { role: "button", name: "Download" } },
      { click: { role: "button", name: "Download the 3MF file" } },
      { waitFor: { role: "progressbar" } },
    ],
  },
  // Exporting, done: no hold; the real build runs to its end (the geometry worker, up to 120 s).
  "exporting-done": {
    board: "Exporting",
    boardOpts: { state: { phase: "done", p: 100 } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: "Download" } },
      { click: { role: "button", name: "Download the 3MF file" } },
      { waitFor: { role: "heading", name: /parts are ready/, timeout: 120_000 } },
    ],
  },
  // The packing guide (Task 13): no board draws it; Export's cards, type and spacing are the nearest.
  "packing-guide": {
    board: "Export",
    nearest:
      "no board of its own: Export's cards (14 px radius, 1 px line), Bricolage titles and 13 px captions",
    viewport: DESKTOP,
    seed: "harbour-kings",
    fullPage: true,
    steps: [
      { click: { role: "button", name: "Download" } },
      { click: { role: "button", name: /^Packing guide/ } },
      { waitFor: { role: "heading", name: /packing guide$/ } },
    ],
  },
  // The kit gallery (kit.html): every primitive in each state, judged against the controls of the
  // boards it repeats (Main's menu and status heading, Empty, Edit, Settings).
  kit: {
    board: "Main",
    boardOpts: { state: { menu: true } },
    nearest: "no board of its own: the controls of Main, Empty, Edit and Settings",
    viewport: DESKTOP,
    seed: null,
    url: "/kit.html",
    fullPage: true,
  },
  "kit-phone": {
    board: "MobileWorkspace",
    nearest: "no board of its own: the controls of MobileWorkspace",
    viewport: PHONE,
    seed: null,
    url: "/kit.html",
    fullPage: true,
  },
  // MobileStart: the h1, the two steps, the foot as a bar at the bottom of the screen; no page scroll.
  "m-start": { board: "MobileStart", viewport: PHONE, seed: null, noPageScroll: true },
  "m-workspace": { board: "MobileWorkspace", viewport: PHONE, seed: "harbour-kings" },
  // The tray sheet (Task 8): a modal dialog; the other trays are at half behind it.
  "m-tray": {
    board: "MobileTray",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [SELECT_HEROES],
  },
  "m-tray-more": {
    board: "MobileTray",
    nearest: "no board of its own: MobileTray's tiles, with the menu panel over them",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [
      SELECT_HEROES,
      { click: { role: "button", name: "More", in: '[data-region="sheet"]' } },
    ],
    // the native dialog, which jsdom cannot run: Escape closes only More, a press on the backdrop closes the sheet
    probes: ["tray-sheet"],
  },
  "m-edit": {
    board: "MobileEdit",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: /What's inside/ } },
      { click: { role: "button", name: /^Heroes, /, in: '[data-region="sheet"]' } },
    ],
  },
  "m-download": {
    board: "MobileDownload",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: "Download" } }],
  },
  // The packing guide on a phone: one column, a card for each tray (no board: MobileDownload's cards are the nearest).
  "m-packing-guide": {
    board: "MobileDownload",
    nearest: "no board of its own: MobileDownload's cards and captions",
    viewport: PHONE,
    seed: "harbour-kings",
    fullPage: true,
    steps: [
      { click: { role: "button", name: "Download" } },
      { click: { role: "button", name: /^Packing guide/ } },
      { waitFor: { role: "heading", name: /packing guide$/ } },
    ],
  },
  // MobileFix (Task 12): the heading, the attempt and the peek sheet "Ways to make it fit".
  "m-fix": {
    board: "MobileFix",
    viewport: PHONE,
    seed: "harbour-kings-nofit",
    steps: [MAKE_NEW_PLAN, { waitFor: { text: FIT_YET, timeout: 90_000 } }],
  },
  // Pins in the way on a phone: no board draws it; MobileFix's sheet is the nearest (titled "Unpin one").
  "m-pin-conflict": {
    board: "MobileFix",
    nearest: 'MobileFix, whose sheet holds the cards of pins in the way ("Unpin one") on a phone',
    viewport: PHONE,
    seed: "harbour-kings-pins",
    steps: [MAKE_NEW_PLAN, { waitFor: { text: /fit with/, timeout: 90_000 } }],
  },
  // MobileBox: the sheet fills the screen; its h1 is "The box" and the side view is under the fields.
  "m-box": {
    board: "MobileBox",
    viewport: PHONE,
    seed: "harbour-kings-headroom",
    steps: [
      { click: { role: "button", name: /^The box/, in: '[data-region="sheet"]' } },
      { waitFor: { role: "heading", name: "The box" } },
    ],
  },
};
