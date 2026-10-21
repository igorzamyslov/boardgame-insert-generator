// src/viewer/viewerFrame.style.test.ts
// The 3D view's frame fills the working column (WideStage2), where the top view's keeps the box's
// aspect. jsdom draws no CSS, so the rules are read as text.
import { describe, expect, it } from "vitest";
import plan from "../plan/plan.css?raw";

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the `@media (width >= 760px)` block, or "" when there is none. */
function fromTablet(source: string): string {
  const css = strip(source);
  const start = css.indexOf("@media (width >= 760px)");
  if (start === -1) {
    return "";
  }
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") {
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(css.indexOf("{", start) + 1, i);
      }
    }
  }
  return "";
}

/** The declarations of the first rule with exactly this selector. */
function ruleFor(selector: string, source: string): string {
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.trim() === selector) {
      return body;
    }
  }
  return "";
}

describe("the 3D view's frame", () => {
  const wide = fromTablet(plan);

  it("grows to what the column has left, not to the box's aspect", () => {
    const fit = ruleFor(".viewer-fit", wide);
    expect(fit).toMatch(/flex:\s*1 1 auto/);
    expect(fit).toMatch(/aspect-ratio:\s*auto/);
    expect(fit).toMatch(/max-height:\s*none/);
    // a frame shorter than the room hangs from the slot, so Top and 3D leave it at the same height
    expect(fit).toMatch(/align-items:\s*start/);
  });

  it("is as wide as the column and as tall as the top view's frame, never taller than wide", () => {
    const stage = ruleFor(".viewer-fit > .viewer-stage", wide);
    expect(stage).toMatch(/width:\s*100cqw/);
    // the top view's frame is the room's height, or the column's width at the box's W:L, up to
    // its cap (`.plan-fit`): the same here, so a landscape box does not grow taller when Top turns
    // to 3D (0.9.0 review); the room alone (the old rule) made a 400 × 285 mm box 3 to 216 px taller
    const height = stage.replace(/\s+/g, " ");
    expect(height).toMatch(/height:\s*min\(/);
    expect(height).toContain("100cqh,");
    expect(height).toContain("100cqw,");
    expect(height).toContain("100cqw * var(--box-l) / var(--box-w),");
    expect(height).toContain(
      "(var(--plan-max) - 12px) * var(--box-l) / max(var(--box-w), var(--box-l)) + 12px",
    );
    // the same cap `.plan-fit` has
    expect(strip(plan)).toMatch(
      /\.plan-fit \{[^}]*max-height:\s*calc\(\s*\(var\(--plan-max\) - 12px\) \* var\(--box-l\) \/ max\(var\(--box-w\), var\(--box-l\)\) \+ 12px\s*\);/,
    );
  });

  it("leaves the top view's frame and a phone's frame as they were", () => {
    const css = strip(plan);
    // the plan's box still takes its longer side from --plan-max and the box's W:L
    expect(ruleFor(".plan-fit", css)).toMatch(/aspect-ratio:\s*var\(--box-w\) \/ var\(--box-l\)/);
    expect(ruleFor(".plan-box,\n.viewer-stage", css)).toMatch(/width:\s*calc\(/);
    // nothing outside the tablet block makes the 3D frame fill: a phone's is the box's shape
    expect(css.replace(wide, "")).not.toMatch(/\.viewer-fit/);
  });
});
