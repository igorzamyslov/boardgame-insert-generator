// src/screens/boxStage.style.test.ts
// The box editor's rules that no DOM test can see (jsdom draws no CSS): Box's and MobileBox's values.
import { describe, expect, it } from "vitest";
import panel from "../ui/boxPanel.css?raw";
import stage from "./boxStage.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule with exactly this selector. */
function ruleFor(selector: string, source: string): string {
  for (const [, selectors = "", body = ""] of strip(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim() === selector) {
      return body;
    }
  }
  return "";
}

describe("boxStage.css", () => {
  it("is read (a stylesheet that imports as empty would pass every rule below by finding none)", () => {
    expect(stage.length).toBeGreaterThan(1000);
    expect(panel.length).toBeGreaterThan(1000);
  });

  it("draws the side view as Box's: 560 px at most, 16 px round, the box's ground and its inset line", () => {
    const drawing = ruleFor(".bx-drawing", stage);
    expect(drawing).toMatch(/width:\s*min\(560px, calc\(100vw - 48px\)\)/);
    expect(drawing).toMatch(/border-radius:\s*var\(--r-panel\)/);
    expect(drawing).toMatch(/background:\s*var\(--box\)/);
    expect(drawing).toMatch(/box-shadow:\s*var\(--box-inset-side\)/);
    expect(drawing).toMatch(/overflow:\s*hidden/);
  });

  it("draws the free band as Box's: 46 px, white, a dashed line under it, 14 px 600", () => {
    const band = ruleFor(".bx-band", stage);
    expect(band).toMatch(/height:\s*46px/);
    expect(band).toMatch(/border-bottom:\s*2px dashed var\(--spacer-dash\)/);
    expect(band).toMatch(/background:\s*var\(--sheet\)/);
    expect(band).toMatch(/font-size:\s*var\(--text-sm\)/);
    expect(band).toMatch(/font-weight:\s*600/);
  });

  it("places each block by its own x, z, w and h on a plane, 3 px in so blocks are 6 px apart", () => {
    expect(ruleFor(".bx-floor", stage)).toMatch(/position:\s*relative/);
    expect(ruleFor(".bx-floor", stage)).toMatch(/height:\s*var\(--bx-rows\)/);
    expect(ruleFor(".bx-plane", stage)).toMatch(/inset:\s*var\(--bx-inset\)/);
    const side = ruleFor(".bx-side", stage);
    expect(side).toMatch(/--bx-rows:\s*278px/);
    expect(side).toMatch(/--bx-gap:\s*var\(--s-6\)/);
    expect(side).toMatch(/--bx-inset:\s*calc\(var\(--bx-gap\) \/ 2\)/);
    const tray = ruleFor(".bx-tray", stage);
    expect(tray).toMatch(/position:\s*absolute/);
    expect(tray).toMatch(/left:\s*calc\(var\(--x\) \+ var\(--bx-inset\)\)/);
    expect(tray).toMatch(/bottom:\s*calc\(var\(--z\) \+ var\(--bx-inset\)\)/);
    expect(tray).toMatch(/width:\s*calc\(var\(--w\) - var\(--bx-gap\)\)/);
    expect(tray).toMatch(/height:\s*calc\(var\(--h\) - var\(--bx-gap\)\)/);
    expect(tray).toMatch(/border:\s*2px solid var\(--tile-line/);
    expect(tray).toMatch(/border-radius:\s*var\(--bx-tray-r\)/);
    expect(tray).toMatch(/background:\s*var\(--tile-fill/);
  });

  it("draws MobileBox's smaller drawing: 358 px, 14 px round, a 30 px band, 5 px gaps, 7 px blocks", () => {
    const side = ruleFor(".bx-side[data-phone]", stage);
    expect(side).toMatch(/--bx-rows:\s*178px/);
    expect(side).toMatch(/--bx-gap:\s*var\(--s-5\)/);
    expect(side).toMatch(/--bx-tray-r:\s*7px/);
    expect(side).toMatch(/gap:\s*var\(--s-8\)/);
    const drawing = ruleFor(".bx-side[data-phone] .bx-drawing", stage);
    expect(drawing).toMatch(/width:\s*min\(358px, 100%\)/);
    expect(drawing).toMatch(/border-radius:\s*var\(--r-card\)/);
    expect(ruleFor(".bx-side[data-phone] .bx-band", stage)).toMatch(/height:\s*30px/);
  });

  it("centres the stage's picture and keeps the label a 600 line, not a 28 px heading", () => {
    const body = ruleFor(".bx-stage__body", stage);
    expect(body).toMatch(/justify-content:\s*center/);
    expect(body).toMatch(/gap:\s*var\(--s-18\)/);
    const label = ruleFor(".bx-label", stage);
    expect(label).toMatch(/font:\s*inherit/);
    expect(label).toMatch(/font-weight:\s*600/);
    expect(label).toMatch(/color:\s*var\(--muted-strong\)/);
  });
});

describe("boxPanel.css", () => {
  it("lays the panel out as Box's rail: 22 px between the parts and 16 px above them", () => {
    expect(ruleFor(".ed.bx:not(.ed--phone)", panel)).toMatch(/gap:\s*var\(--s-22\)/);
    expect(ruleFor(".ws--box .ws-rail", panel)).toMatch(/padding-top:\s*var\(--s-16\)/);
    expect(ruleFor(".bx-title", panel)).toMatch(/font:\s*700 var\(--h2-panel\)/);
  });

  it("draws three sizes 10 px apart, and a rule over the space kept free and over the storage row", () => {
    const sizes = ruleFor(".bx-sizes", panel);
    expect(sizes).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    expect(sizes).toMatch(/gap:\s*var\(--s-10\)/);
    for (const selector of [".bx-top", ".bx-stored"]) {
      const rule = ruleFor(selector, panel);
      expect(rule).toMatch(/border-top:\s*1px solid var\(--rule-soft\)/);
      expect(rule).toMatch(/padding-top:\s*var\(--s-16\)/);
    }
    expect(ruleFor(".bx-top", panel)).toMatch(/gap:\s*var\(--s-10\)/);
  });

  it("makes the space field 96 px (the rail is 300, not Box's 340), beside a segment that takes the rest", () => {
    expect(ruleFor(".bx-top .bx-headroom", panel)).toMatch(/width:\s*96px/);
    // "285" stays whole in an 80 px field
    expect(ruleFor(".bx-sizes .k-field__box", panel)).toMatch(/padding:\s*0 var\(--s-8\)/);
    expect(ruleFor(".bx-top .k-seg", panel)).toMatch(/flex:\s*1 1 0/);
  });

  it("puts Done at the foot on the right, in sight", () => {
    const foot = ruleFor(".bx-foot", panel);
    expect(foot).toMatch(/margin-top:\s*auto/);
    expect(foot).toMatch(/justify-content:\s*flex-end/);
    expect(foot).toMatch(/position:\s*sticky/);
  });

  it("draws MobileBox's sheet: 20 px between parts, a 56 px row, a 24 px checkbox", () => {
    expect(ruleFor(".bx--phone .ed-scroll", panel)).toMatch(/gap:\s*var\(--s-20\)/);
    expect(ruleFor(".bx--phone .k-check", panel)).toMatch(/min-height:\s*56px/);
    const box = ruleFor(".bx--phone .k-check .k-check__box", panel);
    expect(box).toMatch(/width:\s*24px/);
    expect(box).toMatch(/height:\s*24px/);
    const block = ruleFor(".bx-side-block", panel);
    expect(block).toMatch(/border-top:\s*1px solid var\(--rule-soft\)/);
    expect(block).toMatch(/gap:\s*var\(--s-8\)/);
  });
});
