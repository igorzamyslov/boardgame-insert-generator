// src/screens/header.style.test.ts
// The header's and the project menu's rules that no DOM test can see (jsdom draws no CSS).
import { describe, expect, it } from "vitest";
import kit from "../kit/kit.css?raw";
import css from "./header.css?raw";

const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule with exactly this selector. */
function ruleFor(selector: string, source = stripped): string {
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim() === selector) {
      return body;
    }
  }
  return "";
}

describe("header.css", () => {
  it("draws Main's bar: 60 px and then its rule, 24 px aside, 12 px between", () => {
    const bar = ruleFor(".hd");
    expect(bar).toMatch(/height:\s*var\(--header-h\)/);
    expect(bar).toMatch(/box-sizing:\s*content-box/);
    expect(bar).toMatch(/padding:\s*0 var\(--s-24\)/);
    expect(bar).toMatch(/gap:\s*var\(--s-12\)/);
    expect(bar).toMatch(/border-bottom:\s*1px solid var\(--rule\)/);
  });

  it("draws the phone's bar at the phone height with its own padding and gap", () => {
    const bar = ruleFor(".hd--phone");
    expect(bar).toMatch(/height:\s*var\(--header-h-phone\)/);
    expect(bar).toMatch(/padding:\s*0 var\(--s-8\) 0 var\(--s-16\)/);
    expect(bar).toMatch(/gap:\s*var\(--s-4\)/);
  });

  it("gives the name a 44 px target, and the phone's two-line name a 44 px hit area", () => {
    expect(ruleFor(".hd-name")).toMatch(/height:\s*var\(--control-h\)/);
    expect(ruleFor(".hd--phone .hd-name::before")).toMatch(/inset:\s*-12px 0/);
  });

  it("opens the panel 4 px under its button, right-aligned to it, over the page", () => {
    const panel = ruleFor(".hd-menu__panel");
    expect(panel).toMatch(/top:\s*calc\(100% \+ var\(--s-4\)\)/);
    expect(panel).toMatch(/right:\s*0/);
    expect(panel).toMatch(/position:\s*absolute/);
  });

  it("draws Main's menu note: 40 px buttons that keep a 44 px target", () => {
    const note = ruleFor(".pm-note");
    expect(note).toMatch(/padding:\s*var\(--s-12\)/);
    expect(note).toMatch(/border-radius:\s*var\(--r-tile\)/);
    expect(note).toMatch(/background:\s*var\(--warn-bg\)/);
    expect(note).toMatch(/color:\s*var\(--warn-ink-strong\)/);
    expect(ruleFor(".pm-note .k-btn")).toMatch(/height:\s*40px/);
    expect(ruleFor(".pm-note .k-btn::before")).toMatch(/inset:\s*-2px 0/);
  });

  it("keeps the wordmark out of sight on a tablet (760 to 960 px) but for a reader, and Undo and Redo stay", () => {
    const tablet = /@media \(width >= 760px\) and \(width <= 960px\) \{([\s\S]*?\n\})\n/.exec(
      stripped,
    )?.[1];
    expect(tablet).toBeDefined();
    const wordmark = ruleFor(".hd-wordmark", tablet);
    // clipped, not display: none: the app's name is still read
    expect(wordmark).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(wordmark).not.toMatch(/display:\s*none/);
    // nothing in the band touches the buttons
    expect(tablet).not.toMatch(/\.k-iconbtn|\.hd-undo|\.hd-redo/);
  });

  it("writes no raw colour, and no media query but the tablet's", () => {
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stripped.match(/@media[^{]*/g)).toEqual([
      "@media (width >= 760px) and (width <= 960px) ",
    ]);
  });
});

describe("kit.css for the header", () => {
  it("fills a blocked primary icon button with the rule colour, as MobileWorkspace's Download", () => {
    expect(
      ruleFor('.k-iconbtn--primary[aria-disabled="true"]', kit.replace(/\/\*[\s\S]*?\*\//g, "")),
    ).toMatch(/--k-bg:\s*var\(--rule\)/);
  });
});
