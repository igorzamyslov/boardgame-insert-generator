// src/screens/fitProblem.style.test.ts
// The fit problems' rules that no DOM test can see (jsdom draws no CSS): NoFit's, PinConflict's and MobileFix's values.
import { describe, expect, it } from "vitest";
import css from "./fitProblem.css?raw";
import rail from "./rail.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule with exactly this selector (the phone block's, with `phone`). */
function ruleFor(selector: string, source: string = css, phone = false): string {
  const body = strip(source);
  const at = body.indexOf("@media (width < 760px)");
  const scope = phone ? body.slice(at) : at === -1 ? body : body.slice(0, at);
  for (const [, selectors = "", decls = ""] of scope.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      selectors
        .replace(/@media[^{]*$/, "")
        .trim()
        .replace(/\s+/g, " ") === selector
    ) {
      return decls;
    }
  }
  return "";
}

describe("fitProblem.css", () => {
  it("is read (a stylesheet that imports as empty would pass every rule below by finding none)", () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(rail.length).toBeGreaterThan(1000);
  });

  it("lays out NoFit's body: wrapped, 40 px apart, centred, the heading 24 px above it", () => {
    const body = ruleFor(".fp-body");
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-wrap:\s*wrap/);
    expect(body).toMatch(/gap:\s*var\(--s-40\)/);
    expect(body).toMatch(/align-items:\s*flex-start/);
    expect(body).toMatch(/justify-content:\s*center/);
    // the stage's 16 px gap and 8 more
    expect(body).toMatch(/margin-top:\s*var\(--s-8\)/);
  });

  it("lays out PinConflict's: from the left, 32 px apart", () => {
    const body = ruleFor('.fp-body[data-kind="pinConflict"]');
    expect(body).toMatch(/gap:\s*var\(--s-32\)/);
    expect(body).toMatch(/justify-content:\s*flex-start/);
  });

  it("draws the picture at the box's 582 px, its caption 12 px under it", () => {
    const draw = ruleFor(".fp-draw");
    expect(draw).toMatch(/flex:\s*0 1 582px/);
    expect(draw).toMatch(/flex-direction:\s*column/);
    expect(draw).toMatch(/gap:\s*var\(--s-12\)/);
    // it shrinks with the stage rather than push the notices out of it
    expect(draw).toMatch(/max-height:\s*100%/);
  });

  it("draws NoFit's panel: 300 px inside (342 in all), white, a 1 px rule, 16 px round, 20 px in, 12 px between", () => {
    expect(ruleFor(".fp-side")).toMatch(/flex:\s*0 1 342px/);
    expect(ruleFor(".fp-side")).toMatch(/gap:\s*var\(--s-12\)/);
    const panel = ruleFor(".fp-panel");
    expect(panel).toMatch(/gap:\s*var\(--s-12\)/);
    expect(panel).toMatch(/padding:\s*var\(--s-20\)/);
    expect(panel).toMatch(/border:\s*1px solid var\(--rule\)/);
    expect(panel).toMatch(/border-radius:\s*var\(--r-panel\)/);
    expect(panel).toMatch(/background:\s*var\(--sheet\)/);
  });

  it("draws PinConflict's column: 280 px up to 340, no card round it", () => {
    const side = ruleFor('.fp-side[data-kind="pinConflict"]');
    expect(side).toMatch(/flex:\s*1 1 280px/);
    expect(side).toMatch(/max-width:\s*340px/);
    const column = ruleFor('.fp-panel[data-kind="pinConflict"]');
    expect(column).toMatch(/padding:\s*0/);
    expect(column).toMatch(/border:\s*0/);
  });

  it("sets the title in Bricolage 19", () => {
    expect(ruleFor(".fp-title")).toMatch(/font:\s*700 var\(--h3\) \/ normal var\(--font-display\)/);
  });

  it("draws a card: 14 px in, a 1 px field line, 12 px round, 600, and 44 px at the least", () => {
    const card = ruleFor(".fp-card");
    expect(card).toMatch(/padding:\s*var\(--s-14\)/);
    expect(card).toMatch(/border:\s*1px solid var\(--field-line\)/);
    expect(card).toMatch(/border-radius:\s*var\(--r-field\)/);
    expect(card).toMatch(/font-weight:\s*600/);
    expect(card).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(card).toMatch(/background:\s*var\(--sheet\)/);
  });

  it("gives NoFit's first card the 1.5 px ink edge, and PinConflict's cards 14 px", () => {
    expect(ruleFor(".fp-card--lead")).toMatch(/border:\s*1\.5px solid var\(--ink\)/);
    expect(ruleFor('.fp-cards[data-kind="pinConflict"] > .fp-card')).toMatch(
      /border-radius:\s*var\(--r-card\)/,
    );
  });

  it("keeps a card its own colour under the pointer, over style.css's button rule", () => {
    expect(ruleFor(".fp-card:hover:not(:disabled)")).toMatch(/background:\s*var\(--sheet\)/);
  });

  it("draws Undo quiet: 14 px, muted, underlined 3 px off, flush left", () => {
    const undo = ruleFor(".fp-cards > .fp-undo");
    expect(undo).toMatch(/--k-fg:\s*var\(--muted\)/);
    expect(undo).toMatch(/align-self:\s*flex-start/);
    expect(undo).toMatch(/font-size:\s*var\(--text-sm\)/);
    expect(undo).toMatch(/text-decoration:\s*underline/);
    expect(undo).toMatch(/text-underline-offset:\s*3px/);
    // blocked it stays a link, not the kit's grey pill
    expect(ruleFor('.fp-cards > .fp-undo[aria-disabled="true"]')).toMatch(/--k-bg:\s*transparent/);
  });

  describe("on a phone (MobileFix)", () => {
    it("peeks the sheet at 276 px", () => {
      expect(ruleFor(".ws--fit", css, true)).toMatch(/--sheet-peek:\s*276px/);
    });

    it("sets the heading's h1 and line in the warn ink", () => {
      const heading = ruleFor(".fp-status .k-status__title, .fp-status .k-status__line", css, true);
      expect(heading).toMatch(/color:\s*var\(--warn-ink\)/);
    });

    it("makes the cards 56 px at the least, 8 px apart", () => {
      expect(ruleFor(".fp-card", css, true)).toMatch(/min-height:\s*56px/);
      expect(ruleFor(".fp-cards", css, true)).toMatch(/gap:\s*var\(--s-8\)/);
      // the cards fill the peek, so the list is out of sight until the sheet opens
      expect(ruleFor(".fp-cards", css, true)).toMatch(
        /min-height:\s*calc\(var\(--sheet-peek\) - 116px\)/,
      );
    });

    it("leaves the picture to the page's column, the cards to the sheet", () => {
      expect(ruleFor(".fp-body", css, true)).toMatch(/display:\s*contents/);
      expect(ruleFor(".fp-draw", css, true)).toMatch(/flex:\s*none/);
    });
  });

  describe("the rail's row that does not fit (rail.css)", () => {
    it("is the warn wash with a 1.5 px warn edge, its meta in warn ink 600", () => {
      const row = ruleFor(".k-row.is-culprit", rail);
      expect(row).toMatch(/--k-bg:\s*var\(--warn-bg\)/);
      expect(row).toMatch(/border-color:\s*var\(--warn\)/);
      const meta = ruleFor(".k-row.is-culprit .k-row__meta", rail);
      expect(meta).toMatch(/color:\s*var\(--warn-ink\)/);
      expect(meta).toMatch(/font-weight:\s*600/);
    });
  });
});
