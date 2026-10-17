// src/screens/firstVisit.style.test.ts
// The first visit's rules that no DOM test can see (jsdom draws no CSS).
import { describe, expect, it } from "vitest";
import css from "./firstVisit.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");
const stripped = strip(css);

/** The declarations of the first rule with exactly this selector, inside or outside a media query. */
function ruleFor(selector: string, source = stripped): string {
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim() === selector) {
      return body;
    }
  }
  return "";
}

/** What is inside the one media query for a phone. */
const phoneCss = stripped.slice(stripped.indexOf("@media (width < 760px)"));

describe("firstVisit.css", () => {
  it("is read (a stylesheet that imports as empty would pass every rule below by finding none)", () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(phoneCss).toContain("@media (width < 760px)");
  });

  it("keeps Empty's rail: two steps 28 px apart, the foot at the bottom, the list scrolling inside", () => {
    const rail = ruleFor(".fv-rail");
    expect(rail).toMatch(/gap:\s*var\(--s-28\)/);
    expect(rail).toMatch(/overflow:\s*auto/);
    expect(rail).toMatch(/min-height:\s*0/);
    expect(ruleFor(".fv-foot")).toMatch(/margin-top:\s*auto/);
    expect(ruleFor(".fv-step")).toMatch(/gap:\s*var\(--s-14\)/);
  });

  it("draws three fields in a grid of 10 px and the kinds two to a row, the last across both", () => {
    const fields = ruleFor(".fv-fields");
    expect(fields).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    expect(fields).toMatch(/gap:\s*var\(--s-10\)/);
    expect(ruleFor(".fv-kinds")).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
    expect(ruleFor(".fv-kinds > :last-child")).toMatch(/grid-column:\s*span 2/);
  });

  it("draws the error as Empty's card: 10 12, radius 12, the danger colours, 14 px", () => {
    const card = ruleFor(".fv-error");
    expect(card).toMatch(/padding:\s*var\(--s-10\) var\(--s-12\)/);
    expect(card).toMatch(/border-radius:\s*var\(--r-field\)/);
    expect(card).toMatch(/background:\s*var\(--danger-bg\)/);
    expect(card).toMatch(/color:\s*var\(--danger-ink\)/);
    expect(card).toMatch(/font-size:\s*var\(--text-sm\)/);
  });

  it("sets the h1 at the first-visit size, 560 px at most", () => {
    const title = ruleFor(".fv-title");
    expect(title).toMatch(/var\(--h1-first\)/);
    expect(title).toMatch(/max-width:\s*560px/);
    expect(title).toMatch(/letter-spacing:\s*-0\.02em/);
  });

  it("draws the empty box: min(440px, the screen less 96 px), radius 16, the dashed frame inside", () => {
    const box = ruleFor(".fv-box");
    expect(box).toMatch(/width:\s*min\(440px, calc\(100vw - 96px\)\)/);
    expect(box).toMatch(/aspect-ratio:\s*1/);
    expect(box).toMatch(/padding:\s*8%/);
    expect(box).toMatch(/border-radius:\s*var\(--r-panel\)/);
    expect(box).toMatch(/background:\s*var\(--box\)/);
    const inner = ruleFor(".fv-box__inner");
    expect(inner).toMatch(/border:\s*2px dashed var\(--box-dash\)/);
    expect(inner).toMatch(/color:\s*var\(--ink-dim\)/);
  });

  it("writes the length chip up the side, over the box's left", () => {
    const chip = ruleFor(".fv-chip--length");
    expect(chip).toMatch(/writing-mode:\s*vertical-rl/);
    expect(chip).toMatch(/rotate\(180deg\)/);
    expect(ruleFor(".fv-chip")).toMatch(/background:\s*var\(--chip\)/);
    expect(ruleFor(".fv-chip")).toMatch(/color:\s*var\(--muted-strong\)/);
  });

  it("keeps the example link 44 px high and underlined", () => {
    const link = ruleFor(".fv-example");
    expect(link).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(link).toMatch(/text-decoration:\s*underline/);
  });

  it("on a phone: one white column, the foot a bar that sticks to the bottom, no box beside it", () => {
    expect(ruleFor(".fv,\n  .fv .ws-stage", phoneCss)).toMatch(/background:\s*var\(--sheet\)/);
    const foot = ruleFor(".fv-foot", phoneCss);
    expect(foot).toMatch(/position:\s*sticky/);
    expect(foot).toMatch(/bottom:\s*0/);
    expect(foot).toMatch(/border-top:\s*1px solid var\(--rule-soft\)/);
    expect(ruleFor(".fv .ws-body", phoneCss)).toMatch(/flex-flow:\s*column nowrap/);
    expect(ruleFor(".fv-title", phoneCss)).toMatch(/var\(--h1-first-phone\)/);
    // MobileStart's fields are 52 px tall
    expect(ruleFor(".fv-fields .k-field__box", phoneCss)).toMatch(/height:\s*52px/);
  });
});
