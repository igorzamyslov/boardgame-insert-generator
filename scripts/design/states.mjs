// scripts/design/states.mjs
// Every screen state the screenshot harness can reach, and the board it is judged against.
// Later UI tasks add their states here. `npm run shots -- <state>…` runs the named ones.
//
//   board      the board file without ".dc.html" (docs/design/boards)
//   boardOpts  renderBoard options for the board variant: { props, state }
//   boardCrop  a region name (regions.mjs): the board is judged by that part of it only
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
//      | { press: key }
//      | { wait: ms }  a pause, for what has no mark to wait on (the 3D view building its meshes)

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const MENU = { click: { role: "button", name: /^Project menu/ } };
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
  "first-visit": { board: "Empty", viewport: DESKTOP, seed: null },
  // The plan is the hero: at 1440×900 its box is at least 560 px wide (Main's is 582).
  workspace: {
    board: "Main",
    viewport: DESKTOP,
    seed: "harbour-kings",
    minPlanWidth: 560,
    noStageScroll: true,
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
      { click: { role: "button", name: "Pin" } },
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
  editor: {
    board: "Edit",
    boardOpts: { props: { moreOpen: false } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: /^Market deck, /, in: '[data-region="rail"]' } }],
  },
  box: {
    board: "Box",
    viewport: DESKTOP,
    seed: "harbour-kings-headroom",
    steps: [{ click: { role: "button", name: /^The box/, in: '[data-region="rail"]' } }],
  },
  "no-fit": {
    board: "NoFit",
    viewport: DESKTOP,
    seed: "harbour-kings-nofit",
    steps: [MAKE_NEW_PLAN, { waitFor: { text: FIT_YET, timeout: 90_000 } }],
  },
  "pin-conflict": {
    board: "PinConflict",
    viewport: DESKTOP,
    seed: "harbour-kings-pins",
    steps: [MAKE_NEW_PLAN, { waitFor: { text: /fit with/, timeout: 90_000 } }],
  },
  settings: {
    board: "Settings",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [MENU, { click: { role: "button", name: "Settings" } }],
  },
  download: {
    board: "Export",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: "Download" } }],
  },
  exporting: {
    board: "Exporting",
    boardOpts: { state: { phase: "building", p: 10 } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    holds: ["export"],
    steps: [
      { click: { role: "button", name: "Download" } },
      { click: { role: "button", name: /Download (the )?3MF/ } },
      { waitFor: { role: "progressbar" } },
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
  "m-start": { board: "MobileStart", viewport: PHONE, seed: null },
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
  "m-fix": {
    board: "MobileFix",
    viewport: PHONE,
    seed: "harbour-kings-nofit",
    steps: [MAKE_NEW_PLAN, { waitFor: { text: FIT_YET, timeout: 90_000 } }],
  },
  "m-box": {
    board: "MobileBox",
    viewport: PHONE,
    seed: "harbour-kings-headroom",
    steps: [{ click: { role: "button", name: /^The box/, in: '[data-region="sheet"]' } }],
  },
};
