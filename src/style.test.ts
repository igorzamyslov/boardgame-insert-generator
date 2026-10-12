import { describe, expect, it } from "vitest";
import css from "./style.css?raw";

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

describe("style.css", () => {
  it("gives the 3D canvas an explicit CSS width and height (no ResizeObserver feedback)", () => {
    const body = ruleFor(".viewer-canvas");
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/height:\s*min\(/);
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
