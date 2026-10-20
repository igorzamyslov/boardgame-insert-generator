// src/app/App.groups.test.tsx
// @vitest-environment jsdom
// A tray belongs to every item in it, not only to its first: a group puts several items in one
// tray, and each of them has to find it (its row names the layer, its editor lifts it, a click on
// the tray presses every row that is in it), and the tray is drawn neutral, with each item's own colour in its wells (spec §7.6).
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../model/defaults";
import { inputsHash } from "../model/hash";
import type { Component, Project } from "../model/types";
import { hoveredComponent } from "../screens/hover";
import { shadeHex } from "../ui/identity";
import { fixtureProject, makeLayout, makeTray } from "./test-helpers";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  hoveredComponent.value = null;
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

const item = (kind: "cards" | "bulk", id: string, name: string): Component => ({
  ...newComponent(kind),
  id,
  name,
});
const well = (componentId: string, contents: string) => ({
  x: 1.6,
  y: 1.6,
  w: 40,
  d: 40,
  floorZ: 1.2,
  kind: "well" as const,
  contents,
  componentId,
  features: [],
});

/**
 * Tableau has a tray to itself on the bottom layer. Market and Gems are one group: they share one
 * tray on the top layer, Market's compartment first.
 */
function grouped(asGroup = false): Project {
  const p = fixtureProject();
  const components = [
    item("cards", "tab", "Tableau"),
    item("cards", "mkt", "Market"),
    item("bulk", "gem", "Gems"),
  ];
  const trays = [
    makeTray({
      key: "tab:p0:0",
      path: "0",
      stack: 0,
      level: 0,
      h: 40,
      compartments: [well("tab", "Tableau ×20")],
    }),
    makeTray({
      key: asGroup ? "kit:p0:0" : "mkt:p0:0",
      path: "1",
      stack: 0,
      level: 1,
      z: 40,
      h: 30,
      compartments: [well("mkt", "Market ×30"), well("gem", "Gems ×12")],
    }),
  ];
  // a real group is a group of the project, its tray keyed by the group's id; the others share a tray without one
  const groups = asGroup
    ? [
        {
          id: "kit",
          name: "Player kit",
          copies: 1,
          access: "often" as const,
          memberIds: ["mkt", "gem"],
        },
      ]
    : undefined;
  const next = { ...p, components, ...(groups === undefined ? {} : { groups }), locks: [] };
  return { ...next, layout: makeLayout(inputsHash(next), trays) };
}

const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const row = (id: string): HTMLElement =>
  rail().querySelector(`[data-row-id="${id}"]`) as HTMLElement;
const tile = (key: string): HTMLElement =>
  document.querySelector(`.plan-tile[data-key="${key}"]`) as HTMLElement;
const showLayer = (name: RegExp): void => {
  fireEvent.click(
    within(screen.getByRole("group", { name: "Layer" })).getByRole("button", { name }),
  );
};
const pressedRows = (): string[] =>
  within(rail())
    .queryAllByRole("button", { pressed: true })
    .map((b) => (b as HTMLElement).dataset.rowId ?? "");

describe("a tray that holds a group's items", () => {
  it("names the layer on every member's row, not only the first's", () => {
    renderApp({ project: grouped() });
    expect(row("tab").getAttribute("aria-label")).toMatch(/bottom layer$/);
    expect(row("mkt").getAttribute("aria-label")).toMatch(/top layer$/);
    expect(row("gem").getAttribute("aria-label")).toMatch(/top layer$/);
  });

  it("presses every member's row when the tray is chosen, and no other", () => {
    renderApp({ project: grouped() });
    showLayer(/^Layer 2/);
    fireEvent.keyDown(tile("mkt:p0:0"), { key: "Enter" });
    expect(pressedRows().sort()).toEqual(["gem", "mkt"]);
    // a tray with one item still presses one row
    showLayer(/^Layer 1/);
    fireEvent.keyDown(tile("tab:p0:0"), { key: "Enter" });
    expect(pressedRows()).toEqual(["tab"]);
  });

  it("lights every member's row while the pointer is on the tray", () => {
    renderApp({ project: grouped() });
    showLayer(/^Layer 2/);
    fireEvent.pointerEnter(tile("mkt:p0:0"), { pointerType: "mouse" });
    expect(row("mkt").getAttribute("data-lit")).toBe("true");
    expect(row("gem").getAttribute("data-lit")).toBe("true");
    expect(row("tab").getAttribute("data-lit")).toBeNull();
    fireEvent.pointerLeave(tile("mkt:p0:0"), { pointerType: "mouse" });
    expect(row("gem").getAttribute("data-lit")).toBeNull();
  });

  it("lights the tray from either member's row, and the other member's row with it", () => {
    renderApp({ project: grouped() });
    showLayer(/^Layer 2/);
    for (const id of ["mkt", "gem"]) {
      act(() => {
        hoveredComponent.value = id;
      });
      expect(tile("mkt:p0:0").classList.contains("is-dimmed"), id).toBe(false);
      expect(row("mkt").getAttribute("data-lit"), id).toBe("true");
      expect(row("gem").getAttribute("data-lit"), id).toBe("true");
      expect(row("tab").getAttribute("data-lit"), id).toBeNull();
    }
    // the item that has a tray of its own lights that one, not the group's
    act(() => {
      hoveredComponent.value = "tab";
    });
    expect(row("mkt").getAttribute("data-lit")).toBeNull();
    expect(row("gem").getAttribute("data-lit")).toBeNull();
    expect(row("tab").getAttribute("data-lit")).toBe("true");
  });

  it("lifts the tray in every member's editor, on the layer it is on", () => {
    renderApp({ project: grouped() });
    for (const id of ["mkt", "gem"]) {
      fireEvent.click(row(id));
      // the editor opens on the tray's layer: it is drawn, lifted, and the other tray is not here
      expect(tile("mkt:p0:0"), id).not.toBeNull();
      expect(tile("mkt:p0:0").classList.contains("is-lifted"), id).toBe(true);
      expect(tile("tab:p0:0")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    }
    // and it is not lifted for the item that is not in it
    fireEvent.click(row("tab"));
    expect(tile("mkt:p0:0")).toBeNull();
    expect(tile("tab:p0:0").classList.contains("is-lifted")).toBe(true);
  });

  it("draws the tray neutral, with each member's own colour in its wells", () => {
    const project = grouped(true);
    renderApp({ project });
    showLayer(/^Layer 2/);
    const group = tile("kit:p0:0");
    // no kind's shade on the tile: the neutral tokens of the plan's CSS stand for it
    expect(group.classList.contains("is-group")).toBe(true);
    expect(group.style.getPropertyValue("--tile-fill")).toBe("");
    // the wells wear the members' own kinds: Market's cards, then Gems' bits
    const wells = [...group.querySelectorAll<HTMLElement>(".plan-cell")];
    expect(wells.map((c) => c.style.getPropertyValue("--cell-own-fill"))).toEqual([
      expect.stringContaining(shadeHex("cards", 1, "light").fill),
      expect.stringContaining(shadeHex("bulk", 0, "light").fill),
    ]);
    // the member's row keeps its own kind's colour, as before
    const market = (row("mkt").closest(".k-rowwrap") as HTMLElement).style.getPropertyValue(
      "--shade-fill",
    );
    expect(market).toContain(shadeHex("cards", 1, "light").fill);
    // an ungrouped tray is still its kind's
    showLayer(/^Layer 1/);
    expect(tile("tab:p0:0").style.getPropertyValue("--tile-fill")).toContain(
      shadeHex("cards", 0, "light").fill,
    );
    expect(tile("tab:p0:0").classList.contains("is-group")).toBe(false);
  });

  it("calls the group's tray by the group's name, in the plan, and its tray bar too", () => {
    renderApp({ project: grouped(true) });
    showLayer(/^Layer 2/);
    expect(tile("kit:p0:0").querySelector(".plan-name")?.textContent).toBe("Player kit");
    fireEvent.keyDown(tile("kit:p0:0"), { key: "Enter" });
    const bar = screen.getByRole("region", { name: "Selected tray" });
    expect(bar.querySelector(".tray-bar__name")?.textContent).toBe("Player kit");
    expect(bar.querySelector(".tray-bar__swatch--group")).not.toBeNull();
  });
});
