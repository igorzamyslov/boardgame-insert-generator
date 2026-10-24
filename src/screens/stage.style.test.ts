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
  it("gives the slot no height, on any width: its notes float over the plan, so nothing moves", () => {
    const slot = ruleFor(".stage-slot");
    expect(slot).toMatch(/height:\s*0\b/);
    expect(slot).toMatch(/position:\s*relative/);
    expect(slot).not.toMatch(/min-height/);
    expect(css).not.toContain("--stage-slot");
  });

  it("docks the tray dock at the bottom centre of the plan column, fixed on a phone", () => {
    const dock = ruleFor(".tray-dock");
    expect(dock).toMatch(/position:\s*absolute/);
    expect(dock).toMatch(/bottom:/);
    expect(dock).toMatch(/left:\s*50%/);
    expect(dock).toMatch(/translateX\(-50%\)/);
    const phone = css.slice(css.indexOf("@media (width < 760px) {\n  .tray-dock"));
    expect(phone).toMatch(/\.tray-dock\s*\{[^}]*position:\s*fixed/);
    expect(phone).toMatch(/bottom:\s*calc\(var\(--sheet-foot\)/);
  });

  it("lets Layer take the width of a phone's switch row, beside the 3D toggle", () => {
    expect(ruleFor(".stage-segs")).toMatch(/display:\s*flex/);
    expect(ruleFor(".stage-segs--phone > .k-seg")).toMatch(/flex:\s*1\b/);
  });

  it('draws Stop after "Searching…" as a 44 px target that adds no height to the title\'s line', () => {
    const stop = ruleFor(".stage-stop");
    expect(stop).toMatch(/--k-fg:\s*var\(--ink\)/);
    expect(stop).toMatch(
      /margin-block:\s*calc\(\(var\(--h1\) \* 1\.2 - var\(--control-h\)\) \/ 2\)/,
    );
  });

  it("lets the heading's row wrap, so a row of actions drops under the heading instead of squeezing it", () => {
    // 0.9.0 review: four "Edit <item>" buttons left the h1 0 px wide and the stage scrolling sideways at 820 px
    const wide = strip(css).slice(strip(css).indexOf("@media (width >= 760px)"));
    expect(ruleFor(".ws-stage .k-status", wide)).toMatch(/flex-wrap:\s*wrap/);
    // the heading holds a share of the row before the actions wrap; it grows into what is free
    const lead = ruleFor(".ws-stage .k-status__lead", wide);
    expect(lead).toMatch(/flex:\s*1 1 \d+px/);
    expect(lead).toMatch(/min-width:\s*0/);
    // and the actions shrink into their own lines rather than past the row's edge
    const extra = ruleFor(".ws-stage .k-status__extra", wide);
    expect(extra).toMatch(/flex:\s*0 1 auto/);
    expect(extra).toMatch(/min-width:\s*0/);
    expect(extra).toMatch(/max-width:\s*100%/);
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

  it("lays what the plan says over the box, letting presses through to the tiles", () => {
    const note = ruleFor('.stage-slot > [role="status"]:not(:empty)');
    expect(note).toMatch(/pointer-events:\s*none/);
    expect(ruleFor(".stage-slot > *")).toMatch(/position:\s*absolute/);
    expect(ruleFor(".stage-slot")).not.toMatch(/flex-wrap/);
  });

  it("moves nothing: the order of the stage is the page's (banner, status, plan)", () => {
    expect(strip(css)).not.toMatch(/\border:/);
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
