// src/screens/stage.style.test.ts
// The stage top's rules that no DOM test can see (jsdom draws no CSS).
import { describe, expect, it } from "vitest";
import kit from "../kit/kit.css?raw";
import css from "./stage.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule with exactly this selector. */
function ruleFor(selector: string, source = strip(css)): string {
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim() === selector) {
      return body;
    }
  }
  return "";
}

describe("stage.css", () => {
  it("lets Layer take the width of a phone's switch row, beside the 3D toggle", () => {
    expect(ruleFor(".stage-segs")).toMatch(/display:\s*flex/);
    expect(ruleFor(".stage-segs > .k-seg")).toMatch(/flex:\s*1\b/);
  });

  it("draws Stop with a 1 px ink border and 18 px of padding, as Main does", () => {
    const stop = ruleFor(".stage-stop");
    expect(stop).toMatch(/--k-edge:\s*var\(--ink\)/);
    expect(stop).toMatch(/padding:\s*0 var\(--s-18\)/);
  });

  it("cuts a long name on a status button instead of pushing it past the row", () => {
    const button = ruleFor(".k-status__extra .k-btn");
    expect(button).toMatch(/max-width:\s*100%/);
    expect(button).toMatch(/min-width:\s*0/);
  });

  it("sets the no-WebGL line in 13 px muted", () => {
    const note = ruleFor(".stage-note");
    expect(note).toMatch(/font-size:\s*var\(--text-xs\)/);
    expect(note).toMatch(/color:\s*var\(--muted\)/);
  });

  it("takes the bullets off the lists under the heading and under the plan", () => {
    expect(ruleFor(".stage-list")).toMatch(/list-style:\s*none/);
    expect(ruleFor(".stage-notes")).toMatch(/list-style:\s*none/);
  });

  it("puts what the plan says under the tray bar, across the slot, not squeezing the bar", () => {
    expect(ruleFor(".stage-slot")).toMatch(/flex-wrap:\s*wrap/);
    const note = ruleFor('.stage-slot > [role="status"]:not(:empty)');
    expect(note).toMatch(/flex:\s*1 0 100%/);
    expect(note).toMatch(/order:\s*1/);
  });

  it("moves nothing: the order of the stage is the page's (banner, status, plan)", () => {
    expect(strip(css).replace(/\n\s*order: 1;/, "")).not.toMatch(/\border:/);
  });

  it("keeps the heading's text as tall with no line as with one, so the row does not shift", () => {
    const text = ruleFor(".k-status__text", strip(kit));
    expect(text).toMatch(
      /min-height:\s*calc\(var\(--h1\) \* 1\.2 \+ var\(--s-2\) \+ var\(--status-line-h\)\)/,
    );
    const phone = kit.slice(kit.indexOf("The status heading on a phone"));
    expect(phone).toMatch(/min-height:\s*calc\(var\(--h1-phone\)/);
  });

  it("gives the heading a 13 px line on a phone, in the kit", () => {
    const phone = kit.slice(kit.indexOf("The status heading on a phone"));
    expect(phone).toMatch(/\.k-status__line\s*\{[^}]*font-size:\s*var\(--text-xs\)/);
  });
});
