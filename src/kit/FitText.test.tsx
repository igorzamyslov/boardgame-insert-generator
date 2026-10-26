// src/kit/FitText.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIT_MIN_PX, FIT_MIN_RATIO, FitText, fitFontSize } from "./FitText";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("fitFontSize", () => {
  it("keeps the size when the text fits", () => {
    expect(fitFontSize(13, 90, 100)).toBe(13);
    expect(fitFontSize(13, 100, 100)).toBe(13);
  });

  it("shrinks in proportion to what is over", () => {
    // 120 px of text in 100 px at 13 px: 10.8 px does it
    expect(fitFontSize(13, 120, 100)).toBe(10.8);
  });

  it("stops at 80 % of the size (or 10 px) when even that doesn't fit", () => {
    expect(fitFontSize(13, 200, 100)).toBeCloseTo(13 * FIT_MIN_RATIO, 5);
    expect(fitFontSize(15, 400, 100)).toBe(12);
    // a 12 px label would go to 9.6 px at 80 %: its floor is 10 px
    expect(fitFontSize(12, 400, 100)).toBe(FIT_MIN_PX);
    // never above its own size, even where the floor would be
    expect(fitFontSize(9, 400, 100)).toBe(9);
  });

  it("has no opinion on a label with no room or no text", () => {
    expect(fitFontSize(13, 0, 100)).toBe(13);
    expect(fitFontSize(13, 100, 0)).toBe(13);
  });
});

describe("FitText", () => {
  /** jsdom has no layout: give the label a width of its text (7 px a character) in a room. */
  function layout(room: number): void {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => room);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      const size = parseFloat(this.style.fontSize || "13");
      return (this.textContent?.length ?? 0) * 7 * (size / 13);
    });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontSize: "13px",
    } as CSSStyleDeclaration);
  }

  it("sets nothing for a name that fits", () => {
    layout(200);
    render(<FitText title="Coins">Coins</FitText>);
    expect(screen.getByTitle("Coins").style.fontSize).toBe("");
  });

  it("makes a name a notch smaller before it is cut", () => {
    layout(100);
    // 16 characters: 112 px at 13 px, 100 px fit at 11.6 px or less
    render(<FitText title="Faction wooden">Faction wooden p</FitText>);
    const size = parseFloat(screen.getByTitle("Faction wooden").style.fontSize);
    expect(size).toBeGreaterThanOrEqual(13 * FIT_MIN_RATIO);
    expect(size).toBeLessThan(13);
  });

  it("stops at the floor and leaves the cut to the ellipsis", () => {
    layout(50);
    render(<FitText title="A very long name">A very long name indeed</FitText>);
    expect(parseFloat(screen.getByTitle("A very long name").style.fontSize)).toBeCloseTo(10.4, 5);
  });
});
