// src/screens/BoxSideView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { makeLayout } from "../app/test-helpers";
import type { Box, Project, TraySpec } from "../model/types";
import { isAddOn } from "../plan/layers";
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
    // the cut is through the middle of the tallest stack's bottom tray (the one with the most layers):
    // the seed's plan has Starter decks on two layers, at y = 173 to 276
    const bottoms = trays.filter(
      (t) => !isAddOn(t) && trays.some((o) => o.stack === t.stack && o.level > t.level),
    );
    const bottom = bottoms.reduce((best, t) => (t.w * t.d > best.w * best.d ? t : best));
    const y0 = bottom.y + bottom.d / 2;
    const crossed = trays.filter((t) => !isAddOn(t) && t.y <= y0 && y0 < t.y + t.d);
    // (the seed's plan decides how many: what is drawn is exactly the ones it crosses)
    expect(crossed.length).toBeGreaterThan(1);
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

  describe("with a kept-free area", () => {
    /** The seed's box (70 high) keeping 12 mm for part of the top: a 120 × 100 area in the front left corner. */
    const withArea = (placed = true): { p: Project; box: Box } => {
      const p = harbour();
      const box: Box = {
        ...p.box,
        innerHeight: 70,
        headroom: 12,
        headroomCoverage: "partial",
        headroomAreas: [{ w: 120, d: 100 }],
      };
      const reserved = placed
        ? [{ area: 0, name: "Rulebook", x: 100, y: 0, w: 120, d: 100, z: 57.5 }]
        : undefined;
      const layout = p.layout === undefined ? undefined : { ...p.layout, reserved };
      return { p: { ...p, box, layout }, box };
    };

    it("draws the paper as a ghost slab over its stacks, not a band over the whole top", () => {
      const { p, box } = withArea();
      const { container } = draw(p, box);
      expect(document.querySelector(".bx-band")).toBeNull();
      const ghost = container.querySelector<HTMLElement>(".bx-reserve");
      expect(ghost).toBeTruthy();
      const usable = box.innerWidth - 2 * 0.5;
      const num = (name: string): number =>
        parseFloat(ghost?.style.getPropertyValue(name) ?? "NaN");
      expect(num("--x")).toBeCloseTo((100 / usable) * 100, 2);
      expect(num("--w")).toBeCloseTo((120 / usable) * 100, 2);
      // the floor is as high as the lid now: the slab is the headroom's share of it
      expect(num("--h")).toBeCloseTo((12 / (70 + p.settings.topPressFit)) * 100, 1);
      expect(ghost?.textContent).toBe("Kept free, 12 mm");
      expect(container.querySelector(".bx-drawing")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("scales the blocks to the lid, so the stacks elsewhere reach the top of the drawing", () => {
      const { p, box } = withArea();
      const { container } = draw(p, box);
      const lid = 70 + p.settings.topPressFit;
      const blocks = [...container.querySelectorAll<HTMLElement>(".bx-tray")];
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        const num = (name: string): number => parseFloat(block.style.getPropertyValue(name));
        const t = (p.layout?.trays ?? []).find((x) => x.key === block.dataset.key);
        expect(num("--h")).toBeCloseTo(((t?.h ?? 0) / lid) * 100, 2);
      }
    });

    it("says both heights in the caption, text a reader gets", () => {
      const { p, box } = withArea();
      draw(p, box);
      const low = 70 - 12 + p.settings.topPressFit;
      const lid = 70 + p.settings.topPressFit;
      const caption = screen.getByText(
        `Trays fill the ${Math.round(lid * 10) / 10} mm below the lid, and ${Math.round(low * 10) / 10} mm under the Rulebook.`,
      );
      expect(caption.closest("[aria-hidden='true']")).toBeNull();
    });

    it("draws the slab at the left while there is no plan to say where it lies", () => {
      const { p, box } = withArea(false);
      const { container } = draw({ ...p, layout: undefined }, box);
      const ghost = container.querySelector<HTMLElement>(".bx-reserve");
      expect(ghost).toBeTruthy();
      expect(parseFloat(ghost?.style.getPropertyValue("--x") ?? "NaN")).toBe(0);
      expect(container.querySelectorAll(".bx-tray")).toHaveLength(0);
    });

    it("keeps the whole-top drawing for 'Part of it' with no size, and for 'Whole top'", () => {
      const p = harbour();
      for (const box of [
        { ...p.box, headroom: 8, headroomCoverage: "partial" as const },
        {
          ...p.box,
          headroom: 8,
          headroomCoverage: "full" as const,
          headroomAreas: [{ w: 100, d: 90 }],
        },
      ]) {
        cleanup();
        const { container } = draw(p, box);
        expect(container.querySelector(".bx-reserve")).toBeNull();
        expect(screen.getByText("Kept free, 8 mm")).toBeTruthy();
        expect(screen.getByText("Trays fill the 62 mm below.")).toBeTruthy();
      }
    });
  });
});
