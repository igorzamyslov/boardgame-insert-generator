// src/screens/BoxSideView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { makeLayout } from "../app/test-helpers";
import type { Box, Project, TraySpec } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import { BoxSideView } from "./BoxSideView";

afterEach(cleanup);

const harbour = (): Project => loadSeed("harbour-kings-headroom").project;

function draw(project: Project, box: Box = project.box, phone = false) {
  return render(
    <BoxSideView
      box={box}
      settings={project.settings}
      layout={project.layout}
      components={project.components}
      phone={phone}
    />,
  );
}

describe("BoxSideView", () => {
  it("shows the kept-free height and the rest", () => {
    const p = harbour();
    draw(p, { ...p.box, innerHeight: 70, headroom: 8 });
    expect(screen.getByText("Kept free, 8 mm")).toBeTruthy();
    // the caption is text a reader gets; the drawing is for the eye
    const caption = screen.getByText("Trays fill the 62 mm below.");
    expect(caption.closest("[aria-hidden='true']")).toBeNull();
  });

  it("draws the trays a slice crosses at their real x, z, h", () => {
    const p = harbour();
    const { container } = draw(p);
    const trays = p.layout?.trays ?? [];
    // the cut is through the middle of the deepest stack (the tray on the top level with the most depth)
    const top = trays.filter((t) => t.part === "tray" && t.level > 0).sort((a, b) => b.d - a.d)[0];
    const y0 = (top?.y ?? 0) + (top?.d ?? 0) / 2;
    const crossed = trays.filter((t) => t.part !== "spacer" && t.y <= y0 && y0 < t.y + t.d);
    expect(crossed.length).toBeGreaterThanOrEqual(3);
    const blocks = [...container.querySelectorAll<HTMLElement>(".bx-tray")];
    expect(blocks.map((b) => b.dataset.key).sort()).toEqual(crossed.map((t) => t.key).sort());
    const fill = 62;
    const usable = p.box.innerWidth - 2 * 0.5;
    for (const t of crossed) {
      const block = container.querySelector(`.bx-tray[data-key="${t.key}"]`) as HTMLElement;
      const num = (name: string): number => parseFloat(block.style.getPropertyValue(name));
      expect(num("--x")).toBeCloseTo((t.x / usable) * 100, 2);
      expect(num("--w")).toBeCloseTo((t.w / usable) * 100, 2);
      expect(num("--z")).toBeCloseTo((t.z / fill) * 100, 2);
      expect(num("--h")).toBeCloseTo((t.h / fill) * 100, 2);
    }
    // the drawing is for the eye only
    expect(container.querySelector(".bx-drawing")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts no block past the band", () => {
    for (const seed of ["harbour-kings-headroom", "harbour-kings"]) {
      const p = loadSeed(seed).project;
      cleanup();
      const { container } = draw(p);
      const fill = 100;
      for (const block of container.querySelectorAll<HTMLElement>(".bx-tray")) {
        const num = (name: string): number => parseFloat(block.style.getPropertyValue(name));
        expect(num("--z") + num("--h"), `${seed}: ${block.dataset.key}`).toBeLessThanOrEqual(
          fill + 0.01,
        );
        expect(num("--x") + num("--w")).toBeLessThanOrEqual(100.5);
      }
    }
  });

  it("says nothing about free space without headroom", () => {
    const p = harbour();
    draw(p, { ...p.box, headroom: 0 });
    expect(screen.queryByText(/Kept free/)).toBeNull();
    expect(screen.queryByText(/Trays fill the/)).toBeNull();
    expect(document.querySelector(".bx-band")).toBeNull();
  });

  it("colours a block by its component's kind, and a spare tray plain", () => {
    const p = harbour();
    const first = p.layout?.trays.find((t) => t.part === "tray");
    expect(first).toBeTruthy();
    const kept = { y: 0, d: 50, z: 0, h: 40, level: 0 };
    const trays = [
      { ...(first as TraySpec), ...kept, key: "kept", stack: 0, x: 0, w: 60 },
      {
        ...(first as TraySpec),
        ...kept,
        key: "spare",
        part: "leftover" as const,
        stack: 1,
        x: 70,
        w: 60,
      },
    ];
    const { container } = draw({ ...p, layout: makeLayout("h", trays) });
    const block = (key: string): HTMLElement =>
      container.querySelector(`.bx-tray[data-key="${key}"]`) as HTMLElement;
    expect(block("spare").style.getPropertyValue("--tile-fill")).toBe("");
    expect(block("spare").hasAttribute("data-spare")).toBe(true);
    expect(block("kept").style.getPropertyValue("--tile-fill")).not.toBe("");
  });

  it("draws the free band and an empty floor while there is no plan", () => {
    const p = harbour();
    const { container } = draw({ ...p, layout: undefined });
    expect(screen.getByText("Kept free, 8 mm")).toBeTruthy();
    expect(container.querySelectorAll(".bx-tray")).toHaveLength(0);
    expect(container.querySelector(".bx-floor")).toBeTruthy();
  });

  it("is the phone's drawing when asked", () => {
    const p = harbour();
    const { container } = draw(p, p.box, true);
    expect(container.querySelector(".bx-side")?.getAttribute("data-phone")).toBe("true");
  });
});
