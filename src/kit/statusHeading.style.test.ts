// src/kit/statusHeading.style.test.ts
// The status heading's rules that no DOM test can see (jsdom draws no CSS): with no line under the
// title, the icon, the title, the action after it and the switches share the title's centre.
import { describe, expect, it } from "vitest";
import css from "./kit.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule with exactly this selector. */
function ruleFor(selector: string): string {
  for (const [, selectors = "", body = ""] of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim() === selector) {
      return body;
    }
  }
  return "";
}

describe("StatusHeading without a line", () => {
  it("starts the row at the title's line instead of centring it on the title and the line's room", () => {
    expect(ruleFor('.k-status[data-line="none"]')).toMatch(/align-items:\s*flex-start/);
    expect(ruleFor('.k-status[data-line="none"] .k-status__lead')).toMatch(
      /align-items:\s*flex-start/,
    );
  });

  it("centres the title on the icon, and the action on the title's line", () => {
    expect(ruleFor('.k-status[data-line="none"] .k-status__text')).toMatch(
      /padding-top:\s*calc\(\(var\(--status-icon-now\) - var\(--status-title-h\)\) \/ 2\)/,
    );
    expect(ruleFor('.k-status[data-line="none"] .k-status__head')).toMatch(
      /height:\s*var\(--status-title-h\)/,
    );
    expect(ruleFor('.k-status[data-line="none"] .k-status__extra')).toMatch(/margin-block:/);
  });

  it("keeps the room of a line under the title, so the row does not move when one turns up", () => {
    expect(ruleFor(".k-status__text")).toMatch(/min-height:/);
  });

  it("measures the icon and the title by the phone's sizes on a phone", () => {
    const phone = css.slice(css.indexOf("@media (width < 760px) {\n  .k-status {"));
    expect(phone).toMatch(/--status-icon-now:\s*var\(--status-icon-phone\)/);
    expect(phone).toMatch(/--status-title-h:\s*calc\(var\(--h1-phone\) \* 1\.2\)/);
  });
});
