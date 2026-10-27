import { describe, expect, it } from "vitest";
import kit from "./kit/kit.css?raw";
import plan from "./plan/plan.css?raw";
import workspace from "./screens/workspace.css?raw";
import css from "./style.css?raw";
import base from "./styles/base.css?raw";
import fonts from "./styles/fonts.css?raw";
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

/** A value as the tests compare it: lower case, one space, none around commas, `.25` as `0.25`. */
const normal = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/(^|[^\d])\.(\d)/g, "$10.$2")
    .trim();

describe("tokens.css", () => {
  const stripped = tokens.replace(/\/\*[\s\S]*?\*\//g, "");
  const light = declarations(stripped.slice(0, stripped.indexOf(':root[data-theme="dark"]')));
  /** A token's value with `var(--other)` followed through to the hex it ends in. */
  const resolve = (name: string): string => {
    let value = light.get(name) ?? "";
    for (let depth = 0; depth < 5; depth += 1) {
      const next = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
      if (!next) {
        break;
      }
      value = light.get(next) ?? "";
    }
    return value;
  };

  it("defines the redesign tokens", () => {
    const expected: Record<string, string> = {
      "--page": "#F4F3EF",
      "--sheet": "#FFFFFF",
      "--ink": "#1D1F1C",
      "--muted": "#5F625C",
      "--rule": "#E4E1D9",
      "--box": "#D3CDBF",
      "--focus": "#2F5BB8",
      "--cards-fill": "#C0D3F7",
      "--cards-line": "#335AA6",
      "--cards-ink": "#22457E",
      "--bits-fill": "#FBDEAB",
      "--bits-line": "#8A5D08",
      "--bits-ink": "#6E4C0E",
      "--tiles-fill": "#C1E7CB",
      "--tiles-line": "#2E6B41",
      "--tiles-ink": "#22552E",
      "--minis-fill": "#F0C2D6",
      "--minis-line": "#964068",
      "--minis-ink": "#74244B",
      "--custom-fill": "#D3CCED",
      "--custom-line": "#5B4B9A",
      "--custom-ink": "#45397A",
      "--spacer-fill": "#E9E5DB",
      "--spacer-hatch": "#DDD8CC",
      "--spacer-dash": "#6E695C",
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(light.get(name)?.toUpperCase(), name).toBe(value);
    }
  });

  it("defines the board tokens", () => {
    // Every value of "Values from the boards" in the UI rebuild plan, as the boards draw it.
    const board: Record<string, string> = {
      // surfaces, lines, ink
      "--row": "#FAF9F6",
      "--fill-quiet": "#EFEDE7",
      "--chip": "#E9E5DB",
      "--track": "#E9E7E0",
      "--icon-ground": "#EDEAE2",
      "--rule-soft": "#EEEBE4",
      "--field-line": "#DAD6CC",
      "--line-strong": "#BDB7A9",
      "--handle": "#D6D2C8",
      "--muted-strong": "#3E413C",
      "--ink-dim": "#4A4D47",
      "--ink-off": "#6B6E68",
      "--box-edge": "#BFB8A8",
      "--box-dash": "#8C8778",
      "--cell-fill": "rgb(255 255 255 / 38%)",
      "--pill-fill": "rgb(255 255 255 / 92%)",
      "--field-glow": "#CFDCF6",
      // meaning
      "--info-bg": "#E6EEFC",
      "--info-ink": "#1B3D7A",
      "--fit-bg": "#DDF0E3",
      "--ok": "#2B7247",
      "--danger": "#B4321F",
      "--danger-bg": "#FBE4E0",
      "--danger-ink": "#8A2414",
      "--destructive": "#A13A2C",
      "--warn": "#C2620F",
      "--warn-bg": "#FCE6CF",
      "--warn-ink": "#7A3A08",
      "--warn-ink-strong": "#5A2A06",
      "--warn-icon": "#9A4A0B",
      "--changed": "#3F6FD1",
      "--changed-bg": "#EEF3FC",
      "--changed-ink": "#22457E",
      "--logo-cards": "#8FB0EE",
      "--logo-bits": "#EDC175",
      "--logo-tiles": "#86C79A",
      "--logo-minis": "#E89BBE",
      // shadows and rings
      "--shadow-menu": "0 16px 40px rgba(29, 31, 28, 0.18)",
      "--shadow-dialog": "0 30px 80px rgba(29, 31, 28, 0.35)",
      "--shadow-drawer": "-20px 0 60px rgba(29, 31, 28, 0.25)",
      "--shadow-bar": "0 6px 18px rgba(29, 31, 28, 0.08)",
      "--shadow-thumb": "0 1px 2px rgba(29, 31, 28, 0.12)",
      "--shadow-toast": "0 10px 24px rgba(29, 31, 28, 0.18)",
      "--shadow-peek": "0 -8px 30px rgba(29, 31, 28, 0.14)",
      "--shadow-sheet-modal": "0 -8px 30px rgba(29, 31, 28, 0.18)",
      "--shadow-lift-drop": "0 2px 2px -1px rgba(29, 31, 28, 0.3)",
      "--ring-selected": "0 0 0 3px var(--sheet), 0 0 0 5px var(--ink)",
      "--ring-dot": "0 0 0 2px var(--sheet)",
      "--box-inset-plan": "inset 0 0 0 1px var(--box-edge)",
      "--box-inset-side": "inset 0 0 0 2px var(--box-dash)",
      // spacing
      "--s-2": "2px",
      "--s-3": "3px",
      "--s-4": "4px",
      "--s-5": "5px",
      "--s-6": "6px",
      "--s-8": "8px",
      "--s-10": "10px",
      "--s-12": "12px",
      "--s-14": "14px",
      "--s-16": "16px",
      "--s-18": "18px",
      "--s-20": "20px",
      "--s-22": "22px",
      "--s-24": "24px",
      "--s-28": "28px",
      "--s-32": "32px",
      "--s-40": "40px",
      // radii
      "--r-pill": "999px",
      "--r-dialog": "22px",
      "--r-bar": "18px",
      "--r-panel": "16px",
      "--r-card": "14px",
      "--r-field": "12px",
      "--r-tile": "10px",
      "--r-icon": "9px",
      "--r-logo": "8px",
      "--r-cell": "6px",
      // sizes
      "--control-h": "44px",
      "--field-h": "48px",
      "--field-h-compact": "44px",
      "--cta-h": "54px",
      "--dialog-btn-h": "48px",
      "--header-h": "60px",
      "--header-h-phone": "56px",
      "--rail-w": "300px",
      "--rail-min": "300px",
      "--rail-max": "480px",
      "--stage-min": "360px",
      "--plan-max": "900px",
      "--rail-pad": "20px",
      "--stage-pad": "22px 36px 28px",
      "--stage-pad-focus": "28px 40px",
      "--row-min": "52px",
      "--kind-tile-h": "56px",
      "--status-icon": "40px",
      "--status-icon-phone": "32px",
      "--menu-w": "260px",
      "--dialog-max": "560px",
      "--dialog-pad": "32px",
      "--sheet-peek": "196px",
      // type
      "--text-sm": "14px",
      "--text-xs": "13px",
      "--text-2xs": "12px",
      "--text-field": "17px",
      "--text-count": "18px",
      "--text-wordmark": "18px",
      "--text-stat": "24px",
      "--h1": "28px",
      "--h1-first": "40px",
      "--h1-dialog": "30px",
      "--h1-drawer": "26px",
      "--h1-phone": "21px",
      "--h2": "20px",
      "--h2-panel": "22px",
      "--h2-section": "17px",
      "--h3": "19px",
    };
    const wrong: string[] = [];
    for (const [name, value] of Object.entries(board)) {
      if (normal(light.get(name) ?? "") !== normal(value)) {
        wrong.push(`${name}: ${light.get(name) ?? "(missing)"} is not ${value}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(Object.keys(board).length).toBeGreaterThan(110);
    expect(light.get("--font-display")).toContain('"Bricolage Grotesque"');
    expect(light.get("--font-ui")).toContain('"Figtree"');
  });

  it('puts dark behind [data-theme="dark"], which ui/theme.ts resolves, not behind a media query', () => {
    expect(stripped).not.toContain("prefers-color-scheme");
    expect(stripped).toMatch(/:root\s*\{[^}]*color-scheme:\s*light\s*;/);
    expect(stripped).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark\s*;/);
  });

  it("gives every colour token a dark value or says why not", () => {
    const at = stripped.indexOf(':root[data-theme="dark"]');
    const names = (css: string): string[] =>
      [...css.matchAll(/(--[\w-]+):\s*(?:#|rgb)/g)].map((m) => m[1] ?? "");
    const dark = new Set(names(stripped.slice(at)));
    // Same in both: the logo's squares and the paper the packing guide is drawn on.
    const shared = new Set([
      "--logo-cards",
      "--logo-bits",
      "--logo-tiles",
      "--logo-minis",
      "--paper-white",
    ]);
    const missing = names(stripped.slice(0, at)).filter((n) => !dark.has(n) && !shared.has(n));
    expect(missing).toEqual([]);
  });

  it("keeps the legacy names", () => {
    const legacy = [
      "--edge",
      "--space-1",
      "--space-2",
      "--space-3",
      "--space-4",
      "--space-5",
      "--space-6",
      "--space-7",
      "--space-8",
      "--radius-sm",
      "--radius-md",
      "--radius-lg",
      "--rail-width",
      "--page-max",
      "--shadow-sheet",
      "--on-focus",
      "--focus-wash",
      "--on-danger",
      "--danger-wash",
      "--on-warn",
      "--warn-wash",
      "--font-mono",
      "--paper",
      "--sheet-sunken",
      "--rule-strong",
      "--ink-soft",
      "--indigo",
      "--on-indigo",
      "--indigo-wash",
      "--madder",
      "--on-madder",
      "--madder-wash",
      "--ochre",
      "--on-ochre",
      "--ochre-wash",
      "--tint-8",
      "--paper-white",
    ];
    expect(legacy.filter((name) => !light.has(name))).toEqual([]);
    // each one lands on a board value (or, for the three that have none, a plain literal)
    expect(light.get("--rail-width")).toBe("var(--rail-w)");
    expect(light.get("--space-3")).toBe("var(--s-12)");
    expect(light.get("--madder")).toBe("var(--danger)");
  });

  it("keeps text at 4.5:1 and edges at 3:1", () => {
    for (const ground of ["--page", "--sheet"]) {
      expect(
        contrast(resolve("--ink"), resolve(ground)),
        `ink on ${ground}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(resolve("--muted"), resolve(ground)),
        `muted on ${ground}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(resolve("--focus"), resolve(ground)),
        `focus on ${ground}`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(resolve("--edge"), resolve(ground)),
        `edge on ${ground}`,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const kind of ["cards", "bits", "tiles", "minis", "custom"]) {
      expect(
        contrast(resolve(`--${kind}-ink`), resolve(`--${kind}-fill`)),
        `${kind} ink on its fill`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(resolve(`--${kind}-line`), resolve("--box")),
        `${kind} line on the box`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the board's message colours readable on their grounds", () => {
    const text: [string, string][] = [
      ["--danger-ink", "--danger-bg"],
      ["--warn-ink", "--warn-bg"],
      ["--warn-ink-strong", "--warn-bg"],
      ["--info-ink", "--info-bg"],
      ["--changed-ink", "--changed-bg"],
      ["--ok", "--fit-bg"],
      ["--on-danger", "--danger"],
      ["--on-focus", "--focus"],
    ];
    for (const [ink, ground] of text) {
      expect(contrast(resolve(ink), resolve(ground)), `${ink} on ${ground}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    // the mark inside the warning triangle is a shape, not text: 3:1
    expect(contrast(resolve("--on-warn"), resolve("--warn"))).toBeGreaterThanOrEqual(3);
  });
});

describe("base.css", () => {
  const stripped = base.replace(/\/\*[\s\S]*?\*\//g, "");

  it("sets the page, its ink and 15 px Figtree, 16 px on a phone", () => {
    const body = ruleFor("body", base);
    expect(body).toMatch(/background:\s*var\(--page\)/);
    expect(body).toMatch(/color:\s*var\(--ink\)/);
    expect(body).toMatch(/font:[^;]*15px[^;]*var\(--font-ui\)/);
    expect(ruleFor("body", mediaBlock("(width < 760px)", base))).toMatch(/font-size:\s*16px/);
  });

  it("sets headings in the display face at 700", () => {
    const body = ruleFor("h1", base);
    expect(body).toMatch(/font-family:\s*var\(--font-display\)/);
    expect(body).toMatch(/font-weight:\s*700/);
  });

  it("shows where the keyboard is: a 3 px ring, and the glow on a field with focus", () => {
    expect(stripped).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/);
    expect(stripped).toMatch(/:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
    const field = ruleFor(".field-box:focus-within", base);
    expect(field).toMatch(/border:\s*1\.5px solid var\(--ink\)/);
    expect(field).toMatch(/box-shadow:\s*0 0 0 3px var\(--field-glow\)/);
  });

  it("marks a text field's focus once: border and glow, no outline on top", () => {
    for (const selector of [
      'input[type="text"]:focus-visible',
      'input[type="search"]:focus-visible',
      "select:focus-visible",
      "textarea:focus-visible",
      ".field-box input:focus-visible",
    ]) {
      expect(ruleFor(selector, base), selector).toMatch(/outline:\s*none/);
    }
    // a button and a link keep the ring
    expect(ruleFor(":focus-visible", base, true)).toMatch(/outline:\s*3px solid var\(--focus\)/);
  });

  it("keeps .tap at the control height and .visually-hidden out of sight", () => {
    expect(ruleFor(".tap", base)).toMatch(/min-height:\s*var\(--control-h\)/);
    expect(ruleFor(".visually-hidden", base)).toMatch(/clip-path:\s*inset\(50%\)/);
  });
});

describe("fonts.css", () => {
  it("ships Figtree 500", () => {
    const faces = [...fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    const files = faces
      .filter((f) => /font-family:\s*"Figtree"/.test(f) && /font-weight:\s*500/.test(f))
      .map((f) => /figtree-(latin(?:-ext)?)-500-normal\.woff2/.exec(f)?.[1]);
    expect(files.sort()).toEqual(["latin", "latin-ext"]);
  });
});

describe("style.css", () => {
  it("gives the 3D canvas an explicit CSS width and height, the frame's (no ResizeObserver feedback)", () => {
    const body = ruleFor(".viewer-canvas");
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/height:\s*100%/);
  });

  it("draws the 3D view in the plan's frame: the same size and radius, on the stage's own colour", () => {
    const frame = ruleFor(".viewer-stage", plan);
    expect(frame).toBe(ruleFor(".plan-box", plan));
    expect(frame).toMatch(
      /--side:\s*min\(\s*var\(--plan-max\),\s*calc\(\(100cqw - 12px\) \* var\(--long\) \/ var\(--box-w\) \+ 12px\),\s*calc\(\(100cqh - 12px\) \* var\(--long\) \/ var\(--box-l\) \+ 12px\)\s*\)/,
    );
    expect(frame).toMatch(/border-radius:\s*var\(--r-panel\)/);
    // the plan's box is tan; the model is not in a tan block: it sits on the stage, with no edge drawn round it
    expect(frame).toMatch(/background:\s*var\(--box\)/);
    const ground = ruleFor(".viewer-stage", plan, true);
    expect(ground).toMatch(/background:\s*var\(--page\)/);
    expect(ground).toMatch(/box-shadow:\s*none/);
    expect(ruleFor(".viewer-canvas")).toMatch(/border-radius:\s*inherit/);
    expect(ruleFor(".viewer-canvas")).not.toMatch(/background/);
  });

  it("keeps the selected tray's name from catching the pointer, so trays under it can still be picked", () => {
    expect(ruleFor(".viewer-selection-live")).toMatch(/pointer-events:\s*none/);
    expect(ruleFor(".viewer-stage", plan)).toMatch(/position:\s*relative/);
  });

  it("keeps the 3D view's messages out of the flow, over the foot of the frame, so the frame never shrinks", () => {
    const under = ruleFor(".viewer-under");
    expect(under).toMatch(/position:\s*absolute/);
    expect(under).toMatch(/bottom:\s*var\(--s-8\)/);
    // the strip is no panel: the pointer reaches the canvas round the one row of controls
    expect(under).toMatch(/pointer-events:\s*none/);
    expect(under).not.toMatch(/background/);
    expect(ruleFor(".viewer-under > *")).toMatch(/pointer-events:\s*auto/);
    // Spread apart is in the caption row under the frame, not over it
    const row = ruleFor(".range-field");
    expect(row).toMatch(/align-items:\s*center/);
    expect(css).not.toMatch(/\.viewer-controls/);
    expect(css).not.toMatch(/\.tray-picker|\.tray-chip/);
  });

  it("lets one finger scroll the page past the 3D canvas", () => {
    const body = ruleFor(".viewer-canvas");
    expect(body).toMatch(/touch-action:\s*pan-y/);
    expect(body).not.toMatch(/touch-action:\s*none/);
    // the frame around it takes no touch-action of its own
    expect(ruleFor(".viewer-stage", plan)).not.toMatch(/touch-action/);
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
    expect(ruleFor(".tap", base)).toMatch(/min-height:\s*var\(--control-h\)/);
  });
});

describe("the phone layout", () => {
  const phoneLayout = css.slice(css.indexOf(".pf-sheet {"));

  it("keeps a note over the foot of the screen above the sheet's handle", () => {
    const body = ruleFor(".pf-toasts", phoneLayout);
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/calc\(var\(--sheet-foot\)/);
    expect(ruleFor(".ws", workspace)).toMatch(/--sheet-foot:\s*calc\(var\(--sheet-peek\)/);
  });

  it("makes the screen one dvh tall, so a browser's own bars do not cover the sheet", () => {
    expect(ruleFor(".ws", workspace)).toMatch(/height:\s*100dvh/);
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

  it("orders the stage: banner, status, plan", () => {
    // DESIGN §5: the page's order is the order on every width, so no `order` moves a block
    // (App.test.tsx checks the page; stage.style.test.ts checks stage.css has none)
    expect(ruleFor(".ws-stage > .stage-block", workspace)).not.toMatch(/order:/);
    expect(mediaBlock("(width < 760px)", workspace)).not.toMatch(
      /\.stage-block|\.stage-status|\.app-notices/,
    );
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

  it("sizes the plan from Main and the height left", () => {
    // the container takes what the stage has left; the box shrinks into it before the stage scrolls
    const fit = ruleFor(".plan-fit", plan);
    expect(fit).toMatch(/container-type:\s*size/);
    expect(fit).toMatch(/min-height:\s*0/);
    // as tall as the box at the stage's width, up to the box at full size, so the caption sits
    // under it; shrinking, never growing
    expect(fit).toMatch(/flex:\s*0 1 auto/);
    expect(fit).toMatch(/aspect-ratio:\s*var\(--box-w\) \/ var\(--box-l\)/);
    expect(fit).toMatch(/max-height:\s*calc\(\s*\(var\(--plan-max\) - 12px\)/);
    expect(fit).toMatch(/display:\s*grid/);
    expect(fit).toMatch(/place-items:\s*center/);
    const col = ruleFor(".ws-stage > .plan-col", workspace);
    expect(col).toMatch(/flex:\s*1 1 auto/);
    expect(col).toMatch(/min-height:\s*0/);
    // no floor under it: the 24 rem of the old layout is gone
    expect(workspace).not.toMatch(/24rem/);
    // the box: --plan-max (900 px), or less
    // each side of the box is held by its own container side, whichever way the box lies
    expect(ruleFor(".plan-box", plan)).toMatch(
      /--side:\s*min\(\s*var\(--plan-max\),\s*calc\(\(100cqw - 12px\) \* var\(--long\) \/ var\(--box-w\) \+ 12px\),\s*calc\(\(100cqh - 12px\) \* var\(--long\) \/ var\(--box-l\) \+ 12px\)\s*\)/,
    );
    expect(ruleFor(".plan-box", plan)).toMatch(/border-radius:\s*var\(--r-panel\)/);
    expect(ruleFor(".plan-box", plan)).toMatch(/box-shadow:\s*var\(--box-inset-plan\)/);
    // a phone: the page's width less 16 px a side, radius 14, and the frame sets no height cap
    const phone = mediaBlock("(width < 760px)", plan);
    expect(ruleFor(".plan-box", phone)).toMatch(/--side:\s*calc\(100vw - 32px\)/);
    expect(ruleFor(".plan-box", phone)).toMatch(/border-radius:\s*var\(--r-card\)/);
    expect(ruleFor(".plan-fit", phone)).toMatch(/container-type:\s*normal/);
    expect(ruleFor(".plan-fit", phone)).toMatch(/max-height:\s*none/);
    // dimming: every other tile at 60% (half washed the hue out; owner: "a bit pale"), with a short fade that reduced motion drops
    expect(ruleFor(".plan-tile.is-dimmed", plan)).toMatch(/opacity:\s*0\.6/);
    expect(ruleFor(".plan-tile", plan)).toMatch(/transition:\s*opacity 180ms,\s*box-shadow 180ms/);
    expect(ruleFor(".plan-tile", mediaBlock("(prefers-reduced-motion: reduce)", plan))).toMatch(
      /transition:\s*none/,
    );
  });

  it("draws a phone's tiles plain: a smaller pill, no cells, no padding", () => {
    const phone = mediaBlock("(width < 760px)", plan);
    expect(ruleFor(".plan-cells", phone)).toMatch(/display:\s*none/);
    // no tile has padding, on a phone or not (a thin spacer must not grow past its footprint)
    expect(ruleFor(".plan-tile", plan)).toMatch(/padding:\s*0;/);
    expect(ruleFor(".plan-pill", phone)).toMatch(/padding:\s*2px 7px/);
    expect(ruleFor(".plan-pill", phone)).toMatch(/font-size:\s*var\(--text-2xs\)/);
  });

  it("draws a tile 3 px inside its footprint, 10 px round, with no padding", () => {
    const tile = ruleFor(".plan-tile", plan);
    expect(tile).toMatch(/left:\s*calc\(var\(--x\) \+ 3px\)/);
    expect(tile).toMatch(/width:\s*calc\(var\(--w\) - 6px\)/);
    expect(tile).toMatch(/border-radius:\s*var\(--r-tile\)/);
    expect(tile).toMatch(/padding:\s*0;/);
    expect(ruleFor(".plan-floor", plan)).toMatch(/inset:\s*6px/);
  });

  it("gives the Layer and View segments a 44 px target", () => {
    // the status row's segments are the kit's (Main's, 44 px each in a 3 px track)
    expect(ruleFor(".k-seg__item", kit)).toMatch(/height:\s*var\(--control-h\)/);
  });
});

describe("pills", () => {
  // DESIGN §2 Claims: what does not fit in a pill ends in an ellipsis; the status heading's title
  // is one line, cut with one, and its whole text is in a title (the kit's `ellipsis`).
  it("keep the status heading's title to one line, cut with an ellipsis", () => {
    expect(ruleFor(".ellipsis", kit)).toMatch(/white-space:\s*nowrap/);
    expect(ruleFor(".ellipsis", kit)).toMatch(/text-overflow:\s*ellipsis/);
    expect(ruleFor(".ellipsis", kit)).toMatch(/overflow:\s*hidden/);
  });
});

describe("breakpoints", () => {
  const sheets = import.meta.glob<string>("./**/*.css", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  it("never scrolls sideways on a phone: no rule sets a fixed width over 390 px outside the wide screens' blocks", () => {
    // what is left once the blocks that only apply from 760 px (and print) are cut out
    const phoneRules = (source: string): string => {
      let out = source.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const query of ["(width >= 760px)", "(width >= 760px) and (width <= 960px)", "print"]) {
        for (;;) {
          const at = out.indexOf(`@media ${query}`);
          if (at === -1) {
            break;
          }
          const open = out.indexOf("{", at);
          let depth = 0;
          let end = open;
          for (; end < out.length; end += 1) {
            depth += out[end] === "{" ? 1 : out[end] === "}" ? -1 : 0;
            if (depth === 0) {
              break;
            }
          }
          out = out.slice(0, at) + out.slice(end + 1);
        }
      }
      return out;
    };
    const wide: string[] = [];
    for (const [file, source] of Object.entries(sheets)) {
      for (const m of phoneRules(source).matchAll(
        /([^{};]+)\{[^{}]*?[;{\s](?:min-)?width:\s*(\d+(?:\.\d+)?)px/g,
      )) {
        if (Number(m[2]) > 390) {
          wide.push(`${file}: ${(m[1] ?? "").trim()} ${m[2]}px`);
        }
      }
    }
    expect(wide).toEqual([]);
  });

  it("are 760 (phone), 600 (full-screen dialogs), the 760 to 960 tablet band and the page block's edge (1600), and nothing else", () => {
    const RULED = new Set([
      "(width < 760px)",
      "screen and (width < 760px)",
      "(width >= 760px)",
      "(width >= 760px) and (width <= 960px)",
      "(width < 600px)",
      "(width > 1600px)", // wide windows: the page block's edge (--block-max, 0.9.0)
      "(prefers-reduced-motion: reduce)",
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
});

describe("workspace.css", () => {
  const stripped = workspace.replace(/\/\*[\s\S]*?\*\//g, "");

  it("fills the viewport and never scrolls the page on desktop", () => {
    expect(ruleFor(".ws", stripped)).toMatch(/height:\s*100dvh/);
    expect(ruleFor(".ws-header", stripped)).toMatch(/flex:\s*none/);
    const body = ruleFor(".ws-body", stripped);
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/flex-wrap:\s*wrap/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(ruleFor(".ws", stripped)).toMatch(/overflow:\s*clip/);
    // a column is never taller than the body, so the page has no scroll of its own
    expect(ruleFor(".ws-rail", stripped)).toMatch(/max-height:\s*100%/);
    expect(ruleFor(".ws-stage", stripped)).toMatch(/max-height:\s*100%/);
  });

  it("gives the rail one width on every screen: the person's, 300 to 480 px, from --rail-w", () => {
    const rail = ruleFor(".ws-rail", stripped);
    expect(rail).toMatch(/flex:\s*0 1 clamp\(var\(--rail-min\), var\(--rail-w\),/);
    // the range is in the tokens, not a max-width of the rule
    expect(rail).not.toMatch(/max-width/);
    expect(rail).toMatch(/padding:\s*var\(--rail-pad\)/);
    expect(rail).toMatch(/background:\s*var\(--sheet\)/);
    expect(rail).toMatch(/border-right:\s*1px solid var\(--rule\)/);
    expect(rail).toMatch(/overflow:\s*hidden/);
    const light = declarations(tokens.replace(/\/\*[\s\S]*?\*\//g, ""));
    expect(light.get("--rail-w")).toBe("300px");
    expect(light.get("--rail-min")).toBe("300px");
    expect(light.get("--rail-max")).toBe("480px");
  });

  it("puts the rail's handle on its stage-side edge: a 44 px hit area on the stage's side, a visible focus, no handle on a phone", () => {
    const handle = ruleFor(".ws-handle", stripped);
    // a real box (a zero-width one is hidden to assistive technology) that takes no room
    expect(handle).toMatch(/width:\s*var\(--handle-w\)/);
    expect(handle).toMatch(/margin-right:\s*calc\(-1 \* var\(--handle-w\)\)/);
    expect(handle).toMatch(/cursor:\s*col-resize/);
    expect(handle).toMatch(/touch-action:\s*none/);
    // the hit area starts at the rail's edge and reaches into the stage, so the rail's scrollbar is never under it
    const hit = ruleFor(".ws-handle::before", stripped);
    expect(hit).toMatch(/inset:\s*0 auto 0 0/);
    expect(hit).toMatch(/width:\s*var\(--control-h\)/);
    expect(ruleFor(".ws-handle:focus-visible", stripped)).toMatch(
      /outline:\s*3px solid var\(--focus\)/,
    );
    expect(ruleFor(".ws-handle", mediaBlock("(width < 760px)", stripped))).toMatch(
      /display:\s*none/,
    );
  });

  it("keeps an editor's scrollbar at the rail's edge, with a gutter of its own, off the fields", () => {
    // the wrapper reaches over the rail's padding to the edge ...
    expect(ruleFor(".ws-rail > .ws-interim", stripped)).toMatch(
      /margin-right:\s*calc\(-1 \* var\(--rail-pad\)\)/,
    );
    // ... and the panel, which is what scrolls, puts the padding back inside itself
    const panel = ruleFor(".ws-rail > .ws-interim > .ed", stripped);
    expect(panel).toMatch(/padding-right:\s*calc\(var\(--rail-pad\) - var\(--scroll-gutter\)\)/);
    expect(panel).toMatch(/scrollbar-gutter:\s*stable/);
    // only in the rail: a phone's sheet holds the same editor and has no padding to reach over
    expect(ruleFor(".ws-interim", stripped)).not.toMatch(/margin-right/);
  });

  it("lets the stage take the rest", () => {
    const stage = ruleFor(".ws-stage", stripped);
    expect(stage).toMatch(/flex:\s*999 1 var\(--stage-min\)/);
    expect(stage).toMatch(/min-width:\s*0/);
    expect(stage).toMatch(/padding:\s*var\(--stage-pad\)/);
    expect(stage).toMatch(/gap:\s*var\(--s-16\)/);
    expect(ruleFor(".ws-stage--focus", stripped)).toMatch(/padding:\s*var\(--stage-pad-focus\)/);
  });

  it("puts the stage first on a phone, and the header at the phone's height", () => {
    const phone = mediaBlock("(width < 760px)", stripped);
    expect(ruleFor(".ws-stage", phone)).toMatch(/order:\s*-1/);
    expect(ruleFor(".ws-header", phone)).toMatch(/min-height:\s*var\(--header-h-phone\)/);
  });

  it("keeps the sheet's peek clear of the stage's last block, only where a sheet is", () => {
    const phone = mediaBlock("(width < 760px)", stripped);
    expect(ruleFor(".ws--sheet .ws-stage", phone)).toMatch(/calc\(var\(--sheet-foot\)/);
    expect(ruleFor(".ws-stage", phone)).not.toMatch(/--sheet-foot/);
  });

  it("keeps the stage beside the rail at every desktop width: the rail clamps to 100vw less the stage's floor, and the floor fits the narrowest desktop", () => {
    const light = declarations(tokens.replace(/\/\*[\s\S]*?\*\//g, ""));
    const floor = Number.parseInt(light.get("--stage-min") ?? "", 10);
    const railMin = Number.parseInt(light.get("--rail-min") ?? "", 10);
    // the narrowest rail and the stage's floor fit side by side at 760 px, so the line never wraps
    expect(floor).toBeGreaterThanOrEqual(360);
    expect(railMin + floor).toBeLessThanOrEqual(760);
    // whatever width the person chose, at any width: not only in a media band
    const rail = ruleFor(".ws-rail", stripped);
    expect(rail).toMatch(
      /flex:\s*0 1 clamp\(var\(--rail-min\), var\(--rail-w\), calc\(100vw - var\(--stage-min\)\)\)/,
    );
    expect(ruleFor(".ws-stage", stripped)).toMatch(/flex:\s*999 1 var\(--stage-min\)/);
    // and no media rule gives either a basis of its own to undo it
    expect(mediaBlock("(width >= 760px) and (width <= 960px)", stripped)).not.toMatch(
      /\.ws-(rail|stage)\b/,
    );
  });

  it("writes no raw colours", () => {
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("kit.css", () => {
  const stripped = kit.replace(/\/\*[\s\S]*?\*\//g, "");

  it("sizes the kit from tokens", () => {
    expect(ruleFor(".k-btn", stripped)).toMatch(/height:\s*var\(--control-h\)/);
    expect(ruleFor(".k-field__box", stripped)).toMatch(/height:\s*var\(--field-h\)/);
    expect(ruleFor(".k-btn", stripped)).toMatch(/border-radius:\s*var\(--r-pill\)/);
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("keeps the other sizes the boards draw", () => {
    expect(ruleFor(".k-btn--dialog", stripped)).toMatch(/height:\s*var\(--dialog-btn-h\)/);
    expect(ruleFor(".k-btn--cta", stripped)).toMatch(/height:\s*var\(--cta-h\)/);
    expect(ruleFor(".k-iconbtn", stripped)).toMatch(/width:\s*var\(--control-h\)/);
    expect(ruleFor(".k-seg__item", stripped)).toMatch(/height:\s*var\(--control-h\)/);
    expect(ruleFor(".k-chip", stripped)).toMatch(/height:\s*var\(--control-h\)/);
    expect(ruleFor(".k-kindtile", stripped)).toMatch(/height:\s*var\(--kind-tile-h\)/);
    expect(ruleFor(".k-menu", stripped)).toMatch(/width:\s*var\(--menu-w\)/);
  });

  it("writes only the breakpoints DESIGN rules", () => {
    const queries = [...stripped.matchAll(/@media\s+([^{]+)\{/g)].map((m) => (m[1] ?? "").trim());
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(["(width < 760px)", "(width < 600px)", "(prefers-reduced-motion: reduce)"]).toContain(
        q,
      );
    }
  });
});
