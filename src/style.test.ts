import { describe, expect, it } from "vitest";
import css from "./style.css?raw";
import tokens from "./styles/tokens.css?raw";
import { contrast } from "./ui/color";

/** The declarations block of the first rule whose selector list contains `selector`. */
function ruleFor(selector: string, source = css): string {
  const rules = source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selectors = "", body = ""] of rules) {
    if (selectors.split(",").some((s) => s.trim() === selector)) {
      return body;
    }
  }
  return "";
}

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

  it("lets one finger scroll the page past the 3D canvas and shortens it on phones", () => {
    const body = ruleFor(".viewer-canvas");
    expect(body).toMatch(/touch-action:\s*pan-y/);
    expect(body).not.toMatch(/touch-action:\s*none/);
    const narrow = /@media \(width <= 600px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(ruleFor(".viewer-canvas", narrow)).toMatch(/height:\s*min\(45vh,\s*320px\)/);
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
