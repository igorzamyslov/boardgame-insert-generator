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
import { consoleSection, consoleSummary, splitErrors } from "./consoleErrors.mjs";
import { JUMP_REGIONS, jumpProblems } from "./jump.mjs";
import { trapProblems } from "./keys.mjs";
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
  } else if (step.scrollTop) {
    // a scrolling panel back to its top (a focused field scrolled it): the board is drawn unscrolled
    await page
      .locator(step.scrollTop)
      .first()
      .evaluate((el) => {
        el.scrollTop = 0;
      });
  } else if (step.tabTo) {
    // Tab (from where the focus is) until the focus is on the control with that role and name:
    // for a state reached by keyboard only.
    const { role, name, in: within, max = 60 } = step.tabTo;
    const scope = within ? page.locator(within) : page;
    const target = await scope
      .getByRole(role, { name })
      .first()
      .elementHandle({ timeout: STEP_TIMEOUT });
    for (let i = 0; i < max; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate((el) => el === document.activeElement, target)) {
        return;
      }
    }
    throw new Error(`Tab did not reach the ${role} "${name}" in ${max} presses`);
  } else if (step.press) {
    await page.keyboard.press(step.press);
  } else if (step.wait !== undefined) {
    await page.waitForTimeout(step.wait);
  } else {
    throw new Error(`unknown step ${JSON.stringify(step)}`);
  }
}

/** The keyboard probe's verdict per check, by state name (for the run's summary). */
const keyChecks = new Map();

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
  /**
   * Drag and drop in the rail (0.7.0 Task 14, R14; spec §7.3): the state (`kit-drag`) starts on the kit
   * seed. The probe drags Market deck's grip (an ungrouped row's grip shows on hover) with the mouse to
   * the gap between Starter deck and Resources, and asserts:
   *   - while the button is down: the lifted row carries `--shadow-sheet`, a 2 px `--focus` line marks
   *     the place, the group being entered has `--focus-wash` and a dashed `--focus` edge (the mid-drag
   *     picture is `kit-drag.mid-drag.png`, for the reviewer to judge against §7.3), and the rail's
   *     width has not moved (a drag does not start a resize);
   *   - after the drop: the group's order is Starter deck, Market deck, Resources, Hero, the rail's
   *     live region says Market deck moved to Player kit, and one Undo puts it back and leaves
   *     nothing more to undo;
   *   - Escape in the middle of a drag cancels it: the order is as it was, the row and the line are
   *     gone, and there is nothing to undo.
   */
  async "drag-into-group"(page) {
    const problems = [];
    const rail = page.locator('[data-region="rail"]');
    const marketRow = rail.locator('li.rail-item[aria-label="Market deck"]');
    const grip = marketRow.locator("[data-grip]");
    if ((await grip.count()) === 0) {
      return ["probe drag-into-group: the Market deck row has no drag grip"];
    }
    const members = () =>
      rail
        .locator(".gc-member")
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    const live = () => rail.locator('[data-live="rail"]').textContent();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const canUndo = async () =>
      (await undo.getAttribute("aria-disabled")) !== "true" && !(await undo.isDisabled());
    const start = ["Starter deck", "Resources", "Hero"];
    const sameOrder = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!sameOrder(await members(), start)) {
      return [`probe drag-into-group: it starts from ${JSON.stringify(await members())}`];
    }
    const widthBefore = (await rail.boundingBox())?.width;
    /** The pointer's place: the gap between two member rows, in the page. */
    const gap = async () => {
      const a = await rail.locator('.gc-member[aria-label="Starter deck"]').boundingBox();
      const b = await rail.locator('.gc-member[aria-label="Resources"]').boundingBox();
      return { x: a.x + a.width / 2, y: (a.y + a.height + b.y) / 2 };
    };
    // off hover the grip is unseen and takes no press: what is at the row's left edge is the row
    await page.mouse.move(700, 450);
    const edge = await marketRow.boundingBox();
    const atEdge = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return { grip: el?.closest(".gc-grip") !== null, row: el?.closest(".k-row") !== null };
      },
      [edge.x + 4, edge.y + edge.height / 2],
    );
    if (atEdge.grip || !atEdge.row) {
      problems.push("off hover a press on the row's left edge lands on the grip, not the row");
    }
    // the grip of an ungrouped row shows on hover: the pointer goes to the row first
    const holdMarket = async () => {
      const row = await marketRow.boundingBox();
      await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
      const g = await grip.boundingBox();
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      const to = await gap();
      await page.mouse.move(to.x, to.y - 20, { steps: 6 });
      await page.mouse.move(to.x, to.y, { steps: 6 });
      return to;
    };

    // 1. mid-drag: the look (spec §7.3)
    await holdMarket();
    const look = await page.evaluate(() => {
      const css = (el, p) => getComputedStyle(el)[p];
      // what the tokens come to, read off scratch elements
      const scratch = (style) => {
        const el = document.createElement("div");
        el.style.cssText = `position:fixed;${style}`;
        document.body.append(el);
        return el;
      };
      const shadow = scratch("box-shadow:var(--shadow-sheet)");
      const wash = scratch("background-color:var(--focus-wash)");
      const focus = scratch("background-color:var(--focus)");
      const want = {
        shadow: css(shadow, "boxShadow"),
        wash: css(wash, "backgroundColor"),
        focus: css(focus, "backgroundColor"),
      };
      for (const el of [shadow, wash, focus]) {
        el.remove();
      }
      const lifted = document.querySelector(".is-lifted");
      const mark = document.querySelector(".rail-dropline");
      const card = document.querySelector('.gc[data-drop="true"]');
      return {
        lifted: lifted
          ? { shadow: css(lifted, "boxShadow"), name: lifted.getAttribute("aria-label") }
          : null,
        line: mark
          ? {
              height: mark.getBoundingClientRect().height,
              color: css(mark, "backgroundColor"),
              shown: css(mark, "display") !== "none",
            }
          : null,
        card: card
          ? {
              wash: css(card, "backgroundColor"),
              edge: css(card, "borderTopStyle"),
              edgeColor: css(card, "borderTopColor"),
            }
          : null,
        want,
      };
    });
    if (look.lifted === null) {
      problems.push("while the grip is held the row does not lift (no .is-lifted)");
    } else {
      if (look.lifted.shadow !== look.want.shadow) {
        problems.push(`the lifted row's shadow is ${look.lifted.shadow}, not --shadow-sheet`);
      }
      if (look.lifted.name !== "Market deck") {
        problems.push(`the lifted row is ${look.lifted.name}, not Market deck`);
      }
    }
    if (look.line === null || !look.line.shown) {
      problems.push("no drop line is shown between Starter deck and Resources");
    } else {
      if (Math.abs(look.line.height - 2) > 0.01) {
        problems.push(`the drop line is ${look.line.height} px high, not 2`);
      }
      if (look.line.color !== look.want.focus) {
        problems.push(`the drop line is ${look.line.color}, not --focus`);
      }
    }
    if (look.card === null) {
      problems.push("the group being entered has no data-drop");
    } else {
      if (look.card.wash !== look.want.wash) {
        problems.push(`the group being entered is ${look.card.wash}, not --focus-wash`);
      }
      if (look.card.edge !== "dashed" || look.card.edgeColor !== look.want.focus) {
        problems.push(
          `the group being entered has a ${look.card.edge} ${look.card.edgeColor} edge, not dashed --focus`,
        );
      }
    }
    const widthDuring = (await rail.boundingBox())?.width;
    if (widthBefore !== widthDuring) {
      problems.push(`the rail's width went from ${widthBefore} to ${widthDuring} during the drag`);
    }
    await page.screenshot({ path: `${outDir}kit-drag.mid-drag.png` });
    await rail.screenshot({ path: `${outDir}kit-drag.mid-drag.rail.png` });

    // 2. the drop: the order, the live region, one undo step
    await page.mouse.up();
    await page.waitForTimeout(100);
    const dropped = await members();
    if (!sameOrder(dropped, ["Starter deck", "Market deck", "Resources", "Hero"])) {
      problems.push(`after the drop the group's order is ${JSON.stringify(dropped)}`);
    }
    const said = (await live()) ?? "";
    if (!said.includes("Market deck moved to Player kit.")) {
      problems.push(`the live region says "${said}", not that Market deck moved to Player kit`);
    }
    if ((await page.locator(".is-lifted, .rail-dropline, [data-drop]").count()) !== 0) {
      problems.push("the lift, the line or the group's wash is left after the drop");
    }
    if ((await rail.boundingBox())?.width !== widthBefore) {
      problems.push("the rail's width changed with the drop");
    }
    if (!(await canUndo())) {
      problems.push("after the drop there is nothing to undo");
    } else {
      await undo.click();
      await page.waitForTimeout(100);
      if (!sameOrder(await members(), start)) {
        problems.push(
          `one Undo leaves the order ${JSON.stringify(await members())}, not the start`,
        );
      }
      if (await canUndo()) {
        problems.push("after one Undo there is still a step to undo: the drop was more than one");
      }
    }

    // 3. Escape in the middle of a drag cancels it
    await holdMarket();
    if ((await page.locator(".is-lifted").count()) !== 1) {
      problems.push("the second drag did not begin (nothing is lifted)");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    if ((await page.locator(".is-lifted, .rail-dropline, [data-drop]").count()) !== 0) {
      problems.push("Escape left the lift, the line or the group's wash");
    }
    await page.mouse.up();
    await page.waitForTimeout(100);
    if (!sameOrder(await members(), start)) {
      problems.push(`after Escape the order is ${JSON.stringify(await members())}, not the start`);
    }
    if (await canUndo()) {
      problems.push("a cancelled drag left a step to undo");
    }
    return problems.map((p) => `probe drag-into-group: ${p}`);
  },
  /**
   * The Settings drawer by keyboard (0.6.0 carry): the state opened it with keys alone (Tab to the
   * project menu's button, Enter, Tab to Settings, Enter). Tab then stays inside the drawer and
   * comes round from the last control to the first, Shift+Tab from the first goes to the last, what
   * is behind the drawer is inert (it cannot take the focus, and a click on it does nothing),
   * Escape closes the drawer, and the focus goes back to the project menu's button, which is what
   * opened it (the menu hands the focus to its button before Settings opens: Header.tsx).
   * The result of each check is kept in `keyChecks` for the report.
   */
  async "settings-keys"(page, name) {
    const problems = [];
    const checks = [];
    const check = (what, found) => {
      checks.push(`${found.length === 0 ? "pass" : "FAIL"}  ${what}`);
      problems.push(...found);
    };
    const dialog = page.locator('dialog[data-region="drawer"]');
    if ((await dialog.count()) === 0) {
      return ["probe settings-keys: the drawer is not open: the keyboard steps did not open it"];
    }
    // where the focus is: in the drawer (a stable label with its place), in the browser's own
    // interface (nothing in the page has it: the body), or on the page behind the drawer
    const where = () =>
      page.evaluate(() => {
        const dlg = document.querySelector('dialog[data-region="drawer"]');
        const el = document.activeElement;
        const name = (e) =>
          `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}"`;
        if (el === null || el === document.body || el === document.documentElement) {
          return { kind: "browser", label: "the browser" };
        }
        if (dlg === null || !dlg.contains(el)) {
          return { kind: "behind", label: name(el) };
        }
        return {
          kind: "drawer",
          label: `${name(el)} #${[...dlg.querySelectorAll("*")].indexOf(el)}`,
        };
      });
    // the drawer opened at its heading (the first thing the focus is on)
    const start = await where();
    check(
      "the drawer opens with the focus inside it",
      start.kind === "drawer" && /Settings/.test(start.label)
        ? []
        : [`the focus is on ${start.label} when the drawer opens, not its heading`],
    );
    // 1. Tab through every control until one comes round again
    const stops = [];
    const behindLabels = [];
    let wrapTo = null;
    let viaBrowser = false;
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      const at = await where();
      if (at.kind === "browser") {
        viaBrowser = true;
      } else if (at.kind === "behind") {
        behindLabels.push(at.label);
      } else if (stops.some((s) => s.label === at.label)) {
        wrapTo = at.label;
        break;
      } else {
        stops.push(at);
      }
    }
    // 2. Shift+Tab from the first control: the Tab above left the focus on it
    let shiftTabFromFirst = "nothing";
    let shiftViaBrowser = false;
    if (wrapTo !== null) {
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press("Shift+Tab");
        const at = await where();
        shiftTabFromFirst = at.label;
        if (at.kind !== "browser") {
          break;
        }
        shiftViaBrowser = true;
      }
    }
    const trap = trapProblems({
      stops,
      behind: behindLabels,
      wrapTo,
      viaBrowser,
      shiftTabFromFirst,
      shiftViaBrowser,
    });
    check(
      `Tab stays inside the drawer (${stops.length} controls)`,
      trap.filter((t) => t.startsWith("Tab took") || t.includes("nothing to trap")),
    );
    check(
      `Tab past the last control comes round to the first${viaBrowser ? " (through the browser's own interface, as a native dialog does)" : ""}`,
      trap.filter((t) => t.startsWith("Tab past") || t.startsWith("Tab never")),
    );
    check(
      `Shift+Tab from the first control goes to the last${shiftViaBrowser ? " (through the browser's own interface)" : ""}`,
      trap.filter((t) => t.startsWith("Shift+Tab")),
    );
    // 3. the page behind is inert: its controls cannot take the focus, and a click goes nowhere
    const behind = await page.evaluate(() => {
      const dlg = document.querySelector('dialog[data-region="drawer"]');
      const outside = [
        ...document.querySelectorAll('button, a[href], input, [tabindex="0"]'),
      ].filter((el) => !dlg.contains(el) && !el.closest("[hidden]"));
      const focused = [];
      for (const el of outside) {
        el.focus();
        if (document.activeElement === el) {
          focused.push(
            `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}"`,
          );
        }
      }
      // put the focus back inside, as the checks below expect
      dlg.querySelector("h1")?.focus();
      return { outside: outside.length, focused, modal: dlg.matches(":modal") };
    });
    const inert = [];
    if (!behind.modal) {
      inert.push("the drawer is not a modal dialog (:modal does not match)");
    }
    if (behind.outside === 0) {
      inert.push("there is nothing behind the drawer to check");
    }
    if (behind.focused.length > 0) {
      inert.push(`controls behind the drawer took the focus: ${behind.focused.join(", ")}`);
    }
    // a click on the page where the drawer is not (the rail, on a desktop): the box editor must not open
    const rail = page.locator('[data-region="rail"] button').first();
    const r = (await rail.count()) > 0 ? await rail.boundingBox() : null;
    if (r !== null) {
      const top = await page.evaluate(
        ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("dialog")),
        { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      );
      // (on a phone the drawer covers the page: there is no spot to click)
      if (!top) {
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
        await page.waitForTimeout(150);
        if ((await dialog.count()) === 0) {
          inert.push("a click on the page behind closed the drawer");
        } else if ((await page.locator("section.bx, section.ed").count()) > 0) {
          inert.push("a click on the page behind reached it (an editor opened)");
        }
      }
    }
    check("the page behind the drawer is inert", inert);
    // 4. Escape closes it
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    check(
      "Escape closes the drawer",
      (await page.locator("dialog[open]").count()) === 0 ? [] : ["Escape left the drawer open"],
    );
    // 5. and the focus is back on the button that opened it (the project menu's)
    const back = await page.evaluate(() => {
      const el = document.activeElement;
      return `${el?.tagName.toLowerCase()} "${(el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 40)}"`;
    });
    check(
      "the focus goes back to the project menu's button",
      /^button "Project menu/.test(back)
        ? []
        : [`after Escape the focus is on ${back}, not the project menu's button`],
    );
    keyChecks.set(name, checks);
    return problems.map((p) => `probe settings-keys: ${p}`);
  },
  /**
   * The 3D frame and camera (feedback on 0.5.0, point 10): a long box is not cut off by its frame,
   * however it is turned and however far apart it is spread. The page's camera is turned by
   * dragging the canvas, a turn at a time round and over the model, with the spread at rest and at
   * full; after each, `__shotsScene.framing()` says how far the farthest corner of the box or of a
   * part is from the frame's edge (1: on it), and anything over 1 is a part cut off. Needs WebGL:
   * without it the frame is the fallback line and there is nothing to probe.
   */
  async "fit-3d"(page) {
    const canvas = page.locator("canvas.viewer-canvas");
    if ((await canvas.count()) === 0) {
      return [];
    }
    const framing = () => page.evaluate(() => globalThis.__shotsScene?.framing() ?? null);
    if ((await framing()) === null) {
      return [
        "probe fit-3d: the scene's shots window (__shotsScene) is missing: is this a --mode shots build?",
      ];
    }
    const problems = [];
    const box = await canvas.boundingBox();
    if (box === null) {
      return ["probe fit-3d: the canvas has no box"];
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const drag = async (dx, dy) => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(80);
    };
    const check = async (what) => {
      const { overflow } = await framing();
      if (overflow > 1) {
        problems.push(
          `the model is cut off by the frame ${what}: ${overflow.toFixed(3)} (over 1 is outside it)`,
        );
      }
    };
    const spread = page.getByLabel("Spread apart");
    for (const [label, value] of [
      ["together", "0"],
      ["half spread", "0.5"],
      ["spread apart", "1"],
    ]) {
      await spread.fill(value);
      await page.waitForTimeout(80);
      await check(`as it opens, ${label}`);
      // a turn about the vertical axis in steps, then over the top and under, back and forth
      for (const [dx, dy] of [
        [160, 0],
        [160, 0],
        [160, 0],
        [0, 120],
        [0, -240],
        [220, 90],
        [-420, -90],
      ]) {
        await drag(dx, dy);
        await check(`${label}, after turning it by ${dx},${dy}`);
      }
    }
    return problems.map((p) => `probe ${p.replace(/^probe /, "")}`);
  },
  /**
   * One selection for both views (parity): after a tray was chosen in Top and 3D opened, its bar
   * and rail row are still there, the selected tray keeps its colour while every other tray fades
   * toward the page's, pointing at a row (or focusing it) keeps that component's trays at full
   * colour and fades the rest, with no selection and no row nothing fades, and going back to Top
   * keeps the selection. Reads `__shotsScene` (shots mode only).
   */
  async "selection-parity"(page) {
    // The state selected Market deck in the top view, then opened 3D. Needs WebGL: without it the
    // frame is the fallback line and the harness already notes that, so there is nothing to probe.
    if ((await page.locator('[data-region="plan-box"].viewer-stage').count()) === 0) {
      return [];
    }
    const problems = [];
    const bar = page.locator('[data-region="tray-bar"]');
    const rail = page.locator('[data-region="rail"]');
    const pressed = () => rail.locator('button[aria-pressed="true"]');
    const glow = () => page.evaluate(() => globalThis.__shotsScene?.emissive() ?? null);
    const count = (map, hex) => Object.values(map).filter((v) => v === hex).length;
    const tints = () => page.evaluate(() => globalThis.__shotsScene?.tints() ?? null);
    const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    // how far a colour is from the page's, as the sum of its channel differences
    const away = (page, hex) => rgb(hex).reduce((n, c, i) => n + Math.abs(c - rgb(page)[i]), 0);
    // a tray is faded when its colour moved toward the page's, full when it is its own colour
    const stateOf = (t, page) =>
      t.color === t.base ? "full" : away(page, t.color) < away(page, t.base) ? "faded" : "other";
    const states = (read) =>
      Object.fromEntries(
        Object.entries(read.trays).map(([key, t]) => [key, stateOf(t, read.page)]),
      );
    const SELECTED = 0x444444;
    const LIT = 0x383838;

    // 1. the selection made in Top is still there in 3D: the bar, its rail row, the glowing tray
    if ((await bar.count()) !== 1) {
      problems.push(`the tray bar is not there in 3D (${await bar.count()} found)`);
    } else if (!/Market deck/.test((await bar.textContent()) ?? "")) {
      problems.push("the tray bar in 3D is not the Market deck's");
    }
    const rows = await pressed().allTextContents();
    if (rows.length !== 1 || !/^Market deck/.test(rows[0])) {
      problems.push(
        `the pressed rail rows in 3D are ${JSON.stringify(rows)}, not the Market deck's`,
      );
    }
    const before = await glow();
    if (before === null) {
      return [
        ...problems,
        "the scene's shots window (__shotsScene) is missing: is this a --mode shots build?",
      ].map((p) => `probe selection-parity: ${p}`);
    }
    if (count(before, SELECTED) !== 1) {
      problems.push(`${count(before, SELECTED)} trays glow as selected in 3D, not 1`);
    }
    if (count(before, LIT) !== 0) {
      problems.push("a tray is lit in 3D before any row is pointed at");
    }
    // the selected tray keeps its colour; every other tray moved toward the page's
    const selectedKeys = Object.keys(before).filter((k) => before[k] === SELECTED);
    const tinted = await tints();
    const sel = tinted === null ? {} : states(tinted);
    for (const key of selectedKeys) {
      if (sel[key] !== "full") {
        problems.push(`the selected tray's colour moved in 3D (${key} is ${sel[key]})`);
      }
    }
    const others = Object.entries(sel).filter(([key]) => !selectedKeys.includes(key));
    if (others.length === 0 || others.some(([, v]) => v !== "faded")) {
      problems.push(
        `with a tray selected, the other trays did not all fade toward the page's colour: ${JSON.stringify(Object.fromEntries(others))}`,
      );
    }

    // 2. pointing at another row lights its trays in the canvas: the glow table and the pixels change
    const canvas = page.locator(".viewer-canvas");
    const pixelsBefore = await canvas.screenshot();
    await rail
      .getByRole("button", { name: /^Starter decks/ })
      .first()
      .hover({ timeout: STEP_TIMEOUT });
    await page.waitForTimeout(400);
    const lit = await glow();
    const pixelsLit = await canvas.screenshot();
    // kept beside the state's pictures, for whoever judges how subtle the tint is
    writeFileSync(`${outDir}workspace-3d-selected.canvas-before.png`, pixelsBefore);
    writeFileSync(`${outDir}workspace-3d-selected.canvas-hover.png`, pixelsLit);
    if (count(lit, LIT) < 1) {
      problems.push("pointing at the Starter decks row lit no tray in 3D");
    }
    if (count(lit, SELECTED) !== 1) {
      problems.push("pointing at a row took the selected tray's glow away in 3D");
    }
    // the lit trays and the selected one are at full colour, every other tray is faded
    const litKeys = Object.keys(lit).filter((k) => lit[k] === LIT);
    const hovered = states((await tints()) ?? { page: "#000000", trays: {} });
    for (const [key, v] of Object.entries(hovered)) {
      const full = litKeys.includes(key) || selectedKeys.includes(key);
      if (full !== (v === "full")) {
        problems.push(
          `pointing at the Starter decks row: ${key} is ${v}, it should be ${full ? "full" : "faded"}`,
        );
      }
    }
    if (pixelsBefore.equals(pixelsLit)) {
      problems.push("pointing at the Starter decks row left the 3D canvas's pixels unchanged");
    }
    // keyboard focus lights the same trays: the row holds the focus, then loses it
    await page.mouse.move(720, 450);
    await page.waitForTimeout(300);
    if (count(await glow(), LIT) !== 0) {
      problems.push("a tray stays lit in 3D after the pointer left the row");
    }
    await rail
      .getByRole("button", { name: /^Starter decks/ })
      .first()
      .focus();
    await page.waitForTimeout(300);
    if (count(await glow(), LIT) < 1) {
      problems.push("focusing the Starter decks row lit no tray in 3D");
    }
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    if (count(await glow(), LIT) !== 0) {
      problems.push("a tray stays lit in 3D after the row lost the focus");
    }

    // 3. back to Top: the same tray is selected and the bar stays; then 3D again, where closing
    // the bar leaves nothing selected and nothing faded
    await page
      .locator('[data-region="status"]')
      .getByRole("button", { name: "Top", exact: true })
      .first()
      .click({ timeout: STEP_TIMEOUT });
    await page.waitForTimeout(300);
    if ((await bar.count()) !== 1 || !/Market deck/.test((await bar.textContent()) ?? "")) {
      problems.push("the tray bar is gone or changed after going back to Top");
    }
    if ((await page.locator(".plan-tile.is-selected").count()) < 1) {
      problems.push("no tile is selected in the top view after going back from 3D");
    }
    const rowsTop = await pressed().allTextContents();
    if (rowsTop.length !== 1 || !/^Market deck/.test(rowsTop[0])) {
      problems.push(`the pressed rail rows in Top are ${JSON.stringify(rowsTop)}`);
    }
    await page
      .locator('[data-region="status"]')
      .getByRole("button", { name: "3D", exact: true })
      .click({ timeout: STEP_TIMEOUT });
    await page.waitForFunction(
      () => Object.keys(globalThis.__shotsScene?.tints().trays ?? {}).length > 0,
      undefined,
      { timeout: STEP_TIMEOUT },
    );
    await page.waitForTimeout(500);
    const again = await tints();
    const againStates = again === null ? {} : states(again);
    if (Object.values(againStates).filter((v) => v === "full").length < 1) {
      problems.push("back in 3D the selected tray is not at full colour");
    }
    await bar.getByRole("button", { name: "Close", exact: true }).click({ timeout: STEP_TIMEOUT });
    await page.waitForTimeout(500);
    const closed = await tints();
    const closedStates = closed === null ? {} : states(closed);
    if (
      Object.keys(closedStates).length === 0 ||
      Object.values(closedStates).some((v) => v !== "full")
    ) {
      problems.push(
        `with nothing selected or pointed at, a tray is not at full colour: ${JSON.stringify(closedStates)}`,
      );
    }
    return problems.map((p) => `probe selection-parity: ${p}`);
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
    { storage: { ...seed?.storage, ...state.storage }, holds: state.holds ?? [] },
  );
  const problems = [];
  // What the page logs as an error (console.error and uncaught errors), for the numbers file and the
  // run's verdict: it is listened to from the first load to the end of the probes.
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
    }
  });
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
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
  // Nothing scrolls sideways at any width (0.6.0): not the page, and on a desktop not the stage either.
  const sideways = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      out.push("the page");
    }
    const stage = document.querySelector('[data-region="stage"]');
    if (stage !== null && stage.scrollWidth > stage.clientWidth + 1) {
      out.push("the stage");
    }
    return out;
  });
  if (sideways.length > 0) {
    problems.push(`sideways scroll: ${sideways.join(" and ")} (it must not at any width)`);
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
  if (state.stageBesideRail) {
    // The rail's width is the person's: the stage must still sit beside it, 360 px wide at least.
    const at = await page.evaluate(() => {
      const rail = document.querySelector('[data-region="rail"]')?.getBoundingClientRect();
      const stage = document.querySelector('[data-region="stage"]')?.getBoundingClientRect();
      return rail && stage
        ? {
            railRight: rail.right,
            railTop: rail.top,
            stageLeft: stage.left,
            stageTop: stage.top,
            stageW: stage.width,
          }
        : null;
    });
    if (
      at === null ||
      Math.abs(at.stageTop - at.railTop) > 1 ||
      at.stageLeft < at.railRight - 1 ||
      at.stageW < 359
    ) {
      problems.push(
        `the stage is not beside the rail with 360 px (${at === null ? "missing" : JSON.stringify(at)})`,
      );
    }
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
  return { page, problems, errors };
}

// ---------------------------------------------------------------- measuring and composing

const regionSource = (name) => REGIONS[name].board.toString();

// ---------------------------------------------------------------- nothing jumps (Review Focus 4)

// Pairs that must not differ: Keep searching turning into Stop, and the View segment turning to 3D.
// `sizeOnly`: a region that may slide but not change size (none now: the slot over the plan is as tall as the tray bar).
const JUMP_PAIRS = [
  { pair: ["workspace", "workspace-searching"], sizeOnly: [] },
  { pair: ["workspace", "workspace-3d"], sizeOnly: [] },
  // a tray chosen, then the 3D view: the plan's frame is where the selected top view has it (Task 8, 0.6.0)
  { pair: ["workspace-tray", "workspace-3d-selected"], sizeOnly: [] },
  { pair: ["workspace", "workspace-tray"], sizeOnly: [] },
  // a swap chosen puts its prompt over the box, so the plan is where it was with the bar alone (Task 8)
  { pair: ["workspace", "workspace-swap"], sizeOnly: [] },
  { pair: ["workspace-tray", "workspace-swap"], sizeOnly: [] },
  // the same at 1920×1080, where the plan is at its 900 px cap
  { pair: ["workspace-1920", "workspace-3d-1920"], sizeOnly: [] },
  { pair: ["workspace-1920", "workspace-tray-1920"], sizeOnly: [] },
  // a narrow stage (820 px: the controls take two rows): the View switch stays put too
  { pair: ["workspace-820", "workspace-820-searching"], sizeOnly: [] },
  { pair: ["workspace-820", "workspace-820-3d"], sizeOnly: [] },
  // the band just above the two-row controls: 3D's "All" and three layers fit one row or scroll in their slot
  { pair: ["workspace-940", "workspace-940-3d"], sizeOnly: [] },
  { pair: ["workspace-940", "workspace-940-searching"], sizeOnly: [] },
  { pair: ["workspace-960-long", "workspace-960-long-3d"], sizeOnly: [] },
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
    // a modal dialog's h1 is the page's h1 while it is open (the page behind it is inert)
    const el =
      document.querySelector("dialog[open] h1, [role=dialog] h1") || document.querySelector("h1");
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
  const h1 =
    document.querySelector("dialog[open] h1, [role=dialog] h1") || document.querySelector("h1");
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

/** What each state's page logged as an error, with the messages the state expects: for the summary line. */
const consoleErrorsByState = {};

async function shootState(browser, appUrl, name, seeds) {
  const state = STATES[name];
  const key = `${state.board}--${name}`;
  const boardLabel = `Board: ${state.board}--${name}.png${state.nearest ? " (nearest)" : ""}`;
  const appLabel = `App: ${name}`;
  const { page: app, problems, errors } = await openApp(browser, appUrl, name, state, seeds);
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
      problems.push(...(await PROBES[probe](app, name)));
    }
    // after the probes: they press keys and may make the page log
    const allowed = state.expectedErrors ?? [];
    consoleErrorsByState[name] = { errors, allowed };
    for (const message of splitErrors(errors, allowed).unexpected) {
      problems.push(`console error: ${message.replaceAll(/\s+/g, " ").trim()}`);
    }
    writeFileSync(
      `${outDir}${name}.numbers.md`,
      `# ${name}: board ${state.board}${state.nearest ? ` (${state.nearest})` : ""} against the app\n\n${table}\n${consoleSection(errors, allowed)}`,
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
        /^(the (page scrolls|stage scrolls|stage is not beside|plan box)|probe |console error|sideways scroll)/.test(
          p,
        ),
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
      for (const c of keyChecks.get(name) ?? []) {
        lines.push(`        keys: ${c}`);
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
        : `ok      jump: header, rail, status, view switch and plan box do not move between ${pair.join(" and ")}${slides}${problems.length > 0 ? ` (${problems.join("; ")})` : ""}`,
    );
  }
  lines.push("", consoleSummary(consoleErrorsByState));
  console.log(`\n${lines.join("\n")}\n\nout: ${outDir}`);
  writeFileSync(`${outDir}summary.txt`, `${lines.join("\n")}\n`);
} finally {
  await browser.close();
  stopServer();
}
process.exit(failed > 0 ? 1 : 0);
