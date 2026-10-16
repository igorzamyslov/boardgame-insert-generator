import { describe, expect, it } from "vitest";
import css from "./style.css?raw";
import proof from "./styles/proof.css?raw";
import tokens from "./styles/tokens.css?raw";
import { contrast } from "./ui/color";
import { NARROW_QUERY, PHONE_QUERY } from "./ui/useMediaQuery";

/** The declarations block of the first rule whose selector list contains `selector` (`alone`: is just it). */
function ruleFor(selector: string, source = css, alone = false): string {
  const rules = source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selectors = "", body = ""] of rules) {
    const list = selectors.split(",").map((s) => s.trim());
    if (alone ? list.length === 1 && list[0] === selector : list.includes(selector)) {
      return body;
    }
  }
  return "";
}

/**
 * The inside of every `@media <query> { … }` block, found by matching braces (so a change of
 * indentation or a nested rule cannot break the test).
 */
function mediaBlocks(query: string, source = css): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(`@media ${query}`, from);
    const open = at === -1 ? -1 : source.indexOf("{", at);
    if (open === -1) {
      return out;
    }
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      depth += source[end] === "{" ? 1 : source[end] === "}" ? -1 : 0;
      if (depth === 0) {
        break;
      }
    }
    out.push(source.slice(open + 1, end));
    from = end;
  }
}

/** The first block of `mediaBlocks`, or "". */
const mediaBlock = (query: string, source = css): string => mediaBlocks(query, source)[0] ?? "";

/** Every `--name: value` declaration in a CSS block, by name. */
function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name = "", value = ""] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(name, value.trim());
  }
  return out;
}

describe("tokens.css", () => {
  const stripped = tokens.replace(/\/\*[\s\S]*?\*\//g, "");
  const darkAt = stripped.indexOf("@media screen and (prefers-color-scheme: dark)");
  const light = declarations(stripped.slice(0, darkAt));
  const dark = declarations(stripped.slice(darkAt));

  it("defines the redesign tokens", () => {
    expect(darkAt).toBeGreaterThan(0);
    const expected: Record<string, string> = {
      "--page": "#F4F3EF",
      "--sheet": "#FFFFFF",
      "--ink": "#1D1F1C",
      "--muted": "#5F625C",
      "--rule": "#E4E1D9",
      "--box": "#D3CDBF",
      "--focus": "#2F5BB8",
      "--cards-fill": "#DCE6FA",
      "--cards-line": "#335AA6",
      "--cards-ink": "#22457E",
      "--bits-fill": "#FBE9C9",
      "--bits-line": "#8A5D08",
      "--bits-ink": "#6E4C0E",
      "--tiles-fill": "#D8EEDE",
      "--tiles-line": "#2E6B41",
      "--tiles-ink": "#22552E",
      "--minis-fill": "#F5DCE7",
      "--minis-line": "#964068",
      "--minis-ink": "#74244B",
      "--custom-fill": "#E7E3F4",
      "--custom-line": "#5B4B9A",
      "--custom-ink": "#45397A",
      "--spacer-fill": "#E9E5DB",
      "--spacer-hatch": "#DDD8CC",
      "--spacer-dash": "#6E695C",
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(light.get(name)?.toUpperCase(), name).toBe(value);
    }
    expect(stripped).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
    expect(stripped).toMatch(/:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
  });

  it("redefines every colour under the same name in the dark scheme", () => {
    const colours = [...light].filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).map(([n]) => n);
    expect(colours.length).toBeGreaterThan(20);
    expect(colours.filter((n) => !dark.has(n))).toEqual([]);
    // Dark is its own warm palette, not the light one repeated.
    expect(dark.get("--page")).not.toBe(light.get("--page"));
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("keeps text at 4.5:1 and edges at 3:1 in the %s scheme", (_, set) => {
    const get = (name: string): string => set.get(name) ?? light.get(name) ?? "#000000";
    for (const ground of ["--page", "--sheet"]) {
      expect(contrast(get("--ink"), get(ground)), `ink on ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(get("--muted"), get(ground)), `muted on ${ground}`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(get("--focus"), get(ground)), `focus on ${ground}`).toBeGreaterThanOrEqual(3);
      expect(contrast(get("--edge"), get(ground)), `edge on ${ground}`).toBeGreaterThanOrEqual(3);
    }
    for (const kind of ["cards", "bits", "tiles", "minis", "custom"]) {
      expect(
        contrast(get(`--${kind}-ink`), get(`--${kind}-fill`)),
        `${kind} ink on its fill`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(get(`--${kind}-line`), get("--box")),
        `${kind} line on the box`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("style.css", () => {
  it("gives the 3D canvas an explicit CSS width and height (no ResizeObserver feedback)", () => {
    const body = ruleFor(".viewer-canvas");
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/height:\s*min\(/);
  });

  it("lets every pointer event through the axis indicator, so trays under it can still be picked", () => {
    expect(ruleFor(".axis-gizmo")).toMatch(/pointer-events:\s*none/);
    expect(ruleFor(".viewer-stage")).toMatch(/position:\s*relative/);
  });

  it("keeps the axes toggle in the view's corner with a 44 px target", () => {
    const body = ruleFor(".viewer-axes-toggle");
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/min-width:\s*var\(--control-h\)/);
    expect(body).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(ruleFor(".viewer-selection-live")).toMatch(/pointer-events:\s*none/);
  });

  it("lets one finger scroll the page past the 3D canvas and shortens it on phones", () => {
    const body = ruleFor(".viewer-canvas");
    expect(body).toMatch(/touch-action:\s*pan-y/);
    expect(body).not.toMatch(/touch-action:\s*none/);
    expect(ruleFor(".viewer-canvas", mediaBlock("(width < 600px)"))).toMatch(
      /height:\s*min\(45vh,\s*320px\)/,
    );
  });

  it("puts the field notes in the full-width group of the form grid, not in a rule of their own", () => {
    expect(ruleFor(".form-grid > .field-notes")).toMatch(/grid-column:\s*1 \/ -1/);
    expect(css.split(".form-grid > .field-notes")).toHaveLength(2);
    expect(ruleFor(".form-grid > .field-notes")).toBe(ruleFor(".form-grid > fieldset"));
  });

  it("prints on a light scheme whatever the screen uses", () => {
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
  });
});

describe("touch targets", () => {
  it("gives fields at least 44 px, and the .tap buttons the control height", () => {
    expect(ruleFor('input[type="search"]')).toMatch(/min-height:\s*44px/);
    expect(ruleFor('input[type="text"]')).toMatch(/min-height:\s*44px/);
    expect(ruleFor(".tap")).toMatch(/min-height:\s*var\(--control-h\)/);
  });
});

describe("the phone layout", () => {
  const phoneLayout = css.slice(css.indexOf(".pf-sheet {"));

  it("keeps a note over the foot of the screen above the sheet's handle", () => {
    const body = ruleFor(".pf-toasts", phoneLayout);
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/calc\(var\(--sheet-foot\)/);
    expect(ruleFor(".pf-app")).toMatch(/--sheet-handle:\s*var\(--control-h\)/);
  });

  it("makes the screen one dvh tall, so a browser's own bars do not cover the sheet", () => {
    expect(ruleFor(".pf-app", proof)).toMatch(/height:\s*100dvh/);
  });

  it("leaves the scrolling to the settings sheet's panel, whatever the screen's width", () => {
    expect(ruleFor(".settings-sheet .modal-body")).toMatch(/overflow:\s*auto/);
    // so the visually hidden text inside is clipped by the panel, not stretching the dialog
    expect(ruleFor(".settings-sheet .modal-body")).toMatch(/position:\s*relative/);
    expect(ruleFor(".settings-sheet[open]")).toMatch(/overflow:\s*hidden/);
    expect(ruleFor(".settings-sheet")).toMatch(/dvh/);
  });

  it("breaks at the width the app asks about", () => {
    const px = /\(width < (\d+)px\)/.exec(PHONE_QUERY)?.[1];
    expect(px).toBe("760");
    expect(css).toContain(`@media (width < ${px}px)`);
  });

  it("breaks at 600 px where the app asks about it, for full-screen dialogs and sheets", () => {
    const px = /\(width < (\d+)px\)/.exec(NARROW_QUERY)?.[1];
    expect(px).toBe("600");
    expect(mediaBlocks(`(width < ${px}px)`).length).toBeGreaterThan(1);
  });

  it("leaves the order of the stage to the page: the status pill, the box, then the figures", () => {
    // DESIGN §5: the same order on every width, so no `order` moves a block (App.test.tsx checks the page)
    expect(ruleFor(".pf-app__stage > .stage-block", phoneLayout)).not.toMatch(/order:/);
    expect(css).not.toMatch(/\.pf-app__stage > \.pf-status\s*{[^}]*order:/);
  });

  it("fills the screen with an open sheet that holds the editor or the box, below 600 px", () => {
    const sheet = mediaBlocks("(width < 600px)").find((b) => b.includes(".pf-sheet[data-full"));
    expect(sheet).toBeTruthy();
    const body = ruleFor('.pf-sheet[data-full="true"][data-expanded="true"]', sheet);
    expect(body).toMatch(/inset:\s*0/);
    expect(body).toMatch(/height:\s*100dvh/);
  });

  it("makes every button 44 px by default", () => {
    // the rule for `button` alone, not the shared `button, input, select` one
    expect(ruleFor("button", css, true)).toMatch(/min-height:\s*var\(--control-h\)/);
  });

  it("keeps the plan at least 24 rem tall (the figures below it still share the stage), so it scrolls rather than shrinks", () => {
    expect(ruleFor(".pf-app__stage > .pf-view")).toMatch(/min-height:\s*24rem/);
  });

  it("gives the view's tabs a 44 px target", () => {
    expect(ruleFor(".pf-tabs button", proof)).toMatch(/min-height:\s*var\(--control-h\)/);
  });
});

describe("pills", () => {
  // DESIGN §2 Claims: a pill is one line; what does not fit ends in an ellipsis, never wraps.
  it("keep to one line: the pill does not wrap, its text and its button are cut with an ellipsis", () => {
    const pill = ruleFor(".pf-status__pill");
    expect(pill).toMatch(/display:\s*flex/);
    expect(pill).toMatch(/flex-wrap:\s*nowrap/);
    for (const part of [".pf-status__text", ".pf-status__btn"]) {
      const body = ruleFor(part);
      expect(body, part).toMatch(/white-space:\s*nowrap/);
      expect(body, part).toMatch(/text-overflow:\s*ellipsis/);
      expect(body, part).toMatch(/overflow:\s*hidden/);
    }
    // the text gives way first, and the button can shrink instead of overflowing the pill
    expect(ruleFor(".pf-status__text")).toMatch(/min-width:\s*0/);
    expect(ruleFor(".pf-status__btn")).toMatch(/flex:\s*0 1 auto/);
    expect(ruleFor(".pf-status__btn")).toMatch(/max-width:\s*\d+%/);
  });
});

describe("breakpoints", () => {
  const sheets = import.meta.glob<string>("./**/*.css", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  it("are 760 (phone), 600 (full-screen dialogs) and the 760 to 960 tablet rail, and nothing else", () => {
    const RULED = new Set([
      "(width < 760px)",
      "screen and (width < 760px)",
      "(width >= 760px)",
      "(width >= 760px) and (width <= 960px)",
      "(width < 600px)",
      "(prefers-reduced-motion: reduce)",
      "(prefers-color-scheme: dark)",
      "screen and (prefers-color-scheme: dark)",
      "print",
    ]);
    const found = new Set<string>();
    for (const source of Object.values(sheets)) {
      for (const m of source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@media\s+([^{]+)\{/g)) {
        found.add((m[1] ?? "").trim());
      }
    }
    expect(found.size).toBeGreaterThan(4);
    expect([...found].filter((q) => !RULED.has(q))).toEqual([]);
  });

  it("narrows the rail between 760 and 960 px, and no further", () => {
    const rail = mediaBlock("(width >= 760px) and (width <= 960px)");
    expect(ruleFor(".pf-app__body", rail)).toMatch(
      /grid-template-columns:\s*minmax\(280px, 340px\)/,
    );
    expect(ruleFor(".pf-app__rail", rail)).toMatch(/padding-inline/);
  });
});
