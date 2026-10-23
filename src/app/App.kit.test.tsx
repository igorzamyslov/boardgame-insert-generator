// src/app/App.kit.test.tsx
// @vitest-environment jsdom
// The Player kit seed (G1): four copies of a group's tray are called "Player kit 1" to "4" in the plan,
// the tray bar, the Download dialog and the packing guide; choosing one selects that tray alone and
// lights all four.
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSeed } from "../test-support/harbourKings";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  hoveredComponent.value = null;
  hoveredMembers.value = null;
});

const project = () => loadSeed("harbour-kings-kit").project;
const tiles = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".plan-tile[data-key]"),
];
const kitTiles = (): HTMLElement[] => tiles().filter((t) => t.classList.contains("is-group"));
/** The trays of the other two items: not a group's, not a spare tray or a spacer. */
const ownTiles = (): HTMLElement[] =>
  tiles().filter((t) => !t.classList.contains("is-group") && !t.classList.contains("is-leftover"));
const nameOf = (t: HTMLElement): string => t.querySelector(".plan-name")?.textContent ?? "";

describe("the Player kit seed", () => {
  it("calls the group's four trays Player kit 1 to 4 in the plan, in the neutral look", () => {
    renderApp({ project: project() });
    expect(kitTiles().map(nameOf).sort()).toEqual([
      "Player kit 1",
      "Player kit 2",
      "Player kit 3",
      "Player kit 4",
    ]);
    // the two ungrouped trays keep their kind's colour and their own names
    const rest = ownTiles();
    expect(rest.map(nameOf).sort()).toEqual(["Hex tiles", "Market deck"]);
    for (const t of rest) {
      expect(t.style.getPropertyValue("--tile-fill")).not.toBe("");
    }
    // every well wears its member's colours
    for (const t of kitTiles()) {
      const wells = [...t.querySelectorAll<HTMLElement>(".plan-cell")];
      expect(wells.length).toBeGreaterThanOrEqual(3);
      expect(wells.every((w) => w.style.getPropertyValue("--cell-own-fill") !== "")).toBe(true);
    }
  });

  it("selects one tray and lights all four copies; the tray bar says Player kit 2", async () => {
    renderApp({ project: project() });
    const two = kitTiles().find((t) => nameOf(t) === "Player kit 2") as HTMLElement;
    fireEvent.keyDown(two, { key: "Enter" });
    const pressed = tiles().filter((t) => t.getAttribute("aria-pressed") === "true");
    expect(pressed).toEqual([two]);
    // all four copies are lit, the two other trays dimmed
    for (const t of kitTiles()) {
      expect(t.classList.contains("is-dimmed"), nameOf(t)).toBe(false);
    }
    for (const t of ownTiles()) {
      expect(t.classList.contains("is-dimmed"), nameOf(t)).toBe(true);
    }
    const bar = screen.getByRole("region", { name: "Selected tray" });
    expect(bar.querySelector(".tray-bar__name")?.textContent).toBe("Player kit 2");
    expect(bar.querySelectorAll(".tray-bar__cell").length).toBe(3);
    // the filament comes once the part is built
    await waitFor(() =>
      expect(bar.querySelector(".tray-bar__meta")?.textContent).toMatch(
        /^\d+(\.\d)? × \d+(\.\d)? × \d+(\.\d)? mm · \d+ compartments · about \d+ g$/,
      ),
    );
    // the rail's card is pressed for it
    const rail = screen.getByRole("complementary", { name: "What's inside" });
    expect(within(rail).getByRole("button", { name: /^Player kit/, pressed: true })).toBeTruthy();
  });

  it("lists the copies by name in the Download dialog, in the neutral swatch", () => {
    renderApp({ project: project() });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    const chips = [...document.querySelectorAll<HTMLElement>(".export-chip")].filter(
      (c) => c.dataset.group === "true",
    );
    expect(chips.map((c) => c.textContent).sort()).toEqual([
      "Player kit 1",
      "Player kit 2",
      "Player kit 3",
      "Player kit 4",
    ]);
  });
});
