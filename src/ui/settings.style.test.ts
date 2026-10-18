// src/ui/settings.style.test.ts
// The Settings drawer's rules that no DOM test can see (jsdom draws no CSS).
import { describe, expect, it } from "vitest";
import kit from "../kit/kit.css?raw";
import css from "./settings.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");
const stripped = strip(css);

/** The declarations of the first rule with exactly this selector, inside or outside a media query. */
function ruleFor(selector: string, source = stripped): string {
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      selectors
        .replace(/@media[^{]*$/, "")
        .split(",")
        .map((x) => x.trim())
        .includes(selector)
    ) {
      return body;
    }
  }
  return "";
}

describe("settings.css", () => {
  it("is read (a stylesheet that imports as empty would pass every rule below by finding none)", () => {
    expect(css.length).toBeGreaterThan(1000);
  });

  it("leaves the scrolling to the body: the header, tabs and foot stay, the drawer does not scroll", () => {
    const body = ruleFor(".st-body");
    expect(body).toMatch(/overflow:\s*auto/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/flex:\s*1 1 0/);
    // so the visually hidden text inside is clipped by the body, not stretching the drawer
    expect(body).toMatch(/position:\s*relative/);
    for (const part of [".st-head", ".st-tabs", ".st-foot"]) {
      expect(ruleFor(part), part).toMatch(/flex:\s*none/);
    }
    const drawer = ruleFor(".k-drawer", strip(kit));
    expect(drawer).toMatch(/overflow:\s*hidden/);
    expect(drawer).toMatch(/height:\s*100dvh/);
    // and the page behind it does not scroll either
    expect(strip(kit)).toMatch(
      /html:has\(dialog\.k-dialog\[open\], dialog\.k-drawer\[open\]\)\s*\{\s*overflow:\s*hidden/,
    );
  });

  it("draws the header, tabs and foot at the board's paddings and rules", () => {
    expect(ruleFor(".st-head")).toMatch(/padding:\s*var\(--s-22\) var\(--s-28\)/);
    expect(ruleFor(".st-head")).toMatch(/gap:\s*var\(--s-12\)/);
    expect(ruleFor(".st-head")).toMatch(/border-bottom:\s*1px solid var\(--rule-soft\)/);
    expect(ruleFor(".st-title")).toMatch(/var\(--h1-drawer\)/);
    expect(ruleFor(".st-tabs")).toMatch(/padding:\s*var\(--s-14\) var\(--s-28\) 0/);
    expect(ruleFor(".st-body")).toMatch(/padding:\s*var\(--s-8\) var\(--s-28\) var\(--s-24\)/);
    const foot = ruleFor(".st-foot");
    expect(foot).toMatch(/padding:\s*var\(--s-16\) var\(--s-28\)/);
    expect(foot).toMatch(/border-top:\s*1px solid var\(--rule-soft\)/);
    expect(foot).toMatch(/background:\s*var\(--row\)/);
  });

  it("draws a section as the board does: 18 px above and below, 16 apart, a soft rule", () => {
    const sec = ruleFor(".st-sec");
    expect(sec).toMatch(/gap:\s*var\(--s-16\)/);
    expect(sec).toMatch(/padding:\s*var\(--s-18\) 0/);
    expect(sec).toMatch(/border-bottom:\s*1px solid var\(--rule-soft\)/);
    expect(ruleFor(".st-h2")).toMatch(/700 17px/);
  });

  it("draws a group as a 14 px card and a row as a label, a 72 px box and the way back", () => {
    const card = ruleFor(".st-card");
    expect(card).toMatch(/border:\s*1px solid var\(--rule\)/);
    expect(card).toMatch(/border-radius:\s*var\(--r-card\)/);
    expect(ruleFor(".st-card__head")).toMatch(/padding:\s*var\(--s-12\) var\(--s-14\)/);
    expect(ruleFor(".st-rows")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) auto auto/);
    const num = ruleFor(".st-card .st-num");
    expect(num).toMatch(/width:\s*72px/);
    expect(num).toMatch(/height:\s*var\(--field-h-compact\)/);
    expect(num).toMatch(/border-radius:\s*var\(--r-tile\)/);
    expect(num).toMatch(/text-align:\s*right/);
    expect(ruleFor(".st-card .st-num[data-changed]")).toMatch(/1\.5px solid var\(--changed\)/);
    const back = ruleFor(".st-back");
    expect(back).toMatch(/background:\s*var\(--changed-bg\)/);
    expect(back).toMatch(/color:\s*var\(--changed-ink\)/);
    // a 44 px target
    expect(back).toMatch(/height:\s*var\(--control-h\)/);
    // a switch has the same way back, under its words
    expect(ruleFor(".st-back--switch")).toMatch(/margin:/);
    expect(ruleFor(".st-switch")).toMatch(/flex-direction:\s*column/);
  });

  it("ends every number box at the row's edge: no grid gap, the boxes and pills carry their own 12 px", () => {
    const rows = ruleFor(".st-rows");
    // a column gap would sit after an empty way-back column and push every box off the edge
    expect(rows).toMatch(/gap:\s*var\(--s-4\) 0;/);
    expect(ruleFor(".st-card .st-num")).toMatch(/margin-left:\s*var\(--s-12\)/);
    expect(ruleFor(".st-rows .st-back")).toMatch(/margin-left:\s*var\(--s-12\)/);
    // a choice takes the whole row and never the number columns, which it would widen
    const choice = ruleFor(".st-row__choice");
    expect(choice).toMatch(/grid-column:\s*1 \/ -1/);
    expect(choice).toMatch(/flex-direction:\s*column/);
    expect(stripped).not.toMatch(/span 2/);
    // the choice's own way back sits at the row's left, not 12 px in
    expect(ruleFor(".st-rows .st-row__choice .st-back")).toMatch(/margin-left:\s*0/);
  });

  it("right-aligns the printer's number fields as the groups' boxes are", () => {
    expect(ruleFor(".st-details .k-field .k-field__input")).toMatch(/text-align:\s*right/);
    expect(ruleFor(".st-card .st-num")).toMatch(/text-align:\s*right/);
  });

  it("draws the other-printer row in the info colours, 12 14, radius 12", () => {
    const other = ruleFor(".st-other");
    expect(other).toMatch(/padding:\s*var\(--s-12\) var\(--s-14\)/);
    expect(other).toMatch(/border-radius:\s*var\(--r-field\)/);
    expect(other).toMatch(/background:\s*var\(--info-bg\)/);
    expect(other).toMatch(/color:\s*var\(--info-ink\)/);
  });

  it("narrows the side padding to 20 px below 600 px, where the drawer is full screen", () => {
    const at = stripped.indexOf("@media (width < 600px)");
    expect(at).toBeGreaterThan(-1);
    expect(stripped.slice(at)).toMatch(/\.st-body[^{]*\{[^}]*padding-left:\s*var\(--s-20\)/);
    expect(strip(kit)).toMatch(
      /@media \(width < 600px\)\s*\{\s*\.k-dialog,\s*\.k-drawer\s*\{[^}]*height:\s*100dvh/,
    );
  });
});
