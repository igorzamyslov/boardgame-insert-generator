// src/ui/BottomSheet.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import css from "../style.css?raw";
import { BottomSheet } from "./BottomSheet";

afterEach(cleanup);

// The behaviour tests (focus, Escape, inert, the handle) moved to src/kit/Sheet.test.tsx with the
// code: `BottomSheet` is the kit's `Sheet` in its legacy look. What stays here is that look.
describe("BottomSheet", () => {
  it("is the kit's sheet in its legacy look: the .pf-sheet classes style.css draws", () => {
    render(
      <BottomSheet label="Sheet" title="List" expanded={false} onExpandedChange={() => undefined}>
        <p>Inside</p>
      </BottomSheet>,
    );
    expect(screen.getByRole("region").classList.contains("pf-sheet")).toBe(true);
    expect(
      screen.getByRole("button", { name: "List" }).classList.contains("pf-sheet__handle"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("region").getAttribute("data-expanded")).toBe("false");
  });
});

describe("the sheet's styles", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  /** The text between the braces that open at `open`, braces inside included. */
  function blockAt(open: number): string {
    let depth = 0;
    for (let i = open; i < stripped.length; i++) {
      depth += stripped[i] === "{" ? 1 : stripped[i] === "}" ? -1 : 0;
      if (depth === 0) {
        return stripped.slice(open + 1, i);
      }
    }
    return "";
  }

  /** Every rule as [selector list, body], whatever block it sits in. */
  function rulesIn(source: string): [string[], string][] {
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel = "", body = ""]) => [
      sel
        .replace(/@media[^{]*\{/, "")
        .split(",")
        .map((x) => x.trim()),
      body,
    ]);
  }

  it("gives the handle a 44 px target", () => {
    const body = rulesIn(stripped).find(([sel]) => sel.includes(".pf-sheet__handle"))?.[1];
    expect(body).toMatch(/min-height:\s*var\(--control-h\)/);
  });

  it("turns off every transition the sheet has when the person asks for less motion", () => {
    const at = stripped.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(at).toBeGreaterThan(-1);
    const reducedBody = blockAt(stripped.indexOf("{", at));
    const reduced = new Set(
      rulesIn(reducedBody)
        .filter(([, body]) => /transition:\s*none/.test(body))
        .flatMap(([sel]) => sel),
    );
    const outside = stripped.slice(0, at) + stripped.slice(at + reducedBody.length);
    const animated = rulesIn(outside)
      .filter(([, body]) => /transition:\s*(?!none)/.test(body))
      .flatMap(([sel]) => sel)
      .filter((sel) => sel.includes(".pf-sheet"));
    expect(animated.length).toBeGreaterThanOrEqual(3);
    for (const sel of animated) {
      expect(reduced.has(sel), sel).toBe(true);
    }
  });
});
