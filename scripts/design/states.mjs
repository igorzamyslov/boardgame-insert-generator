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
//   storage    extra localStorage entries (key -> JSON text) set over the seed's, e.g. the prefs entry
//   url        the page to open, relative to the dev server ("/kit.html"); the app's own by default
//   fullPage   the app is drawn in full, not just the window (a page that scrolls, like the kit gallery)
//   holds      shots-mode holds to set before the app starts ("export", "search")
//   steps      what to do before the screenshot
//   noPageScroll  the state fails when the page scrolls at its size (a review focus)
//   noStageScroll  the state fails when the stage scrolls: the plan's box shrinks instead (Task 7)
//   minPlanWidth  the state fails when the plan's box is narrower than this many px
//   stageBesideRail  the state fails when the stage is not beside the rail (it wrapped under it) or is under 360 px wide
//   planWidth     the state fails when the plan's box is not this many px wide (±1), by its computed size
//   probes        names of probes (shots.mjs PROBES) run in Chromium after the pictures; a problem fails the state
//   needsWebGL    the state draws the 3D view: without WebGL it notes the fallback and the jump check skips it
//   expectedErrors  console.error messages the state expects: a string the message contains, or a
//                 RegExp. Any other error the page logs (or an uncaught one) fails the state. Empty by default.
//
// Step = { click: { role, name, in? } }  click getByRole(role, { name }), inside the CSS selector `in`
//      | { waitFor: { role?, name?, text?, timeout? } }  (default 15 s)
//      | { fill: { label, value } }  type a value into the text box with that label (getByLabel)
//      | { tabTo: { role, name, in?, max? } }  press Tab until the focus is on that control (keyboard-only states)
//      | { press: key }
//      | { scrollTop: selector }  a scrolling panel back to its top
//      | { wait: ms }  a pause, for what has no mark to wait on (the 3D view building its meshes)

const DESKTOP = { width: 1440, height: 900 };
const WIDE = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };
// What the app keeps per browser (src/share/prefs.ts): the rail's width, as the handle leaves it.
const PREFS_RAIL_480 = { "insert-generator:prefs": JSON.stringify({ railWidth: 480 }) };
const PREFS_RAIL_420 = { "insert-generator:prefs": JSON.stringify({ railWidth: 420 }) };

const MENU = { click: { role: "button", name: /^Project menu/ } };
// The rail (Task 5) and the editor opened from it (Task 10).
const RAIL = '[data-region="rail"]';
const EDIT_MARKET = { click: { role: "button", name: /^Market deck, /, in: RAIL } };
// The owner's Star Realms (a tall box): WideStage2's own insert; its second item is the Starter deck.
const EDIT_STARTER = { click: { role: "button", name: /^Starter deck, /, in: RAIL } };
const MORE_OPTIONS = { click: { role: "button", name: /^More options/, in: RAIL } };
// The no-fit heading: "The <name> tray doesn't fit yet" (owner decision; the board's is "<name> don't fit yet").
const FIT_YET = /tray doesn't fit yet|Not everything fits yet/;
// The banner's button (the stale seeds): a new plan, whose result the state then waits for.
const MAKE_NEW_PLAN = {
  click: { role: "button", name: "Make a new plan", in: '[data-region="banner"]' },
};
// The status heading of the stage (Task 6): the h1, its switches and its action.
const STATUS = '[data-region="status"]';
// The Layer and Top / 3D switches' row under it (0.9.0: they no longer share the heading's row).
const SWITCHES = '[data-region="switches"]';
// The kit seeds (Task 9 and after): a tray of the Player kit in the plan (called "Player kit 2" since Task 10),
// and the group's header in the rail.
const PLAN_KIT_2 = {
  click: {
    role: "button",
    name: /^Player kit 2/,
    in: '[data-region="stage"]',
  },
};
// the card's header: its name is the group's ("Player kit, 4 copies"), and opens the group's editor (Task 11)
const KIT_HEADER = { click: { role: "button", name: "Player kit, 4 copies", in: RAIL } };
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

// Settings opened by keys alone: the project menu's button, Enter, its Settings item, Enter.
const KEYS_TO_SETTINGS = [
  { tabTo: { role: "button", name: /^Project menu/ } },
  { press: "Enter" },
  { tabTo: { role: "button", name: "Settings", in: "#project-menu" } },
  { press: "Enter" },
  { waitFor: { role: "heading", name: "Settings" } },
];

/** Seeds: a current plan each, and the ones that are stale on purpose (make-seeds.mjs). */
export const SEEDS = {
  current: [
    "harbour-kings",
    "harbour-kings-headroom",
    "harbour-kings-long",
    "harbour-kings-wide",
    "harbour-kings-kit",
    "harbour-kings-kit-loose",
    "harbour-kings-kit-split",
    "harbour-kings-flat",
    "star-realms",
  ],
  stale: [
    "harbour-kings-stale",
    "harbour-kings-notes",
    "harbour-kings-errors",
    "harbour-kings-nofit",
    "harbour-kings-nofit-bed",
    "harbour-kings-pins",
  ],
};

/**
 * The Star Realms states of WideStage2: "star-<width>-<top|3d>" (normal) and "star-<width>-edit-<top|3d>"
 * (the Starter deck's editor open). The 3D ones switch the View and wait for the meshes.
 */
function starStates() {
  const out = {};
  const sizes = { 2400: { width: 2400, height: 1300 }, 1440: DESKTOP };
  const to3d = [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }];
  for (const [width, viewport] of Object.entries(sizes)) {
    for (const mode of ["normal", "edit"]) {
      for (const view of ["top", "3d"]) {
        const name = `star-${width}-${mode === "edit" ? "edit-" : ""}${view}`;
        out[name] = {
          board: "WideStage2",
          boardOpts: { props: { width, mode, view } },
          viewport,
          seed: "star-realms",
          noPageScroll: true,
          // the 3D frame fills the working column (900 px), whatever the box's shape
          ...(view === "3d" ? { needsWebGL: true, planWidth: 900 } : {}),
          // the edited item's trays stand out, with the model closed up (0.9.0 review)
          ...(view === "3d" && mode === "edit" ? { probes: ["edit-3d-contrast"] } : {}),
          steps: [...(mode === "edit" ? [EDIT_STARTER] : []), ...(view === "3d" ? to3d : [])],
        };
      }
    }
  }
  return out;
}

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
  // The plan is the hero: at 1440×900 its box is at least 550 px wide (0.9.0: the switches have a row of
  // their own, as WideStage2 draws it, so the frame is 560 px at 1440×900 where Main's was 582).
  workspace: {
    board: "Main",
    viewport: DESKTOP,
    seed: "harbour-kings",
    minPlanWidth: 550,
    noStageScroll: true,
    probes: ["plan-gaps"],
  },
  // 1920×1080: the plan's frame grows to 900 px (owner decision C, 2026-10-19). The board is drawn at 1440
  // only, so the pair shows Main for reference and the numbers differ by design.
  "workspace-1920": {
    board: "Main",
    nearest: "Main at 1440: the board is not drawn at 1920, so its numbers differ by design",
    viewport: WIDE,
    seed: "harbour-kings",
    minPlanWidth: 730,
    noStageScroll: true,
    probes: ["plan-gaps"],
  },
  // 0.9.0 (WideStage2): at 2400 the app is one centred block, 1600 px at most, the page behind it; in the
  // stage the heading with Keep searching beside it, the switches, the tray bar and the frame are one
  // 900 px column. The board draws the owner's Star Realms (a tall box); the seed is Harbour Kings, so
  // the frame's shape and the words differ by design, the layout does not.
  "workspace-2400": {
    board: "WideStage2",
    boardOpts: { props: { width: "2400", mode: "normal", view: "top" } },
    nearest: "WideStage2 at 2400: the board's insert is Star Realms, the seed's is Harbour Kings",
    viewport: { width: 2400, height: 1300 },
    seed: "harbour-kings",
    noPageScroll: true,
    noStageScroll: true,
  },
  // The same at 1440, where the block fills the window, in 3D.
  "workspace-3d-1440": {
    board: "WideStage2",
    boardOpts: { props: { width: "1440", mode: "normal", view: "3d" } },
    nearest: "WideStage2 at 1440: the board's insert is Star Realms, the seed's is Harbour Kings",
    viewport: DESKTOP,
    seed: "harbour-kings",
    needsWebGL: true,
    noPageScroll: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
  // 0.9.0 Task 3: WideStage2's own insert, the owner's Star Realms (a 101 x 195 x 37 mm box, Trade deck,
  // Starter deck in 3 trays, Counter), in the board's eight states: normal and editing the Starter deck,
  // Top and 3D, at 2400 and 1440. The board's words and the seed's are the same; its plan is the app's own
  // search, so the trays may stand a little differently.
  ...starStates(),
  // The rail dragged wider (420 px, kept in the prefs): the stage takes the rest, and the plan fits it.
  "workspace-rail-wide": {
    board: "Main",
    nearest:
      "Main with the rail at 420 px: the board's rail is 300, so the rail's width differs by design",
    viewport: DESKTOP,
    seed: "harbour-kings",
    storage: PREFS_RAIL_420,
    noStageScroll: true,
  },
  // 1024×768 with the rail chosen at 480: the stage keeps 360 px beside it, so nothing wraps (the rail shows 480
  // at 1024 only because 1024 less 360 is more; at 800 it would show 440).
  "workspace-rail-wide-1024": {
    board: "Main",
    nearest:
      "Main with the rail at 480 px in a 1024 px window: the board is drawn at 1440, so its widths differ by design",
    viewport: { width: 1024, height: 768 },
    seed: "harbour-kings",
    storage: PREFS_RAIL_480,
    noPageScroll: true,
    noStageScroll: true,
    stageBesideRail: true,
  },
  // The tablet band: the rail stays beside the stage (Task 3 checks it; Task 15 does the pass).
  "workspace-820": {
    board: "Main",
    viewport: { width: 820, height: 1180 },
    seed: "harbour-kings",
    noPageScroll: true,
  },
  // The same at 820 px, where the status row's controls take two rows (stage.css): the View switch still
  // stays where it is when Keep searching turns into Stop and when the 3D view adds "All" to the Layer switch.
  "workspace-820-searching": {
    board: "Main",
    boardOpts: { state: { searching: true } },
    nearest: "Main's searching state, drawn at 1440; 820 differs by design",
    viewport: { width: 820, height: 1180 },
    seed: "harbour-kings",
    holds: ["search"],
    steps: [
      { click: { role: "button", name: "Keep searching", in: STATUS } },
      { waitFor: { role: "button", name: "Stop" } },
    ],
  },
  "workspace-820-3d": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest: "no board of its own: Main's 3D view, drawn at 1440; 820 differs by design",
    viewport: { width: 820, height: 1180 },
    seed: "harbour-kings",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
  // The band between the narrow two-row controls and the wide one row (a stage of about 600 to 750 px):
  // 3D's "All" (586 px of controls) and three layers (617, and 664 with All) once overflowed a 940 to 960 px
  // window. The View switch stays put there too (jump pairs).
  // 0.9.0 review: a landscape box (400 × 285 mm) in a tall window. The 3D frame is as tall as the top
  // view's box, so Top turning to 3D leaves its top, height and middle (jump pairs).
  "workspace-wide-2400": {
    board: "WideStage2",
    boardOpts: { props: { width: "2400", mode: "normal", view: "top" } },
    nearest: "WideStage2 at 2400: the board's box is tall, this one is landscape",
    viewport: { width: 2400, height: 1300 },
    seed: "harbour-kings-wide",
    noPageScroll: true,
  },
  "workspace-wide-2400-3d": {
    board: "WideStage2",
    boardOpts: { props: { width: "2400", mode: "normal", view: "3d" } },
    nearest: "WideStage2 at 2400: the board's box is tall, this one is landscape",
    viewport: { width: 2400, height: 1300 },
    seed: "harbour-kings-wide",
    needsWebGL: true,
    noPageScroll: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
  "workspace-wide-1440": {
    board: "Main",
    nearest: "no board of its own: Main's box frame, wider than it is tall",
    viewport: DESKTOP,
    seed: "harbour-kings-wide",
    noStageScroll: true,
  },
  // 0.9.0 review: four items with a size of 0 mm, so the heading offers an "Edit <item>" for each. At 820
  // they wrap under the heading, which keeps its width; nothing scrolls sideways (probe heading-room).
  "workspace-820-errors": {
    board: "Main",
    nearest: "no board of its own: Main's error heading, at 820 (differs by design)",
    viewport: { width: 820, height: 1180 },
    seed: "harbour-kings-errors",
    probes: ["heading-room"],
  },
  "workspace-1440-errors": {
    board: "Main",
    nearest: "Main's error heading at 1440",
    viewport: DESKTOP,
    seed: "harbour-kings-errors",
    probes: ["heading-room"],
  },
  "workspace-940": {
    board: "Main",
    nearest: "Main at 1440; 940 differs by design",
    viewport: { width: 940, height: 800 },
    seed: "harbour-kings",
  },
  "workspace-940-3d": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest: "no board of its own: Main's 3D view, drawn at 1440; 940 differs by design",
    viewport: { width: 940, height: 800 },
    seed: "harbour-kings",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
  "workspace-940-searching": {
    board: "Main",
    boardOpts: { state: { searching: true } },
    nearest: "Main's searching state, drawn at 1440; 940 differs by design",
    viewport: { width: 940, height: 800 },
    seed: "harbour-kings",
    holds: ["search"],
    steps: [
      { click: { role: "button", name: "Keep searching", in: STATUS } },
      { waitFor: { role: "button", name: "Stop" } },
    ],
  },
  // Three layers (the long seed): the Layer slot grows to 334 px (381 with All).
  "workspace-960-long": {
    board: "Main",
    nearest: "Main at 1440 with three layers; 960 differs by design",
    viewport: { width: 960, height: 800 },
    seed: "harbour-kings-long",
  },
  "workspace-960-long-3d": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest:
      "no board of its own: Main's 3D view, drawn at 1440 with three layers; 960 differs by design",
    viewport: { width: 960, height: 800 },
    seed: "harbour-kings-long",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
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
  // A box that is not square (400 × 285 mm): its longer side is the width the stage leaves (up to 900 px), as a square box's is.
  "workspace-wide": {
    board: "Main",
    nearest: "no board of its own: Main's box frame, wider than it is tall",
    viewport: DESKTOP,
    seed: "harbour-kings-wide",
    minPlanWidth: 700,
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
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
  // A long box in 3D (feedback on 0.5.0, point 10): the camera fits it however it is turned and spread.
  "workspace-3d-1920": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest:
      "no board of its own: Main's box frame and segments (drawn at 1440; 1920 differs by design)",
    viewport: WIDE,
    seed: "harbour-kings",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
  "workspace-3d-wide": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest: "no board of its own: Main's box frame and segments, with a wider box",
    viewport: DESKTOP,
    seed: "harbour-kings-wide",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
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
    steps: [SELECT_MARKET, { click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
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
    minPlanWidth: 550,
    noStageScroll: true,
    steps: [SELECT_MARKET],
  },
  "workspace-tray-1920": {
    board: "Main",
    boardOpts: { state: { sel: "market" } },
    nearest: "Main with a tray selected, drawn at 1440; 1920 differs by design",
    viewport: WIDE,
    seed: "harbour-kings",
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
      { click: { role: "button", name: /^Layer 2/, in: SWITCHES } },
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
  // The tablet width: Edit's board drawn at 820, the rail the editor and the stage beside it.
  "editor-820": {
    board: "Edit",
    boardOpts: { props: { moreOpen: false } },
    viewport: { width: 820, height: 1180 },
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
  // the Room around the pieces row opened, show the changed dot and "Back to <default>" beside the Market deck's own.
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
      { click: { role: "button", name: /^Room around the pieces/, in: RAIL } },
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
  // NoFit (Task 12): the closest attempt of a failed search (box height: a Heroes figure taller than the box, 90 mm as make-seeds tunes it), the culprit
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
  // The box's editor while the plan does not fit (0.6.0 carry): the box is open over the no-fit
  // seed (a Heroes figure taller than the 70 mm box), so the editor tells the problem in a line. No board
  // draws this: Box is the editor, NoFit's status line is the problem's words.
  "box-nofit": {
    board: "Box",
    nearest:
      "Box, with the no-fit line of NoFit above the fields (neither board draws the two together)",
    viewport: DESKTOP,
    seed: "harbour-kings-nofit",
    noPageScroll: true,
    steps: [
      MAKE_NEW_PLAN,
      { waitFor: { text: FIT_YET, timeout: 90_000 } },
      { click: { role: "button", name: /^The box/, in: '[data-region="rail"]' } },
      { waitFor: { role: "heading", name: "Side view of the box" } },
    ],
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
  // details open with My own size (the three sizes, margin, layer height) ...
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
  // Settings by keyboard only (0.6.0 carry): Tab to the project menu's button, Enter, Tab to
  // Settings, Enter; the `settings-keys` probe then checks the trap, the inert page, Escape and
  // where the focus goes back to. The drawer is drawn with nothing changed, so its header differs
  // from the board's ("3 changed").
  "settings-keys": {
    board: "Settings",
    nearest: "Settings, drawn with three values changed where this state changes none",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: KEYS_TO_SETTINGS,
    probes: ["settings-keys"],
  },
  "m-settings-keys": {
    board: "Settings",
    nearest: "Settings, drawn with three values changed where this state changes none",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: KEYS_TO_SETTINGS,
    probes: ["settings-keys"],
  },
  // Export (Task 13): the dialog opened from the header. Export draws "Other formats" open; the
  // app folds it, so the state opens it too.
  download: {
    board: "Export",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: "Download" } },
      // the filament is counted from the built parts: the tile has its figure once the worker is done
      { waitFor: { text: /^about \d+ g$/, timeout: 120_000 } },
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
  // The phone's 3D view (0.6.0 pass): the canvas fills the box frame, no blank band, no sideways scroll.
  "m-workspace-3d": {
    board: "MobileWorkspace",
    nearest: "no board of its own: MobileWorkspace's box frame and segments",
    viewport: PHONE,
    seed: "harbour-kings",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
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
    steps: [
      { click: { role: "button", name: "Download" } },
      { waitFor: { text: /^about \d+ g$/, timeout: 120_000 } },
    ],
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
  // The same on a phone: the sheet's first line in the scroll is the problem.
  "m-box-nofit": {
    board: "MobileBox",
    nearest:
      "MobileBox, with the no-fit line of MobileFix above the fields (neither board draws the two together)",
    viewport: PHONE,
    seed: "harbour-kings-nofit",
    steps: [
      MAKE_NEW_PLAN,
      { waitFor: { text: FIT_YET, timeout: 90_000 } },
      { click: { role: "button", name: /^The box/, in: '[data-region="sheet"]' } },
      { waitFor: { role: "heading", name: "The box" } },
    ],
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

  // ---- Groups, copies, turns and flat decks (0.7.0). Each screen below is built by the task named in
  // its comment; until then its state fails (no region, no button): that is the expected gap.
  // The kit seeds are drawn at the 0.6.0 defaults (rail 300 px, plan 582 px, R10): a pair is judged
  // on regions, order and arrangement, not on pixels.
  // GroupRail: the Player kit card (members indented, "×4"), one copy selected in the plan (Tasks 9, 10).
  "kit-rail": {
    board: "GroupRail",
    viewport: DESKTOP,
    seed: "harbour-kings-kit",
    minPlanWidth: 550,
    noStageScroll: true,
    steps: [PLAN_KIT_2],
  },
  // GroupAdd: Add, then Group: an empty card with its drop target, focused (Task 9).
  "kit-add": {
    board: "GroupAdd",
    viewport: DESKTOP,
    seed: "harbour-kings-kit-loose",
    steps: [
      { click: { role: "button", name: "Add", in: RAIL } },
      { click: { role: "button", name: "Group", in: '[data-region="kind-picker"]' } },
    ],
  },
  // GroupAdd's picker: six tiles, Group the sixth (Task 9). The board's own picker is judged by its grid.
  "kit-picker": {
    board: "GroupAdd",
    boardCrop: { "kind-picker": "#kind-picker" },
    viewport: DESKTOP,
    seed: "harbour-kings-kit-loose",
    steps: [{ click: { role: "button", name: "Add", in: RAIL } }],
  },
  // GroupEdit: the group's editor in the rail and its stage sentence (Task 11). The editor's h2 is
  // the panel's name (visually hidden); the h1 is the sentence, "Player kit, 4 trays.". The only
  // difference from the board is the missing Extra room row (owner's ruling O2).
  "kit-edit": {
    board: "GroupEdit",
    viewport: DESKTOP,
    seed: "harbour-kings-kit",
    steps: [KIT_HEADER, { waitFor: { role: "heading", name: "Player kit" } }],
  },
  // MobileGroup: the sheet's group card with its members, over the plan (Task 15).
  "m-kit": {
    board: "MobileGroup",
    viewport: PHONE,
    seed: "harbour-kings-kit",
    steps: [{ click: { role: "button", name: /What's inside/ } }],
  },
  // A member's editor: no board of its own, judged against Edit with More options open (Task 12).
  // Tall, so the rows at the foot of More options are in the picture: the line that stands where
  // Copies did, and the Group row opened on "In Player kit", Edit and Take out of group.
  "kit-member": {
    board: "Edit",
    nearest: "Edit with More options open (`editor-more`): no board draws a member's editor",
    viewport: { width: 1440, height: 1500 },
    seed: "harbour-kings-kit",
    steps: [
      { click: { role: "button", name: /^Hero, /, in: RAIL } },
      MORE_OPTIONS,
      { click: { role: "button", name: /^Group/, in: RAIL } },
      { waitFor: { role: "button", name: "Take out of group" } },
    ],
  },
  // A member of a group with a long name, its Group row open: "Edit <group>" and "Take out of group" wrap
  // inside the 300 px rail instead of running into its padding (Task 12, fix round 1).
  "kit-member-long": {
    board: "Edit",
    nearest: "Edit with More options open (`editor-more`): no board draws a member's editor",
    viewport: { width: 1440, height: 1500 },
    seed: "harbour-kings-kit",
    steps: [
      KIT_HEADER,
      { fill: { label: "Name", value: "Starter kit for every player at the table" } },
      { click: { role: "button", name: "What's inside", in: RAIL } },
      { click: { role: "button", name: /^Hero, /, in: RAIL } },
      MORE_OPTIONS,
      { click: { role: "button", name: /^Group/, in: RAIL } },
      { waitFor: { role: "button", name: "Take out of group" } },
    ],
  },
  // An item's Group row and its Move to group… panel (Task 12).
  "kit-move-panel": {
    board: "Edit",
    nearest: "Edit (`editor-more`): no board draws the Move to group… panel",
    viewport: { width: 1440, height: 1500 },
    seed: "harbour-kings-kit",
    steps: [
      EDIT_MARKET,
      MORE_OPTIONS,
      { click: { role: "button", name: /^Group/, in: RAIL } },
      { click: { role: "button", name: /^Move to group/, in: RAIL } },
      { waitFor: { role: "button", name: "New group" } },
    ],
  },
  // Remove group…: the question in place of the foot's buttons (Task 11).
  "kit-remove": {
    board: "GroupEdit",
    nearest: "GroupEdit: no board draws the Remove group… question",
    viewport: DESKTOP,
    seed: "harbour-kings-kit",
    steps: [
      KIT_HEADER,
      { click: { role: "button", name: "Remove group…", in: RAIL } },
      { waitFor: { text: /Its 3 items stay/ } },
    ],
  },
  // The kit with a Hero too long for one copy to fit the bed: "Player kit 1a" and "1b" (Task 10).
  "workspace-kit-split": {
    board: "GroupRail",
    nearest: "GroupRail: no board draws a split group, its trays named 1a and 1b",
    viewport: DESKTOP,
    seed: "harbour-kings-kit-split",
    noStageScroll: true,
  },
  "workspace-kit-3d": {
    board: "Main",
    boardOpts: { state: { view: "3d" } },
    nearest: "no board of its own: Main's box frame and segments, with the kit's four copies",
    viewport: DESKTOP,
    seed: "harbour-kings-kit",
    needsWebGL: true,
    steps: [{ click: { role: "button", name: "3D", in: SWITCHES } }, { wait: 3000 }],
  },
  "kit-download": {
    board: "Export",
    nearest: "Export (`download`): no board draws a group's trays in the list",
    viewport: DESKTOP,
    seed: "harbour-kings-kit",
    steps: [
      { click: { role: "button", name: "Download" } },
      { waitFor: { text: /^about \d+ g$/, timeout: 120_000 } },
      { click: { role: "button", name: "Other formats" } },
    ],
  },
  "kit-packing-guide": {
    board: "Export",
    nearest: "Export (`packing-guide`): no board draws a group's trays in the guide",
    viewport: DESKTOP,
    seed: "harbour-kings-kit",
    fullPage: true,
    steps: [
      { click: { role: "button", name: "Download" } },
      { click: { role: "button", name: /^Packing guide/ } },
      { waitFor: { role: "heading", name: /packing guide$/ } },
    ],
  },
  // Turn 90° on the Market deck: the Turned chip beside its row, the plan kept (Task 13). The pin in
  // boardOpts is only there for the board: its `pins` state draws a chip beside Market deck's row and
  // the rules note under the list, where the Turned chip and the rules note (R17) go. The app side
  // pins nothing.
  "workspace-turned": {
    board: "Main",
    boardOpts: { state: { pins: { market: { x: 0, y: 0, layer: "bottom" } } } },
    nearest: "Main `workspace-rules`: no board draws the Turned chip",
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [
      SELECT_MARKET,
      { click: { role: "button", name: /^Turn this (tray|stack) 90/, in: TRAY_BAR } },
      { waitFor: { role: "button", name: "Let Market deck turn" } },
    ],
  },
  // A cards item with three flat decks in one well: its editor shows Between decks (Task 13).
  "editor-flat-decks": {
    board: "EditKinds",
    boardCrop: { rail: "main section:nth-of-type(1)" },
    nearest: "Edit / EditKinds: no board draws Between decks",
    viewport: { width: 1440, height: 1500 },
    seed: "harbour-kings-flat",
    steps: [
      { click: { role: "button", name: /^Starter deck, /, in: RAIL } },
      MORE_OPTIONS,
      { click: { role: "button", name: /^Between decks/, in: RAIL } },
    ],
  },
  // Drag and drop has no board (R14): its look is judged against spec §7.3 and its gate is the probe
  // `drag-into-group` (shots.mjs; Task 14), with a mid-drag picture, `kit-drag.mid-drag.png`. The pair shows GroupRail for reference.
  "kit-drag": {
    board: "GroupRail",
    nearest: "no board of its own (spec §7.3): the rail of GroupRail; the gate is the probe",
    viewport: DESKTOP,
    seed: "harbour-kings-kit",
    probes: ["drag-into-group"],
  },
  "m-kit-edit": {
    board: "MobileEdit",
    nearest: "MobileEdit: no board draws a group's editor on a phone",
    viewport: PHONE,
    seed: "harbour-kings-kit",
    steps: [
      { click: { role: "button", name: /What's inside/ } },
      { click: { role: "button", name: "Player kit, 4 copies", in: '[data-region="sheet"]' } },
      { waitFor: { role: "heading", name: "Player kit" } },
    ],
  },
  "m-kit-member": {
    board: "MobileEdit",
    nearest: "MobileEdit: no board draws a member's editor on a phone",
    viewport: PHONE,
    seed: "harbour-kings-kit",
    steps: [
      { click: { role: "button", name: /What's inside/ } },
      { click: { role: "button", name: /^Hero, /, in: '[data-region="sheet"]' } },
    ],
  },
  // The same on a phone, in the sheet.
  "m-kit-member-long": {
    board: "MobileEdit",
    nearest: "MobileEdit: no board draws a member's editor on a phone",
    viewport: PHONE,
    seed: "harbour-kings-kit",
    steps: [
      { click: { role: "button", name: /What's inside/ } },
      { click: { role: "button", name: "Player kit, 4 copies", in: '[data-region="sheet"]' } },
      { fill: { label: "Name", value: "Starter kit for every player at the table" } },
      { click: { role: "button", name: "Back", in: '[data-region="sheet"]' } },
      { click: { role: "button", name: /^Hero, /, in: '[data-region="sheet"]' } },
      { click: { role: "button", name: /^More options/, in: '[data-region="sheet"]' } },
      { click: { role: "button", name: /^Group/, in: '[data-region="sheet"]' } },
      { waitFor: { role: "button", name: "Take out of group" } },
    ],
  },
  "m-turned": {
    board: "MobileWorkspace",
    nearest: "MobileWorkspace: no board draws the Turned chip",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [
      SELECT_MARKET,
      {
        click: { role: "button", name: /^Turn this (tray|stack) 90/, in: '[data-region="sheet"]' },
      },
    ],
  },
};
