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
//   holds      shots-mode holds to set before the app starts ("export", "search")
//   steps      what to do before the screenshot
//   noPageScroll  the state fails when the page scrolls at its size (a review focus)
//
// Step = { click: { role, name, in? } }  click getByRole(role, { name }), inside the CSS selector `in`
//      | { waitFor: { role?, name?, text?, timeout? } }  (default 15 s)
//      | { press: key }

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const MENU = { click: { role: "button", name: /^Project menu/ } };
// The no-fit heading: the board's "...fit yet", and the old UI's "<name> is too big for ...".
const FIT_YET = /fit yet|too big for/;
const MAKE_NEW_PLAN = { click: { role: "button", name: "Make a new plan" } };

/** Seeds: a current plan each, and the ones that are stale on purpose (make-seeds.mjs). */
export const SEEDS = {
  current: ["harbour-kings", "harbour-kings-headroom", "harbour-kings-long"],
  stale: [
    "harbour-kings-stale",
    "harbour-kings-notes",
    "harbour-kings-nofit",
    "harbour-kings-pins",
  ],
};

/** @type {Record<string, any>} */
export const STATES = {
  "first-visit": { board: "Empty", viewport: DESKTOP, seed: null },
  workspace: { board: "Main", viewport: DESKTOP, seed: "harbour-kings" },
  "workspace-searching": {
    board: "Main",
    boardOpts: { state: { searching: true } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    holds: ["search"],
    steps: [
      { click: { role: "button", name: "Keep searching" } },
      { waitFor: { role: "button", name: "Stop" } },
    ],
  },
  "workspace-banner": {
    board: "Main",
    boardOpts: { props: { notice: "outdated" } },
    viewport: DESKTOP,
    seed: "harbour-kings-stale",
  },
  "workspace-banner-notes": {
    board: "Main",
    boardOpts: { props: { notice: "outdated" } },
    viewport: DESKTOP,
    seed: "harbour-kings-notes",
  },
  "workspace-menu": {
    board: "Main",
    boardOpts: { state: { menu: true } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [MENU],
  },
  "workspace-tray": {
    board: "Main",
    boardOpts: { state: { sel: "market" } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: /^Market deck/, in: ".plan" } }],
  },
  "workspace-long": {
    board: "Main",
    nearest: "no board of its own: judged against Main",
    viewport: DESKTOP,
    seed: "harbour-kings-long",
    noPageScroll: true,
  },
  editor: {
    board: "Edit",
    boardOpts: { props: { moreOpen: false } },
    viewport: DESKTOP,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: "Market deck" } }],
  },
  box: {
    board: "Box",
    viewport: DESKTOP,
    seed: "harbour-kings-headroom",
    steps: [{ click: { role: "heading", name: "The box" } }],
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
  "m-start": { board: "MobileStart", viewport: PHONE, seed: null },
  "m-workspace": { board: "MobileWorkspace", viewport: PHONE, seed: "harbour-kings" },
  "m-tray": {
    board: "MobileTray",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [{ click: { role: "button", name: /^Heroes/, in: ".plan" } }],
  },
  "m-edit": {
    board: "MobileEdit",
    viewport: PHONE,
    seed: "harbour-kings",
    steps: [
      { click: { role: "button", name: /What's inside/ } },
      { click: { role: "button", name: "Heroes" } },
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
    steps: [
      { click: { role: "button", name: /What's inside/ } },
      { click: { role: "heading", name: "The box" } },
    ],
  },
};
