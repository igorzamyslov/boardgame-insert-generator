// @vitest-environment jsdom
// src/test-support/boardCopy.test.ts
import { describe, expect, it } from "vitest";
import { boardLiterals, containsDenied, unruled, visibleStrings } from "./boardCopy";
import type { Allowed } from "./boardCopy";

const empty: Allowed = { literals: new Set(), rulings: [], data: new Set(), engine: new Set() };

describe("boardCopy", () => {
  it("collects a board's literals", async () => {
    const literals = await boardLiterals("Main.dc.html");
    for (const text of [
      "Tap a tray for details.",
      "This plan stays unless a better one turns up.",
      "This plan is from before your last changes.",
      "Keep searching",
    ]) {
      expect(literals.has(text), text).toBe(true);
    }
    expect([...literals].filter((text) => text.includes("{{"))).toEqual([]);
  });

  it("reads only visible text", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div>A<span aria-hidden="true">B</span><span class="visually-hidden">C</span><span hidden>D</span><b>  E   F </b></div>';
    expect(visibleStrings(host.firstElementChild as Element)).toEqual(["A", "E F"]);
  });

  it("matches digits in literals to any number", () => {
    const literals = new Set(["10 trays in 2 layers, 66 of 70 mm high"]);
    expect(unruled(["8 trays in 3 layers, 60 of 70 mm high"], { ...empty, literals })).toEqual([]);
    expect(unruled(["8 trays in 3 layers, 60 of 70 mm tall"], { ...empty, literals })).toEqual([
      "8 trays in 3 layers, 60 of 70 mm tall",
    ]);
  });

  it("splits on the middle dot", () => {
    const rulings = [{ text: "Layer 1 (bottom)", row: "test" }];
    expect(
      unruled(["Layer 1 (bottom) · 95 × 190 × 40 mm · about 3.5 h, 58 g"], { ...empty, rulings }),
    ).toEqual([]);
  });

  it("knows measures and estimates", () => {
    const strings = ["285 × 285 × 70 mm", "1.6", "about 560 g", "about 33 h", "about 45 min"];
    expect(unruled(strings, empty)).toEqual([]);
  });

  it("matches ruled templates", () => {
    const rulings = [{ text: "The {name} tray doesn't fit yet", row: "test" }];
    expect(unruled(["The Heroes tray doesn't fit yet"], { ...empty, rulings })).toEqual([]);
    expect(unruled(["Heroes don't fit yet"], { ...empty, rulings })).toEqual([
      "Heroes don't fit yet",
    ]);
  });

  it("never allows a denied board string", async () => {
    const main = await boardLiterals("Main.dc.html");
    for (const text of ["Update the plan", "Keep the old plan", "Turn back"]) {
      expect(main.has(text), text).toBe(false);
    }
    const noFit = await boardLiterals("NoFit.dc.html");
    expect(noFit.has("Lay the figures down")).toBe(false);
    expect(unruled(["Lay the figures down"], { ...empty, literals: noFit })).toEqual([
      "Lay the figures down",
    ]);
  });

  it("matches denied strings as whole words", () => {
    expect(containsDenied("Best")).toBe(true);
    expect(containsDenied("The Best fit")).toBe(true);
    expect(containsDenied("Bestow a gift")).toBe(false);
    expect(containsDenied("Not the Best")).toBe(true);
    expect(containsDenied("+ Add")).toBe(true);
    expect(containsDenied("Please Choose… one")).toBe(true);
  });

  it("reports what is left", () => {
    expect(unruled(["Hello"], empty)).toEqual(["Hello"]);
  });
});
