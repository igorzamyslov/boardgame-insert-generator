// src/screens/BoxSideView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { makeLayout, makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Box, Project } from "../model/types";
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

  it("draws one row per layer, top first", () => {
    const p = harbour();
    const { container } = draw(p);
    const rows = [...container.querySelectorAll<HTMLElement>(".bx-row")];
    expect(rows).toHaveLength(2);
    const keysOf = (row: HTMLElement): string[] =>
      [...row.querySelectorAll<HTMLElement>(".bx-tray")].map((t) => t.dataset.key ?? "");
    const trays = (p.layout?.trays ?? []).filter((t) => t.part !== "spacer");
    const top = Math.max(...trays.map((t) => t.level));
    expect(keysOf(rows[0] as HTMLElement).sort()).toEqual(
      trays
        .filter((t) => t.level === top)
        .map((t) => t.key)
        .sort(),
    );
    expect(keysOf(rows[1] as HTMLElement).sort()).toEqual(
      trays
        .filter((t) => t.level === 0)
        .map((t) => t.key)
        .sort(),
    );
    // the drawing is for the eye only
    expect(container.querySelector(".bx-drawing")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says nothing about free space without headroom", () => {
    const p = harbour();
    draw(p, { ...p.box, headroom: 0 });
    expect(screen.queryByText(/Kept free/)).toBeNull();
    expect(screen.queryByText(/Trays fill the/)).toBeNull();
    expect(document.querySelector(".bx-band")).toBeNull();
  });

  it("sizes a row by its layer's height, from the same bands as the Layer switch", () => {
    const low = makeTray({ key: "l:p0:0", level: 0, z: 0, h: 20, w: 100 });
    const high = makeTray({ key: "h:p0:0", level: 1, z: 20, h: 40, w: 100 });
    const box = { ...DEFAULT_BOX, innerHeight: 68, headroom: 8 };
    const { container } = render(
      <BoxSideView
        box={box}
        settings={DEFAULT_SETTINGS}
        layout={makeLayout("h", [low, high])}
        components={[]}
      />,
    );
    const rows = [...container.querySelectorAll<HTMLElement>(".bx-row")];
    // 60 mm below the free band: the top layer is two thirds of it, the bottom one third
    expect(rows.map((r) => r.style.getPropertyValue("--share"))).toEqual(["0.6667", "0.3333"]);
  });

  it("colours a block by its component's kind, and a spare tray plain", () => {
    const p = harbour();
    const { container } = draw(p);
    const spare = p.layout?.trays.find((t) => t.part === "leftover");
    expect(spare).toBeTruthy();
    const block = (key: string): HTMLElement =>
      container.querySelector(`.bx-tray[data-key="${key}"]`) as HTMLElement;
    expect(block(spare?.key ?? "").style.getPropertyValue("--tile-fill")).toBe("");
    const first = p.layout?.trays.find((t) => t.part === "tray");
    expect(block(first?.key ?? "").style.getPropertyValue("--tile-fill")).not.toBe("");
  });

  it("draws the free band and an empty floor while there is no plan", () => {
    const p = harbour();
    const { container } = draw({ ...p, layout: undefined });
    expect(screen.getByText("Kept free, 8 mm")).toBeTruthy();
    expect(container.querySelectorAll(".bx-row")).toHaveLength(0);
    expect(container.querySelector(".bx-floor")).toBeTruthy();
  });

  it("is the phone's drawing when asked", () => {
    const p = harbour();
    const { container } = draw(p, p.box, true);
    expect(container.querySelector(".bx-side")?.getAttribute("data-phone")).toBe("true");
  });
});
