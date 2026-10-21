// src/screens/workspace.style.test.ts
// The wide-screen rules (0.9.0, board WideStage2): the app is one centred block, and the stage's
// working column is one width. jsdom draws no CSS, so the rules are read from the files.
import { describe, expect, it } from "vitest";
import tokens from "../styles/tokens.css?raw";
import stage from "./stage.css?raw";
import workspace from "./workspace.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(workspace);

/** The declarations of every rule whose selector list holds this selector, joined. */
function ruleFor(selector: string, source = css): string {
  let out = "";
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      selectors
        .split(",")
        .map((s) => s.trim())
        .includes(selector)
    ) {
      out += body;
    }
  }
  return out;
}

const token = (name: string): string =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(strip(tokens))?.[1]?.trim() ?? "";

describe("the page block (workspace.css)", () => {
  it("is 1600 px at most, a token the rules share", () => {
    expect(token("--block-max")).toBe("1600px");
  });

  it("centres the body (rail and stage) in a block of that width", () => {
    const body = ruleFor(".ws-body");
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/max-width:\s*var\(--block-max\)/);
    expect(body).toMatch(/margin-inline:\s*auto/);
  });

  it("keeps the header's rule across the window and its content in the block", () => {
    expect(ruleFor(".ws-header")).toMatch(/border-bottom:\s*1px solid var\(--rule\)/);
    const bar = ruleFor(".ws-header > .hd");
    expect(bar).toMatch(/max-width:\s*var\(--block-max\)/);
    expect(bar).toMatch(/margin-inline:\s*auto/);
    expect(bar).toMatch(/border-bottom:\s*0/);
  });

  it("draws the rail's left edge where the block starts, once the window is wider than it", () => {
    const wide = css.indexOf("@media (width > 1600px)");
    expect(wide).toBeGreaterThan(-1);
    const block = css.slice(wide);
    expect(ruleFor(".ws-rail", block.slice(block.indexOf("{") + 1))).toMatch(
      /border-left:\s*1px solid var\(--rule\)/,
    );
  });
});

describe("the working column (workspace.css)", () => {
  it("is as wide as the frame can be (--plan-max), a token of its own", () => {
    expect(token("--stage-col")).toBe("var(--plan-max)");
    expect(token("--plan-max")).toBe("900px");
  });

  it("holds the notices, the heading, the switches and the plan in one centred width", () => {
    for (const selector of [
      '.ws-stage > .app-notices:not([data-empty="true"])',
      '.ws-stage > [data-region="status"]',
      ".ws-stage > .stage-segs",
      ".ws-stage > .plan-col",
    ]) {
      const column = ruleFor(selector);
      expect(column, selector).toMatch(/width:\s*100%/);
      expect(column, selector).toMatch(/max-width:\s*var\(--stage-col\)/);
      expect(column, selector).toMatch(/align-self:\s*center/);
    }
  });
});

describe("the switches row (stage.css)", () => {
  const rules = strip(stage);

  it("sits under the heading, at the column's right edge, with the View switch last", () => {
    const row = ruleFor(".stage-segs", rules);
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/justify-content:\s*flex-end/);
  });

  it("lets a Layer switch longer than the row scroll in its own slot", () => {
    const layer = ruleFor(".stage-segs__layer", rules);
    expect(layer).toMatch(/min-width:\s*0/);
    expect(layer).toMatch(/overflow-x:\s*auto/);
  });

  it("keeps the action on the heading's line from a tablet's width: the heading gives way", () => {
    const at = rules.indexOf("@media (width >= 760px)");
    expect(at).toBeGreaterThan(-1);
    const block = rules.slice(at);
    const inBlock = (selector: string): string =>
      ruleFor(selector, block.slice(block.indexOf("{") + 1));
    expect(inBlock(".ws-stage .k-status")).toMatch(/flex-wrap:\s*nowrap/);
    expect(inBlock(".ws-stage .k-status__lead")).toMatch(/flex:\s*0 1 auto/);
    expect(inBlock(".ws-stage .k-status__extra")).toMatch(/flex:\s*none/);
    // the muted line is one line, so Stop and Keep searching leave the heading as tall as it was
    expect(inBlock(".ws-stage .k-status__line:not(:has(.stage-list))")).toMatch(
      /white-space:\s*nowrap/,
    );
  });

  it("stretches Layer only on a phone", () => {
    expect(ruleFor(".stage-segs--phone > .k-seg", rules)).toMatch(/flex:\s*1\b/);
    expect(ruleFor(".stage-segs > .k-seg", rules)).toBe("");
  });
});
