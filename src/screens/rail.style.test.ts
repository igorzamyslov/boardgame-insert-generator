// src/screens/rail.style.test.ts
// The rail's rules that no DOM test can see (jsdom draws no CSS).
import { describe, expect, it } from "vitest";
import kit from "../kit/kit.css?raw";
import css from "./rail.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");
const stripped = strip(css);

/** The declarations of the first rule with exactly this selector. */
function ruleFor(selector: string, source = stripped): string {
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim() === selector) {
      return body;
    }
  }
  return "";
}

describe("rail.css", () => {
  it("scrolls the list inside the rail", () => {
    const list = ruleFor(".rail-list");
    expect(list).toMatch(/overflow:\s*auto/);
    expect(list).toMatch(/min-height:\s*0/);
    // the column the list is in keeps its own height to the rail's, so the list is what gives
    expect(ruleFor(".rail")).toMatch(/min-height:\s*0/);
    expect(ruleFor(".rail")).toMatch(/flex-direction:\s*column/);
  });

  it("keeps the list's scrollbar at the rail's edge, with a gutter of its own, off the rows", () => {
    const list = ruleFor(".rail-list");
    expect(list).toMatch(/scrollbar-gutter:\s*stable/);
    // it reaches over the rail's padding to the edge, and puts the padding back inside itself
    expect(list).toMatch(/margin:[^;]*calc\(-1 \* var\(--rail-pad\)\)/);
    expect(list).toMatch(/padding:[^;]*calc\(var\(--rail-pad\) - var\(--scroll-gutter\)\)/);
    // the phone's sheet list has no scroll of its own and no rail to reach over
    const sheet = ruleFor(".rail-list--sheet");
    expect(sheet).toMatch(/margin:\s*0/);
    expect(sheet).toMatch(/padding:\s*0/);
  });

  it("keeps the foot at the bottom of the rail, under the note", () => {
    const foot = ruleFor(".rail-foot");
    expect(foot).toMatch(/margin-top:\s*auto/);
    expect(foot).toMatch(/padding-top:\s*var\(--s-12\)/);
    expect(foot).toMatch(/border-top:\s*1px solid var\(--rule-soft\)/);
  });

  it("draws Main's rail: 16 px between the parts, the note on the page's colour", () => {
    expect(ruleFor(".rail")).toMatch(/gap:\s*var\(--s-16\)/);
    const note = ruleFor(".rail-note");
    expect(note).toMatch(/padding:\s*var\(--s-12\)/);
    expect(note).toMatch(/border-radius:\s*var\(--r-field\)/);
    expect(note).toMatch(/background:\s*var\(--page\)/);
  });

  it("keeps the box card's size and the foot's bed on one line, cut when too long", () => {
    for (const selector of [".rail-box__size", ".rail-foot__text"]) {
      const rule = ruleFor(selector);
      expect(rule, selector).toMatch(/white-space:\s*nowrap/);
      expect(rule, selector).toMatch(/overflow:\s*hidden/);
      expect(rule, selector).toMatch(/text-overflow:\s*ellipsis/);
      expect(rule, selector).toMatch(/min-width:\s*0/);
    }
    // the numbers keep their 16 px; only the unit is smaller and muted
    expect(ruleFor(".rail-box__size")).toMatch(/font-size:\s*16px/);
    expect(ruleFor(".rail-box__unit")).toMatch(/font-size:\s*var\(--text-xs\)/);
    expect(ruleFor(".rail-box__unit")).toMatch(/color:\s*var\(--muted\)/);
    // "Change" shares the label's line, so the size has the width under both
    expect(ruleFor(".rail-box__top")).toMatch(/justify-content:\s*space-between/);
  });

  it("keeps a 44 px target on Clear all my choices and Settings", () => {
    expect(ruleFor(".rail-clear")).toMatch(/min-height:\s*var\(--control-h\)/);
    // Settings is a kit Button: 44 px tall, with Main's 8 px aside
    expect(ruleFor(".rail-settings")).toMatch(/padding:\s*0 var\(--s-8\)/);
    expect(strip(kit)).toMatch(/\.k-btn\s*\{[^}]*height:\s*var\(--control-h\)/);
  });

  it("opens the picker under the Add pill, right-aligned, and over it on the sheet", () => {
    const panel = ruleFor(".kp__panel");
    expect(panel).toMatch(/position:\s*absolute/);
    expect(panel).toMatch(/top:\s*calc\(100% \+ var\(--s-4\)\)/);
    expect(panel).toMatch(/right:\s*0/);
    expect(ruleFor('.kp__panel[data-placement="above"]')).toMatch(
      /bottom:\s*calc\(100% \+ var\(--s-4\)\)/,
    );
  });

  it("lets the sheet's list sit flush in the sheet's own scroll", () => {
    const list = ruleFor(".rail-list--sheet");
    expect(list).toMatch(/overflow:\s*visible/);
    expect(list).toMatch(/gap:\s*0/);
  });

  it("draws the picker (G3) as two columns of 400 px from the heading's left, over the stage", () => {
    const panel = ruleFor(".rail-head .kp__panel");
    expect(panel).toMatch(/left:\s*0/);
    expect(panel).toMatch(/right:\s*auto/);
    // over the rail's resize handle (z-index 5), whose hit area lies where the panel reaches
    expect(panel).toMatch(/z-index:\s*6/);
    expect(panel).toMatch(/top:\s*calc\(100% \+ var\(--s-8\)\)/);
    const grid = ruleFor(".rail-head .kp__panel > .k-menu");
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    // 400 px is a desktop's: a fixed width over 390 px stays out of the phone's rules
    expect(stripped).toMatch(
      /@media \(width >= 760px\)\s*\{\s*\.rail-head \.kp__panel > \.k-menu\s*\{[^}]*width:\s*400px/,
    );
    expect(grid).toMatch(/gap:\s*var\(--s-8\)/);
    expect(grid).toMatch(/padding:\s*var\(--s-8\)/);
    // the rail clips its content; while the picker is open it may overhang the stage
    expect(ruleFor(".ws-rail:has(.kp__panel)")).toMatch(/overflow:\s*visible/);
  });

  it("frames a group's card (G1): the box card's ground, a 1 px rule, 4 px inside, 2 px between rows", () => {
    const card = ruleFor(".gc");
    expect(card).toMatch(/padding:\s*var\(--s-4\)/);
    expect(card).toMatch(/gap:\s*var\(--s-2\)/);
    expect(card).toMatch(/border:\s*1px solid var\(--rule\)/);
    expect(card).toMatch(/border-radius:\s*var\(--r-card\)/);
    expect(card).toMatch(/background:\s*var\(--row\)/);
  });

  it("presses or lights a group's header with the strong edge on the sheet ground (G1)", () => {
    const pressed = ruleFor('.gc-head[aria-pressed="true"],\n.gc-head[data-lit="true"]');
    expect(pressed).toMatch(/--k-bg:\s*var\(--sheet\)/);
    expect(pressed).toMatch(/border-color:\s*var\(--muted-strong\)/);
    expect(ruleFor(".gc-head__copies")).toMatch(/color:\s*var\(--muted\)/);
  });

  it("gives each member a 24 × 44 grip in the box's dash colour, and an empty card its dashed drop area", () => {
    const grip = ruleFor(".gc-grip");
    expect(grip).toMatch(/width:\s*var\(--s-24\)/);
    expect(grip).toMatch(/height:\s*44px/);
    expect(grip).toMatch(/color:\s*var\(--box-dash\)/);
    const empty = ruleFor(".gc-empty");
    expect(empty).toMatch(/border:\s*1\.5px dashed var\(--line-strong\)/);
    expect(empty).toMatch(/color:\s*var\(--muted\)/);
  });
});
