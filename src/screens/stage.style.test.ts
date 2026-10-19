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
  it("gives a phone's idle slot no height and no place in the flow (no band above the box)", () => {
    // `.visually-hidden` is declared before this file, so the slot's own relative position and its
    // 62 px minimum beat it unless a rule here says otherwise
    const idle = ruleFor(".stage-slot.visually-hidden");
    expect(idle).toMatch(/position:\s*absolute/);
    expect(idle).toMatch(/min-height:\s*0/);
    expect(css.indexOf(".stage-slot.visually-hidden {")).toBeGreaterThan(
      css.indexOf(".plan-col .stage-slot {"),
    );
  });

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

  it("lays what the plan says over the box while the bar holds the slot, so nothing moves", () => {
    const note = ruleFor('.stage-slot[data-held="true"] > [role="status"]:not(:empty)');
    expect(note).toMatch(/position:\s*absolute/);
    expect(note).toMatch(/pointer-events:\s*none/);
    expect(ruleFor(".stage-slot")).toMatch(/position:\s*relative/);
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

  it("takes a narrow status row's controls to two rows with the same places: Layer on its own row, then View and the action", () => {
    const text = strip(css);
    // the row is a size container, in the stage only
    expect(ruleFor(".ws-stage .k-status")).toMatch(/container:\s*stage-status \/ inline-size/);
    // narrower than the three slots side by side (34 rem; they need about 33)
    const at = text.indexOf("@container stage-status (width < 34rem)");
    expect(at).toBeGreaterThan(-1);
    const block = text.slice(at);
    const inBlock = (selector: string): string =>
      ruleFor(selector, block.slice(block.indexOf("{") + 1));
    const controls = inBlock(".stage-controls");
    expect(controls).toMatch(/display:\s*grid/);
    expect(controls).toMatch(/"layer layer"\s*"view action"/);
    // each keeps its own width, so the View switch is the same box whatever the other rows hold
    expect(controls).toMatch(/justify-items:\s*start/);
    // the Layer row keeps a switch's height when it is empty, so the View switch does not rise
    expect(inBlock(".stage-controls__layer")).toMatch(
      /min-height:\s*calc\(var\(--control-h\) \+ 2 \* var\(--s-3\)\)/,
    );
    // and a long Layer switch scrolls in its slot, never the page
    expect(inBlock(".stage-controls__layer")).toMatch(/overflow-x:\s*auto/);
  });
});
