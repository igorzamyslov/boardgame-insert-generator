// src/ui/components/editor.style.test.ts
// The editor's rules that no DOM test can see (jsdom draws no CSS): Edit's, EditKinds' and
// MobileEdit's values, and the stage's.
import { describe, expect, it } from "vitest";
import kit from "../../kit/kit.css?raw";
import plan from "../../plan/plan.css?raw";
import stage from "../../screens/editorStage.css?raw";
import workspace from "../../screens/workspace.css?raw";
import tokens from "../../styles/tokens.css?raw";
import css from "./editor.css?raw";

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

describe("editor.css", () => {
  it("lets a row of two buttons wrap, so a long group name's Edit and Take out of group stay in the rail", () => {
    expect(ruleFor(".ed-ask__buttons", css)).toMatch(/flex-wrap:\s*wrap/);
  });

  it("lays the panel out as Edit's rail: 20 px between the parts, the foot at the bottom and in sight", () => {
    const panel = ruleFor(".ed", css);
    expect(panel).toMatch(/gap:\s*var\(--s-20\)/);
    expect(panel).toMatch(/overflow:\s*auto/);
    expect(panel).toMatch(/min-height:\s*0/);
    const foot = ruleFor(".ed-foot", css);
    expect(foot).toMatch(/margin-top:\s*auto/);
    expect(foot).toMatch(/position:\s*sticky/);
    expect(foot).toMatch(/justify-content:\s*space-between/);
    // a line over it, so content scrolling under it is not cut off without a cue
    expect(foot).toMatch(/border-top:\s*1px solid var\(--rule-soft\)/);
  });

  it("draws the back link as Edit's: 44 px, 14 px 600, a chevron and 8 px round", () => {
    const back = ruleFor(".ed-back", css);
    expect(back).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(back).toMatch(/padding:\s*0 var\(--s-10\) 0 var\(--s-4\)/);
    expect(back).toMatch(/border-radius:\s*var\(--r-logo\)/);
    expect(back).toMatch(/font-weight:\s*600/);
    expect(back).toMatch(/color:\s*var\(--muted-strong\)/);
  });

  it("draws the name as a title: Bricolage 700 at the panel size on a dashed underline", () => {
    const title = ruleFor(".ed .ed-title", css);
    expect(title).toMatch(/font:\s*700 var\(--h2-panel\)/);
    expect(title).toMatch(/border-bottom:\s*1\.5px dashed var\(--field-line\)/);
    // the label round it is the 44 px target, so the input itself is not given one
    expect(title).toMatch(/min-height:\s*0/);
    expect(ruleFor(".ed-id__label", css)).toMatch(/font-size:\s*var\(--text-xs\)/);
  });

  it("draws the cards of pieces as EditKinds': a 14 px card on the row colour, a 76 px count", () => {
    const card = ruleFor(".ed-card", css);
    expect(card).toMatch(/border-radius:\s*var\(--r-card\)/);
    expect(card).toMatch(/background:\s*var\(--row\)/);
    expect(card).toMatch(/padding:\s*var\(--s-12\)/);
    expect(ruleFor(".ed .ed-count", css)).toMatch(/width:\s*76px/);
    // MobileEdit's figure is a plain card with a line
    expect(ruleFor(".ed-card--figure", css)).toMatch(/border-color:\s*var\(--rule\)/);
  });

  it("draws the dashed + Another… in the pill and the card-wide forms, 44 px each", () => {
    const add = ruleFor(".ed .ed-add", css);
    expect(add).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(add).toMatch(/border:\s*1px dashed var\(--spacer-dash\)/);
    expect(add).toMatch(/border-radius:\s*var\(--r-pill\)/);
    expect(ruleFor(".ed .ed-add[data-block]", css)).toMatch(/border-radius:\s*var\(--r-field\)/);
    expect(ruleFor(".ed .ed-link", css)).toMatch(/min-height:\s*var\(--control-h\)/);
  });

  it("is MobileEdit's sheet on a phone: a 56 px header, an 84 px picture, scrolling basics", () => {
    expect(ruleFor(".ed-bar", css)).toMatch(/height:\s*var\(--header-h-phone\)/);
    expect(ruleFor(".ed-bar", css)).toMatch(/padding:\s*0 var\(--s-12\) 0 var\(--s-4\)/);
    expect(ruleFor(".ed-bar__title", css)).toMatch(/font-size:\s*var\(--h3\)/);
    const box = ruleFor(".ed-strip__box", css);
    expect(box).toMatch(/width:\s*84px/);
    expect(box).toMatch(/height:\s*84px/);
    expect(box).toMatch(/background:\s*var\(--box\)/);
    expect(ruleFor(".ed-strip__tray", css)).toMatch(/opacity:\s*0\.5/);
    expect(ruleFor(".ed-scroll", css)).toMatch(/overflow:\s*auto/);
    expect(ruleFor(".ed-scroll", css)).toMatch(/gap:\s*var\(--s-22\)/);
  });

  it("outranks style.css's old button and input rules where it competes with them", () => {
    // `.ed .x` (two classes) beats `button` and `input[type="text"]`, which have one element each
    for (const selector of [".ed .ed-add", ".ed .ed-link", ".ed .ed-remove", ".ed .ed-title"]) {
      expect(ruleFor(selector, css), selector).not.toBe("");
    }
  });
});

describe("the editor's stage", () => {
  it("sets the sentence as Edit does: 17 px, 400, in a slot as tall as the status heading", () => {
    const sentence = ruleFor(".ed-sentence", stage);
    expect(sentence).toMatch(/font-size:\s*17px/);
    expect(sentence).toMatch(/font-weight:\s*400/);
    expect(ruleFor(".ed-slot", stage)).toMatch(/min-height:\s*calc\(var\(--h1\) \* 1\.2/);
  });

  it("draws a problem under the sentence as a tinted line: warn for a tray that does not fit, danger for a failed run", () => {
    expect(ruleFor(".ed-problem", stage)).toMatch(/background:\s*var\(--warn-bg\)/);
    expect(ruleFor('.ed-problem[data-tone="error"]', stage)).toMatch(
      /background:\s*var\(--danger-bg\)/,
    );
  });

  it("lifts the edited tray: a double edge inside the tile (sheet ring, then the kind's line), a small drop shadow", () => {
    const lifted = ruleFor(".plan-tile.is-lifted", plan);
    expect(lifted).toMatch(/inset 0 0 0 2px var\(--sheet\)/);
    expect(lifted).toMatch(/inset 0 0 0 4px var\(--tile-line/);
    expect(lifted).toMatch(/var\(--shadow-lift-drop\)/);
    expect(lifted).toMatch(/z-index:\s*2/);
  });

  it("never lets a lifted tray reach past half the 6 px gap between tiles, so two lifted neighbours (a group lifts every copy) never meet", () => {
    const body = ruleFor(".plan-tile.is-lifted", plan);
    const value = /box-shadow:\s*([^;]+);/.exec(body)?.[1] ?? "";
    const token = /--shadow-lift-drop:\s*([^;]+);/.exec(strip(tokens))?.[1] ?? "";
    const layers: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of value.replace(/var\(--shadow-lift-drop\)/, token)) {
      depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
      if (ch === "," && depth === 0) {
        layers.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    layers.push(current);
    expect(layers.length).toBeGreaterThanOrEqual(3);
    // How far each layer paints beyond the tile's edge: its offset, plus spread, plus blur.
    const reach = (layer: string): number => {
      if (/^\s*inset\b/.test(layer)) {
        return 0;
      }
      const [x = 0, y = 0, blur = 0, spread = 0] =
        layer
          .replace(/rgba?\([^)]*\)|var\([^)]*\)/g, "")
          .match(/-?\d+(\.\d+)?px|(?<![\w.])-?0(?![\w.])/g)
          ?.map((n) => Number.parseFloat(n)) ?? [];
      return Math.max(Math.abs(x), Math.abs(y)) + spread + blur;
    };
    const GAP_PX = 6;
    for (const layer of layers) {
      expect(reach(layer), layer).toBeLessThanOrEqual(GAP_PX / 2);
    }
    // The double edge is real: two inset rings, and no ring drawn outside the tile.
    expect(layers.filter((l) => /^\s*inset\b/.test(l))).toHaveLength(2);
  });

  it("gives an editor 12 px above its back link, and leaves its stage the normal stage's padding", () => {
    expect(ruleFor(".ws--edit .ws-rail", workspace)).toMatch(/padding-top:\s*var\(--s-12\)/);
    expect(ruleFor(".ws-stage--focus", workspace)).toMatch(/padding:\s*var\(--stage-pad-focus\)/);
  });

  it("shows a removal's buttons as links on the ink, 44 px each, and floats the note over a phone's sheet", () => {
    const button = ruleFor(".k-toast .toast-btn,\n.k-toast .toast-btn:hover:not(:disabled)", stage);
    expect(button).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(button).toMatch(/text-decoration:\s*underline/);
    expect(stage).toMatch(/position:\s*fixed/);
  });

  it("takes the sheet's own grip and title away while an editor is in it", () => {
    expect(ruleFor(".k-sheet__bar[hidden]", kit)).toMatch(/display:\s*none/);
    expect(ruleFor('.k-sheet[data-editing="true"] > .k-sheet__body', kit)).toMatch(/padding:\s*0/);
  });

  it("draws Back to <default> as Settings' pill: 44 px, the changed colours, 13 px 600", () => {
    const back = ruleFor(".ed .ed-reset", css);
    expect(back).toMatch(/height:\s*var\(--control-h\)/);
    expect(back).toMatch(/background:\s*var\(--changed-bg\)/);
    expect(back).toMatch(/color:\s*var\(--changed-ink\)/);
    expect(back).toMatch(/font-size:\s*var\(--text-xs\)/);
    expect(back).toMatch(/font-weight:\s*600/);
    expect(back).toMatch(/border-radius:\s*var\(--r-pill\)/);
  });

  it("draws the changed dot at 8 px in the changed colour, on a choice, a chip and a row", () => {
    for (const [selector, source] of [
      [".ed-dot", css],
      [".k-chip__dot", kit],
      [".k-drow__dot", kit],
    ] as const) {
      const dot = ruleFor(selector, source);
      expect(dot, selector).toMatch(/width:\s*8px/);
      expect(dot, selector).toMatch(/height:\s*8px/);
      expect(dot, selector).toMatch(/background:\s*var\(--changed\)/);
    }
    // ringed in the page colour, so it shows on a pressed chip's ink as well
    expect(ruleFor(".k-chip__dot", kit)).toMatch(/box-shadow:\s*0 0 0 1\.5px var\(--sheet\)/);
  });
});
