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
});
