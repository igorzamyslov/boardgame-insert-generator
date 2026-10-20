// src/kit/Gallery.test.tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import * as kit from "./index";
import { Gallery, PRIMITIVES } from "./Gallery";

afterEach(cleanup);

describe("the kit gallery", () => {
  it("shows every primitive in its own section", () => {
    const { container } = render(<Gallery />);
    const shown = [...container.querySelectorAll("section[data-primitive]")].map((s) =>
      s.getAttribute("data-primitive"),
    );
    expect(shown).toEqual(PRIMITIVES);
    for (const name of PRIMITIVES) {
      expect(kit, name).toHaveProperty(name);
    }
  });

  it("has one h1 (the status headings sit lower), and gives no two elements the same id", () => {
    const { container } = render(<Gallery />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows the Copies row in the changed state, and no Per player", () => {
    const { container } = render(<Gallery />);
    const row = container.querySelector('[data-primitive="DisclosureRow"]');
    expect(row?.textContent).toContain("Copies");
    expect(container.textContent).not.toMatch(/Per player|players/);
  });

  it("shows the states the boards use: blocked, pressed, error and every tone", () => {
    const { container } = render(<Gallery />);
    expect(container.querySelector('.k-btn[aria-disabled="true"]')).toBeTruthy();
    expect(container.querySelector('[aria-pressed="true"]')).toBeTruthy();
    expect(container.querySelector('[aria-invalid="true"]')).toBeTruthy();
    for (const tone of ["fit", "info", "warn", "error", "neutral"]) {
      expect(container.querySelector(`.k-status[data-tone="${tone}"]`), tone).toBeTruthy();
    }
    expect(container.querySelector('.k-notice[data-tone="warn"]')).toBeTruthy();
    expect(container.querySelector('.k-notice[data-tone="info"]')).toBeTruthy();
  });
});
