// scripts/design/regions.mjs
// The named regions of a screen, for the 1:1 crops and the numbers (shots.mjs).
//
// `board(doc)` finds the region in a rendered board document. It runs inside the browser page,
// so it must be self-contained (shots.mjs sends its source text). In the app a region is the
// element marked `data-region="<name>"`: the UI task that builds the region puts the attribute on
// it. A region found in only one of the two has no pair crop.
//
// Names, with the task that owns each in the app: header, rail, stage (Task 3), status, plan-box, tray-bar, menu,
// dialog, drawer, sheet, kind-picker.

/** @type {Record<string, { board: (doc: Document) => Element | null }>} */
export const REGIONS = {
  header: { board: (doc) => doc.querySelector("header") },
  rail: { board: (doc) => doc.querySelector("aside") },
  // The whole of <main>: the stage the status row, the plan and its slots sit in.
  stage: { board: (doc) => doc.querySelector("main") },
  // The child of <main> that holds the first h1: the heading row (icon, h1, line, controls).
  status: {
    board: (doc) => {
      let el = doc.querySelector("main h1");
      while (el && el.parentElement && el.parentElement.localName !== "main") {
        el = el.parentElement;
      }
      return el && el.parentElement ? el : null;
    },
  },
  // The first element in <main> sized by aspect-ratio: 1: the box frame.
  "plan-box": {
    board: (doc) =>
      Array.from(doc.querySelectorAll("main *")).find((el) =>
        /aspect-ratio:\s*1\b/.test(el.getAttribute("style") || ""),
      ) || null,
  },
  "tray-bar": { board: (doc) => doc.querySelector('[aria-label="Selected tray"]') },
  menu: { board: (doc) => doc.querySelector('[role="menu"]') },
  // Empty's kind tiles: the grid of the five kinds (the nearest board of the Add pill's picker).
  "kind-picker": {
    board: (doc) =>
      Array.from(doc.querySelectorAll("div")).find(
        (el) =>
          /display:\s*grid/.test(el.getAttribute("style") || "") &&
          el.children.length === 5 &&
          Array.from(el.children).every((c) => c.localName === "a"),
      ) || null,
  },
  dialog: { board: (doc) => doc.querySelector('[role="dialog"]') },
  drawer: { board: (doc) => doc.querySelector('[role="dialog"]') },
  // The panel placed against the bottom edge of a phone board.
  sheet: {
    board: (doc) =>
      Array.from(doc.querySelectorAll('[role="region"], [role="dialog"]')).find((el) => {
        const style = el.getAttribute("style") || "";
        return /position:\s*absolute/.test(style) && /bottom:\s*0/.test(style);
      }) || null,
  },
};
