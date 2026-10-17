#!/usr/bin/env node
// scripts/design/shots.mjs — `npm run shots` and `npm run shots -- <state>… [--out <dir>]`
//
// Draws every design board to a PNG (docs/design/boards/png, committed), runs the app on the
// states in states.mjs against its committed seeds, and writes, per state, into the out folder
// (default .superpowers/sdd/2026-10-16-ui-rebuild/shots/, ignored by git):
//
//   <state>.app.png            the app's window
//   <state>.pair.png           the board above the app, both at 1:1, a labelled gap between
//   <state>.<region>.pair.png  the same for each region (regions.mjs) found in both
//   <state>.numbers.md         header height, rail width, plan width, first h1: board vs app
//
// When `workspace` and `workspace-searching` both run, their layout is compared: the header, the
// rail, the status row and the plan box must not move by more than 1 px between them (Keep
// searching turning into Stop must not shift the page), else the run fails.
//
// `npm run shots -- --boards` only redraws the board PNGs (all of them, or the named states').
//
// The app is served by `vite --mode shots` on a free port; the child is stopped by its PID when
// this script ends, however it ends. See docs/design/README.md.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BOARDS_DIR, boardPreview, renderBoard } from "./renderBoard.mjs";
import { JUMP_REGIONS, jumpProblems } from "./jump.mjs";
import { REGIONS } from "./regions.mjs";
import { SEEDS, STATES } from "./states.mjs";
import { createModuleLoader } from "./viteModules.mjs";

const ROOT = `${resolve(dirname(fileURLToPath(import.meta.url)), "../..")}/`;
const PNG_DIR = `${BOARDS_DIR}png/`;
const CACHE_DIR = `${ROOT}node_modules/.cache/design/`;
const DEFAULT_OUT = `${ROOT}.superpowers/sdd/2026-10-16-ui-rebuild/shots/`;
const STEP_TIMEOUT = 15_000;

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
let outDir = DEFAULT_OUT;
let boardsOnly = false;
const names = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--out") {
    outDir = `${resolve(argv[++i] ?? "")}/`;
  } else if (argv[i] === "--boards") {
    boardsOnly = true;
  } else {
    names.push(argv[i]);
  }
}
const unknown = names.filter((n) => !(n in STATES));
if (unknown.length > 0) {
  console.error(`unknown state: ${unknown.join(", ")}\nstates: ${Object.keys(STATES).join(", ")}`);
  process.exit(1);
}
const all = names.length === 0;
const stateNames = all ? Object.keys(STATES) : names;

// ---------------------------------------------------------------- the dev server

let server = null;

function stopServer() {
  if (server && server.exitCode === null && !server.killed) {
    server.kill("SIGTERM");
  }
}
process.on("exit", stopServer);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopServer();
    process.exit(130);
  });
}

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const log = [];
  server = spawn(
    `${ROOT}node_modules/.bin/vite`,
    ["--mode", "shots", "--port", String(port), "--strictPort"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" },
    },
  );
  server.stdout.on("data", (d) => log.push(String(d)));
  server.stderr.on("data", (d) => log.push(String(d)));
  let exited = false;
  server.once("exit", () => {
    exited = true;
  });
  const url = `http://localhost:${port}/`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`vite exited early:\n${log.join("")}`);
    }
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        return url;
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite did not answer on ${url} within 60 s:\n${log.join("")}`);
}

// ---------------------------------------------------------------- seeds

/** Every seed the chosen states use: loaded, and checked for staleness (`run npm run seeds`). */
async function loadSeeds(seedNames) {
  const seeds = new Map();
  if (seedNames.length === 0) {
    return seeds;
  }
  const loader = await createModuleLoader();
  try {
    const kit = await loader.load("src/test-support/harbourKings.ts");
    const { inputsHash } = await loader.load("src/model/hash.ts");
    const { GEOMETRY_VERSION } = await loader.load("src/geometry/version.ts");
    for (const name of seedNames) {
      const seed = kit.loadSeed(name);
      const layout = seed.project.layout;
      const current = SEEDS.current.includes(name);
      const problems = [];
      if (layout === undefined) {
        problems.push("it has no plan");
      } else {
        if (layout.geometryVersion !== GEOMETRY_VERSION) {
          problems.push(
            `its plan is geometry ${layout.geometryVersion}, the app is ${GEOMETRY_VERSION}`,
          );
        }
        if (current && layout.inputsHash !== inputsHash(seed.project)) {
          problems.push("its plan is for other inputs");
        }
        if (!current && layout.inputsHash === inputsHash(seed.project)) {
          problems.push("its plan is current, and it should be stale");
        }
      }
      if (problems.length > 0) {
        throw new Error(`seed ${name} is stale (${problems.join("; ")}): run npm run seeds`);
      }
      seeds.set(name, seed);
    }
  } finally {
    await loader.close();
  }
  return seeds;
}

// ---------------------------------------------------------------- boards

const fileUrl = (path) => pathToFileURL(path).href;

async function newPage(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  return context.newPage();
}

/** Renders a board variant to the cache and opens it; returns the page and its file path. */
async function openBoard(browser, board, opts, viewport, key) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = `${CACHE_DIR}${key}.html`;
  writeFileSync(path, await renderBoard(`${board}.dc.html`, opts));
  const page = await newPage(browser, viewport);
  await page.goto(fileUrl(path));
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function drawBoards(browser) {
  mkdirSync(PNG_DIR, { recursive: true });
  const written = [];
  if (all) {
    const files = readdirSync(BOARDS_DIR).filter((f) => f.endsWith(".dc.html"));
    for (const file of files) {
      const board = file.replace(".dc.html", "");
      const page = await openBoard(browser, board, {}, boardPreview(file), board);
      await page.screenshot({ path: `${PNG_DIR}${board}.png` });
      await page.context().close();
      written.push(`${board}.png`);
    }
  }
  for (const name of stateNames) {
    const state = STATES[name];
    const page = await openBoard(
      browser,
      state.board,
      state.boardOpts ?? {},
      state.viewport,
      `${state.board}--${name}`,
    );
    await page.screenshot({ path: `${PNG_DIR}${state.board}--${name}.png` });
    await page.context().close();
    written.push(`${state.board}--${name}.png`);
  }
  console.log(`boards: ${written.length} PNGs in ${PNG_DIR}`);
}

// ---------------------------------------------------------------- the app

async function runStep(page, step) {
  if (step.click) {
    const { role, name, in: within } = step.click;
    const scope = within ? page.locator(within) : page;
    await scope.getByRole(role, { name }).first().click({ timeout: STEP_TIMEOUT });
  } else if (step.waitFor) {
    const { role, name, text, timeout = STEP_TIMEOUT } = step.waitFor;
    const target = role
      ? page.getByRole(role, name === undefined ? {} : { name })
      : page.getByText(text);
    await target.first().waitFor({ state: "visible", timeout });
  } else if (step.fill) {
    // a text box by its label: the value replaces what is there (the first visit's Height, say)
    const { label, value } = step.fill;
    await page.getByLabel(label).first().fill(value, { timeout: STEP_TIMEOUT });
  } else if (step.press) {
    await page.keyboard.press(step.press);
  } else if (step.wait !== undefined) {
    await page.waitForTimeout(step.wait);
  } else {
    throw new Error(`unknown step ${JSON.stringify(step)}`);
  }
}

/**
 * Probes run in Chromium after the pictures are taken: what jsdom cannot see of a native
 * `<dialog>`. A probe returns the problems it found; each one fails the state.
 */
const PROBES = {
  /**
   * The box editor's fields (Task 11): no text box cuts its value off ("285.5" in an 80 px field).
   * The value of each is whole when it does not scroll inside its box.
   */
  async "field-clip"(page) {
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll(".k-field__input")]
        .filter((el) => el.scrollWidth > el.clientWidth)
        .map(
          (el) =>
            `${el.id || el.getAttribute("aria-label")}: "${el.value}" is ${el.scrollWidth} px in ${el.clientWidth}`,
        ),
    );
    return clipped.map((c) => `probe field-clip: ${c}`);
  },
  /**
   * The plan (polish): every pair of tiles that stand side by side has the same gap between them,
   * 6 px (each tile is drawn 3 px inside its footprint), whatever the parts are: a tray, a spacer
   * or a spare tray. A pair closer than that, or touching, is a problem.
   */
  async "plan-gaps"(page) {
    const found = await page.evaluate(() => {
      const GAP = 6;
      const tiles = [...document.querySelectorAll(".plan-tile")].map((el) => ({
        name: el.getAttribute("title") ?? el.getAttribute("data-of") ?? "?",
        spacer: el.classList.contains("is-leftover"),
        r: el.getBoundingClientRect(),
      }));
      const out = [];
      const fmt = (t) =>
        `${t.name}${t.spacer ? " (spacer)" : ""} ${Math.round(t.r.width)}x${Math.round(t.r.height)}@${Math.round(t.r.left)},${Math.round(t.r.top)}`;
      for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
          const a = tiles[i].r;
          const b = tiles[j].r;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          const gapX = Math.max(a.left, b.left) - Math.min(a.right, b.right);
          const gapY = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
          // side by side: they share a span on one axis and are near on the other
          const near = (overlapY > 0 && gapX < GAP - 0.5) || (overlapX > 0 && gapY < GAP - 0.5);
          if (near) {
            out.push(
              `${fmt(tiles[i])} and ${fmt(tiles[j])} are ${Math.min(Math.max(gapX, gapY), GAP).toFixed(1)} px apart`,
            );
          }
        }
      }
      return out;
    });
    return found.map((f) => `probe plan-gaps: ${f}`);
  },
  /**
   * The tray sheet (Task 8), with More open: Escape closes More and only More; then a press on the
   * backdrop (the page above the sheet) closes the sheet.
   */
  async "tray-sheet"(page) {
    const problems = [];
    const dialog = page.locator('dialog[data-region="sheet"]');
    const more = dialog.getByRole("button", { name: "More", exact: true });
    const state = async () => ({
      dialogs: await page.locator("dialog[open]").count(),
      expanded: (await more.count()) === 0 ? null : await more.getAttribute("aria-expanded"),
    });
    const before = await state();
    if (before.dialogs !== 1 || before.expanded !== "true") {
      return [
        `probe tray-sheet: it needs the sheet open with More open, found ${JSON.stringify(before)}`,
      ];
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const afterEscape = await state();
    if (afterEscape.dialogs !== 1) {
      problems.push("Escape with More open closed the sheet (it must close only More)");
    } else if (afterEscape.expanded !== "false") {
      problems.push(`Escape with More open left More ${afterEscape.expanded} (it must close it)`);
    }
    // the page above the sheet: the backdrop, which the native dialog sends to the dialog itself
    await page.mouse.click(195, 100);
    await page.waitForTimeout(150);
    const afterBackdrop = await state();
    if (afterBackdrop.dialogs !== 0) {
      problems.push("a press on the backdrop did not close the sheet");
    }
    return problems.map((p) => `probe tray-sheet: ${p}`);
  },
};

const firstLine = (e) => String(e.message).split("\n")[0];

const describeStep = (step) =>
  JSON.stringify(step, (_, v) => (v instanceof RegExp ? v.toString() : v));

/** Opens the app on a state's seed and runs its steps. Throws with the failing step named. */
async function openApp(browser, appUrl, name, state, seeds) {
  const page = await newPage(browser, state.viewport);
  const seed = state.seed === null ? null : seeds.get(state.seed);
  await page.addInitScript(
    ({ storage, holds }) => {
      for (const [key, value] of Object.entries(storage)) {
        localStorage.setItem(key, value);
      }
      if (holds.length > 0) {
        globalThis.__shotsHold = Object.fromEntries(
          holds.map((h) => [h, new Promise(() => undefined)]),
        );
      }
    },
    { storage: seed?.storage ?? {}, holds: state.holds ?? [] },
  );
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  await page.goto(new URL(state.url ?? "", appUrl).href, { waitUntil: "load" });
  for (const step of state.steps ?? []) {
    try {
      await runStep(page, step);
    } catch (e) {
      // What the page showed when the step could not find its target, for whoever fixes the step.
      await page.screenshot({ path: `${outDir}${name}.failed.png` }).catch(() => undefined);
      await page.context().close();
      throw new Error(`step ${describeStep(step)} failed: ${firstLine(e)}`, { cause: e });
    }
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  if (state.noPageScroll) {
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    );
    if (scrolls) {
      // Reported after the pictures are written: they show how far it scrolls.
      problems.push("the page scrolls at this size (it must not, with many components)");
    }
  }
  if (state.noStageScroll) {
    // The plan's box shrinks to what the stage has left, so the stage never scrolls on a desktop.
    const scrolls = await page.evaluate(() => {
      const stage = document.querySelector('[data-region="stage"]');
      return stage !== null && stage.scrollHeight > stage.clientHeight;
    });
    if (scrolls) {
      problems.push("the stage scrolls at this size (it must not: the plan shrinks instead)");
    }
  }
  if (
    state.needsWebGL &&
    (await page.locator('[data-region="plan-box"].viewer-stage').count()) === 0
  ) {
    // The 3D button is blocked without WebGL and the stage says so: a note, not a failure.
    problems.push(
      "WebGL is missing here: the 3D view shows its fallback line, so its frame was not drawn or compared",
    );
  }
  if (state.planWidth !== undefined) {
    // The computed size of the plan's box, not a string in the CSS: a wide box is as wide as a square one.
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-region="plan-box"]');
      const r = el === null ? null : el.getBoundingClientRect();
      return r === null ? null : { w: r.width, h: r.height };
    });
    if (box === null || Math.abs(box.w - state.planWidth) > 1) {
      problems.push(
        `the plan box is ${box === null ? "missing" : `${Math.round(box.w * 100) / 100} px wide`}, not the ${state.planWidth} px it must be`,
      );
    }
  }
  if (state.minPlanWidth !== undefined) {
    const width = await page.evaluate(() => {
      const box = document.querySelector('[data-region="plan-box"]');
      return box === null ? 0 : box.getBoundingClientRect().width;
    });
    if (width < state.minPlanWidth) {
      problems.push(
        `the plan box is ${Math.round(width * 100) / 100} px wide, under the ${state.minPlanWidth} px it must be`,
      );
    }
  }
  return { page, problems };
}

// ---------------------------------------------------------------- measuring and composing

const regionSource = (name) => REGIONS[name].board.toString();

// ---------------------------------------------------------------- nothing jumps (Review Focus 4)

// Pairs that must not differ: Keep searching turning into Stop, and the View segment turning to 3D.
// `sizeOnly`: a tray bar is taller than the slot's hint, so the plan's box slides down; it may not change size (Task 8).
const JUMP_PAIRS = [
  { pair: ["workspace", "workspace-searching"], sizeOnly: [] },
  { pair: ["workspace", "workspace-3d"], sizeOnly: [] },
  { pair: ["workspace", "workspace-tray"], sizeOnly: ["plan-box"] },
  // a swap chosen puts its prompt over the box, so the plan is where it was with the bar alone (Task 8)
  { pair: ["workspace", "workspace-swap"], sizeOnly: ["plan-box"] },
  { pair: ["workspace-tray", "workspace-swap"], sizeOnly: [] },
];
const JUMP_STATES = [...new Set(JUMP_PAIRS.flatMap((j) => j.pair))];
const jumpBoxes = new Map();

async function measureJump(page) {
  return page.evaluate((regions) => {
    const out = {};
    for (const [name, selector] of Object.entries(regions)) {
      const el = document.querySelector(selector);
      const r = el ? el.getBoundingClientRect() : null;
      out[name] = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    }
    return out;
  }, JUMP_REGIONS);
}

/**
 * The bounding box of a region in a page, from its definition (board) or data-region (app). A
 * state's `boardCrop` names a CSS selector for a region of the board instead of its definition:
 * a board that draws several screens side by side (EditKinds) is judged by one of them.
 */
async function regionHandle(page, name, isBoard, crop = {}) {
  const selector = isBoard ? crop[name] : undefined;
  const handle = selector
    ? await page.evaluateHandle((q) => document.querySelector(q), selector)
    : isBoard
      ? await page.evaluateHandle(`(${regionSource(name)})(document)`)
      : await page.evaluateHandle((n) => document.querySelector(`[data-region="${n}"]`), name);
  const element = handle.asElement();
  if (element === null) {
    await handle.dispose();
  }
  return element;
}

async function measure(page, isBoard, crop = {}) {
  const out = {};
  const sizeOf = async (name, key) => {
    const el = await regionHandle(page, name, isBoard, crop);
    if (el === null) {
      return null;
    }
    const box = await el.boundingBox();
    await el.dispose();
    return box === null ? null : Math.round(box[key] * 100) / 100;
  };
  out["header height"] = await sizeOf("header", "height");
  out["rail width"] = await sizeOf("rail", "width");
  out["plan-box width"] = await sizeOf("plan-box", "width");
  const h1 = await page.evaluate(() => {
    const el = document.querySelector("h1");
    return el ? { size: getComputedStyle(el).fontSize, text: (el.textContent || "").trim() } : null;
  });
  out["h1 font-size"] = h1 ? Number.parseFloat(h1.size) : null;
  out["h1 text"] = h1 ? h1.text : null;
  Object.assign(out, await page.evaluate(measureStatusRow));
  Object.assign(out, await page.evaluate(measureTray));
  return out;
}

/**
 * The tray bar (a region named "Selected tray") and the phone's tray sheet (the page's dialog), by
 * structure so a board and the app answer alike (Task 8). Runs in the page, so it is
 * self-contained. A part the page lacks is null, and a metric neither side has is no row.
 */
function measureTray() {
  const round = (n) => Math.round(n * 100) / 100;
  const out = {};
  const put = (key, value) => {
    out[key] = value === null || value === undefined || Number.isNaN(value) ? null : round(value);
  };
  const rect = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, left: r.left + window.scrollX, w: r.width, h: r.height };
  };
  const style = (el, prop) => (el ? Number.parseFloat(getComputedStyle(el)[prop]) : null);
  const named = (root, test) =>
    Array.from(root.querySelectorAll("button, a")).find((b) =>
      test((b.getAttribute("aria-label") || b.textContent || "").trim()),
    ) || null;

  const bar = document.querySelector('[aria-label="Selected tray"]');
  const b = rect(bar);
  put("bar top", b ? b.top : null);
  put("bar left", b ? b.left : null);
  put("bar width", b ? b.w : null);
  put("bar height", b ? b.h : null);
  put("bar radius", style(bar, "borderTopLeftRadius"));
  put("bar padding left", style(bar, "paddingLeft"));
  const swatch = bar ? bar.children[0] : null;
  put("bar swatch size", rect(swatch) ? rect(swatch).w : null);
  put("bar swatch radius", style(swatch, "borderTopLeftRadius"));
  const text = bar ? bar.children[1] : null;
  put("bar text left", rect(text) ? rect(text).left : null);
  put("bar name font-size", style(text ? text.children[0] : null, "fontSize"));
  put("bar name weight", style(text ? text.children[0] : null, "fontWeight"));
  put("bar meta font-size", style(text ? text.children[1] : null, "fontSize"));
  const pin = bar ? named(bar, (t) => /^(Pin|Unpin)$/.test(t)) : null;
  const edit = bar ? named(bar, (t) => t === "Edit") : null;
  const close = bar ? named(bar, (t) => t === "Close") : null;
  put("bar Pin height", rect(pin) ? rect(pin).h : null);
  put("bar Pin left", rect(pin) ? rect(pin).left : null);
  put("bar Edit width", rect(edit) ? rect(edit).w : null);
  put("bar Edit left", rect(edit) ? rect(edit).left : null);
  put("bar Close size", rect(close) ? rect(close).w : null);
  put("bar Close left", rect(close) ? rect(close).left : null);

  const dialog = document.querySelector('dialog, [role="dialog"]');
  const root =
    dialog && dialog.children.length === 1 && dialog.firstElementChild.localName === "div"
      ? dialog.firstElementChild
      : dialog;
  const d = rect(dialog);
  put("sheet top", d ? d.top : null);
  put("sheet height", d ? d.h : null);
  put("sheet radius", style(dialog, "borderTopLeftRadius"));
  const handle = root ? root.children[0] : null;
  put("sheet handle width", rect(handle) ? rect(handle).w : null);
  put("sheet handle top", rect(handle) ? rect(handle).top : null);
  const head = root ? root.children[1] : null;
  const tile = head ? head.children[0] : null;
  put("sheet tile size", rect(tile) ? rect(tile).w : null);
  put("sheet tile left", rect(tile) ? rect(tile).left : null);
  const h2 = dialog ? dialog.querySelector("h2") : null;
  put("sheet h2 font-size", style(h2, "fontSize"));
  put("sheet h2 top", rect(h2) ? rect(h2).top : null);
  const sheetEdit = dialog ? named(dialog, (t) => /^Edit /.test(t)) : null;
  put("sheet Edit height", rect(sheetEdit) ? rect(sheetEdit).h : null);
  put("sheet Edit top", rect(sheetEdit) ? rect(sheetEdit).top : null);
  const dl = dialog ? dialog.querySelector("dl") : null;
  put("sheet Size row top", rect(dl) ? rect(dl).top : null);
  const tiles = root
    ? Array.from(root.querySelectorAll("div")).find(
        (el) => el.children.length === 3 && el.querySelectorAll("button").length === 3,
      )
    : null;
  put("sheet tiles top", rect(tiles) ? rect(tiles).top : null);
  const firstTile = tiles ? tiles.querySelector("button") : null;
  put("sheet tile height", rect(firstTile) ? rect(firstTile).h : null);
  return out;
}

/**
 * The status row's parts, in page coordinates, found by structure so a board and the app answer
 * alike: the icon is the sibling before the h1's column, the line the sibling after the h1, the
 * switches the groups named Layer and View, the action the button that says Keep searching, Stop,
 * Retry or Make a plan. Runs in the page, so it is self-contained. Null for a part the page lacks.
 */
function measureStatusRow() {
  const round = (n) => Math.round(n * 100) / 100;
  const h1 = document.querySelector("h1");
  // page coordinates: an element's screenshot may have scrolled the page, which must not read as a move
  const box = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    };
  };
  const icon = h1 && h1.parentElement ? h1.parentElement.previousElementSibling : null;
  const line = h1 ? h1.nextElementSibling : null;
  const group = (name) => document.querySelector(`[role="group"][aria-label="${name}"]`);
  const action = Array.from(document.querySelectorAll("button")).find((b) =>
    /^(Keep searching|Stop|Retry|Make a plan)$/.test(
      (b.getAttribute("aria-label") || b.textContent || "").trim(),
    ),
  );
  const banner = document.querySelector(
    '[data-region="banner"], main > [role="status"]:not(.visually-hidden)',
  );
  const out = {};
  const put = (key, value) => {
    out[key] = value === null || value === undefined ? null : round(value);
  };
  const h = box(h1);
  const i = box(icon);
  put("icon size", i ? i.width : null);
  put("icon left", i ? i.left : null);
  put("icon top", i ? i.top : null);
  put("h1 left", h ? h.left : null);
  put("h1 top", h ? h.top : null);
  put("heading text height", h && h1.parentElement ? box(h1.parentElement).height : null);
  put("line top", box(line) ? box(line).top : null);
  put("line font-size", line ? Number.parseFloat(getComputedStyle(line).fontSize) : null);
  put("layer switch top", box(group("Layer")) ? box(group("Layer")).top : null);
  put("layer switch height", box(group("Layer")) ? box(group("Layer")).height : null);
  put("view switch height", box(group("View")) ? box(group("View")).height : null);
  put("action height", box(action) ? box(action).height : null);
  put("banner height", box(banner) ? box(banner).height : null);
  return out;
}

/** The numbers every state has: a row for them even when a side lacks one (flagged). */
const CORE_METRICS = new Set([
  "header height",
  "rail width",
  "plan-box width",
  "h1 font-size",
  "h1 text",
]);

function numbersTable(board, app) {
  const rows = ["| metric | board | app | Δ | flag |", "| --- | --- | --- | --- | --- |"];
  for (const metric of Object.keys(board)) {
    const b = board[metric];
    const a = app[metric];
    // a part neither side has (a banner, a switch) is no row
    if (b === null && a === null && !CORE_METRICS.has(metric)) {
      continue;
    }
    let delta = "";
    let flag = "";
    if (b === null || a === null) {
      flag = "≠ (missing)";
    } else if (typeof b === "number" && typeof a === "number") {
      const d = Math.round((a - b) * 100) / 100;
      delta = d > 0 ? `+${d}` : String(d);
      flag = Math.abs(d) > 1 ? "≠" : "";
    } else if (b !== a) {
      flag = "≠";
    }
    const show = (v) => (v === null ? "—" : String(v).replaceAll("|", "\\|"));
    rows.push(`| ${metric} | ${show(b)} | ${show(a)} | ${delta} | ${flag} |`);
  }
  return `${rows.join("\n")}\n`;
}

const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;

/** The board above the app at 1:1, a 24 px labelled gap between. */
async function compose(browser, boardPng, appPng, boardLabel, appLabel, width, path) {
  const page = await newPage(browser, { width, height: 400 });
  await page.setContent(
    `<body style="margin:0;background:#fff;font:600 13px/24px system-ui,sans-serif">` +
      `<img src="${dataUrl(boardPng)}" style="display:block">` +
      `<div style="height:24px;box-sizing:border-box;display:flex;justify-content:space-between;padding:0 8px;background:#1D1F1C;color:#fff">` +
      `<span>${boardLabel}</span><span>${appLabel}</span></div>` +
      `<img src="${dataUrl(appPng)}" style="display:block"></body>`,
  );
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.locator("body").screenshot({ path });
  await page.context().close();
}

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function shootState(browser, appUrl, name, seeds) {
  const state = STATES[name];
  const key = `${state.board}--${name}`;
  const boardLabel = `Board: ${state.board}--${name}.png${state.nearest ? " (nearest)" : ""}`;
  const appLabel = `App: ${name}`;
  const { page: app, problems } = await openApp(browser, appUrl, name, state, seeds);
  const board = await openBoard(browser, state.board, state.boardOpts ?? {}, state.viewport, key);
  try {
    const boardPng = await board.screenshot();
    const appPng = await app.screenshot({
      path: `${outDir}${name}.app.png`,
      fullPage: state.fullPage === true,
    });
    const width = Math.max(pngSize(boardPng).width, pngSize(appPng).width);
    await compose(
      browser,
      boardPng,
      appPng,
      boardLabel,
      appLabel,
      width,
      `${outDir}${name}.pair.png`,
    );

    const regions = [];
    for (const region of Object.keys(REGIONS)) {
      const b = await regionHandle(board, region, true, state.boardCrop);
      const a = await regionHandle(app, region, false);
      if (b !== null && a !== null) {
        const bPng = await b.screenshot();
        const aPng = await a.screenshot();
        const w = Math.max(pngSize(bPng).width, pngSize(aPng).width);
        await compose(
          browser,
          bPng,
          aPng,
          `Board: ${region}`,
          `App: ${region}`,
          w,
          `${outDir}${name}.${region}.pair.png`,
        );
        regions.push(region);
      }
    }
    // a 3D view that could not be drawn (no WebGL here) has nothing to compare
    if (JUMP_STATES.includes(name) && !problems.some((p) => p.startsWith("WebGL is missing"))) {
      jumpBoxes.set(name, await measureJump(app));
    }
    const table = numbersTable(
      await measure(board, true, state.boardCrop),
      await measure(app, false),
    );
    // last: a probe may change the page
    for (const probe of state.probes ?? []) {
      problems.push(...(await PROBES[probe](app)));
    }
    writeFileSync(
      `${outDir}${name}.numbers.md`,
      `# ${name}: board ${state.board}${state.nearest ? ` (${state.nearest})` : ""} against the app\n\n${table}`,
    );
    return { regions, problems };
  } finally {
    await board.context().close();
    await app.context().close();
  }
}

// ---------------------------------------------------------------- main

mkdirSync(outDir, { recursive: true });
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  if (/Executable doesn't exist|playwright install/i.test(String(e.message))) {
    console.error(
      "Chromium is not installed for Playwright: run `npx playwright install chromium`, then npm run shots again.",
    );
    process.exit(1);
  }
  throw e;
}
let failed = 0;
try {
  await drawBoards(browser);
  if (boardsOnly) {
    await browser.close();
    process.exit(0);
  }
  const seedNames = [...new Set(stateNames.map((n) => STATES[n].seed).filter((s) => s !== null))];
  const seeds = await loadSeeds(seedNames);
  const appUrl = await startServer();
  // The first load makes Vite prepare its dependencies; a state then never sees that reload.
  const warm = await newPage(browser, { width: 1440, height: 900 });
  await warm.goto(appUrl, { waitUntil: "networkidle" });
  await warm.context().close();

  const lines = [];
  for (const name of stateNames) {
    try {
      const { regions, problems } = await shootState(browser, appUrl, name, seeds);
      // what fails a state (its pictures are written first: they show by how much)
      const hard = problems.filter((p) =>
        /^(the (page scrolls|stage scrolls|plan box)|probe )/.test(p),
      );
      const paired = `regions ${regions.length > 0 ? regions.join(", ") : "none paired"}`;
      if (hard.length > 0) {
        failed += 1;
        lines.push(`FAILED  ${name}: ${hard.join("; ")} (pictures written; ${paired})`);
      } else {
        lines.push(`ok      ${name}: ${paired}`);
      }
      for (const p of problems.filter((p) => !hard.includes(p))) {
        lines.push(`        ${p}`);
      }
    } catch (e) {
      failed += 1;
      lines.push(`FAILED  ${name}: ${firstLine(e)}`);
    }
  }
  for (const { pair, sizeOnly } of JUMP_PAIRS) {
    if (!pair.every((n) => jumpBoxes.has(n))) {
      continue;
    }
    const problems = jumpProblems(...pair.map((n) => jumpBoxes.get(n)), { sizeOnly });
    // a region found in neither state is not a failure: it only says the check had nothing to compare
    const hard = problems.filter((p) => !p.endsWith("(nothing compared)"));
    failed += hard.length > 0 ? 1 : 0;
    const slides =
      sizeOnly.length > 0 ? ` (the ${sizeOnly.join(" and ")} may slide, not resize)` : "";
    lines.push(
      hard.length > 0
        ? `FAILED  jump (${pair.join(" and ")}): ${hard.join("; ")}`
        : `ok      jump: header, rail, status and plan box do not move between ${pair.join(" and ")}${slides}${problems.length > 0 ? ` (${problems.join("; ")})` : ""}`,
    );
  }
  console.log(`\n${lines.join("\n")}\n\nout: ${outDir}`);
  writeFileSync(`${outDir}summary.txt`, `${lines.join("\n")}\n`);
} finally {
  await browser.close();
  stopServer();
}
process.exit(failed > 0 ? 1 : 0);
