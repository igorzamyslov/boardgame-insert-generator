import { describe, expect, it } from "vitest";
import kit from "./kit/kit.css?raw";
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
  const light = declarations(stripped);
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
      "--scrim": "#8E8B83",
      "--rule-soft": "#EEEBE4",
      "--field-line": "#DAD6CC",
      "--line-strong": "#BDB7A9",
      "--handle": "#D6D2C8",
      "--muted-strong": "#3E413C",
      "--ink-dim": "#4A4D47",
      "--ink-off": "#6B6E68",
      "--box-edge": "#BFB8A8",
      "--box-dash": "#8C8778",
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
      "--shadow-lift-drop": "0 14px 28px rgba(29, 31, 28, 0.2)",
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
      "--rail-basis": "300px",
      "--rail-max": "350px",
      "--rail-pad": "20px",
      "--stage-pad": "22px 36px 28px",
      "--stage-pad-focus": "28px 40px",
      "--row-min": "52px",
      "--kind-tile-h": "56px",
      "--stage-slot": "52px",
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

  it("keeps dark opt-in", () => {
    // Task 16 brings dark back behind [data-theme="dark"] and restores a per-token check.
    expect(stripped).not.toContain("prefers-color-scheme");
    expect(stripped).toMatch(/:root\s*\{[^}]*color-scheme:\s*light\s*;/);
    expect(stripped).not.toMatch(/color-scheme:[^;]*dark/);
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
      "--axis-x",
      "--axis-y",
      "--axis-z",
      "--paper-white",
    ];
    expect(legacy.filter((name) => !light.has(name))).toEqual([]);
    // each one lands on a board value (or, for the three that have none, a plain literal)
    expect(light.get("--rail-width")).toBe("var(--rail-max)");
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
    expect(ruleFor(".ws-stage > .stage-block", workspace)).not.toMatch(/order:/);
    expect(mediaBlock("(width < 760px)", workspace)).not.toMatch(/\.stage-block|\.pf-status/);
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
    expect(ruleFor(".ws-stage > .pf-view", workspace)).toMatch(/min-height:\s*24rem/);
  });

  it("gives the view's tabs a 44 px target", () => {
    expect(ruleFor(".pf-tabs button")).toMatch(/min-height:\s*var\(--control-h\)/);
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

  it("are 760 (phone), 600 (full-screen dialogs) and the 760 to 960 tablet band, and nothing else", () => {
    const RULED = new Set([
      "(width < 760px)",
      "screen and (width < 760px)",
      "(width >= 760px)",
      "(width >= 760px) and (width <= 960px)",
      "(width < 600px)",
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

  it("gives the rail Main's width on every screen", () => {
    const rail = ruleFor(".ws-rail", stripped);
    expect(rail).toMatch(/flex:\s*1 1 var\(--rail-basis\)/);
    expect(rail).toMatch(/max-width:\s*var\(--rail-max\)/);
    expect(rail).toMatch(/padding:\s*var\(--rail-pad\)/);
    expect(rail).toMatch(/background:\s*var\(--sheet\)/);
    expect(rail).toMatch(/border-right:\s*1px solid var\(--rule\)/);
    expect(rail).toMatch(/overflow:\s*hidden/);
    const light = declarations(tokens.replace(/\/\*[\s\S]*?\*\//g, ""));
    expect(light.get("--rail-basis")).toBe("300px");
    expect(light.get("--rail-max")).toBe("350px");
  });

  it("lets the stage take the rest", () => {
    const stage = ruleFor(".ws-stage", stripped);
    expect(stage).toMatch(/flex:\s*999 1 640px/);
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

  it("keeps the rail beside the stage between 760 and 960 px: the stage's basis leaves room for the rail", () => {
    const tablet = mediaBlock("(width >= 760px) and (width <= 960px)", stripped);
    const basis = Number(/flex-basis:\s*(\d+)px/.exec(ruleFor(".ws-stage", tablet))?.[1]);
    const rail = Number(/--rail-basis:\s*(\d+)px/.exec(tokens)?.[1]);
    expect(basis).toBeGreaterThan(0);
    // the two fit side by side at 760 px, so the line does not wrap
    expect(rail + basis).toBeLessThanOrEqual(760);
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
